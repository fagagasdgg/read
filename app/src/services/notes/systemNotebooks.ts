import { listNotFoundLemmas } from '../dictionary/cache'
import { listAllWordPhraseRecords } from '../words/phrases'
import {
  BASE_PHRASES_NOTEBOOK_ID,
  NOT_FOUND_WORDS_NOTEBOOK_ID,
  ensureBasePhrasesNotebook,
  ensureNotFoundWordsNotebook,
  getNotebookDocument,
  replaceNotebookEntries,
  type NotebookEntry,
} from './notebooks'

function phraseEntryId(lemma: string): string {
  return `nbe-phrase-${lemma}`
}

function notFoundEntryId(lemma: string): string {
  return `nbe-notfound-${lemma}`
}

function formatPhraseLines(
  items: Array<{ phrase: string; translation: string }>,
): string {
  return items.map((item) => `${item.phrase} — ${item.translation}`).join('\n')
}

/** 仅在打开「词组总集」时调用，禁止挂到 listNotebooks / 导入热路径 */
export async function syncBasePhrasesNotebook(): Promise<void> {
  await ensureBasePhrasesNotebook()
  const records = await listAllWordPhraseRecords()
  const withItems = records
    .filter((record) => record.items.length > 0)
    .sort((a, b) => a.lemma.localeCompare(b.lemma))

  const existingDoc = await getNotebookDocument(BASE_PHRASES_NOTEBOOK_ID)
  const createdAtMap = new Map(
    (existingDoc?.entries ?? []).map((entry) => [
      entry.sentence.trim().toLowerCase(),
      entry.createdAt,
    ]),
  )

  const entries: NotebookEntry[] = withItems.map((record) => ({
    id: phraseEntryId(record.lemma),
    sentence: record.lemma,
    createdAt: createdAtMap.get(record.lemma) ?? Date.now(),
    analysis: {
      translation: `${record.items.length} 条词组`,
      collocations: formatPhraseLines(record.items),
      slangs: '',
      sentencePattern: '',
    },
  }))

  await replaceNotebookEntries(BASE_PHRASES_NOTEBOOK_ID, entries, { silent: true })
}

/** 仅在打开「待补全词条」或手动保存词条后调用 */
export async function syncNotFoundWordsNotebook(): Promise<void> {
  await ensureNotFoundWordsNotebook()
  const { cleanupPossessiveNotFoundMarkers } = await import('../dictionary/cache')
  await cleanupPossessiveNotFoundMarkers()

  const markers = await listNotFoundLemmas()
  const sorted = [...markers].sort((a, b) => a.lemma.localeCompare(b.lemma))

  const existingDoc = await getNotebookDocument(NOT_FOUND_WORDS_NOTEBOOK_ID)
  const createdAtMap = new Map(
    (existingDoc?.entries ?? []).map((entry) => [
      entry.sentence.trim().toLowerCase(),
      entry.createdAt,
    ]),
  )

  const entries: NotebookEntry[] = sorted.map((marker) => ({
    id: notFoundEntryId(marker.lemma),
    sentence: marker.lemma,
    createdAt: createdAtMap.get(marker.lemma) ?? marker.cachedAt,
    analysis: {
      translation: '点击补全词条释义',
      collocations: '',
      slangs: '',
      sentencePattern: '',
    },
  }))

  await replaceNotebookEntries(NOT_FOUND_WORDS_NOTEBOOK_ID, entries, { silent: true })
}

export async function syncAllSystemNotebooks(): Promise<void> {
  await syncBasePhrasesNotebook()
  await syncNotFoundWordsNotebook()
}
