import type { WordEntry } from '../services/dictionary/types'
import { splitTranslationMeanings } from './splitTranslationMeanings'

export interface InlineGlossFormatOptions {
  maxPosCount: number
  maxMeaningsPerPos: number
}

export function formatInlineGloss(
  entry: WordEntry,
  options: InlineGlossFormatOptions,
): string {
  const { maxPosCount, maxMeaningsPerPos } = options

  return entry.definitions
    .slice(0, maxPosCount)
    .map((item) => {
      const pos = item.pos?.trim()
      const meanings = splitTranslationMeanings(item.translation).slice(0, maxMeaningsPerPos)
      const translation = meanings.join('；')
      return pos ? `${pos} ${translation}` : translation
    })
    .join('；')
}
