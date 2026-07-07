import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { ScopedStorage } from '@daniele-rolli/capacitor-scoped-storage'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { getDictionaryCacheStats, importDictionaryRecords } from '../dictionary/cache'
import { importBookNotebookMap } from '../notes/bookNotebook'
import { importNotebooksBackup } from '../notes/notebooks'
import { getReadingTimeStats, importReadingTimeBackup } from '../reading/readingTime'
import {
  formatBackupDirectoryLabel,
  loadBackupDirectorySettings,
  resolveBackupFolder,
} from '../settings/backupDirectory'
import { getMasteredWordCount, importMasteredWordsList } from '../words/mastered'
import { getLemmaPhraseWordCount, importPhraseStore } from '../words/phrases'
import { collectBackupPayload, summarizeBackupCounts } from './collect'
import { notifyBackupDataChanged } from './events'
import {
  blobToBase64,
  buildBackupZip,
  downloadBackupBlob,
  formatBackupFilename,
  parseBackupZip,
} from './package'
import type { ImportUserDataResult } from './types'

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

export async function importUserDataBackup(file?: File): Promise<ImportUserDataResult> {
  let buffer: ArrayBuffer

  if (file) {
    buffer = await file.arrayBuffer()
  } else if (Capacitor.isNativePlatform()) {
    buffer = await readPickedZipBuffer()
  } else {
    throw new Error('请选择备份 zip 文件')
  }

  const payload = await parseBackupZip(buffer)
  const warnings: string[] = []

  const dictResult = await importDictionaryRecords(payload.dictionary)
  if (dictResult.skipped > 0) {
    warnings.push(`跳过 ${dictResult.skipped} 条无效词典记录`)
  }

  await importPhraseStore(payload.wordPhrases)
  await importMasteredWordsList(payload.masteredWords)
  const notebookResult = await importNotebooksBackup(payload.notebooks)
  warnings.push(...notebookResult.warnings)

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

  notifyBackupDataChanged()

  const stats = await getDictionaryCacheStats()
  const phraseLemmas = await getLemmaPhraseWordCount()
  const masteredTotal = await getMasteredWordCount()
  const readingStats = await getReadingTimeStats()

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
