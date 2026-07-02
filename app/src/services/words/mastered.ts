import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { normalizeWordToken } from '../../lib/lemmatize'

const STORAGE_KEY = 'read-mastered-words'

let cache: Set<string> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

async function readSet(): Promise<Set<string>> {
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
      cache = new Set()
      return cache
    }

    const list = JSON.parse(raw) as string[]
    cache = new Set(list.filter(Boolean))
    return cache
  } catch {
    cache = new Set()
    return cache
  }
}

async function writeSet(set: Set<string>): Promise<void> {
  cache = set
  const payload = JSON.stringify([...set].sort())

  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  } else {
    localStorage.setItem(STORAGE_KEY, payload)
  }
  notify()
}

export function subscribeMasteredWords(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function getMasteredLemmaSet(): Promise<Set<string>> {
  return readSet()
}

export async function isMasteredLemma(rawLemma: string): Promise<boolean> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return false
  const set = await readSet()
  return set.has(lemma)
}

export async function setMasteredLemma(rawLemma: string, mastered: boolean): Promise<void> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return

  const set = await readSet()
  if (mastered) set.add(lemma)
  else set.delete(lemma)
  await writeSet(set)
}

export async function getMasteredWordCount(): Promise<number> {
  const set = await readSet()
  return set.size
}
