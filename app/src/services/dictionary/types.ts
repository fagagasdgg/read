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

export interface LookupOptions {
  forceRefresh?: boolean
}
