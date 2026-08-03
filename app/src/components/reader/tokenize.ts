export interface TextSegment {
  type: 'word' | 'text'
  value: string
}

/** 弯引号、直引号统一为 ASCII 撇号；软连字符去掉；各类连字符归一为 - */
function normalizeForTokenize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u2032\u00b4']/g, "'")
    .replace(/\u00ad/g, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2043\ufe63\uff0d]/g, '-')
}

/**
 * 单词：字母 + 可选撇号片段，可重复「-字母」构成连字符复合词。
 * 例：don't、mother-in-law、state-of-the-art
 */
const WORD_PATTERN = /[a-zA-Z]+(?:'[a-zA-Z]+)?(?:-[a-zA-Z]+(?:'[a-zA-Z]+)?)*/g

/** 撇号被错误拆开后的孤立碎片，如 owl's → owl + s */
const ORPHAN_CONTRACTION_PARTS = new Set(['s', 't', 'd', 'm', 're', 've', 'll', 'nt'])

function isOrphanContractionPart(word: string): boolean {
  return ORPHAN_CONTRACTION_PARTS.has(word.toLowerCase())
}

export function splitTextSegments(text: string): TextSegment[] {
  const normalized = normalizeForTokenize(text)
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = WORD_PATTERN.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    const token = match[0]
    if (!isOrphanContractionPart(token)) {
      segments.push({ type: 'word', value: token })
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
