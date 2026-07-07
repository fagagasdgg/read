import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { ZLibraryMirrorCandidate } from './zlibraryTypes'

const DISCOVERY_TIMEOUT_MS = 8_000
const MAX_DISCOVERY_CANDIDATES = 48
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const HOST_PREFIXES = [
  'singlelogin',
  'z-lib',
  'zlibrary',
  'z-library',
  '1lib',
  'go-to-library',
  'b-ok',
  'booksc',
]

const TLD_SUFFIXES = [
  're',
  'rs',
  'se',
  'sk',
  'fm',
  'gs',
  'id',
  'ec',
  'ltd',
  'to',
  'is',
  'site',
  'asia',
  'io',
  'org',
]

const SEARCH_QUERIES = [
  'z-library official mirror singlelogin',
  'z-lib latest domain site',
  'zlibrary 镜像 入口',
]

const PAGE_SOURCES = [
  { url: 'https://singlelogin.re', label: 'SingleLogin 首页' },
  { url: 'https://go-to-library.sk', label: 'Z-Access' },
]

export interface ZLibraryDiscoveryProgress {
  phase: 'patterns' | 'pages' | 'search'
  message: string
}

export interface ZLibraryDiscoveryResult {
  candidates: ZLibraryMirrorCandidate[]
  summary: string[]
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  return `https://${trimmed.replace(/\/+$/, '')}`
}

function isZLibraryLikeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.includes('z-lib') ||
      host.includes('zlibrary') ||
      host.includes('z-library') ||
      host.includes('singlelogin') ||
      host.includes('1lib') ||
      host.includes('go-to-library') ||
      host.includes('b-ok') ||
      host.includes('booksc')
    )
  } catch {
    return false
  }
}

function decodeDuckDuckGoRedirect(href: string): string | null {
  try {
    const absolute = href.startsWith('//') ? `https:${href}` : href
    const parsed = new URL(absolute, 'https://duckduckgo.com')
    const uddg = parsed.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    if (parsed.hostname.includes('duckduckgo')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function extractUrlsFromHtml(html: string): string[] {
  const found = new Set<string>()

  const hrefPattern = /href=["']([^"']+)["']/gi
  for (const match of html.matchAll(hrefPattern)) {
    const raw = match[1]
    const decoded = decodeDuckDuckGoRedirect(raw) ?? raw
    const normalized = normalizeUrl(decoded)
    if (normalized && isZLibraryLikeUrl(normalized)) {
      found.add(normalized)
    }
  }

  const urlPattern = /https?:\/\/[a-z0-9][-a-z0-9._~:/?#@!$&'()*+,;=%]*/gi
  for (const match of html.matchAll(urlPattern)) {
    const normalized = normalizeUrl(match[0])
    if (normalized && isZLibraryLikeUrl(normalized)) {
      found.add(normalized)
    }
  }

  return [...found]
}

async function fetchText(url: string, userAgent = DEFAULT_USER_AGENT): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': userAgent,
        },
        connectTimeout: DISCOVERY_TIMEOUT_MS,
        readTimeout: DISCOVERY_TIMEOUT_MS,
        responseType: 'text',
      })
      if (response.status < 200 || response.status >= 400) return null
      return typeof response.data === 'string' ? response.data : null
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': userAgent,
        },
      })
      if (!response.ok) return null
      return await response.text()
    } finally {
      window.clearTimeout(timer)
    }
  } catch {
    return null
  }
}

function generatePatternCandidates(): string[] {
  const urls = new Set<string>()

  for (const prefix of HOST_PREFIXES) {
    for (const tld of TLD_SUFFIXES) {
      urls.add(`https://${prefix}.${tld}`)
    }
  }

  urls.add('https://singlelogin.re')
  urls.add('https://z-lib.org')
  urls.add('https://b-ok.org')
  urls.add('https://1lib.domains')

  return [...urls]
}

async function discoverFromPages(
  onProgress?: (progress: ZLibraryDiscoveryProgress) => void,
): Promise<string[]> {
  const found = new Set<string>()
  onProgress?.({ phase: 'pages', message: '正在从已知入口页解析链接…' })

  for (const source of PAGE_SOURCES) {
    const html = await fetchText(source.url)
    if (!html) continue
    for (const url of extractUrlsFromHtml(html)) {
      found.add(url)
    }
  }

  return [...found]
}

async function discoverFromSearch(
  onProgress?: (progress: ZLibraryDiscoveryProgress) => void,
): Promise<string[]> {
  const found = new Set<string>()

  for (const query of SEARCH_QUERIES) {
    onProgress?.({ phase: 'search', message: `正在检索：${query}` })

    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
    const ddgHtml = await fetchText(ddgUrl)
    if (ddgHtml) {
      for (const url of extractUrlsFromHtml(ddgHtml)) {
        found.add(url)
      }
    }

    const bingRss = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`
    const bingXml = await fetchText(bingRss)
    if (bingXml) {
      for (const match of bingXml.matchAll(/<link>([^<]+)<\/link>/gi)) {
        const normalized = normalizeUrl(match[1])
        if (normalized && isZLibraryLikeUrl(normalized)) {
          found.add(normalized)
        }
      }
    }
  }

  return [...found]
}

export async function discoverZLibraryMirrors(
  excludeUrls: string[],
  onProgress?: (progress: ZLibraryDiscoveryProgress) => void,
): Promise<ZLibraryDiscoveryResult> {
  const excluded = new Set(excludeUrls.map((url) => normalizeUrl(url)).filter(Boolean))
  const discovered = new Set<string>()
  const summary: string[] = []

  onProgress?.({ phase: 'patterns', message: '正在组合常见域名变体…' })
  const patterns = generatePatternCandidates().filter((url) => !excluded.has(url))
  for (const url of patterns) discovered.add(url)
  summary.push(`域名组合 ${patterns.length} 个`)

  const pageUrls = (await discoverFromPages(onProgress)).filter((url) => !excluded.has(url))
  for (const url of pageUrls) discovered.add(url)
  if (pageUrls.length) summary.push(`入口页解析 ${pageUrls.length} 个`)

  const searchUrls = (await discoverFromSearch(onProgress)).filter((url) => !excluded.has(url))
  for (const url of searchUrls) discovered.add(url)
  if (searchUrls.length) summary.push(`网络检索 ${searchUrls.length} 个`)

  const limited = [...discovered].slice(0, MAX_DISCOVERY_CANDIDATES)
  const candidates: ZLibraryMirrorCandidate[] = []

  for (const url of limited) {
    if (patterns.includes(url)) {
      candidates.push({ url, label: `组合 · ${new URL(url).hostname}`, enabled: true })
    } else if (pageUrls.includes(url)) {
      candidates.push({ url, label: `页面 · ${new URL(url).hostname}`, enabled: true })
    } else if (searchUrls.includes(url)) {
      candidates.push({ url, label: `检索 · ${new URL(url).hostname}`, enabled: true })
    } else {
      candidates.push({ url, label: `发现 · ${new URL(url).hostname}`, enabled: true })
    }
  }

  if (!candidates.length) {
    summary.push('未发现新的候选地址')
  } else {
    summary.push(`将额外检测 ${candidates.length} 个新地址`)
  }

  return { candidates, summary }
}
