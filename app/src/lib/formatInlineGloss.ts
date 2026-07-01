import type { WordEntry } from '../services/dictionary/types'

export function formatInlineGloss(entry: WordEntry, maxMeanings: number): string {
  return entry.definitions
    .slice(0, maxMeanings)
    .map((item) => {
      const pos = item.pos?.trim()
      return pos ? `${pos} ${item.translation}` : item.translation
    })
    .join('；')
}
