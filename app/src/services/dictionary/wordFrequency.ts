import { Capacitor } from '@capacitor/core'
import type { WordFrequencyInfo } from './types'

const YOUDAO_DIRECT = 'https://dict.youdao.com/jsonapi_s'
const YOUDAO_PROXY = '/api/youdao'

interface YoudaoFrequencyResponse {
  collins?: {
    collins_entries?: Array<{ star?: string | number }>
  }
  individual?: {
    examInfo?: {
      frequency?: string | number
    }
  }
}

function buildLookupUrl(lemma: string): string {
  const params = `doctype=json&jsonversion=4&q=${encodeURIComponent(lemma)}`
  const base = Capacitor.isNativePlatform() ? YOUDAO_DIRECT : YOUDAO_PROXY
  return `${base}?${params}`
}

function parseCollinsStar(data: YoudaoFrequencyResponse): number | undefined {
  const entries = data.collins?.collins_entries
  if (!entries?.length) return undefined

  for (const entry of entries) {
    const raw = entry.star
    if (raw === undefined || raw === null || raw === '') continue
    const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
    if (Number.isFinite(value) && value >= 1 && value <= 5) return value
  }

  return undefined
}

function parseExamFrequency(data: YoudaoFrequencyResponse): number | undefined {
  const raw = data.individual?.examInfo?.frequency
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isFinite(value) || value < 0) return undefined
  return value
}

export async function fetchWordFrequency(lemma: string): Promise<WordFrequencyInfo | null> {
  const url = buildLookupUrl(lemma)

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('词频请求失败，请检查网络连接')
  }

  if (!response.ok) {
    throw new Error(`词频请求失败: ${response.status}`)
  }

  const data = (await response.json()) as YoudaoFrequencyResponse
  const collinsStar = parseCollinsStar(data)
  const examFrequency = parseExamFrequency(data)

  if (collinsStar === undefined && examFrequency === undefined) return null

  return {
    collinsStar,
    examFrequency,
    fetchedAt: Date.now(),
  }
}

export function formatCollinsStar(star: number): string {
  const safe = Math.max(1, Math.min(5, Math.round(star)))
  return '★'.repeat(safe) + '☆'.repeat(5 - safe)
}

export function formatWordFrequency(info: WordFrequencyInfo): string[] {
  const lines: string[] = []
  if (info.collinsStar !== undefined) {
    lines.push(`柯林斯 ${formatCollinsStar(info.collinsStar)}`)
  }
  if (info.examFrequency !== undefined) {
    lines.push(`真题频次 ${info.examFrequency}`)
  }
  return lines
}

export function isFrequencyComplete(info: WordFrequencyInfo | undefined): boolean {
  if (!info) return false
  return info.collinsStar !== undefined || info.examFrequency !== undefined
}
