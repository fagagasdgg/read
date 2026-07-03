import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppToast } from '../common/AppToast'
import { DataBackupSheet } from './DataBackupSheet'
import {
  type BookGroup,
  type SavedBookMeta,
  addBookToGroup,
  buildBookshelfLayout,
  createBookGroup,
  extractCoverFromBook,
  getBookCoverDataUrl,
  getGroupForBook,
  importEpubBatch,
  isImportCancelled,
  isNativeApp,
  listBookGroups,
  listSavedBooks,
  loadEpubFromDevice,
  removeBookFromGroup,
  removeSavedBook,
  renameBookGroup,
  saveBookCover,
  setBookHasCover,
} from '../../services/epub'

const COVER_COLORS = ['#8b5e3c', '#5c7a8a', '#6b8f71', '#9a6b4f', '#4a6fa5', '#7a5c8a']

function coverColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i)) % COVER_COLORS.length
  return COVER_COLORS[hash]
}

function BookCover({
  book,
  disabled,
  onOpen,
}: {
  book: SavedBookMeta
  disabled: boolean
  onOpen: () => void
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      let url = await getBookCoverDataUrl(book.id)
      if (!url) {
        try {
          const parsed = await loadEpubFromDevice(book.id)
          const blob = await extractCoverFromBook(parsed)
          if (blob) {
            await saveBookCover(book.id, blob)
            await setBookHasCover(book.id, true)
            url = await getBookCoverDataUrl(book.id)
          }
        } catch {
          // 无封面则显示书名
        }
      }
      if (!cancelled) setCoverUrl(url)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [book.id])

  return (
    <button
      type="button"
      className="bookshelf-cover"
      style={coverUrl ? undefined : { background: coverColor(book.id) }}
      disabled={disabled}
      onClick={onOpen}
    >
      {coverUrl ? (
        <img className="bookshelf-cover-img" src={coverUrl} alt={book.title} />
      ) : (
        <span className="bookshelf-cover-title">{book.title}</span>
      )}
    </button>
  )
}

interface BookshelfScreenProps {
  onOpenBook: (bookId: string) => void
}

type BookMenuMode = 'actions' | 'pick-group'

export function BookshelfScreen({ onOpenBook }: BookshelfScreenProps) {
  const [books, setBooks] = useState<SavedBookMeta[]>([])
  const [groups, setGroups] = useState<BookGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [menuBookId, setMenuBookId] = useState<string | null>(null)
  const [menuMode, setMenuMode] = useState<BookMenuMode>('actions')
  const [showBackupSheet, setShowBackupSheet] = useState(false)
  const native = isNativeApp()

  const refresh = useCallback(async () => {
    if (native) {
      const [nextBooks, nextGroups] = await Promise.all([listSavedBooks(), listBookGroups()])
      setBooks(nextBooks)
      setGroups(nextGroups)
      return
    }
    setBooks([])
    setGroups([])
  }, [native])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const layout = useMemo(() => buildBookshelfLayout(books, groups), [books, groups])
  const menuBook = menuBookId ? bookMap.get(menuBookId) : undefined

  async function handleImport(files?: FileList | File[]) {
    setLoading(true)
    setError('')
    setStatusText('正在打开文件选择器…')

    try {
      const fileList = files ? Array.from(files) : undefined

      setStatusText('正在导入，请稍候…')
      const result = await importEpubBatch(fileList)
      await refresh()

      if (result.imported > 0 && result.failed.length === 0) {
        setStatusText(`成功导入 ${result.imported} 本`)
      } else if (result.imported > 0 && result.failed.length > 0) {
        setError(
          `已导入 ${result.imported} 本；${result.failed.length} 本失败：\n${result.failed
            .map((f) => `• ${f.fileName}：${f.message}`)
            .join('\n')}`,
        )
        setStatusText('')
      } else if (result.failed.length > 0) {
        setError(result.failed.map((f) => `• ${f.fileName}：${f.message}`).join('\n'))
        setStatusText('')
      }
    } catch (err) {
      if (!isImportCancelled(err)) {
        setError(err instanceof Error ? err.message : '导入失败')
      }
      setStatusText('')
    } finally {
      setLoading(false)
      setTimeout(() => setStatusText(''), 2500)
    }
  }

  async function handleRemove(bookId: string, title: string) {
    if (!window.confirm(`确定从书架删除「${title}」？`)) return
    await removeSavedBook(bookId)
    await refresh()
  }

  function closeMenu() {
    setMenuBookId(null)
    setMenuMode('actions')
  }

  async function openMenu(bookId: string) {
    setMenuBookId(bookId)
    setMenuMode('actions')
  }

  async function handleRemoveFromGroup() {
    if (!menuBookId) return
    const group = await getGroupForBook(menuBookId)
    if (!group) return
    await removeBookFromGroup(group.id, menuBookId)
    closeMenu()
    await refresh()
  }

  async function handlePickGroup(groupId: string) {
    if (!menuBookId) return
    await addBookToGroup(groupId, menuBookId)
    closeMenu()
    await refresh()
  }

  async function handleCreateGroupAndAdd() {
    if (!menuBookId) return
    const name = window.prompt('新分组名称', '')
    if (!name?.trim()) return
    await createBookGroup(name, menuBookId)
    closeMenu()
    await refresh()
  }

  async function handleRenameGroup(groupId: string, currentName: string) {
    const name = window.prompt('分组名称', currentName)
    if (!name?.trim() || name.trim() === currentName) return
    await renameBookGroup(groupId, name)
    await refresh()
  }

  function renderBookTile(book: SavedBookMeta) {
    return (
      <li key={book.id} className="bookshelf-book">
        <BookCover book={book} disabled={loading} onOpen={() => onOpenBook(book.id)} />
        <button
          type="button"
          className="bookshelf-book-menu"
          onClick={() => void openMenu(book.id)}
          aria-label="书籍菜单"
        >
          ⋯
        </button>
        <button
          type="button"
          className="bookshelf-book-delete"
          onClick={() => void handleRemove(book.id, book.title)}
          aria-label="删除"
        >
          ×
        </button>
      </li>
    )
  }

  const hasContent = books.length > 0

  return (
    <div className="bookshelf-screen">
      <header className="bookshelf-header">
        <h1>书架</h1>
        <div className="bookshelf-header-actions">
          <button
            type="button"
            className="bookshelf-import-btn bookshelf-backup-btn"
            disabled={loading}
            onClick={() => setShowBackupSheet(true)}
            aria-label="导入导出学习数据"
            title="导入导出学习数据"
          >
            ⇅
          </button>
          <button
            type="button"
            className="bookshelf-import-btn"
            disabled={loading}
            onClick={() => void handleImport()}
            aria-label="导入 EPUB"
          >
            +
          </button>
        </div>
      </header>

      <div className="bookshelf-shelf">
        {!hasContent ? (
          <div className="bookshelf-empty">
            <p>还没有书籍</p>
            <p className="bookshelf-empty-hint">点击右上角 + 导入 EPUB（可多选）</p>
            <p className="bookshelf-empty-hint">仅支持 .epub，单本不超过 50MB</p>
            {!native && (
              <label className="bookshelf-file-label">
                或选择本地文件（开发）
                <input
                  type="file"
                  accept=".epub,application/epub+zip"
                  multiple
                  onChange={(e) => {
                    const list = e.target.files
                    if (list?.length) void handleImport(list)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        ) : (
          <>
            {layout.groups.map((group) => (
              <section key={group.id} className="bookshelf-group-section">
                <button
                  type="button"
                  className="bookshelf-group-title"
                  onClick={() => void handleRenameGroup(group.id, group.name)}
                  title="点击重命名分组"
                >
                  {group.name}
                  <span className="bookshelf-group-count">{group.bookIds.length} 本</span>
                </button>
                <ul className="bookshelf-grid">
                  {group.bookIds
                    .map((id) => bookMap.get(id))
                    .filter((book): book is SavedBookMeta => Boolean(book))
                    .map((book) => renderBookTile(book))}
                </ul>
              </section>
            ))}

            {layout.ungroupedBookIds.length > 0 && (
              <section className="bookshelf-group-section">
                {layout.groups.length > 0 && (
                  <div className="bookshelf-group-title bookshelf-group-title-static">未分组</div>
                )}
                <ul className="bookshelf-grid">
                  {layout.ungroupedBookIds
                    .map((id) => bookMap.get(id))
                    .filter((book): book is SavedBookMeta => Boolean(book))
                    .map((book) => renderBookTile(book))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {menuBook && (
        <div className="bookshelf-sheet-mask" onClick={closeMenu}>
          <div className="bookshelf-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="bookshelf-sheet-title">{menuBook.title}</h3>

            {menuMode === 'actions' && (
              <div className="bookshelf-sheet-actions">
                <button
                  type="button"
                  className="bookshelf-sheet-btn"
                  onClick={() => setMenuMode('pick-group')}
                >
                  加入分组…
                </button>
                <button
                  type="button"
                  className="bookshelf-sheet-btn"
                  onClick={() => void handleCreateGroupAndAdd()}
                >
                  新建分组并加入
                </button>
                {groups.some((group) => group.bookIds.includes(menuBook.id)) && (
                  <button
                    type="button"
                    className="bookshelf-sheet-btn danger"
                    onClick={() => void handleRemoveFromGroup()}
                  >
                    移出分组
                  </button>
                )}
                <button type="button" className="bookshelf-sheet-btn muted" onClick={closeMenu}>
                  取消
                </button>
              </div>
            )}

            {menuMode === 'pick-group' && (
              <div className="bookshelf-sheet-actions">
                {groups.length === 0 ? (
                  <p className="bookshelf-sheet-hint">还没有分组，请先新建</p>
                ) : (
                  groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      className="bookshelf-sheet-btn"
                      onClick={() => void handlePickGroup(group.id)}
                    >
                      {group.name}
                    </button>
                  ))
                )}
                <button
                  type="button"
                  className="bookshelf-sheet-btn"
                  onClick={() => void handleCreateGroupAndAdd()}
                >
                  + 新建分组
                </button>
                <button
                  type="button"
                  className="bookshelf-sheet-btn muted"
                  onClick={() => setMenuMode('actions')}
                >
                  返回
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showBackupSheet && (
        <DataBackupSheet onClose={() => setShowBackupSheet(false)} onDone={() => void refresh()} />
      )}

      {loading && <AppToast message={statusText || '处理中…'} />}
      {!loading && statusText && <AppToast message={statusText} variant="ok" />}
      {error && <AppToast message={error} variant="error" />}
    </div>
  )
}
