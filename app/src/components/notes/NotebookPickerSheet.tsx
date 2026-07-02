import { useEffect, useState } from 'react'
import { listNotebooks, type NotebookMeta } from '../../services/notes/notebooks'

interface NotebookPickerSheetProps {
  title?: string
  onSelect: (notebookId: string) => void
  onClose: () => void
}

export function NotebookPickerSheet({
  title = '选择笔记本',
  onSelect,
  onClose,
}: NotebookPickerSheetProps) {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void listNotebooks()
      .then((items) => {
        if (!cancelled) setNotebooks(items)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="reader-overlay notebook-picker-overlay" onClick={onClose}>
      <div className="notebook-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="notebook-picker-header">
          <h3>{title}</h3>
          <button type="button" className="notebook-picker-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="notebook-picker-body">
          {loading && <p className="notebook-picker-status">加载中…</p>}
          {!loading && notebooks.length === 0 && (
            <p className="notebook-picker-status">暂无笔记本，请先在「笔记」页创建。</p>
          )}
          {!loading && notebooks.length > 0 && (
            <ul className="notebook-picker-list">
              {notebooks.map((item) => (
                <li key={item.id}>
                  <button type="button" className="notebook-picker-item" onClick={() => onSelect(item.id)}>
                    <span className="notebook-picker-item-title">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
