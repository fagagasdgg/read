import type { ReadingProgress } from './types'

const STORAGE_KEY = 'read-reading-progress'

export function loadProgress(bookId: string): ReadingProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, ReadingProgress>
    return all[bookId] ?? null
  } catch {
    return null
  }
}

export function saveProgress(bookId: string, chapterIndex: number): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all: Record<string, ReadingProgress> = raw ? JSON.parse(raw) : {}
    all[bookId] = { bookId, chapterIndex, updatedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 开发阶段忽略存储失败
  }
}
