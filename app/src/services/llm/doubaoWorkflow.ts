import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import type { NotebookEntryAnalysis } from '../notes/notebooks'
import {
  normalizeSentenceKey,
  parseAnalysisResponse,
  READ_NOTE_EXPORT_MARKER,
} from './analysisParse'

export function buildDoubaoPrompt(sentence: string): string {
  const text = sentence.trim()
  if (!text) throw new Error('请先选择要解析的文本')

  return `你是英语阅读学习助手。用户将发送本条消息，你必须严格遵守下列规则。

【任务】
分析下方英文原文，并仅输出一个 JSON 对象，供阅读器 App 自动导入笔记。

【硬性规则 — 违反任一即失败】
1. 输出有且仅有一个 JSON 对象；第一个字符必须是 {，最后一个字符必须是 }。
2. 禁止 markdown 代码块（禁止出现 \`\`\`）。
3. 禁止在 JSON 前后添加任何说明、标题、道歉、思考过程或总结。
4. JSON 必须可被 JSON.parse 直接解析；字符串内的换行请写成 \\n。

【原文 — 逐字符复制到 sentence 字段】
<<<SENTENCE_START>>>
${text}
<<<SENTENCE_END>>>

【JSON 字段 — 全部为字符串类型】
- marker：固定填写「${READ_NOTE_EXPORT_MARKER}」（不得修改，用于导入校验）
- sentence：必须与上方「原文」完全一致（含标点、空格、换行）
- translation：自然流畅的中文翻译
- collocations：重要搭配/词组；每条一行，格式「英文 — 中文」；若无则填「无」
- slangs：俚语、习语、口语表达；每条一行；若无则填「无」
- sentencePattern：句式结构简要分析（1-3 句中文）

请现在只输出 JSON，不要输出其他任何文字。`
}

export async function copyDoubaoPrompt(sentence: string): Promise<string> {
  const prompt = buildDoubaoPrompt(sentence)
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: prompt })
  } else {
    await navigator.clipboard.writeText(prompt)
  }
  return prompt
}

export async function readClipboardText(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Clipboard.read()
    if (!value?.trim()) throw new Error('剪贴板为空')
    return value
  }
  if (!navigator.clipboard?.readText) {
    throw new Error('当前环境无法读取剪贴板')
  }
  const value = await navigator.clipboard.readText()
  if (!value.trim()) throw new Error('剪贴板为空')
  return value
}

export function isClipboardReadDeniedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')
}

export function parseDoubaoClipboard(
  clipboardText: string,
  expectedSentence: string,
): NotebookEntryAnalysis {
  const trimmed = clipboardText.trim()
  if (!trimmed) throw new Error('内容为空')

  if (trimmed.includes('<<<SENTENCE_START>>>') || trimmed.includes('【硬性规则')) {
    throw new Error('仍是发送给豆包的指令，请粘贴豆包的回复')
  }

  return parseAnalysisResponse(trimmed, {
    expectedSentence,
    requireMarker: true,
  })
}

export function getExpectedSentenceKey(sentence: string): string {
  return normalizeSentenceKey(sentence)
}
