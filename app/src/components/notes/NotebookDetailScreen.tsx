import { useCallback, useEffect, useState } from 'react'
import { normalizeAnalysisListField } from '../../services/llm/analysisParse'
import {
  getNotebookDocument,
  getNotebookEntryById,
  isBaseSentenceNotebook,
  listNotebookEntries,
  removeNotebookEntry,
  type NotebookDocument,
} from '../../services/notes/notebooks'
import {
  loadNotebookPageSize,
  NOTEBOOK_PAGE_SIZE_OPTIONS,
  saveNotebookPageSize,
  type NotebookPageSize,
} from '../../services/notes/notebookUiSettings'

interface NotebookDetailScreenProps {
  notebookId: string
  title: string
  onBack: () => void
}

export function NotebookDetailScreen({ notebookId, title, onBack }: NotebookDetailScreenProps) {
  const [doc, setDoc] = useState<NotebookDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<NotebookPageSize>(20)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDoc = useCallback(async () => {
    setLoading(true)
    try {
      const next = await getNotebookDocument(notebookId)
      setDoc(next)
      return next
    } finally {
      setLoading(false)
    }
  }, [notebookId])

  useEffect(() => {
    void loadNotebookPageSize().then(setPageSize)
  }, [])

  useEffect(() => {
    void loadDoc()
  }, [loadDoc])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        void loadDoc()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadDoc])

  useEffect(() => {
    setPage(1)
    setSelectedEntryId(null)
  }, [notebookId])

  const pageData = listNotebookEntries(doc, page, pageSize)
  const selectedEntry = selectedEntryId ? getNotebookEntryById(doc, selectedEntryId) : null

  function openEntry(entryId: string) {
    setSelectedEntryId(entryId)
  }

  async function handlePageSizeChange(nextSize: NotebookPageSize) {
    setPageSize(nextSize)
    await saveNotebookPageSize(nextSize)
    setPage((current) => {
      const total = doc?.entries.length ?? 0
      const totalPages = Math.max(1, Math.ceil(total / nextSize))
      return Math.min(current, totalPages)
    })
  }

  async function handleDeleteEntry(entryId: string) {
    if (!window.confirm('确定删除这条笔记？')) return

    setDeletingId(entryId)
    try {
      const { totalAfter } = await removeNotebookEntry(notebookId, entryId)
      const nextDoc = await getNotebookDocument(notebookId)
      setDoc(nextDoc)

      if (selectedEntryId === entryId) {
        setSelectedEntryId(null)
      }

      const totalPages = Math.max(1, Math.ceil(totalAfter / pageSize))
      setPage((current) => Math.min(current, totalPages))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="notebook-detail-screen">
      <header className="notebook-detail-header">
        <button
          type="button"
          className="notebook-detail-back"
          onClick={() => {
            if (selectedEntry) {
              setSelectedEntryId(null)
              return
            }
            onBack()
          }}
        >
          ← 返回
        </button>
        <h1>{doc?.title ?? title}</h1>
      </header>

      <div className="notebook-detail-body">
        {loading && <p className="notebook-detail-placeholder">加载中…</p>}
        {!loading && !selectedEntry && (
          <>
            {pageData.total === 0 && (
              <p className="notebook-detail-placeholder">
                {isBaseSentenceNotebook(notebookId)
                  ? '所有保存到各笔记本的句子都会自动汇总到这里，并标注来源书籍与笔记本。'
                  : '这里会展示句子笔记列表。阅读时保存的句子解析会按条目收纳。'}
              </p>
            )}

            <div className="notebook-detail-toolbar">
              <p className="notebook-detail-meta">条目数：{pageData.total}</p>
              <label className="notebook-page-size">
                <span>每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    if (NOTEBOOK_PAGE_SIZE_OPTIONS.includes(next as NotebookPageSize)) {
                      void handlePageSizeChange(next as NotebookPageSize)
                    }
                  }}
                >
                  {NOTEBOOK_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} 条
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {pageData.items.length > 0 ? (
              <>
                <ul className="notebook-entry-list">
                  {pageData.items.map((entry, idx) => (
                    <li key={entry.id} className="notebook-entry-row">
                      <button
                        type="button"
                        className="notebook-entry-item"
                        onClick={() => openEntry(entry.id)}
                      >
                        <span className="notebook-entry-index">
                          #{(pageData.page - 1) * pageSize + idx + 1}
                        </span>
                        <span className="notebook-entry-sentence">{entry.sentence}</span>
                        {entry.source && (
                          <span className="notebook-entry-source">
                            来自《{entry.source.bookTitle}》· {entry.source.notebookTitle}
                          </span>
                        )}
                        <span className="notebook-entry-arrow">›</span>
                      </button>
                      <button
                        type="button"
                        className="notebook-entry-delete"
                        aria-label="删除这条笔记"
                        disabled={deletingId === entry.id}
                        onClick={() => void handleDeleteEntry(entry.id)}
                      >
                        {deletingId === entry.id ? '…' : '×'}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="notebook-pager">
                  <button
                    type="button"
                    className="notebook-pager-btn"
                    disabled={pageData.page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    上一页
                  </button>
                  <span className="notebook-pager-meta">
                    第 {pageData.page} / {pageData.totalPages} 页
                  </span>
                  <button
                    type="button"
                    className="notebook-pager-btn"
                    disabled={pageData.page >= pageData.totalPages}
                    onClick={() => setPage((value) => Math.min(pageData.totalPages, value + 1))}
                  >
                    下一页
                  </button>
                </div>
              </>
            ) : (
              <p className="notebook-detail-placeholder">
                {pageData.total > 0 && page > 1
                  ? '本页暂无条目，请返回上一页。'
                  : '暂无句子条目。后续保存时会以「原句 + 四类解析」结构写入列表。'}
              </p>
            )}
          </>
        )}

        {!loading && selectedEntry && (
          <div className="notebook-entry-detail">
            {selectedEntry.source && (
              <p className="notebook-entry-source-detail">
                来源：书籍《{selectedEntry.source.bookTitle}》→ 笔记本「
                {selectedEntry.source.notebookTitle}」
              </p>
            )}
            <h2 className="notebook-entry-detail-title">{selectedEntry.sentence}</h2>

            <section className="notebook-entry-block">
              <h3>原句翻译</h3>
              <p>{selectedEntry.analysis.translation || '暂无内容'}</p>
            </section>
            <section className="notebook-entry-block">
              <h3>固定搭配</h3>
              <p>
                {normalizeAnalysisListField(
                  selectedEntry.analysis.collocations || '暂无内容',
                  'collocations',
                ) || '暂无内容'}
              </p>
            </section>
            <section className="notebook-entry-block">
              <h3>俚语讲解</h3>
              <p>
                {normalizeAnalysisListField(
                  selectedEntry.analysis.slangs || '暂无内容',
                  'slangs',
                ) || '暂无内容'}
              </p>
            </section>
            <section className="notebook-entry-block">
              <h3>句型分析</h3>
              <p>{selectedEntry.analysis.sentencePattern || '暂无内容'}</p>
            </section>

            <button
              type="button"
              className="notebook-entry-delete-btn"
              disabled={deletingId === selectedEntry.id}
              onClick={() => void handleDeleteEntry(selectedEntry.id)}
            >
              {deletingId === selectedEntry.id ? '删除中…' : '删除这条笔记'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
