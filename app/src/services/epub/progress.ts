import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { ReadingProgress } from './types'

const STORAGE_KEY = 'read-reading-progress'

async function readAll(): Promise<Record<string, ReadingProgress>> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (!value) return {}
      return JSON.parse(value) as Record<string, ReadingProgress>
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ReadingProgress>) : {}
  } catch {
    return {}
  }
}

async function writeAll(all: Record<string, ReadingProgress>): Promise<void> {
  const payload = JSON.stringify(all)
  localStorage.setItem(STORAGE_KEY, payload)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  }
}

function normalizeProgress(item: ReadingProgress): ReadingProgress {
  const legacy = item as ReadingProgress & { scrollTop?: number }
  return {
    ...item,
    pageIndex: legacy.pageIndex ?? 0,
  }
}

export function loadProgress(bookId: string): ReadingProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw) as Record<string, ReadingProgress>
      const item = all[bookId]
      if (item) return normalizeProgress(item)
    }
  } catch {
    // ignore
  }
  return null
}

export async function loadProgressAsync(bookId: string): Promise<ReadingProgress | null> {
  const all = await readAll()
  const item = all[bookId]
  if (item) return normalizeProgress(item)
  return loadProgress(bookId)
}

export async function saveProgressAsync(
  bookId: string,
  chapterIndex: number,
  pageIndex = 0,
): Promise<void> {
  try {
    const all = await readAll()
    all[bookId] = { bookId, chapterIndex, pageIndex, updatedAt: Date.now() }
    await writeAll(all)
  } catch {
    // 开发阶段忽略存储失败
  }
}

export function saveProgress(bookId: string, chapterIndex: number, pageIndex = 0): void {
  void saveProgressAsync(bookId, chapterIndex, pageIndex)
}
