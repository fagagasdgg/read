import { useEffect, useState } from 'react'
import {
  getNotebookDocument,
  getNotebookEntryById,
  listNotebookEntries,
  type NotebookDocument,
} from '../../services/notes/notebooks'

interface NotebookDetailScreenProps {
  notebookId: string
  title: string
  onBack: () => void
}

export function NotebookDetailScreen({ notebookId, title, onBack }: NotebookDetailScreenProps) {
  const [doc, setDoc] = useState<NotebookDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDoc() {
      setLoading(true)
      try {
        const next = await getNotebookDocument(notebookId)
        if (!cancelled) setDoc(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDoc()

    function onVisible() {
      if (document.visibilityState === 'visible') {
        void loadDoc()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [notebookId])

  useEffect(() => {
    setPage(1)
    setSelectedEntryId(null)
  }, [notebookId])

  const pageData = listNotebookEntries(doc, page, 20)
  const selectedEntry = selectedEntryId ? getNotebookEntryById(doc, selectedEntryId) : null

  function openEntry(entryId: string) {
    setSelectedEntryId(entryId)
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
            <p className="notebook-detail-placeholder">
              这里会展示句子笔记列表。后续阅读时保存的句子解析会按条目收纳，避免单个大文件混乱。
            </p>
            <p className="notebook-detail-meta">
              条目数：{pageData.total}
            </p>

            {pageData.items.length > 0 ? (
              <>
                <ul className="notebook-entry-list">
                  {pageData.items.map((entry, idx) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="notebook-entry-item"
                        onClick={() => openEntry(entry.id)}
                      >
                        <span className="notebook-entry-index">
                          #{(pageData.page - 1) * 20 + idx + 1}
                        </span>
                        <span className="notebook-entry-sentence">{entry.sentence}</span>
                        <span className="notebook-entry-arrow">›</span>
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
                暂无句子条目。后续保存时会以「原句 + 四类解析」结构写入列表。
              </p>
            )}
          </>
        )}

        {!loading && selectedEntry && (
          <div className="notebook-entry-detail">
            <h2 className="notebook-entry-detail-title">{selectedEntry.sentence}</h2>

            <section className="notebook-entry-block">
              <h3>原句翻译</h3>
              <p>{selectedEntry.analysis.translation || '暂无内容'}</p>
            </section>
            <section className="notebook-entry-block">
              <h3>固定搭配</h3>
              <p>{selectedEntry.analysis.collocations || '暂无内容'}</p>
            </section>
            <section className="notebook-entry-block">
              <h3>俚语讲解</h3>
              <p>{selectedEntry.analysis.slangs || '暂无内容'}</p>
            </section>
            <section className="notebook-entry-block">
              <h3>句型分析</h3>
              <p>{selectedEntry.analysis.sentencePattern || '暂无内容'}</p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
