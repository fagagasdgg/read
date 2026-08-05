export const NOTEBOOK_DATA_CHANGED = 'read-notebook-data-changed'

/** 生成词频本后提示笔记页切到「词频统计」页签 */
export const NOTES_OPEN_FREQUENCY_PANE = 'read-notes-open-frequency-pane'

let pendingOpenFrequencyPane = false

export function notifyNotebookDataChanged(): void {
  window.dispatchEvent(new Event(NOTEBOOK_DATA_CHANGED))
}

/** 即便笔记 Tab 尚未挂载，也会记住「下次打开切到词频统计」 */
export function notifyOpenFrequencyNotesPane(): void {
  pendingOpenFrequencyPane = true
  window.dispatchEvent(new Event(NOTES_OPEN_FREQUENCY_PANE))
}

export function consumeOpenFrequencyNotesPane(): boolean {
  if (!pendingOpenFrequencyPane) return false
  pendingOpenFrequencyPane = false
  return true
}
