import { fetchFromIciba } from './iciba'
import { DICTIONARY_SOURCES } from './providers'
import { fetchFromYoudao } from './youdao'
import type { DictionarySourceId, WordEntry } from './types'

const FETCHERS: Record<DictionarySourceId, (lemma: string) => Promise<WordEntry | null>> = {
  youdao: fetchFromYoudao,
  iciba: fetchFromIciba,
}

export async function fetchWordFromProviders(
  lemma: string,
  options: { skipSources?: DictionarySourceId[] } = {},
): Promise<WordEntry | null> {
  const skip = new Set(options.skipSources ?? [])
  for (const source of DICTIONARY_SOURCES) {
    if (skip.has(source.id)) continue
    try {
      const entry = await FETCHERS[source.id](lemma)
      if (entry) return entry
    } catch {
      // 当前信源失败，继续尝试下一个
    }
  }
  return null
}

export async function fetchWordFromProvider(
  sourceId: DictionarySourceId,
  lemma: string,
): Promise<WordEntry | null> {
  return FETCHERS[sourceId](lemma)
}
