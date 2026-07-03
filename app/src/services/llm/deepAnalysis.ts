import type { NotebookEntryAnalysis } from '../notes/notebooks'
import { zhipuChatCompletion } from './zhipuClient'
import { loadZhipuSettings } from './zhipuSettings'

const SYSTEM_PROMPT = `你是英语阅读学习助手。用户给出英文句子或段落，请仅输出一个 JSON 对象，不要 markdown 代码块，不要其他说明。

JSON 字段（均为字符串）：
- translation：自然流畅的中文翻译
- collocations：重要搭配/词组，每条一行，格式「英文 — 中文」；没有则写「无」
- slangs：俚语、习语、口语表达，每条一行；没有则写「无」
- sentencePattern：句式结构简要分析（1-3 句中文）`

interface ParsedAnalysis {
  translation?: unknown
  collocations?: unknown
  slangs?: unknown
  sentencePattern?: unknown
}

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join('\n')
  return fallback
}

function extractJsonObject(raw: string): ParsedAnalysis {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as ParsedAnalysis
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as ParsedAnalysis
    }
    throw new Error('无法解析 AI 返回的 JSON')
  }
}

function normalizeAnalysis(parsed: ParsedAnalysis): NotebookEntryAnalysis {
  return {
    translation: asText(parsed.translation, '暂无'),
    collocations: asText(parsed.collocations, '无'),
    slangs: asText(parsed.slangs, '无'),
    sentencePattern: asText(parsed.sentencePattern, '暂无'),
  }
}

export async function analyzeSentenceDeep(sentence: string): Promise<NotebookEntryAnalysis> {
  const text = sentence.trim()
  if (!text) throw new Error('请先选择要解析的文本')

  const settings = await loadZhipuSettings()
  const content = await zhipuChatCompletion(settings, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text },
  ])

  return normalizeAnalysis(extractJsonObject(content))
}
