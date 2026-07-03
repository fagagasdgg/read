import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
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

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase()
}

export async function isNotebookTitleTaken(
  title: string,
  excludeId?: string,
): Promise<boolean> {
  const key = normalizeTitleKey(title)
  if (!key) return false
  const notebooks = await readRegistry()
  return notebooks.some(
    (item) => item.id !== excludeId && normalizeTitleKey(item.title) === key,
  )
}

function pickUniqueDefaultTitle(notebooks: NotebookMeta[]): string {
  let index = notebooks.length
  while (notebooks.some((item) => normalizeTitleKey(item.title) === normalizeTitleKey(defaultTitle(index)))) {
    index += 1
  }
  return defaultTitle(index)
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

async function notebookFileExists(id: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return Boolean(localStorage.getItem(`read-notebook-doc-${id}`))
  }
  try {
    await Filesystem.stat({
      path: notebookPath(id),
      directory: Directory.Data,
    })
    return true
  } catch {
    return false
  }
}

async function writeDocument(doc: NotebookDocument): Promise<void> {
  const payload = JSON.stringify(doc)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: notebookPath(doc.id),
      data: payload,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
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
        encoding: Encoding.UTF8,
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
  const trimmed = title?.trim()
  const resolvedTitle = trimmed || pickUniqueDefaultTitle(notebooks)

  if (trimmed && (await isNotebookTitleTaken(resolvedTitle))) {
    throw new Error(`笔记本「${resolvedTitle}」已存在，请使用其他名称`)
  }

  const meta: NotebookMeta = {
    id: createId(),
    title: resolvedTitle,
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
  const doc = await readDocument(id)
  if (doc) return doc
  try {
    return await ensureNotebookDocument(id)
  } catch {
    return null
  }
}

/** 注册表有记录但文件缺失时自动修复（常见于早期版本或写入失败） */
export async function ensureNotebookDocument(notebookId: string): Promise<NotebookDocument> {
  const notebooks = await readRegistry()
  const meta = notebooks.find((item) => item.id === notebookId)
  if (!meta) throw new Error('笔记本不存在')

  const existing = await readDocument(notebookId)
  if (existing) return existing

  if (await notebookFileExists(notebookId)) {
    throw new Error('笔记本文件无法读取，请尝试重启应用或新建笔记本')
  }

  const doc: NotebookDocument = {
    id: meta.id,
    title: meta.title,
    entries: [],
    updatedAt: Date.now(),
  }
  await writeDocument(doc)
  return doc
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

export async function addNotebookEntry(
  notebookId: string,
  sentence: string,
  analysis: Partial<NotebookEntryAnalysis> = {},
): Promise<NotebookEntry> {
  const doc = await ensureNotebookDocument(notebookId)

  const entry: NotebookEntry = {
    id: createEntryId(),
    sentence: sentence.trim(),
    createdAt: Date.now(),
    analysis: {
      translation: analysis.translation?.trim() ?? '',
      collocations: analysis.collocations?.trim() ?? '',
      slangs: analysis.slangs?.trim() ?? '',
      sentencePattern: analysis.sentencePattern?.trim() ?? '',
    },
  }

  doc.entries.unshift(entry)
  doc.updatedAt = Date.now()
  await writeDocument(doc)
  await touchNotebook(notebookId)

  const verified = await readDocument(notebookId)
  if (!verified?.entries.some((item) => item.id === entry.id)) {
    throw new Error('笔记保存失败，请重试')
  }

  return entry
}

export async function exportNotebooksBackup(): Promise<{
  registry: NotebookMeta[]
  documents: NotebookDocument[]
}> {
  const registry = await listNotebooks()
  const documents: NotebookDocument[] = []

  for (const meta of registry) {
    const doc = await getNotebookDocument(meta.id)
    documents.push(
      doc ?? {
        id: meta.id,
        title: meta.title,
        entries: [],
        updatedAt: meta.updatedAt,
      },
    )
  }

  return { registry, documents }
}

function entryKey(sentence: string, createdAt: number): string {
  return `${sentence.trim().replace(/\s+/g, ' ')}|${createdAt}`
}

export async function importNotebooksBackup(payload: {
  registry: NotebookMeta[]
  documents: NotebookDocument[]
}): Promise<{ notebooks: number; entries: number; warnings: string[] }> {
  const warnings: string[] = []
  const currentRegistry = await readRegistry()
  const registryMap = new Map(currentRegistry.map((item) => [item.id, item]))
  let entriesAdded = 0

  for (const rawMeta of payload.registry) {
    if (!rawMeta || typeof rawMeta !== 'object' || typeof rawMeta.id !== 'string') {
      warnings.push('跳过无效的笔记本元数据')
      continue
    }

    const meta: NotebookMeta = {
      id: rawMeta.id,
      title: typeof rawMeta.title === 'string' && rawMeta.title.trim() ? rawMeta.title.trim() : '笔记本',
      createdAt: typeof rawMeta.createdAt === 'number' ? rawMeta.createdAt : Date.now(),
      updatedAt: typeof rawMeta.updatedAt === 'number' ? rawMeta.updatedAt : Date.now(),
    }

    const rawDoc = payload.documents.find((doc) => doc?.id === meta.id)
    const normalizedDoc = normalizeDocument(rawDoc ?? null, meta.id)
    const safeDoc: NotebookDocument = normalizedDoc ?? {
      id: meta.id,
      title: meta.title,
      entries: [],
      updatedAt: meta.updatedAt,
    }

    const existingMeta = registryMap.get(meta.id)
    if (!existingMeta) {
      registryMap.set(meta.id, meta)
      await writeDocument(safeDoc)
      entriesAdded += safeDoc.entries.length
      continue
    }

    const existingDoc = await readDocument(meta.id)
    const baseDoc = existingDoc ?? safeDoc
    const seen = new Set(baseDoc.entries.map((entry) => entryKey(entry.sentence, entry.createdAt)))

    for (const entry of safeDoc.entries) {
      const key = entryKey(entry.sentence, entry.createdAt)
      if (seen.has(key)) continue
      seen.add(key)
      baseDoc.entries.unshift(entry)
      entriesAdded += 1
    }

    baseDoc.title = meta.title || baseDoc.title
    baseDoc.updatedAt = Math.max(baseDoc.updatedAt, meta.updatedAt, safeDoc.updatedAt)
    existingMeta.title = baseDoc.title
    existingMeta.updatedAt = baseDoc.updatedAt
    await writeDocument(baseDoc)
  }

  const mergedRegistry = [...registryMap.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  await writeRegistry(mergedRegistry)

  return {
    notebooks: payload.registry.length,
    entries: entriesAdded,
    warnings,
  }
}
