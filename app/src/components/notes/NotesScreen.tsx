import { useCallback, useEffect, useState } from 'react'
import { AppToast, type AppToastVariant } from '../common/AppToast'
import {
  createNotebook,
  listNotebooks,
  removeNotebook,
  touchNotebook,
  type NotebookMeta,
} from '../../services/notes/notebooks'
import { NotebookDetailScreen } from './NotebookDetailScreen'

const NOTEBOOK_COLORS = ['#e8dcc8', '#d4e4d9', '#dce4f0', '#f0e0d0', '#e6dce8', '#e0ebe5']

function notebookColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i)) % NOTEBOOK_COLORS.length
  return NOTEBOOK_COLORS[hash]
}

export function NotesScreen() {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([])
  const [openNotebookId, setOpenNotebookId] = useState<string | null>(null)
  const [statusText, setStatusText] = useState('')
  const [statusVariant, setStatusVariant] = useState<AppToastVariant>('ok')

  const refresh = useCallback(async () => {
    setNotebooks(await listNotebooks())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function showToast(message: string, variant: AppToastVariant = 'ok') {
    setStatusVariant(variant)
    setStatusText(message)
    setTimeout(() => setStatusText(''), 2500)
  }

  async function handleCreate() {
    const input = window.prompt('笔记本名称', '')
    if (input === null) return

    const title = input.trim()
    if (!title) {
      showToast('笔记本名称不能为空', 'error')
      return
    }

    try {
      const notebook = await createNotebook(title)
      await refresh()
      showToast(`已创建「${notebook.title}」`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error')
    }
  }

  async function handleRemove(id: string, title: string) {
    if (!window.confirm(`确定删除笔记本「${title}」？`)) return
    await removeNotebook(id)
    if (openNotebookId === id) setOpenNotebookId(null)
    await refresh()
  }

  async function handleOpen(id: string) {
    await touchNotebook(id)
    await refresh()
    setOpenNotebookId(id)
  }

  if (openNotebookId) {
    const notebook = notebooks.find((item) => item.id === openNotebookId)
    return (
      <NotebookDetailScreen
        notebookId={openNotebookId}
        title={notebook?.title ?? '笔记本'}
        onBack={() => setOpenNotebookId(null)}
      />
    )
  }

  return (
    <div className="notes-screen">
      <header className="bookshelf-header">
        <h1>笔记</h1>
        <button
          type="button"
          className="bookshelf-import-btn"
          onClick={() => void handleCreate()}
          aria-label="新建笔记本"
        >
          +
        </button>
      </header>

      <div className="bookshelf-shelf notes-shelf">
        {notebooks.length === 0 ? (
          <div className="bookshelf-empty">
            <p>还没有笔记本</p>
            <p className="bookshelf-empty-hint">点击右上角 + 创建空白笔记本</p>
            <p className="bookshelf-empty-hint">后续可将阅读中的句子解析保存到这里</p>
          </div>
        ) : (
          <ul className="bookshelf-grid">
            {notebooks.map((notebook) => (
              <li key={notebook.id} className="bookshelf-book">
                <button
                  type="button"
                  className="bookshelf-cover notes-cover"
                  style={{ background: notebookColor(notebook.id) }}
                  onClick={() => void handleOpen(notebook.id)}
                >
                  <span className="notes-cover-icon" aria-hidden>
                    📒
                  </span>
                  <span className="notes-cover-title">{notebook.title}</span>
                </button>
                <button
                  type="button"
                  className="bookshelf-book-delete"
                  onClick={() => void handleRemove(notebook.id, notebook.title)}
                  aria-label="删除笔记本"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AppToast message={statusText} variant={statusVariant} />
    </div>
  )
}
