/** 将同一词性下的释义文本拆成独立义项，兼容多种分隔符 */
export function splitTranslationMeanings(translation: string): string[] {
  const text = translation.trim()
  if (!text) return []

  const semicolonParts = splitByDelimiter(text, /[;；]/)
  if (semicolonParts.length > 1) return semicolonParts

  const enumerationParts = splitByDelimiter(text, /[、]/)
  if (enumerationParts.length > 1) return enumerationParts

  const commaParts = splitByDelimiter(text, /[,，]/)
  if (commaParts.length > 1 && looksLikeMeaningList(commaParts)) {
    return commaParts
  }

  const numberedParts = splitNumberedMeanings(text)
  if (numberedParts.length > 1) return numberedParts

  return [text]
}

function splitByDelimiter(text: string, delimiter: RegExp): string[] {
  return text
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
}

function looksLikeMeaningList(parts: string[]): boolean {
  if (parts.length < 2) return false
  const maxLen = Math.max(...parts.map((part) => part.length))
  const avgLen = parts.reduce((sum, part) => sum + part.length, 0) / parts.length
  return maxLen <= 24 && avgLen <= 16
}

function splitNumberedMeanings(text: string): string[] {
  const matches = [...text.matchAll(/\d+[\.\．、]\s*/g)]
  if (matches.length < 2) return []

  const parts: string[] = []
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    const chunk = text.slice(start, end).replace(/^\d+[\.\．、]\s*/, '').trim()
    if (chunk) parts.push(chunk)
  }

  return parts
}
