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
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export function loadProgress(bookId: string): ReadingProgress | null {
  // 同步读取：优先 localStorage（WebView 内也可用）
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const all = JSON.parse(raw) as Record<string, ReadingProgress>
      if (all[bookId]) return all[bookId]
    }
  } catch {
    // ignore
  }
  return null
}

export async function loadProgressAsync(bookId: string): Promise<ReadingProgress | null> {
  const all = await readAll()
  return all[bookId] ?? loadProgress(bookId)
}

export function saveProgress(bookId: string, chapterIndex: number, pageIndex = 0): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all: Record<string, ReadingProgress> = raw ? JSON.parse(raw) : {}
    all[bookId] = { bookId, chapterIndex, pageIndex, updatedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    void writeAll(all)
  } catch {
    // 开发阶段忽略存储失败
  }
}
