import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export const NOTEBOOK_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export type NotebookPageSize = (typeof NOTEBOOK_PAGE_SIZE_OPTIONS)[number]

const STORAGE_KEY = 'read-notebook-page-size'
const DEFAULT_PAGE_SIZE: NotebookPageSize = 20

export function isNotebookPageSize(value: number): value is NotebookPageSize {
  return (NOTEBOOK_PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
}

export async function loadNotebookPageSize(): Promise<NotebookPageSize> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }
    if (!raw) return DEFAULT_PAGE_SIZE
    const parsed = Number.parseInt(raw, 10)
    return isNotebookPageSize(parsed) ? parsed : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

export async function saveNotebookPageSize(size: NotebookPageSize): Promise<void> {
  const payload = String(size)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  } else {
    localStorage.setItem(STORAGE_KEY, payload)
  }
}
