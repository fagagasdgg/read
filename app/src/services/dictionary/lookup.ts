import { fetchFromIciba } from './iciba'
import { DICTIONARY_SOURCES } from './providers'
import { recordSourceOutcome } from './sourceStatus'
import { fetchFromYoudao } from './youdao'
import type { OnlineDictionarySourceId, WordEntry } from './types'

const FETCHERS: Record<OnlineDictionarySourceId, (lemma: string) => Promise<WordEntry | null>> = {
  youdao: fetchFromYoudao,
  iciba: fetchFromIciba,
}

async function trySource(sourceId: OnlineDictionarySourceId, lemma: string): Promise<WordEntry | null> {
  try {
    const entry = await FETCHERS[sourceId](lemma)
    void recordSourceOutcome(sourceId, entry ? 'hit' : 'miss')
    return entry
  } catch (err) {
    const message = err instanceof Error ? err.message : '请求失败'
    void recordSourceOutcome(sourceId, 'error', message)
    return null
  }
}

export async function fetchWordFromProviders(
  lemma: string,
  options: { skipSources?: OnlineDictionarySourceId[] } = {},
): Promise<WordEntry | null> {
  const skip = new Set(options.skipSources ?? [])
  for (const source of DICTIONARY_SOURCES) {
    if (skip.has(source.id)) continue
    const entry = await trySource(source.id, lemma)
    if (entry) return entry
  }
  return null
}

export async function fetchWordFromProvider(
  sourceId: OnlineDictionarySourceId,
  lemma: string,
): Promise<WordEntry | null> {
  return trySource(sourceId, lemma)
}
