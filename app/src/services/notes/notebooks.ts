import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { listSavedBooks } from '../epub/library'
import { notifyNotebookDataChanged } from './events'

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

export interface NotebookEntrySource {
  bookId: string
  bookTitle: string
  notebookId: string
  notebookTitle: string
}

export interface NotebookEntry {
  id: string
  sentence: string
  createdAt: number
  analysis: NotebookEntryAnalysis
  /** 仅 base_sentence 总笔记本中的镜像条目带有来源信息 */
  source?: NotebookEntrySource
}

export const BASE_SENTENCE_NOTEBOOK_ID = 'base_sentence'
export const BASE_SENTENCE_NOTEBOOK_TITLE = 'base_sentence'

export const BASE_PHRASES_NOTEBOOK_ID = 'base_phrases'
export const BASE_PHRASES_NOTEBOOK_TITLE = '词组总集'

export const NOT_FOUND_WORDS_NOTEBOOK_ID = 'not_found_words'
export const NOT_FOUND_WORDS_NOTEBOOK_TITLE = '待补全词条'

const SYSTEM_NOTEBOOK_ORDER = [
  BASE_SENTENCE_NOTEBOOK_ID,
  BASE_PHRASES_NOTEBOOK_ID,
  NOT_FOUND_WORDS_NOTEBOOK_ID,
] as const

export function isBaseSentenceNotebook(id: string): boolean {
  return id === BASE_SENTENCE_NOTEBOOK_ID
}

export function isBasePhrasesNotebook(id: string): boolean {
  return id === BASE_PHRASES_NOTEBOOK_ID
}

export function isNotFoundWordsNotebook(id: string): boolean {
  return id === NOT_FOUND_WORDS_NOTEBOOK_ID
}

export function isSystemNotebook(id: string): boolean {
  return (
    isBaseSentenceNotebook(id) ||
    isBasePhrasesNotebook(id) ||
    isNotFoundWordsNotebook(id)
  )
}

function systemNotebookRank(id: string): number {
  const index = SYSTEM_NOTEBOOK_ORDER.indexOf(id as (typeof SYSTEM_NOTEBOOK_ORDER)[number])
  return index === -1 ? 999 : index
}

function sortNotebookRegistry(notebooks: NotebookMeta[]): NotebookMeta[] {
  return [...notebooks].sort((a, b) => {
    const rankA = systemNotebookRank(a.id)
    const rankB = systemNotebookRank(b.id)
    if (rankA !== rankB) return rankA - rankB
    return b.updatedAt - a.updatedAt
  })
}

function resolveSystemNotebookTitle(id: string, fallback?: string): string {
  if (isBaseSentenceNotebook(id)) return BASE_SENTENCE_NOTEBOOK_TITLE
  if (isBasePhrasesNotebook(id)) return BASE_PHRASES_NOTEBOOK_TITLE
  if (isNotFoundWordsNotebook(id)) return NOT_FOUND_WORDS_NOTEBOOK_TITLE
  return fallback?.trim() || '笔记本'
}

export interface AddNotebookEntryOptions {
  bookId?: string
  bookTitle?: string
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

function normalizeSource(raw: unknown): NotebookEntrySource | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const item = raw as Record<string, unknown>
  if (typeof item.notebookId !== 'string' || !item.notebookId) return undefined
  return {
    bookId: typeof item.bookId === 'string' ? item.bookId : '',
    bookTitle: typeof item.bookTitle === 'string' ? item.bookTitle : '未知书籍',
    notebookId: item.notebookId,
    notebookTitle: typeof item.notebookTitle === 'string' ? item.notebookTitle : '未知笔记本',
  }
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
    source: normalizeSource(item.source),
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

export async function ensureBaseSentenceNotebook(): Promise<NotebookMeta> {
  const notebooks = await readRegistry()
  let meta = notebooks.find((item) => item.id === BASE_SENTENCE_NOTEBOOK_ID)
  const now = Date.now()

  if (!meta) {
    meta = {
      id: BASE_SENTENCE_NOTEBOOK_ID,
      title: BASE_SENTENCE_NOTEBOOK_TITLE,
      createdAt: now,
      updatedAt: now,
    }
    notebooks.unshift(meta)
    await writeRegistry(sortNotebookRegistry(notebooks))
  }

  await ensureNotebookDocument(BASE_SENTENCE_NOTEBOOK_ID)
  return meta
}

async function ensureSystemNotebook(
  id: string,
  title: string,
): Promise<NotebookMeta> {
  const notebooks = await readRegistry()
  let meta = notebooks.find((item) => item.id === id)
  const now = Date.now()

  if (!meta) {
    meta = { id, title, createdAt: now, updatedAt: now }
    notebooks.push(meta)
    await writeRegistry(sortNotebookRegistry(notebooks))
  } else if (meta.title !== title) {
    meta.title = title
    await writeRegistry(sortNotebookRegistry(notebooks))
  }

  await ensureNotebookDocument(id)
  return meta
}

export async function ensureBasePhrasesNotebook(): Promise<NotebookMeta> {
  return ensureSystemNotebook(BASE_PHRASES_NOTEBOOK_ID, BASE_PHRASES_NOTEBOOK_TITLE)
}

export async function ensureNotFoundWordsNotebook(): Promise<NotebookMeta> {
  return ensureSystemNotebook(NOT_FOUND_WORDS_NOTEBOOK_ID, NOT_FOUND_WORDS_NOTEBOOK_TITLE)
}

export async function ensureAllSystemNotebooks(): Promise<void> {
  await ensureBaseSentenceNotebook()
  await ensureBasePhrasesNotebook()
  await ensureNotFoundWordsNotebook()
}

export async function listNotebooks(): Promise<NotebookMeta[]> {
  // 仅确保系统笔记本存在；禁止在此全量同步内容（会与统计页 NOTEBOOK 监听形成死循环并卡死导入/切 Tab）
  await ensureAllSystemNotebooks()
  const notebooks = await readRegistry()
  return sortNotebookRegistry(notebooks)
}

export async function countNotebookEntries(options?: {
  from?: number
  to?: number
}): Promise<number> {
  const notebooks = await readRegistry()
  let total = 0

  for (const meta of notebooks) {
    if (isSystemNotebook(meta.id)) continue
    const doc = await readDocument(meta.id)
    if (!doc?.entries.length) continue

    if (!options?.from && !options?.to) {
      total += doc.entries.length
      continue
    }

    const from = options.from ?? 0
    const to = options.to ?? Number.MAX_SAFE_INTEGER
    for (const entry of doc.entries) {
      if (entry.createdAt >= from && entry.createdAt <= to) {
        total += 1
      }
    }
  }

  return total
}

export async function createNotebook(title?: string): Promise<NotebookMeta> {
  const notebooks = await readRegistry()
  const now = Date.now()
  const trimmed = title?.trim()
  const resolvedTitle = trimmed || pickUniqueDefaultTitle(notebooks)

  if (trimmed && (await isNotebookTitleTaken(resolvedTitle))) {
    throw new Error(`笔记本「${resolvedTitle}」已存在，请使用其他名称`)
  }

  if (normalizeTitleKey(resolvedTitle) === normalizeTitleKey(BASE_SENTENCE_NOTEBOOK_TITLE)) {
    throw new Error(`「${BASE_SENTENCE_NOTEBOOK_TITLE}」为系统总笔记本，请使用其他名称`)
  }
  if (
    [BASE_PHRASES_NOTEBOOK_TITLE, NOT_FOUND_WORDS_NOTEBOOK_TITLE].some(
      (name) => normalizeTitleKey(resolvedTitle) === normalizeTitleKey(name),
    )
  ) {
    throw new Error('该名称为系统笔记本保留名称，请使用其他名称')
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
  notifyNotebookDataChanged()
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
  options?: { query?: string },
): { items: NotebookEntry[]; total: number; totalPages: number; page: number } {
  if (!doc?.entries.length) {
    return { items: [], total: 0, totalPages: 1, page: 1 }
  }

  const query = options?.query?.trim().toLowerCase() ?? ''
  const filtered = query
    ? doc.entries.filter((entry) => {
        const haystack = [
          entry.sentence,
          entry.analysis.translation,
          entry.analysis.collocations,
          entry.analysis.slangs,
          entry.analysis.sentencePattern,
        ]
          .join('\n')
          .toLowerCase()
        return haystack.includes(query)
      })
    : doc.entries

  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt)
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

/** 系统笔记本全量替换条目（词组总集、待补全词条） */
export async function replaceNotebookEntries(
  notebookId: string,
  entries: NotebookEntry[],
  options?: { silent?: boolean },
): Promise<void> {
  const doc = await ensureNotebookDocument(notebookId)
  doc.entries = entries
  doc.updatedAt = Date.now()
  await writeDocument(doc)
  // 默认静默：避免同步写盘触发统计页刷新 → 再 listNotebooks 的连锁卡顿
  if (!options?.silent) {
    notifyNotebookDataChanged()
  }
}

export async function removeNotebook(id: string): Promise<void> {
  if (isSystemNotebook(id)) {
    throw new Error('系统笔记本不可删除')
  }
  const notebooks = (await readRegistry()).filter((item) => item.id !== id)
  await writeRegistry(notebooks)
  await deleteDocument(id)
  notifyNotebookDataChanged()
}

export async function touchNotebook(id: string): Promise<void> {
  const notebooks = await readRegistry()
  const item = notebooks.find((nb) => nb.id === id)
  if (!item) return
  item.updatedAt = Date.now()
  await writeRegistry(sortNotebookRegistry(notebooks))
}

function sourceMirrorKey(entry: NotebookEntry, sourceNotebookId: string): string {
  return `${entry.sentence.trim().replace(/\s+/g, ' ')}|${sourceNotebookId}|${entry.createdAt}`
}

async function removeMirrorFromBaseSentence(
  entry: NotebookEntry,
  sourceNotebookId: string,
): Promise<void> {
  const baseDoc = await readDocument(BASE_SENTENCE_NOTEBOOK_ID)
  if (!baseDoc) return

  const key = sourceMirrorKey(entry, sourceNotebookId)
  const nextEntries = baseDoc.entries.filter((item) => mirrorEntryKey(item) !== key)
  if (nextEntries.length === baseDoc.entries.length) return

  baseDoc.entries = nextEntries
  baseDoc.updatedAt = Date.now()
  await writeDocument(baseDoc)
}

export async function removeNotebookEntry(
  notebookId: string,
  entryId: string,
): Promise<{ totalAfter: number }> {
  if (isBasePhrasesNotebook(notebookId) || isNotFoundWordsNotebook(notebookId)) {
    throw new Error('系统汇总笔记本的条目不可手动删除')
  }
  const doc = await ensureNotebookDocument(notebookId)
  const entry = doc.entries.find((item) => item.id === entryId)
  if (!entry) throw new Error('笔记条目不存在')

  doc.entries = doc.entries.filter((item) => item.id !== entryId)
  doc.updatedAt = Date.now()
  await writeDocument(doc)
  await touchNotebook(notebookId)

  if (!isBaseSentenceNotebook(notebookId)) {
    await removeMirrorFromBaseSentence(entry, notebookId)
  }

  notifyNotebookDataChanged()
  return { totalAfter: doc.entries.length }
}

function mirrorEntryKey(entry: NotebookEntry): string {
  const notebookId = entry.source?.notebookId ?? ''
  return `${entry.sentence.trim().replace(/\s+/g, ' ')}|${notebookId}|${entry.createdAt}`
}

async function resolveBookTitle(bookId: string, fallback?: string): Promise<string> {
  if (fallback?.trim()) return fallback.trim()
  const books = await listSavedBooks()
  return books.find((book) => book.id === bookId)?.title ?? '未知书籍'
}

async function mirrorEntryToBaseSentence(
  entry: NotebookEntry,
  sourceNotebookId: string,
  options?: AddNotebookEntryOptions,
): Promise<void> {
  const notebooks = await readRegistry()
  const sourceMeta = notebooks.find((item) => item.id === sourceNotebookId)
  const baseDoc = await ensureNotebookDocument(BASE_SENTENCE_NOTEBOOK_ID)

  const mirror: NotebookEntry = {
    ...entry,
    id: createEntryId(),
    source: {
      bookId: options?.bookId ?? '',
      bookTitle: await resolveBookTitle(options?.bookId ?? '', options?.bookTitle),
      notebookId: sourceNotebookId,
      notebookTitle: sourceMeta?.title ?? '未知笔记本',
    },
  }

  const key = mirrorEntryKey(mirror)
  const exists = baseDoc.entries.some((item) => mirrorEntryKey(item) === key)
  if (exists) return

  baseDoc.entries.unshift(mirror)
  baseDoc.updatedAt = Date.now()
  await writeDocument(baseDoc)
  await touchNotebook(BASE_SENTENCE_NOTEBOOK_ID)
}

export async function addNotebookEntry(
  notebookId: string,
  sentence: string,
  analysis: Partial<NotebookEntryAnalysis> = {},
  options?: AddNotebookEntryOptions,
): Promise<NotebookEntry> {
  await ensureBaseSentenceNotebook()
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

  if (!isBaseSentenceNotebook(notebookId)) {
    await mirrorEntryToBaseSentence(entry, notebookId, options)
  }

  notifyNotebookDataChanged()
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
      title: resolveSystemNotebookTitle(rawMeta.id, rawMeta.title),
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

  for (const rawDoc of payload.documents) {
    if (!rawDoc || typeof rawDoc !== 'object' || typeof rawDoc.id !== 'string') continue
    if (registryMap.has(rawDoc.id)) continue

    const normalizedDoc = normalizeDocument(rawDoc, rawDoc.id)
    if (!normalizedDoc) {
      warnings.push(`跳过无效的笔记本文档：${rawDoc.id}`)
      continue
    }

    const meta: NotebookMeta = {
      id: normalizedDoc.id,
      title: normalizedDoc.title,
      createdAt: Date.now(),
      updatedAt: normalizedDoc.updatedAt,
    }
    registryMap.set(meta.id, meta)
    await writeDocument(normalizedDoc)
    entriesAdded += normalizedDoc.entries.length
  }

  const mergedRegistry = sortNotebookRegistry([...registryMap.values()])
  await writeRegistry(mergedRegistry)
  await ensureAllSystemNotebooks()

  return {
    notebooks: mergedRegistry.length,
    entries: entriesAdded,
    warnings,
  }
}
