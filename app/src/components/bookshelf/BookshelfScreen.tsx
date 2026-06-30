import { useCallback, useEffect, useState } from 'react'
import {
  type SavedBookMeta,
  importEpub,
  isNativeApp,
  listSavedBooks,
  removeSavedBook,
} from '../../services/epub'

const COVER_COLORS = ['#8b5e3c', '#5c7a8a', '#6b8f71', '#9a6b4f', '#4a6fa5', '#7a5c8a']

function coverColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i)) % COVER_COLORS.length
  return COVER_COLORS[hash]
}

function coverInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

interface BookshelfScreenProps {
  onOpenBook: (bookId: string) => void
}

export function BookshelfScreen({ onOpenBook }: BookshelfScreenProps) {
  const [books, setBooks] = useState<SavedBookMeta[]>([])
  const [loading, setLoading] = useState(false)
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

  async function handleImport(file?: File) {
    setLoading(true)
    setError('')
    try {
      await importEpub(file)
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'EPUB 导入失败'
      if (!message.includes('cancel') && !message.includes('Cancel')) {
        setError(message)
      }
    } finally {
      setLoading(false)
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
            <p className="bookshelf-empty-hint">点击右上角 + 从手机导入 EPUB</p>
            {!native && (
              <label className="bookshelf-file-label">
                或选择本地文件（开发）
                <input
                  type="file"
                  accept=".epub,application/epub+zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleImport(file)
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
                <button
                  type="button"
                  className="bookshelf-cover"
                  style={{ background: coverColor(book.id) }}
                  disabled={loading}
                  onClick={() => onOpenBook(book.id)}
                >
                  <span className="bookshelf-cover-text">{coverInitials(book.title)}</span>
                </button>
                <p className="bookshelf-book-title">{book.title}</p>
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

      {loading && <p className="bookshelf-toast">处理中…</p>}
      {error && <p className="bookshelf-error">{error}</p>}
    </div>
  )
}
