import { useCallback, useEffect, useRef, useState } from 'react'
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
import {
  NOTEBOOK_DATA_CHANGED,
  NOTES_OPEN_FREQUENCY_PANE,
  consumeOpenFrequencyNotesPane,
} from '../../services/notes/events'
import {
  countEntriesByTagId,
  findEntriesByTagId,
  listNoteTags,
  type NoteTag,
  type TaggedNoteHit,
} from '../../services/notes/tags'
import { NotebookDetailScreen } from './NotebookDetailScreen'
import { TagFilterSheet } from './TagFilterSheet'

const NOTEBOOK_COLORS = ['#e8dcc8', '#d4e4d9', '#dce4f0', '#f0e0d0', '#e6dce8', '#e0ebe5']

type NotesPane = 'notes' | 'frequency'

function notebookColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i)) % NOTEBOOK_COLORS.length
  return NOTEBOOK_COLORS[hash]
}

export function NotesScreen({ isActive = true }: { isActive?: boolean }) {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([])
  const [pane, setPane] = useState<NotesPane>(() =>
    consumeOpenFrequencyNotesPane() ? 'frequency' : 'notes',
  )
  const [openNotebookId, setOpenNotebookId] = useState<string | null>(null)
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)
  const [statusText, setStatusText] = useState('')
  const [statusVariant, setStatusVariant] = useState<AppToastVariant>('ok')
  const [tags, setTags] = useState<NoteTag[]>([])
  const [tagFilterId, setTagFilterId] = useState('')
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagHits, setTagHits] = useState<TaggedNoteHit[]>([])
  const [tagHitsLoading, setTagHitsLoading] = useState(false)
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({})
  const [openedFromTagFilter, setOpenedFromTagFilter] = useState(false)

  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  const refresh = useCallback(async () => {
    const [nbList, tagList, counts] = await Promise.all([
      listNotebooks(),
      listNoteTags(),
      countEntriesByTagId(),
    ])
    setNotebooks(nbList)
    setTags(tagList)
    setTagCounts(counts)
  }, [])

  useEffect(() => {
    if (isActive) {
      void refresh()
      return
    }
    setOpenNotebookId(null)
    setOpenEntryId(null)
  }, [isActive, refresh])

  useEffect(() => {
    if (pane !== 'notes' || !tagFilterId) {
      setTagHits([])
      return
    }
    let cancelled = false
    setTagHitsLoading(true)
    void findEntriesByTagId(tagFilterId)
      .then((hits) => {
        if (!cancelled) setTagHits(hits)
      })
      .finally(() => {
        if (!cancelled) setTagHitsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pane, tagFilterId, notebooks])

  useEffect(() => {
    const onDataChanged = () => {
      if (isActiveRef.current) void refresh()
    }
    const onOpenFrequency = () => {
      consumeOpenFrequencyNotesPane()
      setPane('frequency')
      setOpenNotebookId(null)
      if (isActiveRef.current) void refresh()
    }
    window.addEventListener(NOTEBOOK_DATA_CHANGED, onDataChanged)
    window.addEventListener(BACKUP_DATA_CHANGED, onDataChanged)
    window.addEventListener(NOTES_OPEN_FREQUENCY_PANE, onOpenFrequency)
    return () => {
      window.removeEventListener(NOTEBOOK_DATA_CHANGED, onDataChanged)
      window.removeEventListener(BACKUP_DATA_CHANGED, onDataChanged)
      window.removeEventListener(NOTES_OPEN_FREQUENCY_PANE, onOpenFrequency)
    }
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
        initialEntryId={openEntryId}
        exitOnEntryLeave={openedFromTagFilter}
        onBack={() => {
          setOpenNotebookId(null)
          setOpenEntryId(null)
          setOpenedFromTagFilter(false)
        }}
      />
    )
  }

  const selectedTagName = tags.find((tag) => tag.id === tagFilterId)?.name

  return (
    <div className="notes-screen">
      <header className="notes-header">
        <div className="notes-pane-tabs" role="tablist" aria-label="笔记分类">
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'notes'}
            className={`notes-pane-tab${pane === 'notes' ? ' active' : ''}`}
            onClick={() => setPane('notes')}
          >
            阅读笔记
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'frequency'}
            className={`notes-pane-tab${pane === 'frequency' ? ' active' : ''}`}
            onClick={() => {
              setPane('frequency')
              setTagFilterId('')
            }}
          >
            词频统计
          </button>
        </div>
        <div className="notes-header-actions">
          <button
            type="button"
            className="bookshelf-import-btn notes-header-add"
            onClick={() => void handleCreate()}
            aria-label="新建笔记本"
            tabIndex={pane === 'notes' ? 0 : -1}
            aria-hidden={pane !== 'notes'}
            disabled={pane !== 'notes'}
          >
            +
          </button>
        </div>
      </header>

      {pane === 'notes' ? (
        <div className="notes-tag-filter">
          <span className="notes-tag-filter-label">按标签筛选</span>
          <button
            type="button"
            className="notes-tag-filter-trigger"
            onClick={() => setTagPickerOpen(true)}
          >
            <span>{tagFilterId ? selectedTagName ?? '已选标签' : '全部笔记本'}</span>
            <span className="notes-tag-filter-caret" aria-hidden>
              ▾
            </span>
          </button>
          {!tags.length ? (
            <p className="notes-tag-filter-hint">还没有标签，请到「工具 → 笔记标签」创建</p>
          ) : null}
        </div>
      ) : null}

      <TagFilterSheet
        open={tagPickerOpen}
        tags={tags}
        counts={tagCounts}
        value={tagFilterId}
        onClose={() => setTagPickerOpen(false)}
        onSelect={setTagFilterId}
      />

      {pane === 'notes' && tagFilterId ? (
        <div className="notes-tag-results">
          <h2 className="notes-tag-results-title">
            标签「{selectedTagName ?? '…'}」· {tagHitsLoading ? '查询中…' : `${tagHits.length} 条`}
          </h2>
          {!tagHitsLoading && tagHits.length === 0 ? (
            <p className="bookshelf-empty-hint">没有找到带该标签的笔记</p>
          ) : null}
          <ul className="notes-tag-hit-list">
            {tagHits.map((hit, index) => (
              <li key={`${hit.notebookId}:${hit.entry.id}`}>
                <button
                  type="button"
                  className="notes-tag-hit-btn"
                  onClick={() => {
                    setOpenedFromTagFilter(true)
                    setOpenEntryId(hit.entry.id)
                    void handleOpen(hit.notebookId)
                  }}
                >
                  <span className="notes-tag-hit-index">{index + 1}</span>
                  <span className="notes-tag-hit-body">
                    <span className="note-tags-hit-nb">{hit.notebookTitle}</span>
                    <p className="note-tags-hit-sentence">{hit.entry.sentence}</p>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
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
                  onClick={() => {
                    setOpenedFromTagFilter(false)
                    void handleOpen(notebook.id)
                  }}
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
      )}

      <AppToast message={statusText} variant={statusVariant} />
    </div>
  )
}
