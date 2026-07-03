import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY = 'read-book-notebook-defaults'

type BookNotebookMap = Record<string, string>

async function readMap(): Promise<BookNotebookMap> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (!value) return {}
      const parsed = JSON.parse(value) as BookNotebookMap
      return parsed && typeof parsed === 'object' ? parsed : {}
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as BookNotebookMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeMap(map: BookNotebookMap): Promise<void> {
  const payload = JSON.stringify(map)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export async function getBookDefaultNotebookId(bookId: string): Promise<string | null> {
  if (!bookId) return null
  const map = await readMap()
  const id = map[bookId]
  return typeof id === 'string' && id ? id : null
}

export async function setBookDefaultNotebookId(
  bookId: string,
  notebookId: string | null,
): Promise<void> {
  if (!bookId) return
  const map = await readMap()
  if (!notebookId) {
    delete map[bookId]
  } else {
    map[bookId] = notebookId
  }
  await writeMap(map)
}

export async function exportBookNotebookMap(): Promise<Record<string, string>> {
  return readMap()
}

export async function importBookNotebookMap(incoming: Record<string, unknown>): Promise<number> {
  const map = await readMap()
  let added = 0
  for (const [bookId, notebookId] of Object.entries(incoming)) {
    if (!bookId || typeof notebookId !== 'string' || !notebookId) continue
    if (!map[bookId]) {
      map[bookId] = notebookId
      added += 1
    }
  }
  await writeMap(map)
  return added
}
