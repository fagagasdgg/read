import { useCallback, useEffect, useRef, useState } from 'react'

export interface TextSelectionState {
  text: string
}

/** 选区稳定后再弹出工具面板，避免拖动手柄扩展选区时被挡住 */
const DEFAULT_SELECTION_CONFIRM_MS = 850

function isSelectionInside(container: HTMLElement, selection: Selection): boolean {
  if (!selection.rangeCount) return false
  const range = selection.getRangeAt(0)
  const node = range.commonAncestorContainer
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
  return Boolean(element && container.contains(element))
}

function readSelectionText(container: HTMLElement): string | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return null
  if (!isSelectionInside(container, sel)) return null
  return sel.toString().trim()
}

export function useTextSelection(
  container: HTMLElement | null,
  confirmMs = DEFAULT_SELECTION_CONFIRM_MS,
) {
  const [selection, setSelection] = useState<TextSelectionState | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmedTextRef = useRef<string | null>(null)

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = null
    }
  }, [])

  const clearSelection = useCallback(() => {
    clearConfirmTimer()
    confirmedTextRef.current = null
    setSelection(null)
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) sel.removeAllRanges()
  }, [clearConfirmTimer])

  useEffect(() => {
    if (!container) return

    function scheduleConfirm() {
      clearConfirmTimer()
      confirmTimerRef.current = setTimeout(() => {
        const text = readSelectionText(container!)
        if (!text) {
          confirmedTextRef.current = null
          setSelection(null)
          return
        }
        confirmedTextRef.current = text
        setSelection({ text })
      }, confirmMs)
    }

    function refresh() {
      const text = readSelectionText(container!)
      if (!text) {
        clearConfirmTimer()
        confirmedTextRef.current = null
        setSelection(null)
        return
      }

      if (confirmedTextRef.current !== text) {
        setSelection(null)
      }

      scheduleConfirm()
    }

    document.addEventListener('selectionchange', refresh)
    container.addEventListener('mouseup', refresh)
    container.addEventListener('touchend', refresh)

    return () => {
      clearConfirmTimer()
      document.removeEventListener('selectionchange', refresh)
      container.removeEventListener('mouseup', refresh)
      container.removeEventListener('touchend', refresh)
    }
  }, [container, clearConfirmTimer, confirmMs])

  return { selection, clearSelection }
}
