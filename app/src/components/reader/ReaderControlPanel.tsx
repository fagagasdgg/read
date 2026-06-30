interface ReaderControlPanelProps {
  bookTitle: string
  onClose: () => void
  onExit: () => void
  onOpenToc: () => void
  onOpenSettings: () => void
}

export function ReaderControlPanel({
  bookTitle,
  onClose,
  onExit,
  onOpenToc,
  onOpenSettings,
}: ReaderControlPanelProps) {
  return (
    <div className="reader-overlay" onClick={onClose}>
      <div className="reader-control-panel" onClick={(e) => e.stopPropagation()}>
        <header className="reader-control-header">
          <button type="button" className="reader-control-back" onClick={onExit} aria-label="退出书籍">
            ←
          </button>
          <span className="reader-control-title">{bookTitle}</span>
        </header>

        <div className="reader-control-actions">
          <button type="button" className="reader-control-action" onClick={onOpenToc}>
            <span className="reader-control-icon">☰</span>
            <span>目录</span>
          </button>
          <button type="button" className="reader-control-action" onClick={onOpenSettings}>
            <span className="reader-control-icon">⚙</span>
            <span>设置</span>
          </button>
        </div>
      </div>
    </div>
  )
}
