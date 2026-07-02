import type { DictionarySourceId } from './types'

export interface DictionarySourceInfo {
  id: DictionarySourceId
  label: string
  role: 'primary' | 'fallback'
  description: string
}

export const DICTIONARY_SOURCES: DictionarySourceInfo[] = [
  {
    id: 'youdao',
    label: '有道词典',
    role: 'primary',
    description: '主查词信源，提供音标、等级、词性与变体',
  },
  {
    id: 'iciba',
    label: '金山词霸',
    role: 'fallback',
    description: '有道未命中时自动备用，国内可用',
  },
]

export function getDictionarySourceLabel(id: DictionarySourceId): string {
  return DICTIONARY_SOURCES.find((item) => item.id === id)?.label ?? id
}

export function getAllDictionarySourceIds(): DictionarySourceId[] {
  return DICTIONARY_SOURCES.map((item) => item.id)
}
