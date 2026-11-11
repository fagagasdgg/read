/** 折叠空白，便于旧笔记与正文粗匹配 */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

interface CharMapEntry {
  node: Text
  offset: number
}

interface NormalizedTextMap {
  normalized: string
  map: CharMapEntry[]
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent) return true
  if (parent.closest('.reader-inline-gloss, .reader-note-underline-layer, script, style')) {
    return true
  }
  return false
}

/** 将章节 DOM 展平为折叠空白后的字符串，并保留到 Text 节点的映射 */
export function buildNormalizedTextMap(root: HTMLElement): NormalizedTextMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let normalized = ''
  const map: CharMapEntry[] = []
  let prevWasSpace = true

  let current = walker.nextNode()
  while (current) {
    const textNode = current as Text
    current = walker.nextNode()
    if (shouldSkipTextNode(textNode)) continue

    const raw = textNode.data
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i]
      if (/\s/.test(ch)) {
        if (!prevWasSpace && normalized.length > 0) {
          normalized += ' '
          map.push({ node: textNode, offset: i })
          prevWasSpace = true
        }
        continue
      }
      normalized += ch
      map.push({ node: textNode, offset: i })
      prevWasSpace = false
    }
  }

  return {
    normalized: normalized.trimEnd(),
    map: map.slice(0, normalized.trimEnd().length),
  }
}

export interface NoteMatchRect {
  top: number
  left: number
  width: number
  height: number
}

function rangeToContentRects(range: Range, contentEl: HTMLElement): NoteMatchRect[] {
  const contentBox = contentEl.getBoundingClientRect()
  const clientRects = Array.from(range.getClientRects())
  const rects: NoteMatchRect[] = []

  for (const rect of clientRects) {
    if (rect.width < 1 || rect.height < 1) continue
    rects.push({
      top: rect.bottom - contentBox.top - 1,
      left: rect.left - contentBox.left,
      width: rect.width,
      height: 11,
    })
  }

  return rects
}

function createRangeFromMap(
  map: CharMapEntry[],
  start: number,
  endExclusive: number,
): Range | null {
  if (start < 0 || endExclusive <= start || endExclusive > map.length) return null
  const startEntry = map[start]
  const endEntry = map[endExclusive - 1]
  if (!startEntry || !endEntry) return null

  try {
    const range = document.createRange()
    range.setStart(startEntry.node, startEntry.offset)
    range.setEnd(endEntry.node, endEntry.offset + 1)
    return range
  } catch {
    return null
  }
}

/** 在章节中查找 sentence 的全部出现位置，返回相对 contentEl 的下划线矩形 */
export function findSentenceUnderlineRects(
  contentEl: HTMLElement,
  sentence: string,
  textMap?: NormalizedTextMap,
): NoteMatchRect[] {
  const needle = collapseWhitespace(sentence).toLowerCase()
  if (!needle) return []

  const built = textMap ?? buildNormalizedTextMap(contentEl)
  const haystack = built.normalized.toLowerCase()
  if (!haystack || !needle || needle.length > haystack.length) return []

  const rects: NoteMatchRect[] = []
  let from = 0
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from)
    if (index < 0) break
    const range = createRangeFromMap(built.map, index, index + needle.length)
    if (range) {
      rects.push(...rangeToContentRects(range, contentEl))
    }
    from = index + Math.max(1, needle.length)
  }

  return rects
}
