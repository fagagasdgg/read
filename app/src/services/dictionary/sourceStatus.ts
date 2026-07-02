import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { fetchFromIciba } from './iciba'
import { DICTIONARY_SOURCES } from './providers'
import { fetchFromYoudao } from './youdao'
import type { DictionarySourceId } from './types'

export type SourceHealth = 'unknown' | 'healthy' | 'degraded' | 'offline'

export type SourceOutcome = 'hit' | 'miss' | 'error'

interface SourceCounters {
  hit: number
  miss: number
  error: number
  recent: SourceOutcome[]
  lastCheckAt: number | null
  lastSuccessAt: number | null
  lastErrorAt: number | null
  lastErrorMessage: string
}

export interface SourceStatusView {
  id: DictionarySourceId
  label: string
  role: 'primary' | 'fallback'
  health: SourceHealth
  healthLabel: string
  totalChecks: number
  hitCount: number
  missCount: number
  errorCount: number
  successRate: number | null
  lastCheckAt: number | null
  lastErrorMessage: string
}

const STORAGE_KEY = 'read-dictionary-source-stats'
const RECENT_LIMIT = 30
const PROBE_WORD = 'hello'

type StatsMap = Record<DictionarySourceId, SourceCounters>

const listeners = new Set<() => void>()

function emptyCounters(): SourceCounters {
  return {
    hit: 0,
    miss: 0,
    error: 0,
    recent: [],
    lastCheckAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: '',
  }
}

function defaultStats(): StatsMap {
  return {
    youdao: emptyCounters(),
    iciba: emptyCounters(),
  }
}

let statsCache: StatsMap | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

async function readStats(): Promise<StatsMap> {
  if (statsCache) return statsCache

  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(STORAGE_KEY)
    }

    if (!raw) {
      statsCache = defaultStats()
      return statsCache
    }

    const parsed = JSON.parse(raw) as Partial<StatsMap>
    statsCache = {
      youdao: { ...emptyCounters(), ...parsed.youdao },
      iciba: { ...emptyCounters(), ...parsed.iciba },
    }
    return statsCache
  } catch {
    statsCache = defaultStats()
    return statsCache
  }
}

async function writeStats(stats: StatsMap): Promise<void> {
  statsCache = stats
  const payload = JSON.stringify(stats)

  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void (async () => {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key: STORAGE_KEY, value: payload })
      } else {
        localStorage.setItem(STORAGE_KEY, payload)
      }
    })()
  }, 300)
}

function pushRecent(counter: SourceCounters, outcome: SourceOutcome): void {
  counter.recent = [...counter.recent, outcome].slice(-RECENT_LIMIT)
}

function computeHealth(counter: SourceCounters): SourceHealth {
  if (!counter.lastCheckAt) return 'unknown'

  const recent = counter.recent
  if (!recent.length) return 'unknown'

  const errors = recent.filter((item) => item === 'error').length
  const errorRate = errors / recent.length
  const last = recent[recent.length - 1]

  if (last === 'error') {
    const tail = recent.slice(-3)
    if (tail.length === 3 && tail.every((item) => item === 'error')) return 'offline'
    if (errorRate >= 0.5) return 'offline'
    return 'degraded'
  }

  if (errorRate >= 0.2) return 'degraded'
  return 'healthy'
}

function healthLabel(health: SourceHealth): string {
  switch (health) {
    case 'healthy':
      return '正常'
    case 'degraded':
      return '不稳定'
    case 'offline':
      return '异常'
    default:
      return '未检测'
  }
}

function toView(id: DictionarySourceId, counter: SourceCounters): SourceStatusView {
  const meta = DICTIONARY_SOURCES.find((item) => item.id === id)!
  const totalChecks = counter.hit + counter.miss + counter.error
  const successRate =
    totalChecks > 0 ? Math.round(((counter.hit + counter.miss) / totalChecks) * 100) : null

  return {
    id,
    label: meta.label,
    role: meta.role,
    health: computeHealth(counter),
    healthLabel: healthLabel(computeHealth(counter)),
    totalChecks,
    hitCount: counter.hit,
    missCount: counter.miss,
    errorCount: counter.error,
    successRate,
    lastCheckAt: counter.lastCheckAt,
    lastErrorMessage: counter.lastErrorMessage,
  }
}

export function subscribeDictionarySourceStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function getDictionarySourceStatus(): Promise<SourceStatusView[]> {
  const stats = await readStats()
  return DICTIONARY_SOURCES.map((source) => toView(source.id, stats[source.id]))
}

export async function recordSourceOutcome(
  sourceId: DictionarySourceId,
  outcome: SourceOutcome,
  errorMessage = '',
): Promise<void> {
  const stats = await readStats()
  const counter = stats[sourceId]
  const now = Date.now()

  counter.lastCheckAt = now
  pushRecent(counter, outcome)

  if (outcome === 'hit') {
    counter.hit += 1
    counter.lastSuccessAt = now
  } else if (outcome === 'miss') {
    counter.miss += 1
    counter.lastSuccessAt = now
  } else {
    counter.error += 1
    counter.lastErrorAt = now
    if (errorMessage) counter.lastErrorMessage = errorMessage.slice(0, 120)
  }

  await writeStats(stats)
  notify()
}

export async function probeDictionarySources(): Promise<SourceStatusView[]> {
  const fetchers: Record<DictionarySourceId, (word: string) => Promise<unknown>> = {
    youdao: fetchFromYoudao,
    iciba: fetchFromIciba,
  }

  for (const source of DICTIONARY_SOURCES) {
    try {
      const entry = await fetchers[source.id](PROBE_WORD)
      await recordSourceOutcome(source.id, entry ? 'hit' : 'miss')
    } catch (err) {
      const message = err instanceof Error ? err.message : '检测失败'
      await recordSourceOutcome(source.id, 'error', message)
    }
  }

  return getDictionarySourceStatus()
}

export function formatSourceCheckTime(timestamp: number | null): string {
  if (!timestamp) return '尚未检测'
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
