import { Capacitor } from '@capacitor/core'
import { useRef, useState } from 'react'
import { exportUserDataBackup, importUserDataBackup } from '../../services/backup/userDataBackup'

interface DataBackupSheetProps {
  onClose: () => void
  onDone?: () => void
}

export function DataBackupSheet({ onClose, onDone }: DataBackupSheetProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const native = Capacitor.isNativePlatform()

  async function handleExport() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await exportUserDataBackup()
      const location = result.savedPath ? `，已保存至 ${result.savedPath}` : '，已开始下载'
      setMessage(`导出成功${location}。${result.summary}`)
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file?: File) {
    if (!window.confirm('导入将与现有数据合并（词典、词组、笔记、已掌握单词）。是否继续？')) {
      return
    }

    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await importUserDataBackup(file)
      const warn =
        result.warnings.length > 0 ? `（${result.warnings.slice(0, 2).join('；')}）` : ''
      setMessage(
        `导入完成：词条 ${result.dictionaryWords}、未找到 ${result.dictionaryNotFound}、词组单词 ${result.phraseLemmas}、已掌握 ${result.masteredWords}、笔记新增 ${result.notebookEntries} 条${warn}`,
      )
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bookshelf-sheet-mask" onClick={onClose}>
      <div className="bookshelf-sheet data-backup-sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="bookshelf-sheet-title">学习数据备份</h3>
        <p className="bookshelf-sheet-hint data-backup-sheet-hint">
          一键导出/导入：词典缓存（含查不到的标记）、用户词组、笔记本、已掌握单词。格式为 zip 压缩包，不含 EPUB 书籍文件。
        </p>

        <div className="bookshelf-sheet-actions">
          <button
            type="button"
            className="bookshelf-sheet-btn"
            disabled={busy}
            onClick={() => void handleExport()}
          >
            {busy ? '处理中…' : '导出数据'}
          </button>
          <button
            type="button"
            className="bookshelf-sheet-btn"
            disabled={busy}
            onClick={() => {
              if (native) {
                void handleImport()
                return
              }
              fileInputRef.current?.click()
            }}
          >
            {busy ? '处理中…' : '导入数据'}
          </button>
          {!native && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImport(file)
                e.target.value = ''
              }}
            />
          )}
          <button type="button" className="bookshelf-sheet-btn muted" disabled={busy} onClick={onClose}>
            关闭
          </button>
        </div>

        {message && <p className="data-backup-sheet-message">{message}</p>}
        {error && <p className="data-backup-sheet-error">{error}</p>}
      </div>
    </div>
  )
}
