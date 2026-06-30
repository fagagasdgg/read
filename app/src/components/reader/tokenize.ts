export interface TextSegment {
  type: 'word' | 'text'
  value: string
}

const WORD_PATTERN = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g

export function splitTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = WORD_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'word', value: match[0] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
