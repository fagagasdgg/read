/** 单本 EPUB 大小上限（超过易卡死；PDF 等不应读入内存） */
export const MAX_EPUB_BYTES = 50 * 1024 * 1024

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export class ImportCancelledError extends ImportError {
  constructor() {
    super('用户取消选择')
    this.name = 'ImportCancelledError'
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function assertEpubFileName(fileName: string): void {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.epub')) return

  if (lower.endsWith('.mobi') || lower.endsWith('.azw') || lower.endsWith('.azw3')) {
    throw new ImportError('不支持 MOBI / Kindle 格式，请将书籍转换为 EPUB 后再导入')
  }
  if (lower.endsWith('.pdf')) {
    throw new ImportError('不支持 PDF 格式，请使用 EPUB 电子书')
  }
  if (lower.endsWith('.txt')) {
    throw new ImportError('不支持 TXT 文本，请使用 EPUB 格式')
  }

  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : ''
  throw new ImportError(
    ext
      ? `不支持「${ext}」格式，本应用仅支持 EPUB（.epub）`
      : '请选择 EPUB 格式的电子书（.epub）',
  )
}

export function assertEpubSize(byteLength: number, fileName: string): void {
  if (byteLength <= MAX_EPUB_BYTES) return
  throw new ImportError(
    `「${fileName}」过大（约 ${formatBytes(byteLength)}），单本书籍上限 ${formatBytes(MAX_EPUB_BYTES)}。请压缩或拆分后再导入`,
  )
}

export function assertZipMagic(buffer: ArrayBuffer): void {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
  if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return
  throw new ImportError(
    '该文件不是有效的 EPUB。EPUB 本质是 ZIP 压缩包，请确认文件未损坏且格式正确',
  )
}

export function toImportUserMessage(err: unknown, fileName?: string): string {
  if (err instanceof ImportCancelledError) return ''
  if (err instanceof ImportError) return err.message

  const raw = err instanceof Error ? err.message : String(err)
  const label = fileName ? `「${fileName}」` : '该文件'

  if (/central directory|is this a zip/i.test(raw)) {
    return `${label}不是有效的 EPUB。本应用仅支持 EPUB，不支持 MOBI、PDF 等格式`
  }
  if (/invalid epub|EPUB 无效/i.test(raw)) {
    return `${label}解析失败：EPUB 结构不完整或已损坏`
  }
  if (/out of memory|allocation|too large/i.test(raw)) {
    return `${label}过大，导入时内存不足，请换用较小的 EPUB`
  }

  return `${label}导入失败：${raw}`
}

export function isImportCancelled(err: unknown): boolean {
  if (err instanceof ImportCancelledError) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(msg)
}
