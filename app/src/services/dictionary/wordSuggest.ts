import { listCachedWords } from './cache'
import { getEcdictDb } from './ecdict'
import type { WordSuggestMatchMode } from '../settings/userSettings'

export interface WordSuggestItem {
  lemma: string
  gloss: string
  source: 'cache' | 'ecdict'
}

const HAS_CJK = /[\u4e00-\u9fff]/

function escapeLike(raw: string): string {
  return raw.replace(/[%_\\]/g, '\\$&')
}

function pickGloss(translation: string): string {
  const compact = translation.replace(/\s+/g, ' ').trim()
  if (compact.length <= 36) return compact
  return `${compact.slice(0, 36)}…`
}

function mergeUnique(
  items: WordSuggestItem[],
  limit: number,
): WordSuggestItem[] {
  const seen = new Set<string>()
  const out: WordSuggestItem[] = []
  for (const item of items) {
    const key = item.lemma.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

async function suggestFromCache(
  query: string,
  mode: WordSuggestMatchMode,
  limit: number,
  chinese: boolean,
): Promise<WordSuggestItem[]> {
  const words = await listCachedWords()
  const q = query.toLowerCase()
  const scored: Array<WordSuggestItem & { rank: number }> = []

  for (const entry of words) {
    const lemma = entry.lemma?.trim()
    if (!lemma) continue
    const gloss = entry.definitions.map((d) => d.translation).filter(Boolean).join('；')
    if (chinese) {
      if (!gloss.includes(query)) continue
      scored.push({ lemma, gloss: pickGloss(gloss), source: 'cache', rank: 1 })
      continue
    }

    const lower = lemma.toLowerCase()
    let rank = 0
    if (mode === 'prefix' || mode === 'both') {
      if (lower.startsWith(q)) rank = 1
    }
    if (!rank && (mode === 'contains' || mode === 'both')) {
      if (lower.includes(q)) rank = 2
    }
    if (!rank) continue
    scored.push({ lemma, gloss: pickGloss(gloss), source: 'cache', rank })
  }

  scored.sort((a, b) => a.rank - b.rank || a.lemma.length - b.lemma.length || a.lemma.localeCompare(b.lemma))
  return scored.slice(0, limit).map(({ lemma, gloss, source }) => ({ lemma, gloss, source }))
}

async function suggestFromEcdictEnglish(
  query: string,
  mode: WordSuggestMatchMode,
  limit: number,
): Promise<WordSuggestItem[]> {
  const db = await getEcdictDb()
  if (!db) return []

  const token = escapeLike(query.toLowerCase())
  const patterns: Array<{ like: string; rank: number }> = []
  if (mode === 'prefix' || mode === 'both') patterns.push({ like: `${token}%`, rank: 1 })
  if (mode === 'contains' || mode === 'both') patterns.push({ like: `%${token}%`, rank: 2 })

  const rows: Array<WordSuggestItem & { rank: number }> = []
  for (const pattern of patterns) {
    const stmt = db.prepare(
      `SELECT word, translation FROM ecdict
       WHERE word LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY length(word), word
       LIMIT ?`,
    )
    try {
      stmt.bind([pattern.like, limit * 2])
      while (stmt.step()) {
        const raw = stmt.getAsObject() as Record<string, unknown>
        const lemma = String(raw.word ?? '').trim()
        if (!lemma) continue
        if (pattern.rank === 2 && lemma.toLowerCase().startsWith(token)) continue
        rows.push({
          lemma,
          gloss: pickGloss(String(raw.translation ?? '')),
          source: 'ecdict',
          rank: pattern.rank,
        })
      }
    } finally {
      stmt.free()
    }
  }

  rows.sort((a, b) => a.rank - b.rank || a.lemma.length - b.lemma.length || a.lemma.localeCompare(b.lemma))
  return rows.map(({ lemma, gloss, source }) => ({ lemma, gloss, source }))
}

async function suggestFromEcdictChinese(query: string, limit: number): Promise<WordSuggestItem[]> {
  const db = await getEcdictDb()
  if (!db) return []

  const token = escapeLike(query)
  const stmt = db.prepare(
    `SELECT word, translation FROM ecdict
     WHERE translation LIKE ? ESCAPE '\\'
     ORDER BY length(word), word
     LIMIT ?`,
  )
  const rows: WordSuggestItem[] = []
  try {
    stmt.bind([`%${token}%`, limit])
    while (stmt.step()) {
      const raw = stmt.getAsObject() as Record<string, unknown>
      const lemma = String(raw.word ?? '').trim()
      if (!lemma) continue
      rows.push({
        lemma,
        gloss: pickGloss(String(raw.translation ?? '')),
        source: 'ecdict',
      })
    }
  } finally {
    stmt.free()
  }
  return rows
}

/** 单词模糊联想：缓存优先，再 ECDICT；支持中文释义检索 */
export async function suggestWords(
  rawQuery: string,
  options: { mode: WordSuggestMatchMode; limit: number },
): Promise<WordSuggestItem[]> {
  const query = rawQuery.trim()
  if (!query) return []

  const limit = Math.min(100, Math.max(5, options.limit || 20))
  const mode = options.mode
  const chinese = HAS_CJK.test(query)

  const cacheHits = await suggestFromCache(query, mode, limit, chinese)
  if (cacheHits.length >= limit) return cacheHits.slice(0, limit)

  const remain = limit - cacheHits.length
  const ecdictHits = chinese
    ? await suggestFromEcdictChinese(query, remain * 2)
    : await suggestFromEcdictEnglish(query, mode, remain * 2)

  return mergeUnique([...cacheHits, ...ecdictHits], limit)
}
