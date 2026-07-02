import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { getAllDictionarySourceIds } from './providers'
import {
  isWordEntry,
  isWordNotFoundMarker,
  type DictionaryCacheValue,
  type WordEntry,
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
