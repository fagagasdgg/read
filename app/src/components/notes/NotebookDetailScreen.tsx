import { useEffect, useState } from 'react'
import { getNotebookDocument, type NotebookDocument } from '../../services/notes/notebooks'

interface NotebookDetailScreenProps {
  notebookId: string
  title: string
  onBack: () => void
}

export function NotebookDetailScreen({ notebookId, title, onBack }: NotebookDetailScreenProps) {
  const [doc, setDoc] = useState<NotebookDocument | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getNotebookDocument(notebookId)
      .then((next) => {
        if (!cancelled) setDoc(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [notebookId])

  return (
    <div className="notebook-detail-screen">
      <header className="notebook-detail-header">
        <button type="button" className="notebook-detail-back" onClick={onBack}>
          ← 返回
        </button>
        <h1>{doc?.title ?? title}</h1>
      </header>

      <div className="notebook-detail-body">
        {loading && <p className="notebook-detail-placeholder">加载中…</p>}
        {!loading && (
          <>
            <p className="notebook-detail-placeholder">
              这是一本空白笔记本。后续可在阅读时选中句子，将解析结果保存到这里。
            </p>
            <p className="notebook-detail-meta">
              条目数：{doc?.entries.length ?? 0}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
