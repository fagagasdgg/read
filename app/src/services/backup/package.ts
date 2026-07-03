import JSZip from 'jszip'
import type { BackupPayload } from './types'
import { BACKUP_FORMAT, BACKUP_VERSION } from './types'

const MANIFEST_FILE = 'manifest.json'
const DICTIONARY_FILE = 'dictionary.json'
const PHRASES_FILE = 'word-phrases.json'
const MASTERED_FILE = 'mastered-words.json'
const NOTEBOOKS_REGISTRY_FILE = 'notebooks/registry.json'
const NOTEBOOKS_DIR = 'notebooks/documents'
const BOOK_NOTEBOOKS_FILE = 'book-notebooks.json'

function notebookDocFile(id: string): string {
  return `${NOTEBOOKS_DIR}/${id}.json`
}

export async function buildBackupZip(payload: BackupPayload): Promise<Blob> {
  const zip = new JSZip()
  zip.file(MANIFEST_FILE, JSON.stringify(payload.manifest, null, 2))
  zip.file(DICTIONARY_FILE, JSON.stringify(payload.dictionary, null, 2))
  zip.file(PHRASES_FILE, JSON.stringify(payload.wordPhrases, null, 2))
  zip.file(MASTERED_FILE, JSON.stringify(payload.masteredWords, null, 2))
  zip.file(NOTEBOOKS_REGISTRY_FILE, JSON.stringify(payload.notebooks.registry, null, 2))
  zip.file(BOOK_NOTEBOOKS_FILE, JSON.stringify(payload.bookNotebooks, null, 2))

  for (const doc of payload.notebooks.documents) {
    zip.file(notebookDocFile(doc.id), JSON.stringify(doc, null, 2))
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export async function parseBackupZip(buffer: ArrayBuffer): Promise<BackupPayload> {
  const zip = await JSZip.loadAsync(buffer)

  async function readJson<T>(path: string, fallback: T): Promise<T> {
    const file = zip.file(path)
    if (!file) return fallback
    const raw = await file.async('string')
    return JSON.parse(raw) as T
  }

  const manifest = await readJson<BackupPayload['manifest']>(MANIFEST_FILE, {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 0,
    app: 'read',
    counts: {
      dictionaryWords: 0,
      dictionaryNotFound: 0,
      phraseLemmas: 0,
      masteredWords: 0,
      notebooks: 0,
      notebookEntries: 0,
    },
  })

  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error('不是有效的 Read 数据备份包')
  }
  if (manifest.version !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${manifest.version}`)
  }

  const dictionary = await readJson<BackupPayload['dictionary']>(DICTIONARY_FILE, [])
  const wordPhrases = await readJson<BackupPayload['wordPhrases']>(PHRASES_FILE, {})
  const masteredWords = await readJson<BackupPayload['masteredWords']>(MASTERED_FILE, [])
  const registry = await readJson<BackupPayload['notebooks']['registry']>(NOTEBOOKS_REGISTRY_FILE, [])
  const bookNotebooks = await readJson<BackupPayload['bookNotebooks']>(BOOK_NOTEBOOKS_FILE, {})

  const documents: BackupPayload['notebooks']['documents'] = []
  const docPrefix = `${NOTEBOOKS_DIR}/`
  const docFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith(docPrefix) && name.endsWith('.json') && !zip.files[name].dir,
  )

  for (const path of docFiles) {
    const file = zip.file(path)
    if (!file) continue
    try {
      const raw = await file.async('string')
      documents.push(JSON.parse(raw) as BackupPayload['notebooks']['documents'][number])
    } catch {
      // 跳过损坏的笔记文件
    }
  }

  for (const meta of registry) {
    if (!documents.some((doc) => doc.id === meta.id)) {
      documents.push({
        id: meta.id,
        title: meta.title,
        entries: [],
        updatedAt: meta.updatedAt,
      })
    }
  }

  return {
    manifest,
    dictionary,
    wordPhrases,
    masteredWords,
    notebooks: { registry, documents },
    bookNotebooks,
  }
}

export function formatBackupFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `read-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.zip`
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function downloadBackupBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
