import { useCallback, useEffect, useState } from 'react'

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

  const clearSelection = useCallback(() => {
    setSelection(null)
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) sel.removeAllRanges()
  }, [])

  useEffect(() => {
    if (!container) return

    function refresh() {
      if (!container) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null)
        return
      }
      if (!isSelectionInside(container, sel)) {
        setSelection(null)
        return
      }
      setSelection({ text: sel.toString().trim() })
    }

    document.addEventListener('selectionchange', refresh)
    container.addEventListener('mouseup', refresh)
    container.addEventListener('touchend', refresh)

    return () => {
      document.removeEventListener('selectionchange', refresh)
      container.removeEventListener('mouseup', refresh)
      container.removeEventListener('touchend', refresh)
    }
  }, [container])

  return { selection, clearSelection }
}
