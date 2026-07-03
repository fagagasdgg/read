import { useState } from 'react'
import { createPortal } from 'react-dom'

interface DoubaoPasteSheetProps {
  onClose: () => void
  onConfirm: (text: string) => void
}

export function DoubaoPasteSheet({ onClose, onConfirm }: DoubaoPasteSheetProps) {
  const [value, setValue] = useState('')

  return createPortal(
    <div className="doubao-paste-overlay" onMouseDown={onClose}>
      <div
        className="doubao-paste-sheet"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="doubao-paste-header">
          <h3>粘贴豆包回复</h3>
          <button type="button" className="doubao-paste-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <p className="doubao-paste-hint">
          若无法自动读取剪贴板，请长按粘贴豆包返回的完整 JSON 内容。
        </p>
        <textarea
          className="doubao-paste-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="在此粘贴豆包回复…"
          rows={8}
          autoFocus
        />
        <div className="doubao-paste-actions">
          <button type="button" className="doubao-paste-btn doubao-paste-btn-muted" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="doubao-paste-btn doubao-paste-btn-primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value)}
          >
            确认导入
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
