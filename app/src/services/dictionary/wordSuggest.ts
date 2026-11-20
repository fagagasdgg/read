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

/** 越小越靠前：精确匹配 > 前缀（越接近输入越好）> 包含 */
function englishSortKey(
  lemma: string,
  query: string,
  mode: WordSuggestMatchMode,
): number | null {
  const lower = lemma.toLowerCase()
  const q = query.toLowerCase()
  if (!lower || !q) return null

  if (lower === q) return 0

  const isPrefix = lower.startsWith(q)
  const isContains = lower.includes(q)

  if ((mode === 'prefix' || mode === 'both') && isPrefix) {
    // beer 输入时 beer=0 已处理；beerish 比 beeee 更长扩展，按超出长度排
    return 100 + (lower.length - q.length)
  }

  if ((mode === 'contains' || mode === 'both') && isContains && !isPrefix) {
    return 1000 + lower.indexOf(q) * 10 + lower.length
  }

  return null
}

function mergeAndSort(
  items: Array<WordSuggestItem & { sortKey: number }>,
  limit: number,
): WordSuggestItem[] {
  items.sort(
    (a, b) =>
      a.sortKey - b.sortKey || a.lemma.length - b.lemma.length || a.lemma.localeCompare(b.lemma),
  )
  const seen = new Set<string>()
  const out: WordSuggestItem[] = []
  for (const item of items) {
    const key = item.lemma.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ lemma: item.lemma, gloss: item.gloss, source: item.source })
    if (out.length >= limit) break
  }
  return out
}

async function suggestFromCache(
  query: string,
  mode: WordSuggestMatchMode,
  _limit: number,
  chinese: boolean,
): Promise<Array<WordSuggestItem & { sortKey: number }>> {
  const words = await listCachedWords()
  const scored: Array<WordSuggestItem & { sortKey: number }> = []

  for (const entry of words) {
    const lemma = entry.lemma?.trim()
    if (!lemma) continue
    const gloss = entry.definitions.map((d) => d.translation).filter(Boolean).join('；')
    if (chinese) {
      if (!gloss.includes(query)) continue
      const idx = gloss.indexOf(query)
      const startsBoost = gloss.trimStart().startsWith(query) ? 0 : 40
      scored.push({
        lemma,
        gloss: pickGloss(gloss),
        source: 'cache',
        sortKey: startsBoost + (idx < 0 ? 500 : idx) + lemma.length,
      })
      continue
    }

    const sortKey = englishSortKey(lemma, query, mode)
    if (sortKey == null) continue
    scored.push({ lemma, gloss: pickGloss(gloss), source: 'cache', sortKey })
  }

  return scored
}

async function suggestFromEcdictEnglish(
  query: string,
  mode: WordSuggestMatchMode,
  limit: number,
): Promise<Array<WordSuggestItem & { sortKey: number }>> {
  const db = await getEcdictDb()
  if (!db) return []

  const q = query.toLowerCase()
  const token = escapeLike(q)
  const patterns: Array<{ like: string; allowPrefixOnly: boolean }> = []
  if (mode === 'prefix' || mode === 'both') {
    patterns.push({ like: `${token}%`, allowPrefixOnly: true })
  }
  if (mode === 'contains' || mode === 'both') {
    patterns.push({ like: `%${token}%`, allowPrefixOnly: false })
  }

  const rows: Array<WordSuggestItem & { sortKey: number }> = []
  for (const pattern of patterns) {
    const stmt = db.prepare(
      `SELECT word, translation FROM ecdict
       WHERE word LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY CASE WHEN lower(word) = lower(?) THEN 0 ELSE 1 END,
                length(word), word
       LIMIT ?`,
    )
    try {
      stmt.bind([pattern.like, q, Math.max(limit * 3, 30)])
      while (stmt.step()) {
        const raw = stmt.getAsObject() as Record<string, unknown>
        const lemma = String(raw.word ?? '').trim()
        if (!lemma) continue
        const lower = lemma.toLowerCase()
        if (pattern.allowPrefixOnly && !lower.startsWith(q)) continue
        if (!pattern.allowPrefixOnly && lower.startsWith(q)) continue
        const sortKey = englishSortKey(lemma, query, mode)
        if (sortKey == null) continue
        rows.push({
          lemma,
          gloss: pickGloss(String(raw.translation ?? '')),
          source: 'ecdict',
          sortKey,
        })
      }
    } finally {
      stmt.free()
    }
  }

  return rows
}

async function suggestFromEcdictChinese(
  query: string,
  limit: number,
): Promise<Array<WordSuggestItem & { sortKey: number }>> {
  const db = await getEcdictDb()
  if (!db) return []

  const token = escapeLike(query)
  const stmt = db.prepare(
    `SELECT word, translation FROM ecdict
     WHERE translation LIKE ? ESCAPE '\\'
     ORDER BY length(word), word
     LIMIT ?`,
  )
  const rows: Array<WordSuggestItem & { sortKey: number }> = []
  try {
    stmt.bind([`%${token}%`, Math.max(limit * 2, 30)])
    while (stmt.step()) {
      const raw = stmt.getAsObject() as Record<string, unknown>
      const lemma = String(raw.word ?? '').trim()
      if (!lemma) continue
      const translation = String(raw.translation ?? '')
      // 释义越靠前命中越好；整段以查询词开头更优先；短词略优先
      const idx = translation.indexOf(query)
      const startsBoost = translation.trimStart().startsWith(query) ? 0 : 40
      rows.push({
        lemma,
        gloss: pickGloss(translation),
        source: 'ecdict',
        sortKey: startsBoost + (idx < 0 ? 500 : idx) + lemma.length,
      })
    }
  } finally {
    stmt.free()
  }
  return rows
}

/** 单词模糊联想：精确优先；缓存与 ECDICT 合并排序；支持中文释义检索 */
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
  const ecdictHits = chinese
    ? await suggestFromEcdictChinese(query, limit)
    : await suggestFromEcdictEnglish(query, mode, limit)

  // 同 lemma 优先保留 cache（释义可能更新）
  return mergeAndSort([...cacheHits, ...ecdictHits], limit)
}
