import { formatExamLevelsDisplay } from '../../lib/examLevel'
import { normalizeWordToken } from '../../lib/lemmatize'
import { lookupFromEcdict } from '../dictionary/ecdict'
import { resolveLemma } from '../dictionary/resolveLemma'
import { loadEpubFromDevice } from '../epub/import'
import { loadChapterHtml } from '../epub/parser'
import type { SavedBookMeta } from '../epub/library'
import { getBookDefaultNotebookId } from '../notes/bookNotebook'
import {
  createNotebook,
  findFrequencyNotebookByBookId,
  getNotebookDocument,
  getNotebookMeta,
  isFrequencyNotebookMeta,
  renameNotebook,
  replaceNotebookEntries,
  touchNotebook,
  type NotebookEntry,
  type NotebookMeta,
} from '../notes/notebooks'

/** 常见英语停用词（小写） */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for',
  'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
  'again', 'further', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'don', 'should', 'now', 'of', 'as', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'doing',
  'would', 'could', 'might', 'must', 'shall', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
  'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
  'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am',
  'been', 'having', 'until', 'while', 'of', 'because', 'how', 'where', 'why', 'also', 'than',
])

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)?|[A-Za-z]+(?:-[A-Za-z]+)+/g

export interface BookFrequencyProgress {
  phase: 'load' | 'extract' | 'lemma' | 'lookup' | 'save' | 'done'
  current: number
  total: number
  message: string
  percent: number
}

export interface FrequencyEntryMeta {
  rank: number
  count: number
  collins?: number
  bnc?: number
  frq?: number
}

const FREQ_META_PREFIX = 'freq-meta:'

export function encodeFrequencyMeta(meta: FrequencyEntryMeta): string {
  return FREQ_META_PREFIX + JSON.stringify(meta)
}

export function parseFrequencyMeta(raw: string | undefined): FrequencyEntryMeta | null {
  if (!raw?.startsWith(FREQ_META_PREFIX)) return null
  try {
    const parsed = JSON.parse(raw.slice(FREQ_META_PREFIX.length)) as FrequencyEntryMeta
    if (typeof parsed.rank !== 'number' || typeof parsed.count !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

/** 内存缓存：bookId → lemma→count；null 表示该书无词频本。不写入备份。 */
const bookOccurrenceCache = new Map<string, Map<string, number> | null>()

export function invalidateBookOccurrenceCache(bookId?: string): void {
  if (bookId) bookOccurrenceCache.delete(bookId)
  else bookOccurrenceCache.clear()
}

/**
 * 查询单词在本书词频统计中的出现次数。
 * - 无词频本 / 词未收录 → 返回 null（弹窗不展示）
 * - 有收录 → 返回 count
 * 关联方式：词频本 meta.sourceBookId === bookId（创建统计时写入）
 */
export async function getBookLemmaOccurrenceCount(
  bookId: string,
  lemma: string,
): Promise<number | null> {
  const key = lemma.trim().toLowerCase()
  if (!bookId || !key) return null

  let map = bookOccurrenceCache.get(bookId)
  if (map === undefined) {
    const meta = await findFrequencyNotebookByBookId(bookId)
    if (!meta) {
      bookOccurrenceCache.set(bookId, null)
      return null
    }
    const doc = await getNotebookDocument(meta.id)
    const next = new Map<string, number>()
    for (const entry of doc?.entries ?? []) {
      const freq = parseFrequencyMeta(entry.analysis?.collocations)
      if (!freq) continue
      const lemmaKey = entry.sentence.trim().toLowerCase()
      if (!lemmaKey) continue
      next.set(lemmaKey, freq.count)
    }
    bookOccurrenceCache.set(bookId, next)
    map = next
  }

  if (map === null) return null
  return map.has(key) ? (map.get(key) ?? null) : null
}

function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body?.textContent ?? ''
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

function report(
  onProgress: ((p: BookFrequencyProgress) => void) | undefined,
  partial: Omit<BookFrequencyProgress, 'percent'> & { percent?: number },
) {
  const total = Math.max(1, partial.total)
  const percent =
    partial.percent ??
    Math.min(99, Math.round((partial.current / total) * 100))
  onProgress?.({ ...partial, percent })
}

export interface RunBookFrequencyOptions {
  book: SavedBookMeta
  onProgress?: (progress: BookFrequencyProgress) => void
}

export interface RunBookFrequencyResult {
  notebook: NotebookMeta
  wordCount: number
  uniqueKept: number
}

/**
 * 全书词频统计（纯离线 ECDICT）：
 * 停用词过滤 → 词形还原 → 仅保留有释义词 → 写入词频笔记本
 * 笔记本名称取自本书「默认保存笔记本」；未设置则拒绝执行。
 */
export async function runBookWordFrequencyAnalysis(
  options: RunBookFrequencyOptions,
): Promise<RunBookFrequencyResult> {
  const { book, onProgress } = options

  const defaultNotebookId = await getBookDefaultNotebookId(book.id)
  if (!defaultNotebookId) {
    throw new Error('请先在阅读设置中为本书指定「默认保存笔记本」')
  }
  const defaultNotebook = await getNotebookMeta(defaultNotebookId)
  if (!defaultNotebook || isFrequencyNotebookMeta(defaultNotebook)) {
    throw new Error('本书默认笔记本无效或不存在，请在阅读设置中重新指定')
  }
  const title = defaultNotebook.title.trim()
  if (!title) {
    throw new Error('默认笔记本名称为空，请先为其命名')
  }

  report(onProgress, {
    phase: 'load',
    current: 0,
    total: 1,
    message: '正在加载书籍…',
    percent: 2,
  })

  const epub = await loadEpubFromDevice(book.id)
  const chapterTotal = epub.chapters.length
  if (!chapterTotal) throw new Error('该书没有可解析的章节')

  const counts = new Map<string, number>()
  let extractedChapters = 0

  for (let i = 0; i < chapterTotal; i += 1) {
    const chapter = await loadChapterHtml(epub, i)
    const text = htmlToPlainText(chapter.html)
    chapter.revoke()
    const matches = text.match(WORD_RE) ?? []
    for (const raw of matches) {
      const token = normalizeWordToken(raw)
      if (!token || token.length < 2) continue
      if (STOP_WORDS.has(token)) continue
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
    extractedChapters += 1
    if (extractedChapters % 2 === 0 || extractedChapters === chapterTotal) {
      report(onProgress, {
        phase: 'extract',
        current: extractedChapters,
        total: chapterTotal,
        message: `提取正文 ${extractedChapters}/${chapterTotal} 章`,
        percent: 5 + Math.round((extractedChapters / chapterTotal) * 25),
      })
      await yieldToUi()
    }
  }

  const surfaces = [...counts.keys()]
  const lemmaCounts = new Map<string, number>()
  let lemmaDone = 0

  for (const surface of surfaces) {
    const lemma = (await resolveLemma(surface, false)) || surface
    if (STOP_WORDS.has(lemma)) {
      lemmaDone += 1
      continue
    }
    lemmaCounts.set(lemma, (lemmaCounts.get(lemma) ?? 0) + (counts.get(surface) ?? 0))
    lemmaDone += 1
    if (lemmaDone % 80 === 0 || lemmaDone === surfaces.length) {
      report(onProgress, {
        phase: 'lemma',
        current: lemmaDone,
        total: surfaces.length,
        message: `词形还原 ${lemmaDone}/${surfaces.length}`,
        percent: 30 + Math.round((lemmaDone / Math.max(1, surfaces.length)) * 25),
      })
      await yieldToUi()
    }
  }

  const lemmas = [...lemmaCounts.keys()]
  const kept: Array<{
    lemma: string
    count: number
    translation: string
    examLevels: string[]
    formsText: string
    collins?: number
    bnc?: number
    frq?: number
  }> = []

  let lookupDone = 0
  for (const lemma of lemmas) {
    try {
      const entry = await lookupFromEcdict(lemma)
      if (entry?.definitions.length) {
        const translation = entry.definitions
          .map((d) => (d.pos ? `${d.pos} ${d.translation}` : d.translation))
          .join('\n')
        const formsText = entry.forms
          .map((f) => (f.value ? `${f.label}: ${f.value}` : f.label))
          .join(' / ')
        kept.push({
          lemma: entry.lemma || lemma,
          count: lemmaCounts.get(lemma) ?? 0,
          translation,
          examLevels: formatExamLevelsDisplay(entry.examLevels),
          formsText,
          collins: entry.frequency?.collinsStar,
          bnc: entry.frequency?.bnc,
          frq: entry.frequency?.frq,
        })
      }
    } catch {
      // 跳过查不到的
    }
    lookupDone += 1
    if (lookupDone % 40 === 0 || lookupDone === lemmas.length) {
      report(onProgress, {
        phase: 'lookup',
        current: lookupDone,
        total: lemmas.length,
        message: `本地查词 ${lookupDone}/${lemmas.length}（已保留 ${kept.length}）`,
        percent: 55 + Math.round((lookupDone / Math.max(1, lemmas.length)) * 35),
      })
      await yieldToUi()
    }
  }

  kept.sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma))

  report(onProgress, {
    phase: 'save',
    current: 0,
    total: kept.length,
    message: '正在写入笔记本…',
    percent: 92,
  })

  let notebook = await findFrequencyNotebookByBookId(book.id)
  if (notebook) {
    if (notebook.title !== title) {
      try {
        notebook = await renameNotebook(notebook.id, title)
      } catch {
        // 标题冲突时保留原名，仍覆盖词频内容
      }
    }
  } else {
    notebook = await createNotebook(title, {
      kind: 'frequency',
      sourceBookId: book.id,
      sourceBookTitle: book.title || book.fileName,
    })
  }

  const now = Date.now()
  const entries: NotebookEntry[] = kept.map((item, index) => ({
    id: `nbe-freq-${now}-${index}`,
    sentence: item.lemma,
    createdAt: now,
    analysis: {
      translation: item.translation,
      collocations: encodeFrequencyMeta({
        rank: index + 1,
        count: item.count,
        collins: item.collins,
        bnc: item.bnc,
        frq: item.frq,
      }),
      slangs: item.examLevels.join(' / '),
      sentencePattern: item.formsText,
    },
  }))

  await replaceNotebookEntries(notebook.id, entries)
  await touchNotebook(notebook.id)
  invalidateBookOccurrenceCache(book.id)

  report(onProgress, {
    phase: 'done',
    current: entries.length,
    total: entries.length,
    message: `完成：保留 ${entries.length} 个单词`,
    percent: 100,
  })

  return {
    notebook,
    wordCount: [...counts.values()].reduce((s, n) => s + n, 0),
    uniqueKept: entries.length,
  }
}
