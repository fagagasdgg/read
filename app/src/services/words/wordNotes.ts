import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { normalizeWordToken } from '../../lib/lemmatize'

export interface WordNote {
  lemma: string
  text: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'read-word-notes'

let cache: Record<string, WordNote> | null = null

async function readStore(): Promise<Record<string, WordNote>> {
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

    const parsed = JSON.parse(raw) as Record<string, WordNote>
    cache = parsed && typeof parsed === 'object' ? parsed : {}
    return cache
  } catch {
    cache = {}
    return cache
  }
}

async function writeStore(store: Record<string, WordNote>): Promise<void> {
  cache = store
  const payload = JSON.stringify(store)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  } else {
    localStorage.setItem(STORAGE_KEY, payload)
  }
}

export async function getWordNote(rawLemma: string): Promise<WordNote | null> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return null
  const store = await readStore()
  return store[lemma] ?? null
}

export async function setWordNote(rawLemma: string, text: string): Promise<WordNote | null> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) throw new Error('无效单词')

  const trimmed = text.trim()
  const store = await readStore()

  if (!trimmed) {
    if (store[lemma]) {
      delete store[lemma]
      await writeStore(store)
    }
    return null
  }

  const prev = store[lemma]
  const now = Date.now()
  const next: WordNote = {
    lemma,
    text: trimmed,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  }
  store[lemma] = next
  await writeStore(store)
  return next
}

export async function clearWordNote(rawLemma: string): Promise<void> {
  await setWordNote(rawLemma, '')
}

export async function exportWordNotesStore(): Promise<Record<string, WordNote>> {
  const store = await readStore()
  return { ...store }
}

export async function importWordNotesStore(
  incoming: Record<string, WordNote> | null | undefined,
): Promise<{ merged: number }> {
  if (!incoming || typeof incoming !== 'object') return { merged: 0 }

  const store = await readStore()
  let merged = 0

  for (const [key, note] of Object.entries(incoming)) {
    if (!note || typeof note !== 'object') continue
    const lemma = normalizeWordToken(note.lemma || key)
    const text = typeof note.text === 'string' ? note.text.trim() : ''
    if (!lemma || !text) continue

    const prev = store[lemma]
    const incomingUpdated = typeof note.updatedAt === 'number' ? note.updatedAt : 0
    if (prev && (prev.updatedAt ?? 0) >= incomingUpdated) continue

    store[lemma] = {
      lemma,
      text,
      createdAt:
        typeof note.createdAt === 'number' ? note.createdAt : prev?.createdAt ?? Date.now(),
      updatedAt: incomingUpdated || Date.now(),
    }
    merged += 1
  }

  if (merged > 0) await writeStore(store)
  return { merged }
}
