export type ExamLevel =
  | '中考'
  | '高考'
  | 'CET4'
  | 'CET6'
  | '考研'
  | '雅思'
  | '托福'
  | string

export interface WordDefinition {
  pos?: string
  translation: string
}

export interface WordForm {
  label: string
  value: string
}

export interface WordEntry {
  lemma: string
  phoneticUs: string
  phoneticUk: string
  usSpeechUrl: string
  ukSpeechUrl: string
  examLevels: ExamLevel[]
  definitions: WordDefinition[]
  forms: WordForm[]
  cachedAt: number
  source: 'youdao'
}

/** 有道查不到的词，避免重复联网 */
export interface WordNotFoundMarker {
  lemma: string
  notFound: true
  cachedAt: number
}

export type DictionaryCacheValue = WordEntry | WordNotFoundMarker

export function isWordNotFoundMarker(value: DictionaryCacheValue): value is WordNotFoundMarker {
  return 'notFound' in value && value.notFound === true
}

export function isWordEntry(value: DictionaryCacheValue): value is WordEntry {
  return !isWordNotFoundMarker(value)
}

export interface LookupOptions {
  forceRefresh?: boolean
  /** 点击词形变体时按原词查询，不做词形还原 */
  exactToken?: boolean
}
