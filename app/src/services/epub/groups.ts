import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export interface BookGroup {
  id: string
  name: string
  bookIds: string[]
  updatedAt: number
}

const GROUPS_KEY = 'read-book-groups'

function createId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function readGroups(): Promise<BookGroup[]> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: GROUPS_KEY })
      if (!value) return []
      return JSON.parse(value) as BookGroup[]
    }
    const raw = localStorage.getItem(GROUPS_KEY)
    return raw ? (JSON.parse(raw) as BookGroup[]) : []
  } catch {
    return []
  }
}

async function writeGroups(groups: BookGroup[]): Promise<void> {
  const payload = JSON.stringify(groups)
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: GROUPS_KEY, value: payload })
    return
  }
  localStorage.setItem(GROUPS_KEY, payload)
}

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('分组名称不能为空')
  return trimmed.slice(0, 24)
}

function pruneEmptyGroups(groups: BookGroup[]): BookGroup[] {
  return groups.filter((group) => group.bookIds.length > 0)
}

export async function listBookGroups(): Promise<BookGroup[]> {
  return readGroups()
}

export async function getGroupForBook(bookId: string): Promise<BookGroup | null> {
  const groups = await readGroups()
  return groups.find((group) => group.bookIds.includes(bookId)) ?? null
}

export async function createBookGroup(name: string, initialBookId?: string): Promise<BookGroup> {
  let groups = await readGroups()

  if (initialBookId) {
    groups = groups.map((group) => ({
      ...group,
      bookIds: group.bookIds.filter((id) => id !== initialBookId),
    }))
  }

  const group: BookGroup = {
    id: createId(),
    name: normalizeName(name),
    bookIds: initialBookId ? [initialBookId] : [],
    updatedAt: Date.now(),
  }

  groups.push(group)
  await writeGroups(pruneEmptyGroups(groups))
  return group
}

export async function renameBookGroup(groupId: string, name: string): Promise<void> {
  const groups = await readGroups()
  const group = groups.find((item) => item.id === groupId)
  if (!group) return
  group.name = normalizeName(name)
  group.updatedAt = Date.now()
  await writeGroups(groups)
}

export async function addBookToGroup(groupId: string, bookId: string): Promise<void> {
  const groups = await readGroups()
  const target = groups.find((item) => item.id === groupId)
  if (!target) throw new Error('分组不存在')

  const next = groups.map((group) => {
    if (group.id === groupId) {
      const bookIds = group.bookIds.includes(bookId)
        ? group.bookIds
        : [...group.bookIds, bookId]
      return { ...group, bookIds, updatedAt: Date.now() }
    }
    return {
      ...group,
      bookIds: group.bookIds.filter((id) => id !== bookId),
    }
  })

  await writeGroups(pruneEmptyGroups(next))
}

export async function removeBookFromGroup(groupId: string, bookId: string): Promise<void> {
  const groups = await readGroups()
  const group = groups.find((item) => item.id === groupId)
  if (!group) return

  if (group.bookIds.length <= 2) {
    await writeGroups(groups.filter((item) => item.id !== groupId))
    return
  }

  group.bookIds = group.bookIds.filter((id) => id !== bookId)
  group.updatedAt = Date.now()
  await writeGroups(pruneEmptyGroups(groups))
}

export async function removeBookFromAllGroups(bookId: string): Promise<void> {
  const groups = await readGroups()
  let changed = false

  for (const group of groups) {
    const before = group.bookIds.length
    group.bookIds = group.bookIds.filter((id) => id !== bookId)
    if (group.bookIds.length !== before) {
      group.updatedAt = Date.now()
      changed = true
    }
  }

  if (!changed) return
  await writeGroups(pruneEmptyGroups(groups))
}

export function buildBookshelfLayout(
  books: Array<{ id: string; lastReadAt: number }>,
  groups: BookGroup[],
): {
  groups: Array<BookGroup & { sortKey: number }>
  ungroupedBookIds: string[]
} {
  const groupedIds = new Set<string>()
  for (const group of groups) {
    for (const id of group.bookIds) groupedIds.add(id)
  }

  const bookMap = new Map(books.map((book) => [book.id, book]))
  const enrichedGroups = groups
    .map((group) => {
      const sortKey = Math.max(
        0,
        ...group.bookIds.map((id) => bookMap.get(id)?.lastReadAt ?? 0),
        group.updatedAt,
      )
      return { ...group, sortKey }
    })
    .sort((a, b) => b.sortKey - a.sortKey)

  const ungroupedBookIds = books
    .filter((book) => !groupedIds.has(book.id))
    .sort((a, b) => b.lastReadAt - a.lastReadAt)
    .map((book) => book.id)

  return { groups: enrichedGroups, ungroupedBookIds }
}
