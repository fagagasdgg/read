import { Capacitor, CapacitorHttp, type HttpOptions } from '@capacitor/core'
import type {
  ZLibraryMirrorCandidate,
  ZLibraryProbeResult,
  ZLibraryProbeSettings,
  ZLibraryProbeStatus,
} from './zlibraryTypes'

interface HttpProbeAttempt {
  ok: boolean
  statusCode?: number
  finalUrl?: string
  method: string
  latencyMs: number
  error?: string
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  return `https://${trimmed.replace(/\/+$/, '')}`
}

function isSuccessStatus(status: number, settings: ZLibraryProbeSettings): boolean {
  return settings.successStatusCodes.includes(status)
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function formatHttpError(status: number): string {
  if (status === 403) return 'HTTP 403（可能被拦截）'
  if (status === 451) return 'HTTP 451（不可用）'
  return `HTTP ${status}`
}

function formatNetworkError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return '连接超时'
    const message = err.message.toLowerCase()
    if (message.includes('failed to fetch') || message.includes('network')) return '网络不可达'
    if (message.includes('cors')) return '网络请求被拦截'
    return err.message
  }
  return '网络错误'
}

async function requestWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function requestWithCapacitorHttp(
  url: string,
  method: 'HEAD' | 'GET',
  settings: ZLibraryProbeSettings,
  timeoutMs: number,
): Promise<HttpProbeAttempt> {
  const startedAt = Date.now()
  try {
    const options: HttpOptions = {
      url,
      method,
      headers: {
        Accept: method === 'HEAD' ? '*/*' : 'text/html,application/xhtml+xml,*/*;q=0.8',
        'User-Agent': settings.userAgent,
        ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
      },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'text',
    }

    const response = await CapacitorHttp.request(options)

    const statusCode = response.status ?? 0
    const finalUrl = response.url || url
    const latencyMs = Date.now() - startedAt

    if (statusCode <= 0) {
      return { ok: false, method, latencyMs, finalUrl, error: '无 HTTP 响应' }
    }

    return {
      ok: isSuccessStatus(statusCode, settings),
      statusCode,
      finalUrl,
      method,
      latencyMs,
      error: isSuccessStatus(statusCode, settings) ? undefined : formatHttpError(statusCode),
    }
  } catch (err) {
    return {
      ok: false,
      method,
      latencyMs: Date.now() - startedAt,
      error: formatNetworkError(err),
    }
  }
}

async function requestWithFetch(
  url: string,
  method: 'HEAD' | 'GET',
  settings: ZLibraryProbeSettings,
  timeoutMs: number,
): Promise<HttpProbeAttempt> {
  const startedAt = Date.now()
  try {
    const response = await requestWithTimeout(
      url,
      {
        method,
        redirect: 'follow',
        headers: {
          Accept: method === 'HEAD' ? '*/*' : 'text/html,application/xhtml+xml,*/*;q=0.8',
          'User-Agent': settings.userAgent,
          ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
        },
      },
      timeoutMs,
    )

    const statusCode = response.status
    const finalUrl = response.url || url
    const latencyMs = Date.now() - startedAt

    if (method === 'GET') {
      try {
        await response.arrayBuffer()
      } catch {
        // 只探测连通性，忽略正文读取失败
      }
    }

    return {
      ok: isSuccessStatus(statusCode, settings),
      statusCode,
      finalUrl,
      method,
      latencyMs,
      error: isSuccessStatus(statusCode, settings) ? undefined : formatHttpError(statusCode),
    }
  } catch (err) {
    return {
      ok: false,
      method,
      latencyMs: Date.now() - startedAt,
      error: formatNetworkError(err),
    }
  }
}

async function runHttpProbe(
  url: string,
  settings: ZLibraryProbeSettings,
): Promise<HttpProbeAttempt> {
  const useNativeHttp = Capacitor.isNativePlatform()
  const methods: Array<'HEAD' | 'GET'> = settings.methods.length
    ? settings.methods
    : ['HEAD', 'GET']

  let lastAttempt: HttpProbeAttempt | null = null

  for (const method of methods) {
    const attempt = useNativeHttp
      ? await requestWithCapacitorHttp(url, method, settings, settings.timeoutMs)
      : await requestWithFetch(url, method, settings, settings.timeoutMs)

    lastAttempt = attempt
    if (attempt.ok) return attempt

    const retryableStatus = attempt.statusCode != null && shouldRetryStatus(attempt.statusCode)
    const retryableNetwork = !attempt.statusCode
    if (!retryableStatus && !retryableNetwork) {
      // 4xx 等明确失败时，若还有其他 method 可继续尝试
      if (method !== methods[methods.length - 1]) continue
      return attempt
    }
  }

  return (
    lastAttempt ?? {
      ok: false,
      method: methods[0],
      latencyMs: 0,
      error: '探测失败',
    }
  )
}

async function probeMirrorOnce(
  mirror: ZLibraryMirrorCandidate,
  settings: ZLibraryProbeSettings,
): Promise<ZLibraryProbeResult> {
  const url = normalizeUrl(mirror.url)
  if (!url) {
    return { mirror, status: 'unreachable', error: '无效网址', attempts: 0 }
  }

  let lastResult: ZLibraryProbeResult = {
    mirror,
    status: 'unreachable',
    error: '探测失败',
    attempts: 0,
  }

  const maxAttempts = settings.retryCount + 1
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const http = await runHttpProbe(url, settings)
    if (http.ok) {
      return {
        mirror,
        status: 'reachable',
        statusCode: http.statusCode,
        latencyMs: http.latencyMs,
        finalUrl: http.finalUrl ?? url,
        method: http.method,
        attempts: attempt,
      }
    }

    lastResult = {
      mirror,
      status: 'unreachable',
      statusCode: http.statusCode,
      latencyMs: http.latencyMs,
      finalUrl: http.finalUrl ?? url,
      method: http.method,
      attempts: attempt,
      error: http.error,
    }

    const canRetry =
      attempt < maxAttempts &&
      (!http.statusCode || shouldRetryStatus(http.statusCode) || http.error === '连接超时')
    if (!canRetry) break
    await sleep(400)
  }

  return lastResult
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0

  async function runWorker(): Promise<void> {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()))
  return results
}

export async function probeZLibraryMirrors(
  mirrors: ZLibraryMirrorCandidate[],
  settings: ZLibraryProbeSettings,
  onProgress?: (result: ZLibraryProbeResult, index: number) => void,
): Promise<ZLibraryProbeResult[]> {
  const enabled = mirrors.filter((mirror) => mirror.enabled !== false)

  return runWithConcurrency(enabled, settings.concurrency, async (mirror, idx) => {
    onProgress?.({ mirror, status: 'checking' }, idx)
    const result = await probeMirrorOnce(mirror, settings)
    onProgress?.(result, idx)
    return result
  })
}

export function sortProbeResults(results: ZLibraryProbeResult[]): ZLibraryProbeResult[] {
  const rank = (status: ZLibraryProbeStatus) => {
    if (status === 'reachable') return 0
    if (status === 'checking') return 1
    if (status === 'idle') return 2
    return 3
  }

  return [...results].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status)
    if (byStatus !== 0) return byStatus
    return (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER)
  })
}

export function openMirrorUrl(url: string): void {
  const normalized = normalizeUrl(url)
  if (!normalized) return
  window.open(normalized, '_blank', 'noopener,noreferrer')
}
