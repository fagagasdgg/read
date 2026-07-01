import { normalizeWordToken } from './lemmatize'

/** 从变体按钮文案中提取可查询的英文词，如 "meaner或more mean" → "meaner" */
export function extractVariantLookupWord(raw: string): string {
  const cleaned = raw.trim()
  if (!cleaned) return ''

  const segments = cleaned.split(/或|\/|,|；|;/).map((s) => s.trim())
  for (const segment of segments) {
    const match = segment.match(/[a-zA-Z][a-zA-Z'-]*/)?.[0]
    if (match) return match.toLowerCase()
  }

  return normalizeWordToken(cleaned)
}
