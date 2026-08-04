import { useCallback, useEffect, useState } from 'react'
import { AppToast, type AppToastVariant } from '../common/AppToast'
import { BACKUP_DATA_CHANGED } from '../../services/backup/events'
import {
  createNotebook,
  isBasePhrasesNotebook,
  isBaseSentenceNotebook,
  isFrequencyNotebookMeta,
  isNotFoundWordsNotebook,
  isSystemNotebook,
  listNotebooks,
  removeNotebook,
  touchNotebook,
  type NotebookMeta,
} from '../../services/notes/notebooks'
import { NotebookDetailScreen } from './NotebookDetailScreen'

const NOTEBOOK_COLORS = ['#e8dcc8', '#d4e4d9', '#dce4f0', '#f0e0d0', '#e6dce8', '#e0ebe5']

type NotesPane = 'notes' | 'frequency'

function notebookColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i)) % NOTEBOOK_COLORS.length
  return NOTEBOOK_COLORS[hash]
}

export function NotesScreen() {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([])
  const [pane, setPane] = useState<NotesPane>('notes')
  const [openNotebookId, setOpenNotebookId] = useState<string | null>(null)
  const [statusText, setStatusText] = useState('')
  const [statusVariant, setStatusVariant] = useState<AppToastVariant>('ok')

  const refresh = useCallback(async () => {
    setNotebooks(await listNotebooks())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onBackupChanged = () => {
      void refresh()
    }
    window.addEventListener(BACKUP_DATA_CHANGED, onBackupChanged)
    return () => window.removeEventListener(BACKUP_DATA_CHANGED, onBackupChanged)
  }, [refresh])

  function showToast(message: string, variant: AppToastVariant = 'ok') {
    setStatusVariant(variant)
    setStatusText(message)
    setTimeout(() => setStatusText(''), 2500)
  }

  const visibleNotebooks =
    pane === 'frequency'
      ? notebooks.filter((n) => isFrequencyNotebookMeta(n))
      : notebooks.filter((n) => !isFrequencyNotebookMeta(n))

  async function handleCreate() {
    if (pane === 'frequency') {
      showToast('请在「工具 → 全书词频统计」中生成词频笔记本', 'error')
      return
    }

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
    if (isSystemNotebook(id)) {
      showToast('系统笔记本不可删除', 'error')
      return
    }
    if (!window.confirm(`确定删除笔记本「${title}」？`)) return
    try {
      await removeNotebook(id)
      if (openNotebookId === id) setOpenNotebookId(null)
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error')
    }
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
        isFrequency={isFrequencyNotebookMeta(notebook)}
        onBack={() => setOpenNotebookId(null)}
      />
    )
  }

  return (
    <div className="notes-screen">
      <header className="bookshelf-header notes-header-with-tabs">
        <div className="notes-pane-tabs" role="tablist" aria-label="笔记分类">
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'notes'}
            className={`notes-pane-tab${pane === 'notes' ? ' active' : ''}`}
            onClick={() => setPane('notes')}
          >
            笔记
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'frequency'}
            className={`notes-pane-tab${pane === 'frequency' ? ' active' : ''}`}
            onClick={() => setPane('frequency')}
          >
            词频统计
          </button>
        </div>
        {pane === 'notes' && (
          <button
            type="button"
            className="bookshelf-import-btn"
            onClick={() => void handleCreate()}
            aria-label="新建笔记本"
          >
            +
          </button>
        )}
      </header>

      <div className="bookshelf-shelf notes-shelf">
        {visibleNotebooks.filter((n) => !isSystemNotebook(n.id)).length === 0 &&
        (pane === 'frequency' || visibleNotebooks.every((n) => isSystemNotebook(n.id))) ? (
          <div className="bookshelf-empty">
            {pane === 'frequency' ? (
              <>
                <p>还没有词频统计笔记本</p>
                <p className="bookshelf-empty-hint">请到「工具 → 全书词频统计」生成</p>
              </>
            ) : (
              <>
                <p>还没有自定义笔记本</p>
                <p className="bookshelf-empty-hint">
                  点击右上角 + 创建；句子会自动汇总到 base_sentence，词组汇总到「词组总集」
                </p>
              </>
            )}
          </div>
        ) : null}
        <ul className="bookshelf-grid">
          {visibleNotebooks.map((notebook) => (
            <li key={notebook.id} className="bookshelf-book">
              <button
                type="button"
                className={`bookshelf-cover notes-cover${isSystemNotebook(notebook.id) ? ' notes-cover-base' : ''}${isFrequencyNotebookMeta(notebook) ? ' notes-cover-freq' : ''}`}
                style={{ background: notebookColor(notebook.id) }}
                onClick={() => void handleOpen(notebook.id)}
              >
                <span className="notes-cover-icon" aria-hidden>
                  {isBaseSentenceNotebook(notebook.id)
                    ? '📚'
                    : isBasePhrasesNotebook(notebook.id)
                      ? '🔗'
                      : isNotFoundWordsNotebook(notebook.id)
                        ? '✏️'
                        : isFrequencyNotebookMeta(notebook)
                          ? '📊'
                          : '📒'}
                </span>
                <span className="notes-cover-title">{notebook.title}</span>
                {isSystemNotebook(notebook.id) && (
                  <span className="notes-cover-badge">系统</span>
                )}
                {isFrequencyNotebookMeta(notebook) && (
                  <span className="notes-cover-badge">词频</span>
                )}
              </button>
              {!isSystemNotebook(notebook.id) && (
                <button
                  type="button"
                  className="bookshelf-book-delete"
                  onClick={() => void handleRemove(notebook.id, notebook.title)}
                  aria-label="删除笔记本"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AppToast message={statusText} variant={statusVariant} />
    </div>
  )
}
