interface ListPagerProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  label?: string
}

/** 通用分页：首页 / 上一页 / 页码选择 / 下一页 / 尾页 */
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
        共 {totalItems} {label} · {safePage}/{safeTotalPages} 页
      </span>
      <div className="list-pager-controls">
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
          className="list-pager-btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          上一页
        </button>
        <label className="list-pager-select-wrap">
          <span className="sr-only">页码</span>
          <select
            className="list-pager-select"
            value={safePage}
            onChange={(e) => onPageChange(Number(e.target.value))}
          >
            {Array.from({ length: safeTotalPages }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                第 {n} 页
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="list-pager-btn"
          disabled={safePage >= safeTotalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          下一页
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

export function paginateItems<T>(items: T[], page: number, pageSize: number): {
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
