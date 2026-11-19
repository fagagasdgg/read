import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NoteTag } from '../../services/notes/tags'
import { ListPager, paginateItems } from '../common/ListPager'

const PAGE_SIZE = 8

interface TagFilterSheetProps {
  open: boolean
  tags: NoteTag[]
  value: string
  onClose: () => void
  onSelect: (tagId: string) => void
}

/** 现代化标签选择面板（含分页），替代原生 select */
export function TagFilterSheet({ open, tags, value, onClose, onSelect }: TagFilterSheetProps) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!open) return
    const index = tags.findIndex((tag) => tag.id === value)
    if (index >= 0) {
      setPage(Math.floor(index / PAGE_SIZE) + 1)
    } else {
      setPage(1)
    }
  }, [open, tags, value])

  const { pageItems, page: safePage, totalPages } = useMemo(
    () => paginateItems(tags, page, PAGE_SIZE),
    [tags, page],
  )

  if (!open) return null

  return createPortal(
    <div className="tag-filter-sheet-mask" onClick={onClose}>
      <div
        className="tag-filter-sheet"
        role="dialog"
        aria-label="选择标签"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tag-filter-sheet-header">
          <h3>按标签筛选</h3>
          <button type="button" className="tag-filter-sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <button
          type="button"
          className={`tag-filter-option${value === '' ? ' active' : ''}`}
          onClick={() => {
            onSelect('')
            onClose()
          }}
        >
          <span>全部笔记本</span>
          {value === '' ? <span className="tag-filter-check">✓</span> : null}
        </button>

        <div className="tag-filter-sheet-list">
          {pageItems.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`tag-filter-option${value === tag.id ? ' active' : ''}`}
              onClick={() => {
                onSelect(tag.id)
                onClose()
              }}
            >
              <span>{tag.name}</span>
              {value === tag.id ? <span className="tag-filter-check">✓</span> : null}
            </button>
          ))}
          {!tags.length ? (
            <p className="tag-filter-empty">还没有标签，请先到「工具 → 笔记标签」创建</p>
          ) : null}
        </div>

        <ListPager
          page={safePage}
          totalPages={totalPages}
          totalItems={tags.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          label="个标签"
        />
      </div>
    </div>,
    document.body,
  )
}
