import { useRef, useState } from 'react'
import { CollapsibleSettingsSection } from '../settings/CollapsibleSettingsSection'
import {
  batchFetchWordFrequencies,
  getDictionaryCacheStats,
  listCachedWords,
} from '../../services/dictionary'
import {
  isFrequencyComplete,
} from '../../services/dictionary/wordFrequency'
import type { FrequencyBatchProgress } from '../../services/dictionary/batchFrequency'

export function WordFrequencyTool() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<FrequencyBatchProgress | null>(null)
  const [resultText, setResultText] = useState('')
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
      <p className="tools-tool-desc">
        从有道词典获取两种词频指标：柯林斯星级（1–5 星）与真题出现次数。已有词频的单词会自动跳过；新收录的单词在阅读点词时会后台尝试补全。
      </p>

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
    </CollapsibleSettingsSection>
  )
}
