import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { parseEpubBuffer } from './parser'
import { extractCoverFromBook } from './cover'
import { registerBook, saveBookCover } from './library'
import type { EpubBook } from './types'
import {
  assertEpubFileName,
  assertEpubSize,
  assertZipMagic,
  ImportCancelledError,
  isImportCancelled,
  toImportUserMessage,
} from './importValidation'

const LAST_BOOK_KEY = 'read-last-book-id'
const BOOKS_DIR = 'books'

interface PickedFile {
  name?: string
  path?: string
  data?: string
  blob?: Blob
  size?: number
}

export interface ImportFailure {
  fileName: string
  message: string
}

export interface ImportBatchResult {
  imported: number
  failed: ImportFailure[]
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function epubPath(bookId: string): string {
  return `${BOOKS_DIR}/${bookId}.epub`
}

async function saveEpubToDevice(bookId: string, buffer: ArrayBuffer): Promise<void> {
  await Filesystem.writeFile({
    path: epubPath(bookId),
    data: arrayBufferToBase64(buffer),
    directory: Directory.Data,
    recursive: true,
  })
  await Preferences.set({ key: LAST_BOOK_KEY, value: bookId })
}

export async function getLastBookId(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  const { value } = await Preferences.get({ key: LAST_BOOK_KEY })
  return value
}

export async function loadEpubFromDevice(bookId: string): Promise<EpubBook> {
  const { data } = await Filesystem.readFile({
    path: epubPath(bookId),
    directory: Directory.Data,
  })
  const base64 = typeof data === 'string' ? data : ''
  if (!base64) throw new Error('本地书籍文件损坏')
  return parseEpubBuffer(base64ToArrayBuffer(base64), `${bookId}.epub`)
}

async function readPickedFileBuffer(picked: PickedFile): Promise<ArrayBuffer> {
  if (picked.data) {
    return base64ToArrayBuffer(picked.data)
  }
  if (picked.blob) {
    return picked.blob.arrayBuffer()
  }
  if (picked.path) {
    const url = Capacitor.convertFileSrc(picked.path)
    const response = await fetch(url)
    if (!response.ok) throw new Error('无法读取所选文件')
    return response.arrayBuffer()
  }
  throw new Error('无法读取文件内容')
}

function pickedFileName(picked: PickedFile): string {
  return picked.name || picked.path?.split('/').pop() || 'book.epub'
}

async function importEpubBuffer(buffer: ArrayBuffer, fileName: string): Promise<EpubBook> {
  assertEpubFileName(fileName)
  assertEpubSize(buffer.byteLength, fileName)
  assertZipMagic(buffer)

  const book = await parseEpubBuffer(buffer, fileName)

  if (Capacitor.isNativePlatform()) {
    await saveEpubToDevice(book.id, buffer)
    const coverBlob = await extractCoverFromBook(book)
    if (coverBlob) await saveBookCover(book.id, coverBlob)
    await registerBook({
      id: book.id,
      title: book.title,
      author: book.author,
      fileName,
      hasCover: Boolean(coverBlob),
    })
  }

  return book
}

async function importOnePickedFile(picked: PickedFile): Promise<EpubBook> {
  const fileName = pickedFileName(picked)

  if (picked.size != null) {
    assertEpubSize(picked.size, fileName)
  }

  assertEpubFileName(fileName)

  const buffer = await readPickedFileBuffer(picked)
  return importEpubBuffer(buffer, fileName)
}

/** 批量导入 EPUB（手机支持多选；非 EPUB / 超大文件会跳过并给出提示） */
export async function importEpubBatch(files?: File[]): Promise<ImportBatchResult> {
  const failed: ImportFailure[] = []
  let imported = 0

  if (Capacitor.isNativePlatform()) {
    const result = await FilePicker.pickFiles({
      limit: 0,
      readData: false,
    })

    if (!result.files.length) {
      throw new ImportCancelledError()
    }

    for (const picked of result.files) {
      const fileName = pickedFileName(picked)
      try {
        await importOnePickedFile(picked)
        imported += 1
      } catch (err) {
        if (isImportCancelled(err)) throw err
        failed.push({
          fileName,
          message: toImportUserMessage(err, fileName),
        })
      }
    }

    return { imported, failed }
  }

  if (!files?.length) {
    throw new ImportCancelledError()
  }

  for (const file of files) {
    const fileName = file.name || 'book.epub'
    try {
      const buffer = await file.arrayBuffer()
      await importEpubBuffer(buffer, fileName)
      imported += 1
    } catch (err) {
      if (isImportCancelled(err)) throw err
      failed.push({
        fileName,
        message: toImportUserMessage(err, fileName),
      })
    }
  }

  return { imported, failed }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export { MAX_EPUB_BYTES, toImportUserMessage, isImportCancelled } from './importValidation'
