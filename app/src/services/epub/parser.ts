import JSZip from 'jszip'
import type { EpubBook, EpubChapter } from './types'

function resolvePath(baseDir: string, href: string): string {
  const stack = `${baseDir}/${href}`.split('/')
  const resolved: string[] = []
  for (const part of stack) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}

function opfDirFromPath(opfPath: string): string {
  const idx = opfPath.lastIndexOf('/')
  return idx >= 0 ? opfPath.slice(0, idx) : ''
}

function dirFromPath(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx >= 0 ? filePath.slice(0, idx) : ''
}

export interface ChapterHtmlResult {
  html: string
  revoke: () => void
}

async function embedChapterImages(
  book: EpubBook,
  chapterHref: string,
  html: string,
): Promise<ChapterHtmlResult> {
  const doc = new DOMParser().parseFromString(`<div id="embed-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('embed-root')
  if (!root) return { html, revoke: () => {} }

  const chapterDir = dirFromPath(chapterHref)
  const blobUrls: string[] = []

  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src')?.trim()
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue

    const assetPath = resolvePath(chapterDir, decodeURIComponent(src))
    const assetFile = book.zip.file(assetPath)
    if (!assetFile) continue

    const blob = await assetFile.async('blob')
    const objectUrl = URL.createObjectURL(blob)
    blobUrls.push(objectUrl)
    img.setAttribute('src', objectUrl)
  }

  return {
    html: root.innerHTML,
    revoke: () => {
      for (const url of blobUrls) URL.revokeObjectURL(url)
    },
  }
}

function parseContainerXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const rootfile = doc.querySelector('rootfile')
  const path = rootfile?.getAttribute('full-path')
  if (!path) throw new Error('EPUB 无效：找不到 content.opf 路径')
  return path
}

function metaText(doc: Document, localName: string): string {
  for (const el of doc.querySelectorAll('metadata *')) {
    const tag = el.localName || el.tagName.replace(/^.*:/, '')
    if (tag === localName) return el.textContent?.trim() ?? ''
  }
  return ''
}

function parseOpf(xml: string): {
  title: string
  author: string
  manifest: Map<string, { href: string; mediaType: string; properties: string }>
  spine: string[]
} {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const title = metaText(doc, 'title') || '未命名书籍'
  const author = metaText(doc, 'creator') || '未知作者'

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>()
  doc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    const mediaType = item.getAttribute('media-type') ?? ''
    const properties = item.getAttribute('properties') ?? ''
    if (id && href) manifest.set(id, { href, mediaType, properties })
  })

  const spine: string[] = []
  doc.querySelectorAll('spine > itemref').forEach((item) => {
    const idref = item.getAttribute('idref')
    if (idref) spine.push(idref)
  })

  return { title, author, manifest, spine }
}

function normalizeHref(href: string): string {
  const noHash = href.split('#')[0]
  try {
    return decodeURIComponent(noHash).replace(/\\/g, '/')
  } catch {
    return noHash.replace(/\\/g, '/')
  }
}

function hrefBasename(href: string): string {
  const parts = normalizeHref(href).split('/')
  return parts[parts.length - 1] ?? href
}

function mergeTitleLabels(existing: string | undefined, incoming: string): string {
  const next = incoming.trim()
  if (!next) return existing?.trim() ?? ''
  if (!existing?.trim()) return next
  if (existing.includes(next) || next.includes(existing)) {
    return existing.length >= next.length ? existing : next
  }
  return `${existing.trim()} ${next}`
}

function setTocTitle(map: Map<string, string>, href: string, label: string): void {
  const key = normalizeHref(href)
  map.set(key, mergeTitleLabels(map.get(key), label))
  const base = hrefBasename(href)
  map.set(base, mergeTitleLabels(map.get(base), label))
}

function parseNcxTitles(ncxXml: string): Map<string, string> {
  const map = new Map<string, string>()
  const doc = new DOMParser().parseFromString(ncxXml, 'application/xml')

  function walkNavPoint(np: Element) {
    const label = np.querySelector('navLabel > text')?.textContent?.trim()
    const src = np.querySelector(':scope > content')?.getAttribute('src')
    if (label && src) {
      setTocTitle(map, src, label)
    }
    np.querySelectorAll(':scope > navPoint').forEach(walkNavPoint)
  }

  doc.querySelectorAll('navMap > navPoint').forEach(walkNavPoint)
  return map
}

function parseNavDocumentTitles(navHtml: string): Map<string, string> {
  const map = new Map<string, string>()
  const doc = new DOMParser().parseFromString(navHtml, 'text/html')
  doc.querySelectorAll('nav a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')
    const label = anchor.textContent?.trim()
    if (!href || !label) return
    setTocTitle(map, href, label)
  })
  return map
}

async function loadTocTitleMap(
  zip: JSZip,
  opfDir: string,
  manifest: Map<string, { href: string; mediaType: string; properties: string }>,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()

  for (const item of manifest.values()) {
    if (item.mediaType.includes('ncx') || item.href.endsWith('.ncx')) {
      const file = zip.file(resolvePath(opfDir, item.href))
      if (file) {
        const xml = await file.async('string')
        for (const [k, v] of parseNcxTitles(xml)) titles.set(k, v)
      }
    }
    const isNav =
      item.properties.includes('nav') ||
      (item.mediaType.includes('html') && item.href.toLowerCase().includes('nav'))
    if (isNav || item.href.endsWith('nav.xhtml')) {
      const file = zip.file(resolvePath(opfDir, item.href))
      if (file) {
        const html = await file.async('string')
        for (const [k, v] of parseNavDocumentTitles(html)) titles.set(k, v)
      }
    }
  }

  return titles
}

const GENERIC_CHAPTER_LABEL =
  /^(?:第\s*\d+\s*节|chapter\s+\d+|\d+)$/i

const ROMAN_CHAPTER_LABEL =
  /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/i

function isGenericChapterLabel(label: string): boolean {
  const text = label.trim()
  if (!text || text.length > 48) return false
  if (GENERIC_CHAPTER_LABEL.test(text)) return true
  if (ROMAN_CHAPTER_LABEL.test(text)) return true
  return false
}

function normalizeTitleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isTitleLikeLine(text: string): boolean {
  const normalized = normalizeTitleText(text)
  if (!normalized || normalized.length > 100) return false
  if (/^[A-Z0-9][A-Z0-9\s,'’.-]{2,}$/.test(normalized)) return true
  if (/^第\s*\d+\s*章/.test(normalized)) return true
  return normalized.length <= 60 && !/[.!?。！？]$/.test(normalized)
}

function extractHeadingFromHtml(html: string, bookTitle: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  if (!body) return null

  const parts: string[] = []

  for (const child of Array.from(body.children).slice(0, 8)) {
    if (parts.length >= 3) break

    const tag = child.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const text = normalizeTitleText(child.textContent ?? '')
      if (!text || text === bookTitle) continue
      if (isGenericChapterLabel(text)) continue
      parts.push(text)
      continue
    }

    if (parts.length === 0) {
      if (tag === 'p' || tag === 'div' || tag === 'span') {
        const text = normalizeTitleText(child.textContent ?? '')
        if (!text || text === bookTitle) continue
        if (isTitleLikeLine(text)) {
          parts.push(text)
          continue
        }
      }
      continue
    }

    if (tag === 'p' || tag === 'div' || tag === 'span') {
      const text = normalizeTitleText(child.textContent ?? '')
      if (!text || text === bookTitle) continue
      if (isTitleLikeLine(text)) {
        parts.push(text)
        continue
      }
      break
    }

    break
  }

  if (!parts.length) {
    const heading = body.querySelector('h1, h2, h3, h4')
    const headingText = normalizeTitleText(heading?.textContent ?? '')
    if (headingText && headingText !== bookTitle && headingText.length < 120) {
      return headingText
    }
    return null
  }

  const merged = normalizeTitleText(parts.join(' '))
  return merged && merged !== bookTitle && merged.length < 120 ? merged : null
}

function resolveChapterTitle(
  tocTitles: Map<string, string>,
  chapterHref: string,
  html: string,
  bookTitle: string,
  fallback: string,
): string {
  const normalized = normalizeHref(chapterHref)
  const fromToc =
    tocTitles.get(normalized) ??
    tocTitles.get(hrefBasename(chapterHref)) ??
    tocTitles.get(hrefBasename(normalized))

  const fromHtml = extractHeadingFromHtml(html, bookTitle)

  if (fromHtml) {
    if (!fromToc || fromToc === bookTitle || isGenericChapterLabel(fromToc)) {
      return fromHtml
    }
    if (fromHtml.toLowerCase().includes(fromToc.toLowerCase())) {
      return fromHtml
    }
    if (fromToc.toLowerCase().includes(fromHtml.toLowerCase())) {
      return fromToc
    }
    return fromHtml
  }

  if (fromToc && fromToc !== bookTitle) return fromToc

  return fallback
}

function bookIdFromName(name: string): string {
  return name.replace(/\.epub$/i, '').trim() || 'unknown-book'
}

export async function parseEpubBuffer(buffer: ArrayBuffer, fileName: string): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(buffer)

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('EPUB 无效：缺少 META-INF/container.xml')

  const containerXml = await containerFile.async('string')
  const opfPath = parseContainerXml(containerXml)
  const opfFile = zip.file(opfPath)
  if (!opfFile) throw new Error(`EPUB 无效：找不到 ${opfPath}`)

  const opfXml = await opfFile.async('string')
  const { title, author, manifest, spine } = parseOpf(opfXml)
  const opfDir = opfDirFromPath(opfPath)
  const tocTitles = await loadTocTitleMap(zip, opfDir, manifest)

  const chapters: EpubChapter[] = []
  let index = 0

  for (const idref of spine) {
    const item = manifest.get(idref)
    if (!item) continue
    const isHtml =
      item.mediaType.includes('html') || item.href.endsWith('.xhtml') || item.href.endsWith('.html')
    if (!isHtml) continue

    const fullPath = resolvePath(opfDir, item.href)
    const chapterFile = zip.file(fullPath)
    if (!chapterFile) continue

    const html = await chapterFile.async('string')
    const fallbackTitle = `第 ${index + 1} 节`
    chapters.push({
      index,
      id: idref,
      href: fullPath,
      title: resolveChapterTitle(tocTitles, fullPath, html, title, fallbackTitle),
    })
    index += 1
  }

  if (!chapters.length) throw new Error('EPUB 中没有可阅读的 HTML 章节')

  return {
    id: bookIdFromName(fileName),
    title,
    author,
    chapters,
    zip,
    opfDir,
  }
}

export async function parseEpubFile(file: File): Promise<EpubBook> {
  return parseEpubBuffer(await file.arrayBuffer(), file.name)
}

export async function loadChapterHtml(
  book: EpubBook,
  chapterIndex: number,
): Promise<ChapterHtmlResult> {
  const chapter = book.chapters[chapterIndex]
  if (!chapter) throw new Error('章节不存在')

  const file = book.zip.file(chapter.href)
  if (!file) throw new Error(`找不到章节文件：${chapter.href}`)

  const raw = await file.async('string')
  const doc = new DOMParser().parseFromString(raw, 'text/html')

  doc.querySelectorAll('script, style, link[rel="stylesheet"]').forEach((el) => el.remove())

  const body = doc.body
  if (!body) return embedChapterImages(book, chapter.href, raw)

  return embedChapterImages(book, chapter.href, body.innerHTML)
}
