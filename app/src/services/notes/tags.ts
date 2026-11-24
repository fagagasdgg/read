import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  getNotebookDocument,
  isFrequencyNotebookMeta,
  isSystemNotebook,
  listNotebooks,
  type NotebookEntry,
  writeNotebookDocumentForTags,
} from './notebooks'
import { notifyNotebookDataChanged } from './events'

export interface NoteTag {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'read-note-tags'

function createTagId(): string {
  return `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function normalizeNameKey(name: string): string {
  return normalizeName(name).toLowerCase()
}

async function readTags(): Promise<NoteTag[]> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      if (!value) return []
      return normalizeTagList(JSON.parse(value))
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return normalizeTagList(JSON.parse(raw))
  } catch {
    return []
  }
}

function normalizeTagList(raw: unknown): NoteTag[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const tags: NoteTag[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? normalizeName(row.name) : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    tags.push({
      id,
      name,
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : Date.now(),
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : Date.now(),
    })
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

async function writeTags(tags: NoteTag[]): Promise<void> {
  const payload = JSON.stringify(normalizeTagList(tags))
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload })
    return
  }
  localStorage.setItem(STORAGE_KEY, payload)
}

export async function listNoteTags(): Promise<NoteTag[]> {
  return readTags()
}

export async function createNoteTag(name: string): Promise<NoteTag> {
  const trimmed = normalizeName(name)
  if (!trimmed) throw new Error('标签名称不能为空')

  const tags = await readTags()
  const key = normalizeNameKey(trimmed)
  if (tags.some((tag) => normalizeNameKey(tag.name) === key)) {
    throw new Error('已存在同名标签')
  }

  const now = Date.now()
  const tag: NoteTag = {
    id: createTagId(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  }
  tags.push(tag)
  await writeTags(tags)
  notifyNotebookDataChanged()
  return tag
}

export async function renameNoteTag(id: string, name: string): Promise<NoteTag> {
  const trimmed = normalizeName(name)
  if (!trimmed) throw new Error('标签名称不能为空')

  const tags = await readTags()
  const target = tags.find((tag) => tag.id === id)
  if (!target) throw new Error('标签不存在')

  const key = normalizeNameKey(trimmed)
  if (tags.some((tag) => tag.id !== id && normalizeNameKey(tag.name) === key)) {
    throw new Error('已存在同名标签')
  }

  target.name = trimmed
  target.updatedAt = Date.now()
  await writeTags(tags)
  notifyNotebookDataChanged()
  return target
}

/** 删除标签，并从所有笔记条目上摘掉该 tagId */
export async function deleteNoteTag(id: string): Promise<void> {
  const tags = await readTags()
  if (!tags.some((tag) => tag.id === id)) return

  await writeTags(tags.filter((tag) => tag.id !== id))
  await stripTagIdFromAllEntries(id)
  notifyNotebookDataChanged()
}

async function stripTagIdFromAllEntries(tagId: string): Promise<void> {
  const notebooks = await listNotebooks()
  for (const meta of notebooks) {
    if (isFrequencyNotebookMeta(meta)) continue
    const doc = await getNotebookDocument(meta.id)
    if (!doc?.entries.length) continue

    let changed = false
    for (const entry of doc.entries) {
      if (!entry.tagIds?.includes(tagId)) continue
      entry.tagIds = entry.tagIds.filter((item) => item !== tagId)
      if (!entry.tagIds.length) delete entry.tagIds
      changed = true
    }
    if (changed) {
      doc.updatedAt = Date.now()
      await writeNotebookDocumentForTags(doc)
    }
  }
}

export async function exportNoteTagsBackup(): Promise<NoteTag[]> {
  return readTags()
}

/**
 * 合并标签库。同 id 保留本地；同名不同 id 则把导入 id 映射到本地 id。
 */
export async function importNoteTagsBackup(
  incoming: NoteTag[],
): Promise<{ added: number; remapped: Record<string, string> }> {
  const local = await readTags()
  const byId = new Map(local.map((tag) => [tag.id, tag]))
  const byName = new Map(local.map((tag) => [normalizeNameKey(tag.name), tag]))
  const remapped: Record<string, string> = {}
  let added = 0

  for (const raw of normalizeTagList(incoming)) {
    const existingById = byId.get(raw.id)
    if (existingById) {
      remapped[raw.id] = existingById.id
      continue
    }
    const existingByName = byName.get(normalizeNameKey(raw.name))
    if (existingByName) {
      remapped[raw.id] = existingByName.id
      continue
    }
    byId.set(raw.id, raw)
    byName.set(normalizeNameKey(raw.name), raw)
    remapped[raw.id] = raw.id
    added += 1
  }

  await writeTags([...byId.values()])
  return { added, remapped }
}

export function remapTagIds(tagIds: string[] | undefined, remapped: Record<string, string>): string[] {
  if (!tagIds?.length) return []
  const next: string[] = []
  const seen = new Set<string>()
  for (const id of tagIds) {
    const mapped = remapped[id] ?? id
    if (!mapped || seen.has(mapped)) continue
    seen.add(mapped)
    next.push(mapped)
  }
  return next
}

export async function sanitizeAllEntryTagIds(validIds?: Set<string>): Promise<void> {
  const tags = await readTags()
  const allowed = validIds ?? new Set(tags.map((tag) => tag.id))
  const notebooks = await listNotebooks()

  for (const meta of notebooks) {
    if (isFrequencyNotebookMeta(meta)) continue
    const doc = await getNotebookDocument(meta.id)
    if (!doc?.entries.length) continue

    let changed = false
    for (const entry of doc.entries) {
      if (!entry.tagIds?.length) continue
      const next = entry.tagIds.filter((id) => allowed.has(id))
      if (next.length === entry.tagIds.length) continue
      entry.tagIds = next.length ? next : undefined
      if (!entry.tagIds?.length) delete entry.tagIds
      changed = true
    }
    if (changed) {
      doc.updatedAt = Date.now()
      await writeNotebookDocumentForTags(doc)
    }
  }
}

export function canTagNotebook(notebookId: string): boolean {
  return !isSystemNotebook(notebookId)
}

export interface TaggedNoteHit {
  notebookId: string
  notebookTitle: string
  entry: NotebookEntry
}

/** 按单个标签查询（兼容旧调用） */
export async function findEntriesByTagId(tagId: string): Promise<TaggedNoteHit[]> {
  return findEntriesByTagIds(tagId ? [tagId] : [])
}

/**
 * 按多个标签筛选：笔记需同时包含全部所选标签（AND）。
 * 仅普通阅读本（不含 base_sentence / 词频 / 其它系统本）。
 */
export async function findEntriesByTagIds(tagIds: string[]): Promise<TaggedNoteHit[]> {
  const required = [...new Set(tagIds.map((id) => id.trim()).filter(Boolean))]
  if (!required.length) return []

  const notebooks = await listNotebooks()
  const hits: TaggedNoteHit[] = []

  for (const meta of notebooks) {
    if (isFrequencyNotebookMeta(meta) || isSystemNotebook(meta.id)) continue

    const doc = await getNotebookDocument(meta.id)
    if (!doc?.entries.length) continue

    for (const entry of doc.entries) {
      const entryTags = entry.tagIds
      if (!entryTags?.length) continue
      if (!required.every((id) => entryTags.includes(id))) continue
      hits.push({
        notebookId: meta.id,
        notebookTitle: meta.title,
        entry,
      })
    }
  }

  hits.sort((a, b) => b.entry.createdAt - a.entry.createdAt)
  return hits
}

/** 一次扫描得到各标签在普通阅读本中的笔记条数 */
export async function countEntriesByTagId(): Promise<Record<string, number>> {
  const notebooks = await listNotebooks()
  const counts: Record<string, number> = {}

  for (const meta of notebooks) {
    if (isFrequencyNotebookMeta(meta) || isSystemNotebook(meta.id)) continue
    const doc = await getNotebookDocument(meta.id)
    if (!doc?.entries.length) continue

    for (const entry of doc.entries) {
      if (!entry.tagIds?.length) continue
      for (const tagId of entry.tagIds) {
        counts[tagId] = (counts[tagId] ?? 0) + 1
      }
    }
  }

  return counts
}
