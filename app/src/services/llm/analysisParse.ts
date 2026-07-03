import type { NotebookEntryAnalysis } from '../notes/notebooks'

/** 豆包半自动流程在 JSON 中要求的校验标记 */
export const READ_NOTE_EXPORT_MARKER = 'READ_NOTE_v1'

interface ParsedAnalysis {
  marker?: unknown
  sentence?: unknown
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

export function normalizeSentenceKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function sentencesMatch(a: string, b: string): boolean {
  return normalizeSentenceKey(a) === normalizeSentenceKey(b)
}

export function extractJsonObject(raw: string): ParsedAnalysis {
  const trimmed = raw.trim()

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as ParsedAnalysis
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(trimmed) as ParsedAnalysis
  } catch {
    // fall through
  }

  const start = trimmed.indexOf('{')
  if (start < 0) throw new Error('无法解析返回内容：未找到 JSON 对象')

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1)) as ParsedAnalysis
      }
    }
  }

  throw new Error('无法解析返回内容：JSON 不完整')
}

export function normalizeAnalysis(parsed: ParsedAnalysis): NotebookEntryAnalysis {
  return {
    translation: asText(parsed.translation, '暂无'),
    collocations: asText(parsed.collocations, '无'),
    slangs: asText(parsed.slangs, '无'),
    sentencePattern: asText(parsed.sentencePattern, '暂无'),
  }
}

export interface ParseAnalysisOptions {
  expectedSentence?: string
  requireMarker?: boolean
}

export function parseAnalysisResponse(
  raw: string,
  options: ParseAnalysisOptions = {},
): NotebookEntryAnalysis {
  const parsed = extractJsonObject(raw)

  if (options.requireMarker) {
    const marker = asText(parsed.marker)
    if (marker !== READ_NOTE_EXPORT_MARKER) {
      throw new Error('剪贴板内容不是本应用的豆包解析结果（缺少校验标记）')
    }
  }

  if (options.expectedSentence) {
    const returned = asText(parsed.sentence)
    if (!returned) {
      throw new Error('返回 JSON 缺少 sentence 字段，无法确认是否为当前选段')
    }
    if (!sentencesMatch(returned, options.expectedSentence)) {
      throw new Error('剪贴板内容与当前选段不匹配，请确认已复制豆包对本次选段的回复')
    }
  }

  return normalizeAnalysis(parsed)
}
