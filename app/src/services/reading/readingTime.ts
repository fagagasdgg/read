import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { loadAllProgress } from '../epub/progress'
import { listSavedBooks } from '../epub/library'
import { countNotebookEntries } from '../notes/notebooks'

const STORAGE_KEY = 'read-reading-time-v2'
const LEGACY_KEY = 'read-reading-time'

export type PeriodMode = 'week' | 'month' | 'year'

interface DayRecord {
  date: string
  totalMs: number
  byBook: Record<string, number>
}

interface BookRecord {
  bookId: string
  title: string
  totalMs: number
  updatedAt: number
}

export interface ReadingTimeBackup {
  days: Record<string, DayRecord>
  books: Record<string, BookRecord>
}

interface ReadingStore {
  days: Record<string, DayRecord>
  books: Record<string, BookRecord>
}

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

export interface ReadingBookRank {
  bookId: string
  title: string
  totalMs: number
}

export interface ReadingHistoryStats {
  totalMs: number
  hours: number
  minutes: number
  todayMs: number
  dailyAvgMinutes: number
  comparePercent: number | null
  comparePeriodLabel: string
  daysRead: number
  booksFinished: number
  booksRead: number
  noteCount: number
  distribution: Array<{ label: string; ms: number; dateKey: string; tooltip?: string }>
  distributionMaxMs: number
  /** @deprecated 使用 topBooks */
  longestBook: ReadingBookRank | null
  topBooks: ReadingBookRank[]
  periodLabel: string
}

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6)
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31)
}

function formatMonthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`
}

function formatPeriodLabel(mode: PeriodMode, anchor: Date): string {
  if (mode === 'year') return `${anchor.getFullYear()}年`
  if (mode === 'month') return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`
  const start = startOfWeek(anchor)
  const end = endOfWeek(anchor)
  return `${formatMonthDay(start)}至${formatMonthDay(end)}`
}

function getPeriodRange(mode: PeriodMode, anchor: Date): { start: Date; end: Date } {
  if (mode === 'year') {
    return { start: startOfYear(anchor), end: endOfYear(anchor) }
  }
  if (mode === 'month') {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  }
  return { start: startOfWeek(anchor), end: endOfWeek(anchor) }
}

function shiftAnchor(mode: PeriodMode, anchor: Date, delta: number): Date {
  const d = new Date(anchor)
  if (mode === 'year') {
    d.setFullYear(d.getFullYear() + delta)
    return d
  }
  if (mode === 'month') {
    d.setMonth(d.getMonth() + delta)
    return d
  }
  return addDays(d, delta * 7)
}

export function shiftReadingPeriod(mode: PeriodMode, anchor: Date, delta: number): Date {
  return shiftAnchor(mode, anchor, delta)
}

export function isCurrentReadingPeriod(
  mode: PeriodMode,
  anchor: Date,
  now = new Date(),
): boolean {
  if (mode === 'year') return anchor.getFullYear() === now.getFullYear()
  if (mode === 'month') {
    return anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
  }
  return dateKey(startOfWeek(anchor)) === dateKey(startOfWeek(now))
}

export function currentPeriodResetLabel(mode: PeriodMode): string {
  if (mode === 'year') return '回到今年'
  if (mode === 'month') return '回到本月'
  return '回到本周'
}

async function readStore(): Promise<ReadingStore> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }

    if (raw) {
      const parsed = JSON.parse(raw) as ReadingStore
      if (parsed?.days) return parsed
    }

    return migrateLegacyStore()
  } catch {
    return { days: {}, books: {} }
  }
}

export async function getReadingStoreSnapshot(): Promise<ReadingTimeBackup> {
  return readStore()
}

export async function exportReadingTimeBackup(): Promise<ReadingTimeBackup> {
  return readStore()
}

export async function importReadingTimeBackup(
  incoming: ReadingTimeBackup | null | undefined,
): Promise<{ daysMerged: number; booksMerged: number }> {
  if (!incoming?.days) {
    return { daysMerged: 0, booksMerged: 0 }
  }

  const store = await readStore()
  let daysMerged = 0
  let booksMerged = 0

  for (const [key, day] of Object.entries(incoming.days)) {
    if (!day?.date || !Number.isFinite(day.totalMs) || day.totalMs <= 0) continue

    const existing = store.days[key] ?? { date: key, totalMs: 0, byBook: {} }
    existing.totalMs += day.totalMs

    for (const [bookId, ms] of Object.entries(day.byBook ?? {})) {
      if (!Number.isFinite(ms) || ms <= 0) continue
      existing.byBook[bookId] = (existing.byBook[bookId] ?? 0) + ms
    }

    store.days[key] = existing
    daysMerged += 1
  }

  for (const [bookId, book] of Object.entries(incoming.books ?? {})) {
    if (!book?.bookId || !Number.isFinite(book.totalMs) || book.totalMs <= 0) continue

    const existing = store.books[bookId]
    if (!existing) continue

    existing.totalMs += book.totalMs
    if ((book.updatedAt ?? 0) >= existing.updatedAt) {
      existing.updatedAt = book.updatedAt ?? existing.updatedAt
    }

    store.books[bookId] = existing
    booksMerged += 1
  }

  if (daysMerged > 0 || booksMerged > 0) {
    await writeStore(store)
  }

  return { daysMerged, booksMerged }
}

async function migrateLegacyStore(): Promise<ReadingStore> {
  const store: ReadingStore = { days: {}, books: {} }
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: LEGACY_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(LEGACY_KEY)
    }
    if (!raw) return store

    const legacy = JSON.parse(raw) as Record<string, { date: string; totalMs: number }>
    for (const item of Object.values(legacy)) {
      if (!item?.date || !item.totalMs) continue
      store.days[item.date] = {
        date: item.date,
        totalMs: item.totalMs,
        byBook: {},
      }
    }
    await writeStore(store)
  } catch {
    // ignore
  }
  return store
}

async function writeStore(store: ReadingStore): Promise<void> {
  const payload = JSON.stringify(store)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

function sumMsInRange(store: ReadingStore, start: Date, end: Date): number {
  let total = 0
  const cursor = startOfDay(start)
  const endDay = startOfDay(end)
  while (cursor <= endDay) {
    const key = dateKey(cursor)
    total += store.days[key]?.totalMs ?? 0
    cursor.setDate(cursor.getDate() + 1)
  }
  return total
}

function daysWithReadingInRange(store: ReadingStore, start: Date, end: Date): number {
  let count = 0
  const cursor = startOfDay(start)
  const endDay = startOfDay(end)
  while (cursor <= endDay) {
    const key = dateKey(cursor)
    if ((store.days[key]?.totalMs ?? 0) > 0) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function bookMsInRange(
  store: ReadingStore,
  start: Date,
  end: Date,
): Record<string, number> {
  const totals: Record<string, number> = {}
  const cursor = startOfDay(start)
  const endDay = startOfDay(end)
  while (cursor <= endDay) {
    const key = dateKey(cursor)
    const day = store.days[key]
    if (day?.byBook) {
      for (const [bookId, ms] of Object.entries(day.byBook)) {
        totals[bookId] = (totals[bookId] ?? 0) + ms
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return totals
}

function buildDistribution(
  mode: PeriodMode,
  anchor: Date,
  store: ReadingStore,
): ReadingHistoryStats['distribution'] {
  const { start, end } = getPeriodRange(mode, anchor)
  const items: ReadingHistoryStats['distribution'] = []

  if (mode === 'week') {
    const labels = ['一', '二', '三', '四', '五', '六', '日']
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(start, i)
      const key = dateKey(day)
      const ms = store.days[key]?.totalMs ?? 0
      items.push({
        label: labels[i],
        ms,
        dateKey: key,
        tooltip: `${key} ${formatReadingDuration(ms)}`,
      })
    }
    return items
  }

  if (mode === 'month') {
    const cursor = startOfDay(start)
    const endDay = startOfDay(end)
    while (cursor <= endDay) {
      const key = dateKey(cursor)
      const ms = store.days[key]?.totalMs ?? 0
      items.push({
        label: String(cursor.getDate()),
        ms,
        dateKey: key,
        tooltip: `${formatMonthDay(cursor)} ${formatReadingDuration(ms)}`,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return items
  }

  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(anchor.getFullYear(), month, 1)
    const monthEnd = endOfMonth(monthStart)
    const ms = sumMsInRange(store, monthStart, monthEnd)
    items.push({
      label: String(month + 1),
      ms,
      dateKey: dateKey(monthStart),
      tooltip: `${anchor.getFullYear()}年${month + 1}月 ${formatReadingDuration(ms)}`,
    })
  }
  return items
}

async function countFinishedBooks(): Promise<number> {
  const progress = await loadAllProgress()
  let count = 0
  for (const item of Object.values(progress)) {
    if (typeof item.progressPercent === 'number' && item.progressPercent >= 99) {
      count += 1
    }
  }
  return count
}

export async function addBookReadingSession(
  bookId: string,
  title: string,
  ms: number,
  at = Date.now(),
): Promise<void> {
  if (!Number.isFinite(ms) || ms < 5000) return

  const rounded = Math.round(ms)
  const key = dateKey(new Date(at))
  const store = await readStore()
  const day = store.days[key] ?? { date: key, totalMs: 0, byBook: {} }
  day.totalMs += rounded
  day.byBook[bookId] = (day.byBook[bookId] ?? 0) + rounded
  store.days[key] = day

  const book = store.books[bookId] ?? {
    bookId,
    title: title.trim() || '未知书籍',
    totalMs: 0,
    updatedAt: at,
  }
  book.title = title.trim() || book.title
  book.totalMs += rounded
  book.updatedAt = at
  store.books[bookId] = book

  await writeStore(store)
}

/** @deprecated 使用 addBookReadingSession */
export async function addReadingDuration(ms: number, at = Date.now()): Promise<void> {
  await addBookReadingSession('unknown', '阅读中', ms, at)
}

export async function getReadingTimeStats(): Promise<ReadingTimeStats> {
  const store = await readStore()
  const records = Object.values(store.days)
    .map((d) => ({ date: d.date, totalMs: d.totalMs, sessions: 0 }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const today = dateKey(new Date())
  const weekStart = dateKey(startOfWeek(new Date()))
  let todayMs = 0
  let weekMs = 0
  let totalMs = 0

  for (const record of records) {
    totalMs += record.totalMs
    if (record.date === today) todayMs = record.totalMs
    if (record.date >= weekStart) weekMs += record.totalMs
  }

  return { todayMs, weekMs, totalMs, recentDays: records.slice(0, 14) }
}

export async function getReadingHistoryStats(
  mode: PeriodMode,
  anchor: Date,
): Promise<ReadingHistoryStats> {
  const store = await readStore()
  const savedBooks = await listSavedBooks()
  const localBookIds = new Set(savedBooks.map((book) => book.id))
  const localBookTitles = new Map(savedBooks.map((book) => [book.id, book.title]))
  const todayMs = store.days[dateKey(new Date())]?.totalMs ?? 0
  const { start, end } = getPeriodRange(mode, anchor)
  const totalMs = sumMsInRange(store, start, end)
  const totalMinutes = Math.floor(totalMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  const periodDays =
    mode === 'year'
      ? 365
      : mode === 'month'
        ? end.getDate()
        : 7
  const dailyAvgMinutes = Math.round(totalMs / 60_000 / periodDays)

  const prevAnchor = shiftAnchor(mode, anchor, -1)
  const prevRange = getPeriodRange(mode, prevAnchor)
  const prevMs = sumMsInRange(store, prevRange.start, prevRange.end)
  let comparePercent: number | null = null
  if (prevMs > 0) {
    comparePercent = Math.round(((totalMs - prevMs) / prevMs) * 100)
  } else if (totalMs > 0) {
    comparePercent = 100
  }

  const comparePeriodLabel =
    mode === 'year' ? '去年' : mode === 'month' ? '上月' : '上周'

  const bookTotals = bookMsInRange(store, start, end)
  const booksRead = Object.values(bookTotals).filter((ms) => ms >= 5000).length
  const booksFinished = await countFinishedBooks()

  const noteFrom = start.getTime()
  const noteTo = end.getTime() + 86_400_000 - 1
  const noteCount = await countNotebookEntries({ from: noteFrom, to: noteTo })

  const distribution = buildDistribution(mode, anchor, store)
  const distributionMaxMs = Math.max(...distribution.map((d) => d.ms), 1)

  const topBooks: ReadingBookRank[] = Object.entries(bookTotals)
    .filter(([bookId, ms]) => ms > 0 && localBookIds.has(bookId))
    .map(([bookId, ms]) => ({
      bookId,
      title: localBookTitles.get(bookId) ?? store.books[bookId]?.title ?? '未知书籍',
      totalMs: ms,
    }))
    .sort((a, b) => b.totalMs - a.totalMs)

  const longestBook = topBooks[0] ?? null

  return {
    totalMs,
    hours,
    minutes,
    todayMs,
    dailyAvgMinutes,
    comparePercent,
    comparePeriodLabel,
    daysRead: daysWithReadingInRange(store, start, end),
    booksFinished,
    booksRead,
    noteCount,
    distribution,
    distributionMaxMs,
    longestBook,
    topBooks,
    periodLabel: formatPeriodLabel(mode, anchor),
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

export function formatCompareText(stats: ReadingHistoryStats): string {
  const avg = stats.dailyAvgMinutes
  const avgText = avg > 0 ? `日均阅读 ${avg} 分钟` : '日均阅读 0 分钟'
  if (stats.comparePercent === null) {
    return `${avgText}，暂无上一周期对比数据`
  }
  if (stats.comparePercent === 0) {
    return `${avgText}，与${stats.comparePeriodLabel}持平`
  }
  const direction = stats.comparePercent > 0 ? '增加' : '减少'
  return `${avgText}，较${stats.comparePeriodLabel}${direction} ${Math.abs(stats.comparePercent)}%`
}
