export const BACKUP_DATA_CHANGED = 'read-backup-data-changed'

export function notifyBackupDataChanged(): void {
  window.dispatchEvent(new Event(BACKUP_DATA_CHANGED))
}
