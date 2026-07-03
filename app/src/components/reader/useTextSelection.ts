import { useCallback, useEffect, useRef, useState } from 'react'

export interface TextSelectionState {
  text: string
}

function isSelectionInside(container: HTMLElement, selection: Selection): boolean {
  if (!selection.rangeCount) return false
  const range = selection.getRangeAt(0)
  const node = range.commonAncestorContainer
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
  return Boolean(element && container.contains(element))
}

export function useTextSelection(container: HTMLElement | null) {
  const [selection, setSelection] = useState<TextSelectionState | null>(null)
  const lockingRef = useRef(false)

  const clearSelection = useCallback(() => {
    setSelection(null)
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) sel.removeAllRanges()
  }, [])

  useEffect(() => {
    if (!container) return

    function refresh() {
      if (!container || lockingRef.current) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null)
      }
    }

    function captureSelection() {
      setTimeout(() => {
        if (!container || lockingRef.current) return
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.toString().trim()) return
        if (!isSelectionInside(container, sel)) return

        const text = sel.toString().trim()
        lockingRef.current = true
        sel.removeAllRanges()
        setSelection({ text })
        window.setTimeout(() => {
          lockingRef.current = false
        }, 80)
      }, 320)
    }

    document.addEventListener('selectionchange', refresh)
    container.addEventListener('touchend', captureSelection)
    container.addEventListener('mouseup', captureSelection)

    return () => {
      document.removeEventListener('selectionchange', refresh)
      container.removeEventListener('touchend', captureSelection)
      container.removeEventListener('mouseup', captureSelection)
    }
  }, [container])

  return { selection, clearSelection }
}
