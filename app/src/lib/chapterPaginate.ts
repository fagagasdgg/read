/** 按视口高度将章节 HTML 切成多「页」（按块级元素边界，避免行内截断） */
export function paginateChapterHtml(
  html: string,
  pageHeightPx: number,
  contentWidthPx: number,
  fontSizePx: number,
  lineHeight: number,
): string[] {
  if (!html.trim() || pageHeightPx <= 0 || contentWidthPx <= 0) {
    return [html]
  }

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    `width:${contentWidthPx}px`,
    'padding:12px 20px 8px',
    'box-sizing:border-box',
  ].join(';')

  const article = document.createElement('article')
  article.className = 'chapter-content'
  article.style.fontSize = `${fontSizePx}px`
  article.style.lineHeight = String(lineHeight)
  article.innerHTML = html
  host.appendChild(article)
  document.body.appendChild(host)

  const blocks = Array.from(article.children) as HTMLElement[]
  const pages: string[] = []
  let bucket: string[] = []
  let bucketHeight = 0

  const flush = () => {
    if (!bucket.length) return
    pages.push(bucket.join(''))
    bucket = []
    bucketHeight = 0
  }

  for (const block of blocks) {
    const blockHeight = block.offsetHeight

    if (blockHeight > pageHeightPx) {
      flush()
      pages.push(block.outerHTML)
      continue
    }

    if (bucketHeight + blockHeight > pageHeightPx && bucket.length > 0) {
      flush()
    }

    bucket.push(block.outerHTML)
    bucketHeight += blockHeight
  }

  flush()
  document.body.removeChild(host)

  return pages.length > 0 ? pages : [html]
}
