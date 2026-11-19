interface ListPagerProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  label?: string
}

export const TAG_LIST_PAGE_SIZE = 10

/** 通用分页：首页 / 上一页 / 当前页·总页 / 下一页 / 尾页（无下拉选页） */
export function ListPager({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  label = '条',
}: ListPagerProps) {
  if (totalItems <= pageSize && totalPages <= 1) return null

  const safeTotalPages = Math.max(1, totalPages)
  const safePage = Math.min(Math.max(1, page), safeTotalPages)

  return (
    <div className="list-pager">
      <span className="list-pager-meta">
        共 {totalItems} {label}
      </span>
      <div className="list-pager-controls" role="navigation" aria-label="分页">
        <button
          type="button"
          className="list-pager-btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
        >
          首页
        </button>
        <button
          type="button"
          className="list-pager-btn list-pager-btn-nav"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <span aria-hidden>‹</span> 上一页
        </button>
        <span className="list-pager-status" aria-current="page">
          {safePage}/{safeTotalPages}
        </span>
        <button
          type="button"
          className="list-pager-btn list-pager-btn-nav"
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          下一页 <span aria-hidden>›</span>
        </button>
        <button
          type="button"
          className="list-pager-btn"
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safeTotalPages)}
        >
          尾页
        </button>
      </div>
    </div>
  )
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[]
  page: number
  totalPages: number
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  }
}
