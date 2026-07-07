import { useEffect, useState } from 'react'
import {
  formatBackupDirectoryLabel,
  loadBackupDirectorySettings,
  pickBackupDirectory,
  type BackupDirectorySettings,
} from '../../services/settings/backupDirectory'

export function BackupDirectorySection({ embedded = false }: { embedded?: boolean }) {
  const [backupDir, setBackupDir] = useState<BackupDirectorySettings | null>(null)
  const [pickingDir, setPickingDir] = useState(false)
  const [dirMessage, setDirMessage] = useState('')

  useEffect(() => {
    void loadBackupDirectorySettings().then(setBackupDir)
  }, [])

  async function handlePickBackupDirectory() {
    setPickingDir(true)
    setDirMessage('')
    try {
      const next = await pickBackupDirectory()
      if (next) {
        setBackupDir(next)
        setDirMessage('默认备份目录已更新')
      }
    } catch (err) {
      setDirMessage(err instanceof Error ? err.message : '选择目录失败')
    } finally {
      setPickingDir(false)
    }
  }

  const emptyDir: BackupDirectorySettings = {
    displayPath: '',
    nativePath: '',
    folderId: '',
    folderName: '',
    webDirectoryName: '',
    updatedAt: 0,
  }

  const body = (
    <>
      <p className="reader-backup-dir-path">
        当前目录：<strong>{formatBackupDirectoryLabel(backupDir ?? emptyDir)}</strong>
      </p>
      <button
        type="button"
        className="reader-backup-dir-btn"
        onClick={() => void handlePickBackupDirectory()}
        disabled={pickingDir}
      >
        {pickingDir ? '打开选择器…' : '选择默认保存目录'}
      </button>
      {dirMessage && <p className="reader-backup-dir-message">{dirMessage}</p>}
      <p className="settings-section-note">
        导出时将保存到此目录（需使用系统文件夹选择器授权）。若导出报权限错误，请重新选择目录。
      </p>
    </>
  )

  if (embedded) return body

  return (
    <section className="settings-section">
      <h4 className="settings-section-title">数据备份目录</h4>
      {body}
    </section>
  )
}
