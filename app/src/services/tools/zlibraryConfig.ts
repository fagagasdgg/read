import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type {
  ZLibraryConfigLoadResult,
  ZLibraryConfigSource,
  ZLibraryMirrorCandidate,
  ZLibraryProbeSettings,
  ZLibraryRemoteConfig,
} from './zlibraryTypes'

const CACHE_KEY = 'read-zlibrary-config-cache'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_STALE_MAX_MS = 30 * 24 * 60 * 60 * 1000
const CONFIG_SCHEMA_VERSION = 1

/** 内置远程源：发版后仍可通过更新仓库内 JSON 下发新镜像列表 */
const BUILTIN_REMOTE_SOURCES = [
  'https://raw.githubusercontent.com/fagagasdgg/read/main/app/public/zlibrary-mirrors.json',
]

const BUNDLED_CONFIG_PATH = '/zlibrary-mirrors.json'
const REMOTE_CONFIG_TIMEOUT_MS = 4_000

const DEFAULT_PROBE: ZLibraryProbeSettings = {
  timeoutMs: 15_000,
  retryCount: 1,
  concurrency: 4,
  userAgent: 'EpubReader-ZLibProbe/1.0 (+https://github.com/fagagasdgg/read)',
  methods: ['HEAD', 'GET'],
  successStatusCodes: [200, 204, 301, 302, 303, 307, 308],
}

const DEFAULT_MIRRORS: ZLibraryMirrorCandidate[] = [
  { url: 'https://singlelogin.re', label: 'SingleLogin 主入口' },
  { url: 'https://singlelogin.rs', label: 'SingleLogin 备用' },
  { url: 'https://z-lib.sk', label: 'Z-Library .sk' },
  { url: 'https://z-lib.fm', label: 'Z-Library .fm' },
  { url: 'https://z-lib.gs', label: 'Z-Library .gs' },
  { url: 'https://z-lib.id', label: 'Z-Library .id' },
  { url: 'https://z-library.sk', label: 'Z-Library 国际' },
  { url: 'https://1lib.ltd', label: '1lib.ltd' },
  { url: 'https://z-library.ec', label: 'Z-Library .ec' },
  { url: 'https://go-to-library.sk', label: 'Z-Access 跳转' },
]

const DEFAULT_TIPS = [
  '点击「一键检测」会在你手机当前网络下逐个测试候选网址，无需 GitHub。',
  '候选列表默认来自应用内置，不依赖任何远程配置即可使用。',
  '「刷新远程列表」为可选功能，仅在可访问 GitHub 时用于更新候选网址。',
  '可关注 Telegram @zlib_china_official 获取官方最新入口。',
  '也可发邮件至 blackbox@1delivery.re 获取个人专属访问链接。',
]

interface ConfigCacheRecord {
  fetchedAt: number
  source: ZLibraryConfigSource
  sourceUrl?: string
  config: ZLibraryRemoteConfig
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  return `https://${trimmed.replace(/\/+$/, '')}`
}

function normalizeMirrors(mirrors: ZLibraryMirrorCandidate[] | undefined): ZLibraryMirrorCandidate[] {
  const seen = new Set<string>()
  const result: ZLibraryMirrorCandidate[] = []

  for (const item of mirrors ?? []) {
    const url = normalizeUrl(item.url)
    if (!url || seen.has(url)) continue
    if (item.enabled === false) continue
    seen.add(url)
    result.push({
      url,
      label: item.label?.trim() || url,
      enabled: true,
    })
  }

  return result
}

function normalizeProbeSettings(partial?: Partial<ZLibraryProbeSettings>): ZLibraryProbeSettings {
  const methods = (partial?.methods ?? DEFAULT_PROBE.methods).filter(
    (method): method is 'HEAD' | 'GET' => method === 'HEAD' || method === 'GET',
  )

  return {
    timeoutMs: clampNumber(partial?.timeoutMs, DEFAULT_PROBE.timeoutMs, 3_000, 30_000),
    retryCount: clampNumber(partial?.retryCount, DEFAULT_PROBE.retryCount, 0, 3),
    concurrency: clampNumber(partial?.concurrency, DEFAULT_PROBE.concurrency, 1, 8),
    userAgent: partial?.userAgent?.trim() || DEFAULT_PROBE.userAgent,
    methods: methods.length ? methods : DEFAULT_PROBE.methods,
    successStatusCodes:
      partial?.successStatusCodes?.filter((code) => Number.isFinite(code)) ??
      DEFAULT_PROBE.successStatusCodes,
  }
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value!)))
}

function normalizeRemoteConfig(raw: unknown): ZLibraryRemoteConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<ZLibraryRemoteConfig>
  const schemaVersion =
    typeof data.schemaVersion === 'number' ? data.schemaVersion : CONFIG_SCHEMA_VERSION

  if (schemaVersion > CONFIG_SCHEMA_VERSION) {
    // 未来版本：尽量解析已知字段，不因版本号直接失败
  }

  const mirrors = normalizeMirrors(data.mirrors)
  if (!mirrors.length) return null

  return {
    schemaVersion,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    remoteSources: Array.isArray(data.remoteSources)
      ? data.remoteSources.filter((item): item is string => typeof item === 'string' && !!item.trim())
      : undefined,
    probe: data.probe,
    mirrors,
    tips: Array.isArray(data.tips)
      ? data.tips.filter((item): item is string => typeof item === 'string' && !!item.trim())
      : DEFAULT_TIPS,
  }
}

function buildBuiltinConfig(): ZLibraryRemoteConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    updatedAt: 'builtin',
    remoteSources: BUILTIN_REMOTE_SOURCES,
    mirrors: DEFAULT_MIRRORS,
    tips: DEFAULT_TIPS,
  }
}

function toLoadResult(
  config: ZLibraryRemoteConfig,
  source: ZLibraryConfigSource,
  sourceLabel: string,
  fetchedAt: number,
): ZLibraryConfigLoadResult {
  return {
    config,
    probe: normalizeProbeSettings(config.probe),
    source,
    sourceLabel,
    fetchedAt,
  }
}

async function readCache(): Promise<ConfigCacheRecord | null> {
  try {
    let raw: string | null = null
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: CACHE_KEY })
      raw = value
    } else {
      raw = localStorage.getItem(CACHE_KEY)
    }
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConfigCacheRecord
    if (!parsed?.config?.mirrors?.length) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCache(record: ConfigCacheRecord): Promise<void> {
  const payload = JSON.stringify(record)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: CACHE_KEY, value: payload })
  } else {
    localStorage.setItem(CACHE_KEY, payload)
  }
}

async function fetchConfigFromUrl(
  url: string,
  timeoutMs = REMOTE_CONFIG_TIMEOUT_MS,
): Promise<ZLibraryRemoteConfig | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const json = (await response.json()) as unknown
    return normalizeRemoteConfig(json)
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchRemoteConfig(
  sources: string[],
): Promise<{ config: ZLibraryRemoteConfig; sourceUrl: string } | null> {
  for (const source of sources) {
    const config = await fetchConfigFromUrl(source)
    if (config) return { config, sourceUrl: source }
  }
  return null
}

function collectRemoteSources(config?: ZLibraryRemoteConfig | null): string[] {
  const fromConfig = config?.remoteSources ?? []
  const merged = [...fromConfig, ...BUILTIN_REMOTE_SOURCES]
  const seen = new Set<string>()
  return merged.filter((url) => {
    const key = url.trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadLocalConfig(): Promise<ZLibraryConfigLoadResult | null> {
  const bundled = await fetchConfigFromUrl(BUNDLED_CONFIG_PATH, 2_000)
  if (bundled) {
    return toLoadResult(bundled, 'bundled', '应用内置配置', Date.now())
  }
  return toLoadResult(buildBuiltinConfig(), 'builtin', '内置默认列表', Date.now())
}

export async function loadZLibraryMirrorConfig(options?: {
  /** 主动从 GitHub 等远程源拉取最新候选列表 */
  forceRemote?: boolean
}): Promise<ZLibraryConfigLoadResult> {
  const cached = await readCache()
  const cacheAge = cached ? Date.now() - cached.fetchedAt : Number.POSITIVE_INFINITY
  const cacheUsable = cached && cacheAge < CACHE_STALE_MAX_MS
  const cacheFresh = cached && cacheAge < CACHE_TTL_MS && !options?.forceRemote

  if (cacheFresh && cached) {
    return toLoadResult(
      cached.config,
      'cache',
      cached.sourceUrl ? `缓存（${cached.sourceUrl}）` : '本地缓存',
      cached.fetchedAt,
    )
  }

  // 默认不访问 GitHub：直接用应用内置/硬编码列表，保证国内开箱可用
  if (!options?.forceRemote) {
    const local = await loadLocalConfig()
    if (local) {
      await writeCache({
        fetchedAt: local.fetchedAt,
        source: local.source,
        sourceUrl: local.source === 'bundled' ? BUNDLED_CONFIG_PATH : undefined,
        config: local.config,
      })
      return local
    }
  }

  const remoteSources = collectRemoteSources(cached?.config)
  const remote = await fetchRemoteConfig(remoteSources)
  if (remote) {
    const fetchedAt = Date.now()
    await writeCache({
      fetchedAt,
      source: 'remote',
      sourceUrl: remote.sourceUrl,
      config: remote.config,
    })
    return toLoadResult(
      remote.config,
      'remote',
      `远程（${remote.sourceUrl}）`,
      fetchedAt,
    )
  }

  if (cacheUsable && cached) {
    return toLoadResult(
      cached.config,
      'cache',
      cached.sourceUrl ? `离线缓存（${cached.sourceUrl}）` : '离线缓存',
      cached.fetchedAt,
    )
  }

  const local = await loadLocalConfig()
  return local ?? toLoadResult(buildBuiltinConfig(), 'builtin', '内置默认列表', Date.now())
}
