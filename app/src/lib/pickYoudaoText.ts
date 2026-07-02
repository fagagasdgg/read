/** 从有道 API 嵌套的 l/i 结构中提取文本 */
export function pickYoudaoText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'number') return String(node)

  if (Array.isArray(node)) {
    return node.map(pickYoudaoText).filter(Boolean).join(' ').trim()
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if ('i' in obj) return pickYoudaoText(obj.i)
    if ('l' in obj) return pickYoudaoText(obj.l)
    if ('#text' in obj && typeof obj['#text'] === 'string') return obj['#text'].trim()
  }

  return ''
}
