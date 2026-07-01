import { useCallback, useEffect, useState } from 'react'
import {
  type SavedBookMeta,
  extractCoverFromBook,
  getBookCoverDataUrl,
  importEpubBatch,
  isImportCancelled,
  isNativeApp,
  listSavedBooks,
  loadEpubFromDevice,
  removeSavedBook,
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

export function BookshelfScreen({ onOpenBook }: BookshelfScreenProps) {
  const [books, setBooks] = useState<SavedBookMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const native = isNativeApp()

  const refresh = useCallback(async () => {
    if (native) {
      setBooks(await listSavedBooks())
      return
    }
    setBooks([])
  }, [native])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleImport(files?: FileList | File[]) {
    setLoading(true)
    setError('')
    setStatusText('正在打开文件选择器…')

    try {
      const fileList = files
        ? Array.from(files)
        : undefined

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
        setError(
          result.failed.map((f) => `• ${f.fileName}：${f.message}`).join('\n'),
        )
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

  return (
    <div className="bookshelf-screen">
      <header className="bookshelf-header">
        <h1>书架</h1>
        <button
          type="button"
          className="bookshelf-import-btn"
          disabled={loading}
          onClick={() => void handleImport()}
          aria-label="导入 EPUB"
        >
          +
        </button>
      </header>

      <div className="bookshelf-shelf">
        {books.length === 0 ? (
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
          <ul className="bookshelf-grid">
            {books.map((book) => (
              <li key={book.id} className="bookshelf-book">
                <BookCover
                  book={book}
                  disabled={loading}
                  onOpen={() => onOpenBook(book.id)}
                />
                <button
                  type="button"
                  className="bookshelf-book-delete"
                  onClick={() => void handleRemove(book.id, book.title)}
                  aria-label="删除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && <p className="bookshelf-toast">{statusText || '处理中…'}</p>}
      {!loading && statusText && <p className="bookshelf-toast bookshelf-toast-ok">{statusText}</p>}
      {error && <pre className="bookshelf-error">{error}</pre>}
    </div>
  )
}
