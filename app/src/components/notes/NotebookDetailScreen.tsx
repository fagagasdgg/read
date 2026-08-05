import { useCallback, useEffect, useState } from 'react'
import { formatExamLevelsDisplay } from '../../lib/examLevel'
import { normalizeAnalysisListField } from '../../services/llm/analysisParse'
import {
  getNotebookDocument,
  getNotebookEntryById,
  isBasePhrasesNotebook,
  isBaseSentenceNotebook,
  isNotFoundWordsNotebook,
  isSystemNotebook,
  listNotebookEntries,
  removeNotebookEntry,
  updateNotebookEntryAnalysis,
  type NotebookDocument,
  type NotebookEntryAnalysis,
} from '../../services/notes/notebooks'
import { parseFrequencyMeta } from '../../services/tools/bookWordFrequency'
import { WordPhraseSection } from '../reader/WordPhraseSection'
import { NotFoundWordEditor } from './NotFoundWordEditor'
import {
  loadNotebookPageSize,
  NOTEBOOK_PAGE_SIZE_OPTIONS,
  saveNotebookPageSize,
  type NotebookPageSize,
} from '../../services/notes/notebookUiSettings'

const EMPTY_ANALYSIS: NotebookEntryAnalysis = {
  translation: '',
  collocations: '',
  slangs: '',
  sentencePattern: '',
}

interface NotebookDetailScreenProps {
  notebookId: string
  title: string
  onBack: () => void
  /** 全书词频统计本：列表显示排名/单词/词频 */
  isFrequency?: boolean
}

export function NotebookDetailScreen({
  notebookId,
  title,
  onBack,
  isFrequency = false,
}: NotebookDetailScreenProps) {
  const [doc, setDoc] = useState<NotebookDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<NotebookPageSize>(20)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<NotebookEntryAnalysis>(EMPTY_ANALYSIS)
  const [savingEdit, setSavingEdit] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [freqSortDir, setFreqSortDir] = useState<'asc' | 'desc'>('desc')

  const showSearch =
    isBasePhrasesNotebook(notebookId) ||
    isNotFoundWordsNotebook(notebookId) ||
    isFrequency


  const loadDoc = useCallback(async () => {
    setLoading(true)
    try {
      if (isBasePhrasesNotebook(notebookId)) {
        const { syncBasePhrasesNotebook } = await import('../../services/notes/systemNotebooks')
        await syncBasePhrasesNotebook()
      } else if (isNotFoundWordsNotebook(notebookId)) {
        const { syncNotFoundWordsNotebook } = await import('../../services/notes/systemNotebooks')
        await syncNotFoundWordsNotebook()
      }
      const next = await getNotebookDocument(notebookId)
      setDoc(next)
      return next
    } finally {
      setLoading(false)
    }
  }, [notebookId])

  useEffect(() => {
    void loadNotebookPageSize().then(setPageSize)
  }, [])

  useEffect(() => {
    void loadDoc()
  }, [loadDoc])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        void loadDoc()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadDoc])

  useEffect(() => {
    setPage(1)
    setSelectedEntryId(null)
    setSearchDraft('')
    setSearchQuery('')
    setFreqSortDir('desc')
  }, [notebookId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchDraft.trim())
      setPage(1)
    }, 200)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const listOptions = {
    query: showSearch ? searchQuery : undefined,
    sortBy: isFrequency ? ('frequency' as const) : ('createdAt' as const),
    sortDir: isFrequency ? freqSortDir : ('desc' as const),
    matchWordOnly: isFrequency,
  }
  const pageData = listNotebookEntries(doc, page, pageSize, listOptions)
  const selectedEntry = selectedEntryId ? getNotebookEntryById(doc, selectedEntryId) : null
  const totalEntries = doc?.entries.length ?? 0
  const canEditAnalysis =
    !isFrequency &&
    !isBasePhrasesNotebook(notebookId) &&
    !isNotFoundWordsNotebook(notebookId)

  const selectedIndexOnPage = selectedEntry
    ? pageData.items.findIndex((item) => item.id === selectedEntry.id)
    : -1
  const selectedOrderIndex =
    selectedIndexOnPage >= 0 ? (pageData.page - 1) * pageSize + selectedIndexOnPage : -1
  const prevOnPage = selectedIndexOnPage > 0 ? pageData.items[selectedIndexOnPage - 1] : null
  const nextOnPage =
    selectedIndexOnPage >= 0 && selectedIndexOnPage < pageData.items.length - 1
      ? pageData.items[selectedIndexOnPage + 1]
      : null

  function openEntry(entryId: string, nextPage?: number) {
    setEditing(false)
    setEditDraft(EMPTY_ANALYSIS)
    if (typeof nextPage === 'number') {
      setPage(nextPage)
    } else {
      const indexOnCurrentPage = pageData.items.findIndex((item) => item.id === entryId)
      if (indexOnCurrentPage < 0) {
        for (let p = 1; p <= pageData.totalPages; p += 1) {
          const probe = listNotebookEntries(doc, p, pageSize, listOptions)
          if (probe.items.some((item) => item.id === entryId)) {
            setPage(p)
            break
          }
        }
      }
    }
    setSelectedEntryId(entryId)
  }

  function goAdjacentEntry(direction: -1 | 1) {
    if (!selectedEntry) return
    if (direction < 0) {
      if (prevOnPage) {
        openEntry(prevOnPage.id)
        return
      }
      if (pageData.page <= 1) return
      const prevPage = pageData.page - 1
      const prevPageData = listNotebookEntries(doc, prevPage, pageSize, listOptions)
      const last = prevPageData.items[prevPageData.items.length - 1]
      if (last) openEntry(last.id, prevPage)
      return
    }

    if (nextOnPage) {
      openEntry(nextOnPage.id)
      return
    }
    if (pageData.page >= pageData.totalPages) return
    const nextPage = pageData.page + 1
    const nextPageData = listNotebookEntries(doc, nextPage, pageSize, listOptions)
    const first = nextPageData.items[0]
    if (first) openEntry(first.id, nextPage)
  }

  function startEdit() {
    if (!selectedEntry) return
    setEditDraft({ ...selectedEntry.analysis })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditDraft(EMPTY_ANALYSIS)
  }

  async function handleSaveEdit() {
    if (!selectedEntry) return
    setSavingEdit(true)
    try {
      await updateNotebookEntryAnalysis(notebookId, selectedEntry.id, editDraft)
      const nextDoc = await getNotebookDocument(notebookId)
      setDoc(nextDoc)
      setEditing(false)
      setEditDraft(EMPTY_ANALYSIS)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handlePageSizeChange(nextSize: NotebookPageSize) {
    setPageSize(nextSize)
    await saveNotebookPageSize(nextSize)
    setPage((current) => {
      const total = pageData.total
      const totalPages = Math.max(1, Math.ceil(total / nextSize))
      return Math.min(current, totalPages)
    })
  }

  async function handleDeleteEntry(entryId: string) {
    if (!window.confirm('确定删除这条笔记？')) return

    setDeletingId(entryId)
    try {
      const { totalAfter } = await removeNotebookEntry(notebookId, entryId)
      const nextDoc = await getNotebookDocument(notebookId)
      setDoc(nextDoc)

      if (selectedEntryId === entryId) {
        setSelectedEntryId(null)
      }

      const totalPages = Math.max(1, Math.ceil(totalAfter / pageSize))
      setPage((current) => Math.min(current, totalPages))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const searchPlaceholder = isBasePhrasesNotebook(notebookId)
    ? '搜索单词或词组…'
    : isFrequency
      ? '搜索单词词频…'
      : '搜索待补全单词…'

  return (
    <div className="notebook-detail-screen">
      <header className="notebook-detail-header">
        <button
          type="button"
          className="notebook-detail-back"
          onClick={() => {
            if (selectedEntry) {
              if (editing) cancelEdit()
              setSelectedEntryId(null)
              return
            }
            onBack()
          }}
        >
          ← 返回
        </button>
        <h1>{doc?.title ?? title}</h1>
      </header>

      <div className="notebook-detail-body">
        {loading && <p className="notebook-detail-placeholder">加载中…</p>}
        {!loading && !selectedEntry && (
          <>
            {totalEntries === 0 && (
              <p className="notebook-detail-placeholder">
                {isFrequency
                  ? '词频统计结果为空。可在工具页重新统计一本书。'
                  : isBaseSentenceNotebook(notebookId)
                    ? '所有保存到各笔记本的句子都会自动汇总到这里，并标注来源书籍与笔记本。'
                    : isBasePhrasesNotebook(notebookId)
                      ? '所有已收录词组会按基础单词聚合展示在这里，点击单词可查看词组与释义。'
                      : isNotFoundWordsNotebook(notebookId)
                        ? '阅读时查不到的单词会出现在这里，点击可手动补全词条。'
                        : '这里会展示句子笔记列表。阅读时保存的句子解析会按条目收纳。'}
              </p>
            )}

            {showSearch && totalEntries > 0 && (
              <div className="notebook-search-bar">
                <input
                  type="search"
                  className="notebook-search-input"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={searchPlaceholder}
                  enterKeyHint="search"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {searchDraft ? (
                  <button
                    type="button"
                    className="notebook-search-clear"
                    aria-label="清空搜索"
                    onClick={() => {
                      setSearchDraft('')
                      setSearchQuery('')
                      setPage(1)
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            )}

            <div className="notebook-detail-toolbar">
              <p className="notebook-detail-meta">
                {searchQuery
                  ? `匹配 ${pageData.total} / 共 ${totalEntries} 条`
                  : `条目数：${pageData.total}`}
              </p>
              <div className="notebook-toolbar-controls">
                {isFrequency && (
                  <label className="notebook-page-size">
                    <span>排序</span>
                    <select
                      value={freqSortDir}
                      onChange={(e) => {
                        const next = e.target.value === 'asc' ? 'asc' : 'desc'
                        setFreqSortDir(next)
                        setPage(1)
                      }}
                    >
                      <option value="desc">词频 DESC</option>
                      <option value="asc">词频 ASC</option>
                    </select>
                  </label>
                )}
                <label className="notebook-page-size">
                  <span>每页</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (NOTEBOOK_PAGE_SIZE_OPTIONS.includes(next as NotebookPageSize)) {
                        void handlePageSizeChange(next as NotebookPageSize)
                      }
                    }}
                  >
                    {NOTEBOOK_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} 条
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {pageData.items.length > 0 ? (
              <>
                <ul className="notebook-entry-list">
                  {pageData.items.map((entry, idx) => {
                    const freqMeta = isFrequency ? parseFrequencyMeta(entry.analysis.collocations) : null
                    const rank = freqMeta?.rank ?? (pageData.page - 1) * pageSize + idx + 1
                    return (
                      <li key={entry.id} className="notebook-entry-row">
                        <button
                          type="button"
                          className="notebook-entry-item"
                          onClick={() => openEntry(entry.id)}
                        >
                          <span className="notebook-entry-index">#{rank}</span>
                          <span className="notebook-entry-sentence">{entry.sentence}</span>
                          {isFrequency && freqMeta && (
                            <span className="notebook-entry-freq-count">{freqMeta.count} 次</span>
                          )}
                          {isBasePhrasesNotebook(notebookId) && entry.analysis.translation && (
                            <span className="notebook-entry-source">{entry.analysis.translation}</span>
                          )}
                          {entry.source && (
                            <span className="notebook-entry-source">
                              来自《{entry.source.bookTitle}》· {entry.source.notebookTitle}
                            </span>
                          )}
                          <span className="notebook-entry-arrow">›</span>
                        </button>
                        <button
                          type="button"
                          className="notebook-entry-delete"
                          aria-label="删除这条笔记"
                          disabled={
                            deletingId === entry.id ||
                            isBasePhrasesNotebook(notebookId) ||
                            isBaseSentenceNotebook(notebookId)
                          }
                          onClick={() => void handleDeleteEntry(entry.id)}
                        >
                          {deletingId === entry.id ? '…' : '×'}
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <div className="notebook-pager">
                  <button
                    type="button"
                    className="notebook-pager-btn"
                    disabled={pageData.page <= 1}
                    onClick={() => setPage(1)}
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    className="notebook-pager-btn"
                    disabled={pageData.page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    上一页
                  </button>
                  <span className="notebook-pager-meta">
                    第 {pageData.page} / {pageData.totalPages} 页
                  </span>
                  <button
                    type="button"
                    className="notebook-pager-btn"
                    disabled={pageData.page >= pageData.totalPages}
                    onClick={() => setPage((value) => Math.min(pageData.totalPages, value + 1))}
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    className="notebook-pager-btn"
                    disabled={pageData.page >= pageData.totalPages}
                    onClick={() => setPage(pageData.totalPages)}
                  >
                    尾页
                  </button>
                </div>
              </>
            ) : (
              <p className="notebook-detail-placeholder">
                {searchQuery
                  ? '没有匹配的条目，试试其他关键词。'
                  : pageData.total > 0 && page > 1
                    ? '本页暂无条目，请返回上一页。'
                    : '暂无句子条目。后续保存时会以「原句 + 四类解析」结构写入列表。'}
              </p>
            )}
          </>
        )}

        {!loading && selectedEntry && isNotFoundWordsNotebook(notebookId) && (
          <NotFoundWordEditor
            lemma={selectedEntry.sentence}
            onCancel={() => setSelectedEntryId(null)}
            onSaved={() => {
              setSelectedEntryId(null)
              void loadDoc()
            }}
          />
        )}

        {!loading && selectedEntry && !isNotFoundWordsNotebook(notebookId) && (
          <div className="notebook-entry-detail">
            {selectedEntry.source && (
              <p className="notebook-entry-source-detail">
                来源：书籍《{selectedEntry.source.bookTitle}》→ 笔记本「
                {selectedEntry.source.notebookTitle}」
              </p>
            )}
            <h2 className="notebook-entry-detail-title">{selectedEntry.sentence}</h2>

            {isFrequency ? (
              <>
                {(() => {
                  const meta = parseFrequencyMeta(selectedEntry.analysis.collocations)
                  return (
                    <section className="notebook-entry-block">
                      <h3>词频</h3>
                      <p>
                        {meta
                          ? `排名 #${meta.rank} · 出现 ${meta.count} 次`
                          : '暂无词频数据'}
                        {meta?.collins != null ? ` · 柯林斯 ${meta.collins} 星` : ''}
                        {meta?.frq != null ? ` · COCA ${meta.frq}` : ''}
                        {meta?.bnc != null ? ` · BNC ${meta.bnc}` : ''}
                      </p>
                    </section>
                  )
                })()}
                {selectedEntry.analysis.slangs && (
                  <section className="notebook-entry-block">
                    <h3>考试等级</h3>
                    <div className="popup-level-chips">
                      {formatExamLevelsDisplay(
                        selectedEntry.analysis.slangs.split(/[/、,，\s]+/).filter(Boolean),
                      ).map((label) => (
                        <span key={label} className="popup-level-chip">
                          {label}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
                <section className="notebook-entry-block">
                  <h3>中文释义</h3>
                  <p className="notebook-freq-defs">{selectedEntry.analysis.translation || '暂无内容'}</p>
                </section>
                {selectedEntry.analysis.sentencePattern && (
                  <section className="notebook-entry-block">
                    <h3>变体</h3>
                    <p>{selectedEntry.analysis.sentencePattern}</p>
                  </section>
                )}
                <section className="notebook-entry-block">
                  <h3>词组</h3>
                  <WordPhraseSection lemma={selectedEntry.sentence} />
                </section>
              </>
            ) : isBasePhrasesNotebook(notebookId) ? (
              <section className="notebook-entry-block">
                <h3>词组</h3>
                <p>
                  {normalizeAnalysisListField(
                    selectedEntry.analysis.collocations || '暂无词组',
                    'collocations',
                  ) || '暂无词组'}
                </p>
              </section>
            ) : (
              <>
                {editing ? (
                  <>
                    <label className="notebook-entry-block notebook-entry-edit-field">
                      <h3>原句翻译</h3>
                      <textarea
                        value={editDraft.translation}
                        onChange={(e) =>
                          setEditDraft((prev) => ({ ...prev, translation: e.target.value }))
                        }
                        rows={4}
                        placeholder="填写或补充原句翻译"
                      />
                    </label>
                    <label className="notebook-entry-block notebook-entry-edit-field">
                      <h3>固定搭配</h3>
                      <textarea
                        value={editDraft.collocations}
                        onChange={(e) =>
                          setEditDraft((prev) => ({ ...prev, collocations: e.target.value }))
                        }
                        rows={3}
                        placeholder="填写或补充固定搭配"
                      />
                    </label>
                    <label className="notebook-entry-block notebook-entry-edit-field">
                      <h3>俚语讲解</h3>
                      <textarea
                        value={editDraft.slangs}
                        onChange={(e) =>
                          setEditDraft((prev) => ({ ...prev, slangs: e.target.value }))
                        }
                        rows={3}
                        placeholder="填写或补充俚语讲解"
                      />
                    </label>
                    <label className="notebook-entry-block notebook-entry-edit-field">
                      <h3>句型分析</h3>
                      <textarea
                        value={editDraft.sentencePattern}
                        onChange={(e) =>
                          setEditDraft((prev) => ({ ...prev, sentencePattern: e.target.value }))
                        }
                        rows={5}
                        placeholder="填写或补充句型分析"
                      />
                    </label>
                    <div className="notebook-entry-actions">
                      <button
                        type="button"
                        className="notebook-entry-save-btn"
                        disabled={savingEdit}
                        onClick={() => void handleSaveEdit()}
                      >
                        {savingEdit ? '保存中…' : '保存修改'}
                      </button>
                      <button
                        type="button"
                        className="notebook-entry-cancel-btn"
                        disabled={savingEdit}
                        onClick={cancelEdit}
                      >
                        取消
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <section className="notebook-entry-block">
                      <h3>原句翻译</h3>
                      <p>{selectedEntry.analysis.translation || '暂无内容'}</p>
                    </section>
                    <section className="notebook-entry-block">
                      <h3>固定搭配</h3>
                      <p>
                        {normalizeAnalysisListField(
                          selectedEntry.analysis.collocations || '暂无内容',
                          'collocations',
                        ) || '暂无内容'}
                      </p>
                    </section>
                    <section className="notebook-entry-block">
                      <h3>俚语讲解</h3>
                      <p>
                        {normalizeAnalysisListField(
                          selectedEntry.analysis.slangs || '暂无内容',
                          'slangs',
                        ) || '暂无内容'}
                      </p>
                    </section>
                    <section className="notebook-entry-block">
                      <h3>句型分析</h3>
                      <p>{selectedEntry.analysis.sentencePattern || '暂无内容'}</p>
                    </section>
                  </>
                )}
              </>
            )}

            {!editing && canEditAnalysis && (
              <div className="notebook-entry-actions">
                <button
                  type="button"
                  className="notebook-entry-edit-btn"
                  onClick={startEdit}
                >
                  编辑这条笔记
                </button>
                {!isSystemNotebook(notebookId) && (
                  <button
                    type="button"
                    className="notebook-entry-delete-btn"
                    disabled={deletingId === selectedEntry.id}
                    onClick={() => void handleDeleteEntry(selectedEntry.id)}
                  >
                    {deletingId === selectedEntry.id ? '删除中…' : '删除这条笔记'}
                  </button>
                )}
              </div>
            )}

            {!editing && !canEditAnalysis && !isSystemNotebook(notebookId) && (
              <button
                type="button"
                className="notebook-entry-delete-btn"
                disabled={deletingId === selectedEntry.id}
                onClick={() => void handleDeleteEntry(selectedEntry.id)}
              >
                {deletingId === selectedEntry.id ? '删除中…' : '删除这条笔记'}
              </button>
            )}

            {!editing && pageData.total > 1 && (
              <div className="notebook-entry-nav">
                <button
                  type="button"
                  className="notebook-entry-nav-btn"
                  disabled={selectedOrderIndex <= 0}
                  onClick={() => goAdjacentEntry(-1)}
                >
                  上一页
                </button>
                <span className="notebook-entry-nav-meta">
                  {selectedOrderIndex >= 0 ? selectedOrderIndex + 1 : '-'} / {pageData.total}
                </span>
                <button
                  type="button"
                  className="notebook-entry-nav-btn"
                  disabled={selectedOrderIndex < 0 || selectedOrderIndex >= pageData.total - 1}
                  onClick={() => goAdjacentEntry(1)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
