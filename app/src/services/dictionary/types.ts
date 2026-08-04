export type OnlineDictionarySourceId = 'youdao' | 'iciba'
export type DictionarySourceId = OnlineDictionarySourceId | 'ecdict'

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
  /** 为 false 时仅作形态说明，不可点击跳转 */
  clickable?: boolean
}

export interface WordFrequencyInfo {
  /** 柯林斯星级 1–5 */
  collinsStar?: number
  /** 有道真题出现次数 */
  examFrequency?: number
  /** ECDICT BNC 词频序号（越小越常见） */
  bnc?: number
  /** ECDICT 当代语料词频序号（UI 展示为 COCA；越小越常见） */
  frq?: number
  /** @deprecated 使用 frq；兼容旧字段名 */
  coca?: number
  /** 是否牛津 3000 核心词 */
  oxford?: boolean
  fetchedAt: number
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
  frequency?: WordFrequencyInfo
  /** ECDICT 英文释义原文 */
  definitionEn?: string
  /** ECDICT 词性分布，如 n:46/v:54 */
  posDist?: string
  /** ECDICT exchange 原文字段 */
  exchange?: string
  /** ECDICT detail JSON 原文 */
  detail?: string
  cachedAt: number
  source: DictionarySourceId
}

/** 所有信源都查不到的词，避免重复联网 */
export interface WordNotFoundMarker {
  lemma: string
  notFound: true
  cachedAt: number
  triedSources: OnlineDictionarySourceId[]
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
