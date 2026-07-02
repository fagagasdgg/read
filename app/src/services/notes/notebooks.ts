import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'

export interface NotebookMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** 笔记本正文占位结构，后续可扩展句子+解析条目 */
export interface NotebookDocument {
  id: string
  title: string
  entries: NotebookEntry[]
  updatedAt: number
}

export interface NotebookEntryAnalysis {
  translation: string
  collocations: string
  slangs: string
  sentencePattern: string
}

export interface NotebookEntry {
  id: string
  sentence: string
  createdAt: number
  analysis: NotebookEntryAnalysis
}

const REGISTRY_KEY = 'read-notebook-registry'
const NOTEBOOKS_DIR = 'notebooks'

function notebookPath(id: string): string {
  return `${NOTEBOOKS_DIR}/${id}.json`
}

function createId(): string {
  return `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEntryId(): string {
  return `nbe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultTitle(count: number): string {
  return `笔记本 ${count + 1}`
}

async function readRegistry(): Promise<NotebookMeta[]> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: REGISTRY_KEY })
      if (!value) return []
      return JSON.parse(value) as NotebookMeta[]
    }
    const raw = localStorage.getItem(REGISTRY_KEY)
    return raw ? (JSON.parse(raw) as NotebookMeta[]) : []
  } catch {
    return []
  }
}

async function writeRegistry(notebooks: NotebookMeta[]): Promise<void> {
  const payload = JSON.stringify(notebooks)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: REGISTRY_KEY, value: payload })
    return
  }
  localStorage.setItem(REGISTRY_KEY, payload)
}

async function writeDocument(doc: NotebookDocument): Promise<void> {
  const payload = JSON.stringify(doc)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: notebookPath(doc.id),
      data: payload,
      directory: Directory.Data,
      recursive: true,
    })
    return
  }
  localStorage.setItem(`read-notebook-doc-${doc.id}`, payload)
}

function normalizeEntry(raw: unknown): NotebookEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.sentence !== 'string') return null

  const analysisRaw =
    item.analysis && typeof item.analysis === 'object'
      ? (item.analysis as Record<string, unknown>)
      : {}

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createEntryId(),
    sentence: item.sentence.trim(),
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    analysis: {
      translation: typeof analysisRaw.translation === 'string' ? analysisRaw.translation : '',
      collocations: typeof analysisRaw.collocations === 'string' ? analysisRaw.collocations : '',
      slangs: typeof analysisRaw.slangs === 'string' ? analysisRaw.slangs : '',
      sentencePattern:
        typeof analysisRaw.sentencePattern === 'string' ? analysisRaw.sentencePattern : '',
    },
  }
}

function normalizeDocument(raw: NotebookDocument | null, id: string): NotebookDocument | null {
  if (!raw) return null
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map((entry) => normalizeEntry(entry)).filter((entry): entry is NotebookEntry => Boolean(entry))
    : []

  return {
    id,
    title: typeof raw.title === 'string' && raw.title ? raw.title : '笔记本',
    entries,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

async function readDocument(id: string): Promise<NotebookDocument | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { data } = await Filesystem.readFile({
        path: notebookPath(id),
        directory: Directory.Data,
      })
      if (typeof data !== 'string' || !data) return null
      return normalizeDocument(JSON.parse(data) as NotebookDocument, id)
    }
    const raw = localStorage.getItem(`read-notebook-doc-${id}`)
    return raw ? normalizeDocument(JSON.parse(raw) as NotebookDocument, id) : null
  } catch {
    return null
  }
}

async function deleteDocument(id: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        path: notebookPath(id),
        directory: Directory.Data,
      })
    } catch {
      // 文件可能已不存在
    }
    return
  }
  localStorage.removeItem(`read-notebook-doc-${id}`)
}

export async function listNotebooks(): Promise<NotebookMeta[]> {
  const notebooks = await readRegistry()
  return notebooks.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createNotebook(title?: string): Promise<NotebookMeta> {
  const notebooks = await readRegistry()
  const now = Date.now()
  const meta: NotebookMeta = {
    id: createId(),
    title: title?.trim() || defaultTitle(notebooks.length),
    createdAt: now,
    updatedAt: now,
  }

  const doc: NotebookDocument = {
    id: meta.id,
    title: meta.title,
    entries: [],
    updatedAt: now,
  }

  notebooks.unshift(meta)
  await writeRegistry(notebooks)
  await writeDocument(doc)
  return meta
}

export async function getNotebookDocument(id: string): Promise<NotebookDocument | null> {
  return readDocument(id)
}

export function listNotebookEntries(
  doc: NotebookDocument | null,
  page: number,
  pageSize: number,
): { items: NotebookEntry[]; total: number; totalPages: number; page: number } {
  if (!doc?.entries.length) {
    return { items: [], total: 0, totalPages: 1, page: 1 }
  }

  const sorted = [...doc.entries].sort((a, b) => b.createdAt - a.createdAt)
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(totalPages, Math.max(1, page))
  const start = (safePage - 1) * pageSize
  const items = sorted.slice(start, start + pageSize)

  return { items, total, totalPages, page: safePage }
}

export function getNotebookEntryById(
  doc: NotebookDocument | null,
  entryId: string,
): NotebookEntry | null {
  if (!doc) return null
  return doc.entries.find((entry) => entry.id === entryId) ?? null
}

export async function removeNotebook(id: string): Promise<void> {
  const notebooks = (await readRegistry()).filter((item) => item.id !== id)
  await writeRegistry(notebooks)
  await deleteDocument(id)
}

export async function touchNotebook(id: string): Promise<void> {
  const notebooks = await readRegistry()
  const item = notebooks.find((nb) => nb.id === id)
  if (!item) return
  item.updatedAt = Date.now()
  notebooks.sort((a, b) => b.updatedAt - a.updatedAt)
  await writeRegistry(notebooks)
}
