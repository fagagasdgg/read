import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'

export interface SavedBookMeta {
  id: string
  title: string
  author: string
  fileName: string
  importedAt: number
  lastReadAt: number
}

const REGISTRY_KEY = 'read-book-registry'
const BOOKS_DIR = 'books'

function epubPath(bookId: string): string {
  return `${BOOKS_DIR}/${bookId}.epub`
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

export async function registerBook(meta: Omit<SavedBookMeta, 'importedAt' | 'lastReadAt'>): Promise<void> {
  const now = Date.now()
  const books = await readRegistry()
  const existing = books.find((b) => b.id === meta.id)
  if (existing) {
    existing.title = meta.title
    existing.author = meta.author
    existing.fileName = meta.fileName
    existing.lastReadAt = now
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
  const books = (await readRegistry()).filter((b) => b.id !== bookId)
  await writeRegistry(books)

  if (!Capacitor.isNativePlatform()) return

  try {
    await Filesystem.deleteFile({
      path: epubPath(bookId),
      directory: Directory.Data,
    })
  } catch {
    // 文件可能已不存在
  }
}
