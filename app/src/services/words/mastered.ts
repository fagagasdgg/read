import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { normalizeWordToken, toLemma } from '../../lib/lemmatize'
import { resolveLemma } from '../dictionary/resolveLemma'

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

/** 同步判断：表面形 + compromise 还原（行间快速路径） */
export function isMasteredInSet(token: string, mastered: Set<string>): boolean {
  const surface = normalizeWordToken(token)
  if (!surface) return false
  if (mastered.has(surface)) return true
  const alt = toLemma(token)
  return Boolean(alt && alt !== surface && mastered.has(alt))
}

/**
 * 是否已掌握：认 ECDICT 原型、表面形、compromise 还原
 *（兼容旧数据把 grains / tell 等不同形态存进已掌握列表）
 */
export async function isMasteredLemma(rawLemma: string): Promise<boolean> {
  const surface = normalizeWordToken(rawLemma)
  if (!surface) return false
  const set = await readSet()
  if (set.has(surface)) return true

  const lemma = await resolveLemma(rawLemma, false)
  if (lemma && set.has(lemma)) return true

  const alt = toLemma(rawLemma)
  if (alt && alt !== surface && set.has(alt)) return true
  return false
}

/** 标记已掌握时写入 ECDICT 原型，与本地释义 / 词组键一致 */
export async function setMasteredLemma(rawLemma: string, mastered: boolean): Promise<void> {
  const lemma = (await resolveLemma(rawLemma, false)) || normalizeWordToken(rawLemma)
  if (!lemma) return

  const set = await readSet()
  if (mastered) {
    set.add(lemma)
    const surface = normalizeWordToken(rawLemma)
    if (surface && surface !== lemma) set.delete(surface)
  } else {
    set.delete(lemma)
    const surface = normalizeWordToken(rawLemma)
    if (surface) set.delete(surface)
  }
  await writeSet(set)
}

export async function getMasteredWordCount(): Promise<number> {
  const set = await readSet()
  return set.size
}

export async function exportMasteredWordsList(): Promise<string[]> {
  const set = await readSet()
  return [...set].sort()
}

export async function importMasteredWordsList(words: string[]): Promise<number> {
  const set = await readSet()
  let added = 0
  for (const raw of words) {
    const lemma = (await resolveLemma(raw, false)) || normalizeWordToken(raw)
    if (!lemma || set.has(lemma)) continue
    set.add(lemma)
    added += 1
  }
  await writeSet(set)
  return added
}
