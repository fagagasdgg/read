import { useCallback, useEffect, useState } from 'react'

/** 在完整渲染章节后，按视口高度计算页数（translateY 翻页） */
export function useViewportPagination(
  contentEl: HTMLElement | null,
  windowEl: HTMLElement | null,
  remeasureKey: string,
): { pageHeight: number; pageCount: number; measuring: boolean; layoutStable: boolean } {
  const [pageHeight, setPageHeight] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [measuring, setMeasuring] = useState(true)
  const [layoutStable, setLayoutStable] = useState(false)

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
      setLayoutStable(false)
      return
    }

    setMeasuring(true)
    setLayoutStable(false)
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

  useEffect(() => {
    if (!contentEl || !windowEl || measuring || pageHeight < 40) {
      setLayoutStable(false)
      return
    }

    setLayoutStable(false)
    const timer = window.setTimeout(() => setLayoutStable(true), 50)
    return () => window.clearTimeout(timer)
  }, [contentEl, windowEl, measuring, pageCount, pageHeight, remeasureKey])

  return { pageHeight, pageCount, measuring, layoutStable }
}

export function shouldWaitForMultiPageLand(
  mode: 'start' | 'end' | 'restore',
  targetPage: number,
  pageCount: number,
  pageHeight: number,
  contentEl: HTMLElement | null,
): boolean {
  if (mode === 'start') return false
  if (!contentEl || pageHeight <= 0) return true

  const likelyMultiPage = contentEl.scrollHeight > pageHeight + 8

  // 内容明显超出一页但 pageCount 仍为 1 → 测量未完成（end / restore 均需等待）
  if (likelyMultiPage && pageCount <= 1) {
    return true
  }

  if (mode === 'restore' && targetPage > 0 && pageCount <= 1) {
    return true
  }

  return false
}
