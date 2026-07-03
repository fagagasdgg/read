import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { getAllDictionarySourceIds } from './providers'
import {
  isWordEntry,
  isWordNotFoundMarker,
  type DictionaryCacheValue,
  type DictionarySourceId,
  type ExamLevel,
  type WordDefinition,
  type WordEntry,
  type WordForm,
  type WordNotFoundMarker,
} from './types'

interface DictionaryDB extends DBSchema {
  words: {
    key: string
    value: DictionaryCacheValue
  }
}

const DB_NAME = 'read-dictionary'
const STORE = 'words'

let dbPromise: Promise<IDBPDatabase<DictionaryDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DictionaryDB>(DB_NAME, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(STORE)
        }
      },
    })
  }
  return dbPromise
}

export async function getCachedRecord(lemma: string): Promise<DictionaryCacheValue | null> {
  const db = await getDb()
  return (await db.get(STORE, lemma)) ?? null
}

export async function getCachedWord(lemma: string): Promise<WordEntry | null> {
  const record = await getCachedRecord(lemma)
  if (!record || isWordNotFoundMarker(record)) return null
  return record
}

export async function isLemmaMarkedNotFound(lemma: string): Promise<boolean> {
  const record = await getCachedRecord(lemma)
  if (!record || !isWordNotFoundMarker(record)) return false
  return !shouldRetryNotFound(record)
}

export async function getCachedRecords(
  lemmas: string[],
): Promise<Map<string, DictionaryCacheValue>> {
  const unique = [...new Set(lemmas.filter(Boolean))]
  if (!unique.length) return new Map()

  const db = await getDb()
  const pairs = await Promise.all(
    unique.map(async (lemma) => {
      const record = await db.get(STORE, lemma)
      return record ? ([lemma, record] as const) : null
    }),
  )

  return new Map(pairs.filter((item): item is readonly [string, DictionaryCacheValue] => item !== null))
}

/** @deprecated 使用 getCachedRecords */
export async function getCachedWords(lemmas: string[]): Promise<Map<string, WordEntry>> {
  const records = await getCachedRecords(lemmas)
  const found = new Map<string, WordEntry>()
  for (const [lemma, record] of records) {
    if (isWordEntry(record)) found.set(lemma, record)
  }
  return found
}

export async function setCachedWord(entry: WordEntry): Promise<void> {
  const db = await getDb()
  await db.put(STORE, entry, entry.lemma)
}

export async function setNotFoundLemma(lemma: string): Promise<void> {
  const marker: WordNotFoundMarker = {
    lemma,
    notFound: true,
    cachedAt: Date.now(),
    triedSources: getAllDictionarySourceIds(),
  }
  const db = await getDb()
  await db.put(STORE, marker, lemma)
}

/** 旧版仅标记有道的 notFound 记录，可用备用信源重试 */
export function shouldRetryNotFound(record: WordNotFoundMarker): boolean {
  const tried = record.triedSources ?? ['youdao']
  return getAllDictionarySourceIds().some((id) => !tried.includes(id))
}

export function normalizeNotFoundMarker(record: WordNotFoundMarker): WordNotFoundMarker {
  if (record.triedSources?.length) return record
  return { ...record, triedSources: ['youdao'] }
}

export async function listCachedWords(): Promise<WordEntry[]> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all.filter(isWordEntry)
}

export async function getDictionaryCacheStats(): Promise<{
  wordCount: number
  notFoundCount: number
}> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  let wordCount = 0
  let notFoundCount = 0
  for (const item of all) {
    if (isWordNotFoundMarker(item)) notFoundCount += 1
    else wordCount += 1
  }
  return { wordCount, notFoundCount }
}

export async function exportCachedWordsJson(): Promise<string> {
  const words = await listCachedWords()
  return JSON.stringify(words, null, 2)
}

export async function exportAllCachedRecords(): Promise<
  Array<{ lemma: string; value: DictionaryCacheValue }>
> {
  const db = await getDb()
  const keys = await db.getAllKeys(STORE)
  const records: Array<{ lemma: string; value: DictionaryCacheValue }> = []

  for (const key of keys) {
    const value = await db.get(STORE, key)
    if (!value) continue
    const lemma = typeof key === 'string' ? key : String(key)
    if (isWordEntry(value) || isWordNotFoundMarker(value)) {
      records.push({ lemma, value })
    }
  }

  return records
}

function normalizeDictionaryImportItem(item: unknown): { lemma: string; value: unknown } | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>

  if (typeof row.lemma === 'string' && 'value' in row) {
    return { lemma: row.lemma, value: row.value }
  }

  if (typeof row.lemma === 'string') {
    if (row.notFound === true || row.notFound === 'true' || Array.isArray(row.definitions)) {
      return { lemma: row.lemma, value: row }
    }
    if ('phoneticUs' in row || 'phoneticUk' in row || 'source' in row) {
      return { lemma: row.lemma, value: row }
    }
  }

  return null
}

function normalizeCacheValue(value: unknown, fallbackLemma: string): DictionaryCacheValue | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const lemma =
    typeof item.lemma === 'string' && item.lemma.trim() ? item.lemma.trim() : fallbackLemma
  if (!lemma) return null

  const cachedAt = typeof item.cachedAt === 'number' ? item.cachedAt : Date.now()

  if (item.notFound === true || item.notFound === 'true') {
    const triedSources = Array.isArray(item.triedSources)
      ? (item.triedSources.filter((id) => id === 'youdao' || id === 'iciba') as DictionarySourceId[])
      : (['youdao'] as DictionarySourceId[])
    return {
      lemma,
      notFound: true,
      cachedAt,
      triedSources: triedSources.length ? triedSources : ['youdao'],
    }
  }

  const definitions = Array.isArray(item.definitions)
    ? (item.definitions.filter(
        (def) =>
          def &&
          typeof def === 'object' &&
          typeof (def as WordDefinition).translation === 'string',
      ) as WordDefinition[])
    : []

  const forms = Array.isArray(item.forms)
    ? (item.forms.filter(
        (form) =>
          form &&
          typeof form === 'object' &&
          typeof (form as WordForm).label === 'string' &&
          typeof (form as WordForm).value === 'string',
      ) as WordForm[])
    : []

  return {
    lemma,
    phoneticUs: typeof item.phoneticUs === 'string' ? item.phoneticUs : '',
    phoneticUk: typeof item.phoneticUk === 'string' ? item.phoneticUk : '',
    usSpeechUrl: typeof item.usSpeechUrl === 'string' ? item.usSpeechUrl : '',
    ukSpeechUrl: typeof item.ukSpeechUrl === 'string' ? item.ukSpeechUrl : '',
    examLevels: Array.isArray(item.examLevels) ? (item.examLevels as ExamLevel[]) : [],
    definitions,
    forms,
    cachedAt,
    source: item.source === 'iciba' ? 'iciba' : 'youdao',
  }
}

export async function importDictionaryRecords(
  records: Array<{ lemma: string; value: unknown }> | unknown[],
): Promise<{ imported: number; skipped: number }> {
  const db = await getDb()
  let imported = 0
  let skipped = 0

  const normalized = records
    .map((item) => normalizeDictionaryImportItem(item))
    .filter((item): item is { lemma: string; value: unknown } => item !== null)

  for (const item of normalized) {
    const lemma = item.lemma.trim()
    const incoming = normalizeCacheValue(item.value, lemma)
    if (!lemma || !incoming) {
      skipped += 1
      continue
    }

    const existing = await db.get(STORE, lemma)
    if (!existing) {
      await db.put(STORE, incoming, lemma)
      imported += 1
      continue
    }

    const existingAt =
      'cachedAt' in existing && typeof existing.cachedAt === 'number' ? existing.cachedAt : 0
    const incomingAt =
      'cachedAt' in incoming && typeof incoming.cachedAt === 'number' ? incoming.cachedAt : 0
    if (incomingAt >= existingAt) {
      await db.put(STORE, incoming, lemma)
      imported += 1
    }
  }

  return { imported, skipped }
}
