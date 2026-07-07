import type { DictionaryCacheValue } from '../dictionary/types'
import type { NotebookDocument, NotebookMeta } from '../notes/notebooks'
import type { ReadingTimeBackup } from '../reading/readingTime'
import type { WordPhraseRecord } from '../words/phrases'

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
