import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { ScopedStorage } from '@daniele-rolli/capacitor-scoped-storage'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { getDictionaryCacheStats, importDictionaryRecords } from '../dictionary/cache'
import { importBookNotebookMap } from '../notes/bookNotebook'
import { importNotebooksBackup, resetFrequencyNotebookRepair } from '../notes/notebooks'
import {
  importNoteTagsBackup,
  remapTagIds,
  sanitizeAllEntryTagIds,
} from '../notes/tags'
import { getReadingTimeStats, importReadingTimeBackup } from '../reading/readingTime'
import {
  formatBackupDirectoryLabel,
  loadBackupDirectorySettings,
  resolveBackupFolder,
} from '../settings/backupDirectory'
import { getMasteredWordCount, importMasteredWordsList } from '../words/mastered'
import { getLemmaPhraseWordCount, importPhraseStore } from '../words/phrases'
import { importCliqueStore } from '../words/wordCliques'
import { importWordNotesStore } from '../words/wordNotes'
import { collectBackupPayload, summarizeBackupCounts } from './collect'
import { notifyBackupDataChanged } from './events'
import {
  blobToBase64,
  buildBackupZip,
  downloadBackupBlob,
  formatBackupFilename,
  parseBackupZip,
} from './package'
import type { ImportUserDataProgress, ImportUserDataResult } from './types'

function yieldUi(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

async function reportImportProgress(
  onProgress: ((p: ImportUserDataProgress) => void) | undefined,
  percent: number,
  message: string,
  phase: string,
): Promise<void> {
  onProgress?.({ percent, message, phase })
  await yieldUi()
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function readPickedZipBuffer(): Promise<ArrayBuffer> {
  const result = await FilePicker.pickFiles({
    types: ['application/zip', 'application/x-zip-compressed'],
    limit: 1,
    readData: true,
  })

  const picked = result.files?.[0]
  if (!picked) throw new Error('未选择文件')

  if (picked.data) {
    return base64ToArrayBuffer(picked.data)
  }

  if (picked.path) {
    const url = Capacitor.convertFileSrc(picked.path)
    const response = await fetch(url)
    if (!response.ok) throw new Error('无法读取所选备份文件')
    return response.arrayBuffer()
  }

  if (picked.blob) {
    return picked.blob.arrayBuffer()
  }

  throw new Error('无法读取所选备份文件')
}

async function saveNativeBackupZip(zipBlob: Blob, filename: string): Promise<string> {
  const base64 = await blobToBase64(zipBlob)
  const dir = await loadBackupDirectorySettings()
  const folder = resolveBackupFolder(dir)

  if (folder) {
    try {
      await ScopedStorage.writeFile({
        folder,
        path: filename,
        data: base64,
        encoding: 'base64',
        mimeType: 'application/zip',
      })
      return `${formatBackupDirectoryLabel(dir)}/${filename}`
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `无法写入所选备份目录，请在设置中重新选择目录后重试。${message.includes('Permission') ? '（目录访问权限已失效）' : ''}`,
      )
    }
  }

  const path = `read-backups/${filename}`
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  })
  return `Documents/${path}`
}

export async function exportUserDataBackup(): Promise<{
  filename: string
  summary: string
  savedPath?: string
}> {
  const payload = await collectBackupPayload()
  const zipBlob = await buildBackupZip(payload)
  const filename = formatBackupFilename()
  const summary = summarizeBackupCounts(payload.manifest)

  if (Capacitor.isNativePlatform()) {
    const savedPath = await saveNativeBackupZip(zipBlob, filename)
    return {
      filename,
      summary,
      savedPath,
    }
  }

  downloadBackupBlob(zipBlob, filename)
  return { filename, summary }
}

export async function importUserDataBackup(
  file?: File,
  onProgress?: (progress: ImportUserDataProgress) => void,
): Promise<ImportUserDataResult> {
  await reportImportProgress(onProgress, 2, '读取备份文件…', 'read')
  let buffer: ArrayBuffer

  if (file) {
    buffer = await file.arrayBuffer()
  } else if (Capacitor.isNativePlatform()) {
    buffer = await readPickedZipBuffer()
  } else {
    throw new Error('请选择备份 zip 文件')
  }

  await reportImportProgress(onProgress, 8, '解析压缩包…', 'parse')
  const payload = await parseBackupZip(buffer)
  const warnings: string[] = []

  await reportImportProgress(onProgress, 18, '导入词典缓存…', 'dictionary')
  const dictResult = await importDictionaryRecords(payload.dictionary)
  if (dictResult.skipped > 0) {
    warnings.push(`跳过 ${dictResult.skipped} 条无效词典记录`)
  }

  await reportImportProgress(onProgress, 32, '导入词组…', 'phrases')
  await importPhraseStore(payload.wordPhrases)

  await reportImportProgress(onProgress, 40, '导入已掌握单词…', 'mastered')
  await importMasteredWordsList(payload.masteredWords)

  await reportImportProgress(onProgress, 48, '导入笔记标签…', 'tags')
  const tagImport = await importNoteTagsBackup(payload.noteTags ?? [])
  if (tagImport.added > 0) {
    warnings.push(`合并 ${tagImport.added} 个笔记标签`)
  }

  await reportImportProgress(onProgress, 56, '导入形近词 / 义近词…', 'relations')
  const lookalikeImport = await importCliqueStore('lookalike', payload.wordLookalikes)
  if (lookalikeImport.merged > 0) {
    warnings.push(`合并 ${lookalikeImport.merged} 条形近词关系`)
  }
  const synonymImport = await importCliqueStore('synonym', payload.wordSynonyms)
  if (synonymImport.merged > 0) {
    warnings.push(`合并 ${synonymImport.merged} 条义近词关系`)
  }

  await reportImportProgress(onProgress, 62, '导入单词笔记…', 'word-notes')
  const notesImport = await importWordNotesStore(payload.wordNotes)
  if (notesImport.merged > 0) {
    warnings.push(`合并 ${notesImport.merged} 条单词笔记`)
  }

  await reportImportProgress(onProgress, 70, '整理笔记本标签…', 'remap-tags')
  for (const doc of payload.notebooks.documents) {
    for (const entry of doc.entries) {
      const next = remapTagIds(entry.tagIds, tagImport.remapped)
      if (next.length) entry.tagIds = next
      else delete entry.tagIds
    }
  }

  await reportImportProgress(onProgress, 82, '导入笔记本…', 'notebooks')
  const notebookResult = await importNotebooksBackup(payload.notebooks)
  warnings.push(...notebookResult.warnings)
  resetFrequencyNotebookRepair()
  await sanitizeAllEntryTagIds()

  await reportImportProgress(onProgress, 90, '导入书籍映射与阅读时长…', 'reading')
  const bookNotebookAdded = await importBookNotebookMap(payload.bookNotebooks)

  if (bookNotebookAdded > 0) {
    warnings.push(`合并 ${bookNotebookAdded} 条书籍默认笔记本映射`)
  }

  const readingResult = await importReadingTimeBackup(payload.readingTime)
  if (readingResult.daysMerged > 0 || readingResult.booksMerged > 0) {
    warnings.push(
      `合并阅读时长：${readingResult.daysMerged} 天、${readingResult.booksMerged} 本书`,
    )
  }

  await reportImportProgress(onProgress, 96, '刷新统计…', 'finalize')
  notifyBackupDataChanged()

  const stats = await getDictionaryCacheStats()
  const phraseLemmas = await getLemmaPhraseWordCount()
  const masteredTotal = await getMasteredWordCount()
  const readingStats = await getReadingTimeStats()

  await reportImportProgress(onProgress, 100, '导入完成', 'done')

  return {
    dictionaryWords: stats.wordCount,
    dictionaryNotFound: stats.notFoundCount,
    phraseLemmas,
    masteredWords: masteredTotal,
    notebooks: notebookResult.notebooks,
    notebookEntries: notebookResult.entries,
    readingDaysMerged: readingResult.daysMerged,
    readingBooksMerged: readingResult.booksMerged,
    readingTotalMinutes: Math.round(readingStats.totalMs / 60_000),
    warnings,
  }
}

export async function pickAndImportUserDataBackup(): Promise<ImportUserDataResult> {
  return importUserDataBackup()
}
