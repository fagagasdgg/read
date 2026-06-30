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
  manifest: Map<string, { href: string; mediaType: string }>
  spine: string[]
} {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const title = metaText(doc, 'title') || '未命名书籍'
  const author = metaText(doc, 'creator') || '未知作者'

  const manifest = new Map<string, { href: string; mediaType: string }>()
  doc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    const mediaType = item.getAttribute('media-type') ?? ''
    if (id && href) manifest.set(id, { href, mediaType })
  })

  const spine: string[] = []
  doc.querySelectorAll('spine > itemref').forEach((item) => {
    const idref = item.getAttribute('idref')
    if (idref) spine.push(idref)
  })

  return { title, author, manifest, spine }
}

function chapterTitleFromHtml(html: string, fallback: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const heading = doc.querySelector('h1, h2, h3, title')
  return heading?.textContent?.trim() || fallback
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
    const fallbackTitle = `第 ${index + 1} 章`
    chapters.push({
      index,
      id: idref,
      href: fullPath,
      title: chapterTitleFromHtml(html, fallbackTitle),
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

export async function loadChapterHtml(book: EpubBook, chapterIndex: number): Promise<string> {
  const chapter = book.chapters[chapterIndex]
  if (!chapter) throw new Error('章节不存在')

  const file = book.zip.file(chapter.href)
  if (!file) throw new Error(`找不到章节文件：${chapter.href}`)

  const raw = await file.async('string')
  const doc = new DOMParser().parseFromString(raw, 'text/html')

  doc.querySelectorAll('script, style, link[rel="stylesheet"]').forEach((el) => el.remove())

  const body = doc.body
  if (!body) return raw

  return body.innerHTML
}
