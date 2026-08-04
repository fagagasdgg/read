import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { normalizeWordToken } from '../../lib/lemmatize'
import { resolveLemma } from '../dictionary/resolveLemma'
import { fetchPhrasesOnline, type FetchedPhrase } from '../dictionary/fetchPhrases'

export interface WordPhraseItem {
  id: string
  phrase: string
  translation: string
  source: 'network' | 'manual'
  addedAt: number
}

export interface WordPhraseRecord {
  lemma: string
  /** 是否已执行过联网获取（含获取到 0 条的情况） */
  fetchedAt: number | null
  items: WordPhraseItem[]
  fetchSource?: 'youdao'
}

const STORAGE_KEY = 'read-word-phrases'

let cache: Record<string, WordPhraseRecord> | null = null

function createId(): string {
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePhraseKey(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function readStore(): Promise<Record<string, WordPhraseRecord>> {
  if (cache) return cache

  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }

    if (!raw) {
      cache = {}
      return cache
    }

    const parsed = JSON.parse(raw) as Record<string, WordPhraseRecord>
    cache = parsed && typeof parsed === 'object' ? parsed : {}
    return cache
  } catch {
    cache = {}
    return cache
  }
}

async function writeStore(store: Record<string, WordPhraseRecord>): Promise<void> {
  cache = store
  const payload = JSON.stringify(store)

  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  } else {
    localStorage.setItem(STORAGE_KEY, payload)
  }
}

function emptyRecord(lemma: string): WordPhraseRecord {
  return { lemma, fetchedAt: null, items: [] }
}

function toNetworkItems(phrases: FetchedPhrase[]): WordPhraseItem[] {
  const now = Date.now()
  return phrases.map((item) => ({
    id: createId(),
    phrase: item.phrase.trim(),
    translation: item.translation.trim(),
    source: 'network' as const,
    addedAt: now,
  }))
}

/**
 * 词组存储键：ECDICT 原型优先，兼容旧数据中的表面形 key。
 * 已掌握 / 本地释义 / 词组共用同一原型，避免 grains/grain 分裂。
 */
async function resolvePhraseLemmaKeys(rawLemma: string): Promise<{ primary: string; aliases: string[] }> {
  const surface = normalizeWordToken(rawLemma)
  if (!surface) return { primary: '', aliases: [] }
  const lemma = await resolveLemma(rawLemma, false)
  const primary = lemma || surface
  const aliases = surface !== primary ? [surface] : []
  return { primary, aliases }
}

function pickRecord(
  store: Record<string, WordPhraseRecord>,
  primary: string,
  aliases: string[],
): { key: string; record: WordPhraseRecord } | null {
  if (store[primary]) return { key: primary, record: store[primary] }
  for (const alias of aliases) {
    if (store[alias]) return { key: alias, record: store[alias] }
  }
  return null
}

/** 若词组落在旧表面 key 上，迁移到原型 key（合并，不丢数据） */
async function migratePhraseToPrimary(
  store: Record<string, WordPhraseRecord>,
  primary: string,
  foundKey: string,
  record: WordPhraseRecord,
): Promise<WordPhraseRecord> {
  if (foundKey === primary) return record

  const existing = store[primary]
  const mergedItems = [...(existing?.items ?? [])]
  const keys = new Set(mergedItems.map((item) => normalizePhraseKey(item.phrase)))
  for (const item of record.items) {
    const pk = normalizePhraseKey(item.phrase)
    if (keys.has(pk)) continue
    keys.add(pk)
    mergedItems.push(item)
  }

  const next: WordPhraseRecord = {
    lemma: primary,
    fetchedAt: existing?.fetchedAt ?? record.fetchedAt,
    fetchSource: existing?.fetchSource ?? record.fetchSource,
    items: mergedItems,
  }
  store[primary] = next
  delete store[foundKey]
  await writeStore(store)
  return next
}

export async function getWordPhraseRecord(rawLemma: string): Promise<WordPhraseRecord | null> {
  const { primary, aliases } = await resolvePhraseLemmaKeys(rawLemma)
  if (!primary) return null

  const store = await readStore()
  const found = pickRecord(store, primary, aliases)
  if (!found) return null

  if (found.key !== primary) {
    return migratePhraseToPrimary(store, primary, found.key, found.record)
  }
  return found.record
}

export async function fetchAndSaveWordPhrases(rawLemma: string): Promise<WordPhraseRecord> {
  const { primary, aliases } = await resolvePhraseLemmaKeys(rawLemma)
  if (!primary) throw new Error('无效单词')

  const phrases = await fetchPhrasesOnline(primary)
  const store = await readStore()
  const legacy = pickRecord(store, primary, aliases)

  const networkItems = toNetworkItems(phrases)
  const manualItems =
    legacy?.record.items.filter((item) => item.source === 'manual') ?? []
  const keys = new Set(networkItems.map((item) => normalizePhraseKey(item.phrase)))
  const mergedManual = manualItems.filter((item) => !keys.has(normalizePhraseKey(item.phrase)))

  const record: WordPhraseRecord = {
    lemma: primary,
    fetchedAt: Date.now(),
    fetchSource: 'youdao',
    items: [...networkItems, ...mergedManual],
  }

  store[primary] = record
  for (const alias of aliases) {
    if (alias !== primary) delete store[alias]
  }
  await writeStore(store)
  return record
}

/** 标记已获取但结果为空，便于用户手动补充 */
export async function markWordPhrasesFetchedEmpty(rawLemma: string): Promise<WordPhraseRecord> {
  const { primary, aliases } = await resolvePhraseLemmaKeys(rawLemma)
  if (!primary) throw new Error('无效单词')

  const store = await readStore()
  const legacy = pickRecord(store, primary, aliases)
  const manualItems = legacy?.record.items.filter((item) => item.source === 'manual') ?? []

  const record: WordPhraseRecord = {
    lemma: primary,
    fetchedAt: Date.now(),
    fetchSource: 'youdao',
    items: manualItems,
  }
  store[primary] = record
  for (const alias of aliases) {
    if (alias !== primary) delete store[alias]
  }
  await writeStore(store)
  return record
}

export async function addManualWordPhrase(
  rawLemma: string,
  phrase: string,
  translation: string,
): Promise<WordPhraseRecord> {
  const { primary } = await resolvePhraseLemmaKeys(rawLemma)
  const phraseText = phrase.trim()
  const translationText = translation.trim()
  if (!primary) throw new Error('无效单词')
  if (!phraseText || !translationText) throw new Error('请填写词组和释义')

  const store = await readStore()
  // 先尝试迁移旧 key
  const existingRecord = await getWordPhraseRecord(primary)
  const existing = existingRecord ?? emptyRecord(primary)
  if (!existing.fetchedAt) {
    throw new Error('请先获取词组，或等待获取完成后再补充')
  }

  const key = normalizePhraseKey(phraseText)
  if (existing.items.some((item) => normalizePhraseKey(item.phrase) === key)) {
    throw new Error('该词组已存在')
  }

  const next: WordPhraseRecord = {
    ...existing,
    lemma: primary,
    items: [
      ...existing.items,
      {
        id: createId(),
        phrase: phraseText,
        translation: translationText,
        source: 'manual',
        addedAt: Date.now(),
      },
    ],
  }

  store[primary] = next
  await writeStore(store)
  return next
}

export async function clearWordPhrases(rawLemma: string): Promise<void> {
  const { primary, aliases } = await resolvePhraseLemmaKeys(rawLemma)
  if (!primary) return

  const store = await readStore()
  let changed = false
  if (store[primary]) {
    delete store[primary]
    changed = true
  }
  for (const alias of aliases) {
    if (store[alias]) {
      delete store[alias]
      changed = true
    }
  }
  if (changed) await writeStore(store)
}

export async function getWordPhraseCount(rawLemma: string): Promise<number> {
  const record = await getWordPhraseRecord(rawLemma)
  return record?.items.length ?? 0
}

/** 已添加词组的单词数（至少有一条词组记录） */
export async function getLemmaPhraseWordCount(): Promise<number> {
  const store = await readStore()
  return Object.values(store).filter((record) => record.items.length > 0).length
}

export async function listAllWordPhraseRecords(): Promise<WordPhraseRecord[]> {
  const store = await readStore()
  return Object.values(store)
}

export async function exportPhraseStore(): Promise<Record<string, WordPhraseRecord>> {
  return readStore()
}

function normalizePhraseRecord(raw: unknown, fallbackLemma: string): WordPhraseRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<WordPhraseRecord>
  const lemma = typeof item.lemma === 'string' ? normalizeWordToken(item.lemma) : fallbackLemma
  if (!lemma) return null

  const items = Array.isArray(item.items)
    ? item.items
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Partial<WordPhraseItem>
          if (typeof row.phrase !== 'string' || typeof row.translation !== 'string') return null
          return {
            id: typeof row.id === 'string' && row.id ? row.id : createId(),
            phrase: row.phrase.trim(),
            translation: row.translation.trim(),
            source: row.source === 'manual' ? 'manual' : 'network',
            addedAt: typeof row.addedAt === 'number' ? row.addedAt : Date.now(),
          } satisfies WordPhraseItem
        })
        .filter((entry): entry is WordPhraseItem => Boolean(entry))
    : []

  return {
    lemma,
    fetchedAt: typeof item.fetchedAt === 'number' ? item.fetchedAt : items.length ? Date.now() : null,
    fetchSource: item.fetchSource === 'youdao' ? 'youdao' : undefined,
    items,
  }
}

export async function importPhraseStore(
  incoming: Record<string, unknown>,
): Promise<{ imported: number; merged: number }> {
  cache = null
  const store = await readStore()
  let imported = 0
  let merged = 0

  for (const [key, raw] of Object.entries(incoming)) {
    const record = normalizePhraseRecord(raw, normalizeWordToken(key))
    if (!record) continue

    const existing = store[record.lemma]
    if (!existing) {
      store[record.lemma] = record
      imported += 1
      continue
    }

    const phraseKeys = new Set(existing.items.map((item) => normalizePhraseKey(item.phrase)))
    const mergedItems = [...existing.items]
    for (const item of record.items) {
      const pk = normalizePhraseKey(item.phrase)
      if (phraseKeys.has(pk)) continue
      phraseKeys.add(pk)
      mergedItems.push(item)
    }

    store[record.lemma] = {
      lemma: record.lemma,
      fetchedAt: existing.fetchedAt ?? record.fetchedAt ?? Date.now(),
      fetchSource: existing.fetchSource ?? record.fetchSource,
      items: mergedItems,
    }
    merged += 1
  }

  await writeStore(store)
  return { imported, merged }
}
