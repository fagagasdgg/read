import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import {
  batchFetchWordFrequencies,
  getDictionaryCacheStats,
  listCachedWords,
} from '../../services/dictionary'
import { isFrequencyComplete } from '../../services/dictionary/wordFrequency'
import type { FrequencyBatchProgress } from '../../services/dictionary/batchFrequency'

function FrequencyHelpSheet({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="tools-help-mask" onClick={onClose} role="presentation">
      <div
        className="tools-help-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="freq-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tools-help-header">
          <h3 id="freq-help-title">词频说明</h3>
          <button type="button" className="tools-help-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="tools-help-body">
          <section className="tools-help-block">
            <h4>柯林斯星级（1–5 星）</h4>
            <p>
              来自《柯林斯 COBUILD 英汉双解词典》的重要性星级。星越多，表示该词在通用英语里越常用、越值得优先掌握。5
              星通常是最高频核心词，1 星相对少见。
            </p>
          </section>

          <section className="tools-help-block">
            <h4>真题频次（数字）</h4>
            <p>
              来自有道词典汇总的国内考试真题语料。数字表示该词在真题中累计出现的次数（各题型出现次数之和）。数字越大，说明在中考、高考、四六级等真题里越常考；为 0
              表示有道库中暂未统计到出现，并不代表该词绝对不重要。
            </p>
          </section>

          <section className="tools-help-block">
            <h4>关于 COCA / BNC</h4>
            <p>
              COCA（当代美国英语语料库）与 BNC（英国国家语料库）是海外学术词频体系。当前国内可稳定访问的有道公开接口不提供
              COCA/BNC 数值，因此本工具暂无法批量获取。若后续有国内可用的稳定数据源，会再补充。
            </p>
          </section>

          <section className="tools-help-block">
            <h4>如何理解、怎么用</h4>
            <ul>
              <li>柯林斯星级偏「通用英语常用度」</li>
              <li>真题频次偏「国内考试出现次数」</li>
              <li>两者互补：星高但真题少，可能偏日常；真题多但星不高，可能偏考点</li>
              <li>已有词频的单词会跳过；新词点词查词时也会尝试后台补全</li>
            </ul>
          </section>
        </div>

        <div className="tools-help-footer">
          <button type="button" className="tools-tool-btn tools-tool-btn-primary" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function WordFrequencyTool() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<FrequencyBatchProgress | null>(null)
  const [resultText, setResultText] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function handleStart() {
    if (running) return

    const words = await listCachedWords()
    const pending = words.filter((item) => !isFrequencyComplete(item.frequency))
    if (!pending.length) {
      setResultText('所有已收录单词均已有词频信息')
      return
    }

    setRunning(true)
    setResultText('')
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await batchFetchWordFrequencies({
        signal: controller.signal,
        onProgress: setProgress,
      })
      const stats = await getDictionaryCacheStats()
      setResultText(
        `完成：更新 ${result.updated} 条，跳过 ${result.skipped} 条，失败 ${result.failed} 条；当前缓存 ${stats.wordCount} 词`,
      )
    } catch (err) {
      setResultText(err instanceof Error ? err.message : '获取失败')
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
    setRunning(false)
    setResultText('已停止')
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0

  return (
    <CollapsibleSettingsSection
      title="批量获取词频"
      summary="为已收录单词补充柯林斯星级与真题频次"
    >
      <div className="tools-tool-desc-row">
        <p className="tools-tool-desc">
          从有道词典获取两种词频指标：柯林斯星级与真题频次。已有词频会跳过；新词点词时会尝试后台补全。
        </p>
        <button
          type="button"
          className="tools-help-q"
          aria-label="词频说明"
          title="词频说明"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
      </div>

      {running && progress ? (
        <div className="tools-freq-progress">
          <div className="tools-freq-progress-bar">
            <div className="tools-freq-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="tools-freq-progress-text">
            {progress.done}/{progress.total}
            {progress.currentLemma ? ` · 正在处理 ${progress.currentLemma}` : ''}
          </p>
        </div>
      ) : null}

      <div className="tools-tool-actions">
        <button
          type="button"
          className="tools-tool-btn tools-tool-btn-primary"
          disabled={running}
          onClick={() => void handleStart()}
        >
          {running ? '获取中…' : '一键获取词频'}
        </button>
        {running ? (
          <button type="button" className="tools-tool-btn" onClick={handleStop}>
            停止
          </button>
        ) : null}
      </div>

      {resultText ? <p className="tools-tool-result">{resultText}</p> : null}
      {helpOpen ? <FrequencyHelpSheet onClose={() => setHelpOpen(false)} /> : null}
    </CollapsibleSettingsSection>
  )
}
