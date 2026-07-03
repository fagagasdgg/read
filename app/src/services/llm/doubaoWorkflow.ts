import { Capacitor } from '@capacitor/core'
import type { NotebookEntryAnalysis } from '../notes/notebooks'
import {
  normalizeSentenceKey,
  parseAnalysisResponse,
  READ_NOTE_EXPORT_MARKER,
} from './analysisParse'

/** 豆包 Android 包名（国内版） */
const DOUBAO_ANDROID_PACKAGES = ['com.larus.nova', 'com.larus.boom']

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
  await navigator.clipboard.writeText(prompt)
  return prompt
}

export function tryOpenDoubaoApp(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false
  }

  for (const pkg of DOUBAO_ANDROID_PACKAGES) {
    try {
      window.location.href =
        `intent:#Intent;action=android.intent.action.MAIN;` +
        `category=android.intent.category.LAUNCHER;package=${pkg};end`
      return true
    } catch {
      // try next package
    }
  }
  return false
}

export async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard?.readText) {
    throw new Error('当前环境无法读取剪贴板，请使用「导入剪贴板」并授予权限')
  }
  return navigator.clipboard.readText()
}

export function parseDoubaoClipboard(
  clipboardText: string,
  expectedSentence: string,
): NotebookEntryAnalysis {
  const trimmed = clipboardText.trim()
  if (!trimmed) throw new Error('剪贴板为空')

  // 若用户误复制了完整 prompt，拒绝导入
  if (trimmed.includes('<<<SENTENCE_START>>>') || trimmed.includes('【硬性规则')) {
    throw new Error('剪贴板仍是发送给豆包的指令，请复制豆包的回复后再导入')
  }

  return parseAnalysisResponse(trimmed, {
    expectedSentence,
    requireMarker: true,
  })
}

/** 静默检测：仅当 marker + sentence 均匹配时返回结果，否则 null */
export function tryParseDoubaoClipboard(
  clipboardText: string,
  expectedSentence: string,
): NotebookEntryAnalysis | null {
  try {
    return parseDoubaoClipboard(clipboardText, expectedSentence)
  } catch {
    return null
  }
}

export function getExpectedSentenceKey(sentence: string): string {
  return normalizeSentenceKey(sentence)
}
