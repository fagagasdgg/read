import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { parseEpubBuffer } from './parser'
import type { EpubBook } from './types'

const LAST_BOOK_KEY = 'read-last-book-id'
const BOOKS_DIR = 'books'

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

/** 浏览器：用 File；手机 APK：系统文件选择器 */
export async function importEpub(file?: File): Promise<EpubBook> {
  if (Capacitor.isNativePlatform()) {
    const result = await FilePicker.pickFiles({
      types: ['application/epub+zip', 'application/epub'],
      readData: true,
    })

    const picked = result.files[0]
    if (!picked?.data) throw new Error('未选择文件或无法读取内容')

    const fileName = picked.name || picked.path?.split('/').pop() || 'book.epub'
    const buffer = base64ToArrayBuffer(picked.data)
    const book = await parseEpubBuffer(buffer, fileName)

    await saveEpubToDevice(book.id, buffer)
    return book
  }

  if (!file) throw new Error('请选择 EPUB 文件')
  return parseEpubBuffer(await file.arrayBuffer(), file.name)
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}
