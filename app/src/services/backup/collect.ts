import { exportAllCachedRecords, getDictionaryCacheStats } from '../dictionary/cache'
import { exportBookNotebookMap } from '../notes/bookNotebook'
import { exportNotebooksBackup } from '../notes/notebooks'
import { exportReadingTimeBackup } from '../reading/readingTime'
import { exportMasteredWordsList } from '../words/mastered'
import { exportPhraseStore } from '../words/phrases'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupManifest,
  type BackupPayload,
} from './types'

export async function collectBackupPayload(): Promise<BackupPayload> {
  const [dictionary, wordPhrases, masteredWords, notebooks, bookNotebooks, readingTime, stats] =
    await Promise.all([
      exportAllCachedRecords(),
      exportPhraseStore(),
      exportMasteredWordsList(),
      exportNotebooksBackup(),
      exportBookNotebookMap(),
      exportReadingTimeBackup(),
      getDictionaryCacheStats(),
    ])

  const notebookEntries = notebooks.documents.reduce((sum, doc) => sum + doc.entries.length, 0)
  const phraseLemmas = Object.keys(wordPhrases).length
  const readingDays = Object.keys(readingTime.days).length
  const readingBooks = Object.keys(readingTime.books).length
  const readingTotalMinutes = Math.round(
    Object.values(readingTime.days).reduce((sum, day) => sum + (day.totalMs ?? 0), 0) / 60_000,
  )

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    app: 'read',
    counts: {
      dictionaryWords: stats.wordCount,
      dictionaryNotFound: stats.notFoundCount,
      phraseLemmas,
      masteredWords: masteredWords.length,
      notebooks: notebooks.registry.length,
      notebookEntries,
      readingDays,
      readingBooks,
      readingTotalMinutes,
    },
  }

  return {
    manifest,
    dictionary,
    wordPhrases,
    masteredWords,
    notebooks,
    bookNotebooks,
    readingTime,
  }
}

export function summarizeBackupCounts(manifest: BackupManifest): string {
  const c = manifest.counts
  return `词条 ${c.dictionaryWords}、未找到 ${c.dictionaryNotFound}、词组单词 ${c.phraseLemmas}、已掌握 ${c.masteredWords}、笔记 ${c.notebooks} 本（${c.notebookEntries} 条）、阅读 ${c.readingTotalMinutes} 分钟（${c.readingDays} 天 / ${c.readingBooks} 本）`
}
