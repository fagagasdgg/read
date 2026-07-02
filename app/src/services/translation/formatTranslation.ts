/** 整理有道传统翻译返回：去多余空白、统一标点间距 */
export function formatTraditionalTranslation(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([，。；：！？、])\s+/g, '$1')
    .replace(/\s+([，。；：！？、])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
