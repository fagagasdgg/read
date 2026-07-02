import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { removeBookFromAllGroups } from './groups'

export interface SavedBookMeta {
  id: string
  title: string
  author: string
  fileName: string
  importedAt: number
  lastReadAt: number
  hasCover?: boolean
}

const REGISTRY_KEY = 'read-book-registry'
const BOOKS_DIR = 'books'
const COVERS_DIR = 'covers'

function epubPath(bookId: string): string {
  return `${BOOKS_DIR}/${bookId}.epub`
}

function coverPath(bookId: string): string {
  return `${COVERS_DIR}/${bookId}.jpg`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function readRegistry(): Promise<SavedBookMeta[]> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: REGISTRY_KEY })
      if (!value) return []
      return JSON.parse(value) as SavedBookMeta[]
    }
    const raw = localStorage.getItem(REGISTRY_KEY)
    return raw ? (JSON.parse(raw) as SavedBookMeta[]) : []
  } catch {
    return []
  }
}

async function writeRegistry(books: SavedBookMeta[]): Promise<void> {
  const payload = JSON.stringify(books)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: REGISTRY_KEY, value: payload })
    return
  }
  localStorage.setItem(REGISTRY_KEY, payload)
}

export async function registerBook(
  meta: Omit<SavedBookMeta, 'importedAt' | 'lastReadAt'> & { hasCover?: boolean },
): Promise<void> {
  const now = Date.now()
  const books = await readRegistry()
  const existing = books.find((b) => b.id === meta.id)
  if (existing) {
    existing.title = meta.title
    existing.author = meta.author
    existing.fileName = meta.fileName
    existing.lastReadAt = now
    if (meta.hasCover !== undefined) existing.hasCover = meta.hasCover
  } else {
    books.unshift({
      ...meta,
      importedAt: now,
      lastReadAt: now,
    })
  }
  books.sort((a, b) => b.lastReadAt - a.lastReadAt)
  await writeRegistry(books)
}

export async function setBookHasCover(bookId: string, hasCover: boolean): Promise<void> {
  const books = await readRegistry()
  const item = books.find((b) => b.id === bookId)
  if (!item) return
  item.hasCover = hasCover
  await writeRegistry(books)
}

export async function saveBookCover(bookId: string, blob: Blob): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const base64 = arrayBufferToBase64(await blob.arrayBuffer())
  await Filesystem.writeFile({
    path: coverPath(bookId),
    data: base64,
    directory: Directory.Data,
    recursive: true,
  })
}

export async function getBookCoverDataUrl(bookId: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const { data } = await Filesystem.readFile({
      path: coverPath(bookId),
      directory: Directory.Data,
    })
    if (typeof data !== 'string' || !data) return null
    return `data:image/jpeg;base64,${data}`
  } catch {
    return null
  }
}

export async function touchBookLastRead(bookId: string): Promise<void> {
  const books = await readRegistry()
  const book = books.find((b) => b.id === bookId)
  if (!book) return
  book.lastReadAt = Date.now()
  books.sort((a, b) => b.lastReadAt - a.lastReadAt)
  await writeRegistry(books)
}

export async function listSavedBooks(): Promise<SavedBookMeta[]> {
  const books = await readRegistry()
  return books.sort((a, b) => b.lastReadAt - a.lastReadAt)
}

export async function removeSavedBook(bookId: string): Promise<void> {
  await removeBookFromAllGroups(bookId)
  const books = (await readRegistry()).filter((b) => b.id !== bookId)
  await writeRegistry(books)

  if (!Capacitor.isNativePlatform()) return

  try {
    await Filesystem.deleteFile({
      path: epubPath(bookId),
      directory: Directory.Data,
    })
    await Filesystem.deleteFile({
      path: coverPath(bookId),
      directory: Directory.Data,
    })
  } catch {
    // 文件可能已不存在
  }
}
