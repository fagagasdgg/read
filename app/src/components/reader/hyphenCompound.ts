/** 连字符类字符（不含 em-dash） */
const HYPHEN_RE = /[\u00ad\u2010\u2011\u2012\u2013\u2043\ufe63\uff0d-]/g

export function normalizeHyphenChars(raw: string): string {
  return raw.replace(/\u00ad/g, '').replace(HYPHEN_RE, '-')
}

export function splitCompoundParts(compound: string): string[] {
  return normalizeHyphenChars(compound)
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean)
}

function isReaderWord(node: Node | null): node is HTMLElement {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).classList.contains('reader-word'),
  )
}

function isWordWrap(node: Node | null): node is HTMLElement {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).classList.contains('reader-word-wrap'),
  )
}

function asWordEl(node: Node): HTMLElement | null {
  if (isReaderWord(node)) return node
  if (isWordWrap(node)) {
    const inner = node.querySelector('.reader-word')
    return inner instanceof HTMLElement ? inner : null
  }
  return null
}

/** 节点是否仅空白 / br / 连字符，可作为词间桥接 */
function isBridgeNode(node: Node): boolean {
  if (node.nodeType === Node.COMMENT_NODE) return true
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeHyphenChars(node.textContent ?? '').trim()
    return text === '' || /^-+$/.test(text)
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return false

  const el = node as HTMLElement
  const className = el.className || ''
  if (typeof className === 'string' && (className.includes('reader-word-wrap') || /(^| )reader-word( |$)/.test(className))) {
    return false
  }
  const tag = el.tagName
  if (tag === 'BR' || tag === 'WBR') return true
  const text = normalizeHyphenChars(el.textContent ?? '').trim()
  return text === '' || /^-+$/.test(text)
}

function bridgeHasHyphen(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeHyphenChars(node.textContent ?? '').trim()
      if (/^-+$/.test(text)) return true
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = normalizeHyphenChars((node as HTMLElement).textContent ?? '').trim()
      if (/^-+$/.test(text)) return true
    }
  }
  return false
}

function collectBridge(from: Node, direction: 'prev' | 'next'): { word: HTMLElement; bridge: Node[] } | null {
  const bridge: Node[] = []
  let node: Node | null = direction === 'prev' ? from.previousSibling : from.nextSibling

  while (node) {
    const word = asWordEl(node)
    if (word) {
      if (!bridgeHasHyphen(bridge)) return null
      return { word, bridge }
    }
    if (!isBridgeNode(node)) return null
    bridge.push(node)
    node = direction === 'prev' ? node.previousSibling : node.nextSibling
  }
  return null
}

function wordText(el: HTMLElement): string {
  return (el.dataset.word || el.textContent || '').trim()
}

/**
 * 从点击的单词节点向左右扩展，合并连字符连接的片段（含跨行 / br）。
 */
export function resolveHyphenatedCompound(startEl: HTMLElement): {
  full: string
  parts: string[]
} {
  const start = asWordEl(startEl) ?? startEl
  const startText = wordText(start)

  // 同节点已是完整连字符词
  if (normalizeHyphenChars(startText).includes('-')) {
    const parts = splitCompoundParts(startText)
    return { full: parts.join('-'), parts }
  }

  if (!isReaderWord(start) && !asWordEl(start)) {
    const parts = splitCompoundParts(startText)
    return { full: parts.join('-') || startText, parts: parts.length ? parts : startText ? [startText] : [] }
  }

  const chain: HTMLElement[] = [start]

  let left = start
  for (;;) {
    const found = collectBridge(left, 'prev')
    if (!found) break
    chain.unshift(found.word)
    left = found.word
  }

  let right = start
  for (;;) {
    const found = collectBridge(right, 'next')
    if (!found) break
    chain.push(found.word)
    right = found.word
  }

  const parts = chain.map(wordText).filter(Boolean)
  if (parts.length <= 1) {
    return { full: startText, parts: startText ? [startText] : [] }
  }

  return { full: parts.join('-'), parts }
}
