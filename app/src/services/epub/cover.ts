import JSZip from 'jszip'
import type { EpubBook } from './types'

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

type ManifestItem = { href: string; mediaType: string; properties: string }

function findCoverItemId(
  opfXml: string,
  manifest: Map<string, ManifestItem>,
): string | null {
  const doc = new DOMParser().parseFromString(opfXml, 'application/xml')

  for (const el of doc.querySelectorAll('metadata *')) {
    if (el.getAttribute('name') === 'cover') {
      const content = el.getAttribute('content')?.trim()
      if (content) return content
    }
  }

  for (const [id, item] of manifest) {
    if (item.properties.includes('cover-image')) return id
  }

  return null
}

function firstImageItem(manifest: Map<string, ManifestItem>): ManifestItem | null {
  for (const item of manifest.values()) {
    if (item.mediaType.startsWith('image/')) return item
  }
  return null
}

async function loadCoverBlob(
  zip: JSZip,
  opfDir: string,
  item: ManifestItem,
): Promise<Blob | null> {
  const path = resolvePath(opfDir, item.href)
  const file = zip.file(path)
  if (!file) return null
  return file.async('blob')
}

export async function extractCoverFromBook(book: EpubBook): Promise<Blob | null> {
  const containerFile = book.zip.file('META-INF/container.xml')
  if (!containerFile) return null

  const containerXml = await containerFile.async('string')
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml')
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) return null

  const opfFile = book.zip.file(opfPath)
  if (!opfFile) return null

  const opfXml = await opfFile.async('string')
  const opfDir = opfDirFromPath(opfPath)
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml')

  const manifest = new Map<string, ManifestItem>()
  opfDoc.querySelectorAll('manifest > item').forEach((el) => {
    const id = el.getAttribute('id')
    const href = el.getAttribute('href')
    if (!id || !href) return
    manifest.set(id, {
      href,
      mediaType: el.getAttribute('media-type') ?? '',
      properties: el.getAttribute('properties') ?? '',
    })
  })

  const coverId = findCoverItemId(opfXml, manifest)
  if (coverId) {
    const item = manifest.get(coverId)
    if (item) {
      const blob = await loadCoverBlob(book.zip, opfDir, item)
      if (blob) return blob
    }
  }

  const fallback = firstImageItem(manifest)
  if (fallback) return loadCoverBlob(book.zip, opfDir, fallback)

  return null
}
