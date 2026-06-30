import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { WordEntry } from './types'

interface DictionaryDB extends DBSchema {
  words: {
    key: string
    value: WordEntry
  }
}

const DB_NAME = 'read-dictionary'
const STORE = 'words'

let dbPromise: Promise<IDBPDatabase<DictionaryDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DictionaryDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export async function getCachedWord(lemma: string): Promise<WordEntry | null> {
  const db = await getDb()
  return (await db.get(STORE, lemma)) ?? null
}

export async function setCachedWord(entry: WordEntry): Promise<void> {
  const db = await getDb()
  await db.put(STORE, entry, entry.lemma)
}

export async function listCachedWords(): Promise<WordEntry[]> {
  const db = await getDb()
  return db.getAll(STORE)
}

export async function exportCachedWordsJson(): Promise<string> {
  const words = await listCachedWords()
  return JSON.stringify(words, null, 2)
}
