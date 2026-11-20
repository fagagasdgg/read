import type { DictionaryCacheValue } from '../dictionary/types'
import type { NotebookDocument, NotebookMeta } from '../notes/notebooks'
import type { NoteTag } from '../notes/tags'
import type { ReadingTimeBackup } from '../reading/readingTime'
import type { WordPhraseRecord } from '../words/phrases'
import type { WordNote } from '../words/wordNotes'

/** 与 Preferences 中 clique 存储结构一致 */
export interface WordCliqueBackupStore {
  cliques: Record<
    string,
    {
      id: string
      lemmas: string[]
      updatedAt: number
    }
  >
  index: Record<string, string>
}

export const BACKUP_FORMAT = 'read-user-data'
export const BACKUP_VERSION = 1

export interface BackupManifestCounts {
  dictionaryWords: number
  dictionaryNotFound: number
  phraseLemmas: number
  masteredWords: number
  notebooks: number
  notebookEntries: number
  readingDays: number
  readingBooks: number
  readingTotalMinutes: number
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: number
  app: 'read'
  counts: BackupManifestCounts
}

export interface BackupPayload {
  manifest: BackupManifest
  dictionary: Array<{ lemma: string; value: DictionaryCacheValue }>
  wordPhrases: Record<string, WordPhraseRecord>
  masteredWords: string[]
  notebooks: {
    registry: NotebookMeta[]
    documents: NotebookDocument[]
  }
  bookNotebooks: Record<string, string>
  readingTime: ReadingTimeBackup
  /** 可选；旧 zip 无此文件时视为空标签库 */
  noteTags?: NoteTag[]
  /** 可选；形近词组 */
  wordLookalikes?: WordCliqueBackupStore
  /** 可选；义近词组 */
  wordSynonyms?: WordCliqueBackupStore
  /** 可选；单词笔记（lemma → 一段文字） */
  wordNotes?: Record<string, WordNote>
}

export interface ImportUserDataResult {
  dictionaryWords: number
  dictionaryNotFound: number
  phraseLemmas: number
  masteredWords: number
  notebooks: number
  notebookEntries: number
  readingDaysMerged: number
  readingBooksMerged: number
  readingTotalMinutes: number
  warnings: string[]
}

export interface ImportUserDataProgress {
  percent: number
  message: string
  phase: string
}
