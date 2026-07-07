export const NOTEBOOK_DATA_CHANGED = 'read-notebook-data-changed'

export function notifyNotebookDataChanged(): void {
  window.dispatchEvent(new Event(NOTEBOOK_DATA_CHANGED))
}
