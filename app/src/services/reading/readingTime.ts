import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY = 'read-reading-time'

export interface ReadingDayRecord {
  date: string
  totalMs: number
  sessions: number
}

export interface ReadingTimeStats {
  todayMs: number
  weekMs: number
  totalMs: number
  recentDays: ReadingDayRecord[]
}

function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function readAll(): Promise<Record<string, ReadingDayRecord>> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ReadingDayRecord>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeAll(all: Record<string, ReadingDayRecord>): Promise<void> {
  const payload = JSON.stringify(all)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export async function addReadingDuration(ms: number, at = Date.now()): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return

  const key = todayKey(new Date(at))
  const all = await readAll()
  const current = all[key] ?? { date: key, totalMs: 0, sessions: 0 }
  all[key] = {
    date: key,
    totalMs: current.totalMs + Math.round(ms),
    sessions: current.sessions + 1,
  }
  await writeAll(all)
}

export async function getReadingTimeStats(): Promise<ReadingTimeStats> {
  const all = await readAll()
  const records = Object.values(all).sort((a, b) => b.date.localeCompare(a.date))
  const today = todayKey()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6)
  const weekStart = todayKey(weekAgo)

  let todayMs = 0
  let weekMs = 0
  let totalMs = 0

  for (const record of records) {
    totalMs += record.totalMs
    if (record.date === today) todayMs = record.totalMs
    if (record.date >= weekStart) weekMs += record.totalMs
  }

  return {
    todayMs,
    weekMs,
    totalMs,
    recentDays: records.slice(0, 14),
  }
}

export function formatReadingDuration(ms: number): string {
  if (ms <= 0) return '0 分钟'
  const totalMinutes = Math.round(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}
