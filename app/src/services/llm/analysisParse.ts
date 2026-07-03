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

const LIST_PLACEHOLDER = new Set(['无', '暂无', 'none', 'n/a'])

/**
 * 将搭配/俚语规范为多行展示。仅在较有把握时插入换行，避免误拆完整句子。
 */
export function normalizeAnalysisListField(
  text: string,
  kind: 'collocations' | 'slangs',
): string {
  let value = text.trim()
  if (!value || LIST_PLACEHOLDER.has(value.toLowerCase())) return value

  value = value.replace(/\\n/g, '\n')

  if (/\n/.test(value)) {
    return value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  }

  const hasDash = /[—\-－–]/.test(value)

  if (kind === 'collocations' || (kind === 'slangs' && hasDash)) {
    // 中文释义结束后、下一条英文搭配开始前（该行含 —）
    const afterChinese = value.replace(
      /([\u4e00-\u9fff/）)】【])(?:\s*)(?=[A-Za-z"'](?:(?!\n)[\s\S]){0,96}[—\-－–])/g,
      '$1\n',
    )
    if (afterChinese.includes('\n')) {
      return afterChinese
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
    }

    // 中文紧挨英文（如「烦我back off」）
    const tightChinese = value.replace(/([\u4e00-\u9fff/)])(?=[A-Za-z])/g, '$1\n')
    if (tightChinese.includes('\n')) {
      return tightChinese
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
    }
  }

  if (kind === 'slangs' && /[;；]/.test(value)) {
    return value
      .split(/[;；]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  }

  return value
}

export function normalizeSentenceKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function sentencesMatch(a: string, b: string): boolean {
  return normalizeSentenceKey(a) === normalizeSentenceKey(b)
}

function stripAnalysisNoise(text: string): string {
  return text
    .replace(/[\s\S]*?<\/think>/gi, '')
    .replace(/[\s\S]*?<\/redacted_reasoning>/gi, '')
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .trim()
}

function scoreParsedAnalysis(parsed: ParsedAnalysis): number {
  let score = 0
  if (asText(parsed.translation)) score += 4
  if (asText(parsed.collocations)) score += 2
  if (asText(parsed.slangs)) score += 1
  if (asText(parsed.sentencePattern)) score += 2
  return score
}

function extractBalancedJsonSlice(raw: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]

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
        return raw.slice(start, i + 1)
      }
    }
  }

  return null
}

function salvageFieldsFromText(raw: string): ParsedAnalysis | null {
  const pick = (key: string): string => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's'))
    if (!match?.[1]) return ''
    return match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim()
  }

  const translation = pick('translation')
  if (!translation) return null

  return {
    translation,
    collocations: normalizeAnalysisListField(pick('collocations') || '无', 'collocations'),
    slangs: normalizeAnalysisListField(pick('slangs') || '无', 'slangs'),
    sentencePattern: pick('sentencePattern') || '暂无',
  }
}

export function scoreAnalysisText(raw: string): number {
  try {
    const parsed = extractJsonObject(raw)
    return scoreParsedAnalysis(parsed)
  } catch {
    return 0
  }
}

export function extractJsonObject(raw: string): ParsedAnalysis {
  const trimmed = stripAnalysisNoise(raw)
  if (!trimmed) throw new Error('无法解析 AI 返回的内容：响应为空')

  try {
    const direct = JSON.parse(trimmed) as ParsedAnalysis
    if (scoreParsedAnalysis(direct) > 0) return direct
  } catch {
    // fall through
  }

  let best: ParsedAnalysis | null = null
  let bestScore = 0

  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] !== '{') continue
    const slice = extractBalancedJsonSlice(trimmed, i)
    if (!slice) continue
    try {
      const parsed = JSON.parse(slice) as ParsedAnalysis
      const score = scoreParsedAnalysis(parsed)
      if (score > bestScore) {
        bestScore = score
        best = parsed
      }
    } catch {
      // try next candidate
    }
  }

  if (best && bestScore > 0) return best

  const salvaged = salvageFieldsFromText(trimmed)
  if (salvaged) return salvaged

  throw new Error('无法解析 AI 返回的内容，请换模型或缩短选段后重试')
}

export function normalizeAnalysis(parsed: ParsedAnalysis): NotebookEntryAnalysis {
  const collocations = normalizeAnalysisListField(asText(parsed.collocations, '无'), 'collocations')
  const slangs = normalizeAnalysisListField(asText(parsed.slangs, '无'), 'slangs')

  return {
    translation: asText(parsed.translation, '暂无'),
    collocations,
    slangs,
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
