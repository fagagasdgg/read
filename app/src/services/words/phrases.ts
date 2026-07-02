import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { normalizeWordToken } from '../../lib/lemmatize'
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

export async function getWordPhraseRecord(rawLemma: string): Promise<WordPhraseRecord | null> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return null

  const store = await readStore()
  return store[lemma] ?? null
}

export async function fetchAndSaveWordPhrases(rawLemma: string): Promise<WordPhraseRecord> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) throw new Error('无效单词')

  const phrases = await fetchPhrasesOnline(lemma)
  const record: WordPhraseRecord = {
    lemma,
    fetchedAt: Date.now(),
    fetchSource: 'youdao',
    items: toNetworkItems(phrases),
  }

  const store = await readStore()
  store[lemma] = record
  await writeStore(store)
  return record
}

/** 标记已获取但结果为空，便于用户手动补充 */
export async function markWordPhrasesFetchedEmpty(rawLemma: string): Promise<WordPhraseRecord> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) throw new Error('无效单词')

  const store = await readStore()
  const record: WordPhraseRecord = {
    lemma,
    fetchedAt: Date.now(),
    fetchSource: 'youdao',
    items: [],
  }
  store[lemma] = record
  await writeStore(store)
  return record
}

export async function addManualWordPhrase(
  rawLemma: string,
  phrase: string,
  translation: string,
): Promise<WordPhraseRecord> {
  const lemma = normalizeWordToken(rawLemma)
  const phraseText = phrase.trim()
  const translationText = translation.trim()
  if (!lemma) throw new Error('无效单词')
  if (!phraseText || !translationText) throw new Error('请填写词组和释义')

  const store = await readStore()
  const existing = store[lemma] ?? emptyRecord(lemma)
  if (!existing.fetchedAt) {
    throw new Error('请先获取词组，或等待获取完成后再补充')
  }

  const key = normalizePhraseKey(phraseText)
  if (existing.items.some((item) => normalizePhraseKey(item.phrase) === key)) {
    throw new Error('该词组已存在')
  }

  const next: WordPhraseRecord = {
    ...existing,
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

  store[lemma] = next
  await writeStore(store)
  return next
}

export async function clearWordPhrases(rawLemma: string): Promise<void> {
  const lemma = normalizeWordToken(rawLemma)
  if (!lemma) return

  const store = await readStore()
  if (!store[lemma]) return

  delete store[lemma]
  await writeStore(store)
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
