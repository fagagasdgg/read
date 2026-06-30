import { toLemma } from '../../lib/lemmatize'
import { getCachedWord, setCachedWord } from './cache'
import { fetchFromYoudao } from './youdao'
import type { LookupOptions, WordEntry } from './types'

export type { LookupOptions, WordEntry, WordDefinition, WordForm, ExamLevel } from './types'
export { exportCachedWordsJson, listCachedWords } from './cache'
export { playSpeech } from './speech'

export async function lookupWord(
  rawWord: string,
  options: LookupOptions = {},
): Promise<WordEntry | null> {
  const lemma = toLemma(rawWord)
  if (!lemma) return null

  if (!options.forceRefresh) {
    const cached = await getCachedWord(lemma)
    if (cached) return cached
  }

  const entry = await fetchFromYoudao(lemma)
  if (!entry) return null

  await setCachedWord(entry)
  return entry
}
