import { useCallback, useEffect, useState } from 'react'

/** 在完整渲染章节后，按视口高度计算页数（translateY 翻页） */
export function useViewportPagination(
  contentEl: HTMLElement | null,
  windowEl: HTMLElement | null,
  remeasureKey: string,
): { pageHeight: number; pageCount: number; measuring: boolean } {
  const [pageHeight, setPageHeight] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [measuring, setMeasuring] = useState(true)

  const measure = useCallback(() => {
    if (!contentEl || !windowEl) return

    const style = getComputedStyle(windowEl)
    const paddingY =
      (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    const height = windowEl.clientHeight - paddingY
    const total = contentEl.scrollHeight

    if (height < 40) {
      setMeasuring(false)
      return
    }

    setPageHeight(height)
    setPageCount(Math.max(1, Math.ceil(total / height)))
    setMeasuring(false)
  }, [contentEl, windowEl])

  useEffect(() => {
    if (!contentEl || !windowEl) {
      setPageCount(1)
      setPageHeight(0)
      setMeasuring(false)
      return
    }

    setMeasuring(true)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure)
    })

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure)
    })
    observer.observe(contentEl)
    observer.observe(windowEl)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      observer.disconnect()
    }
  }, [contentEl, windowEl, measure, remeasureKey])

  return { pageHeight, pageCount, measuring }
}
