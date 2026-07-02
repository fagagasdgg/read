export interface TextSegment {
  type: 'word' | 'text'
  value: string
}

/** 弯引号、直引号统一为 ASCII 撇号 */
function normalizeApostrophes(text: string): string {
  return text.replace(/[\u2018\u2019\u2032\u00b4']/g, "'")
}

const WORD_PATTERN = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g

/** 撇号被错误拆开后的孤立碎片，如 owl's → owl + s */
const ORPHAN_CONTRACTION_PARTS = new Set(['s', 't', 'd', 'm', 're', 've', 'll', 'nt'])

function isOrphanContractionPart(word: string): boolean {
  return ORPHAN_CONTRACTION_PARTS.has(word.toLowerCase())
}

export function splitTextSegments(text: string): TextSegment[] {
  const normalized = normalizeApostrophes(text)
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = WORD_PATTERN.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    const token = match[0]
    if (!isOrphanContractionPart(token)) {
      const start = match.index
      const end = start + token.length
      segments.push({ type: 'word', value: text.slice(start, end) || token })
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
