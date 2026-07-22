import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { READ_WORD_EXPORT_MARKER } from '../dictionary/manualWord'

export function buildDoubaoWordPrompt(lemma: string): string {
  const word = lemma.trim()
  if (!word) throw new Error('请先选择要补全的单词')

  return `你是英语词典助手。用户将发送本条消息，你必须严格遵守下列规则。

【任务】
为下方英文单词生成词典条目，并仅输出一个 JSON 对象，供阅读器 App 自动导入词条缓存。

【硬性规则 — 违反任一即失败】
1. 输出有且仅有一个 JSON 对象；第一个字符必须是 {，最后一个字符必须是 }。
2. 禁止 markdown 代码块（禁止出现 \`\`\`）。
3. 禁止在 JSON 前后添加任何说明、标题、道歉、思考过程或总结。
4. JSON 必须可被 JSON.parse 直接解析。

【单词】
${word}

【JSON 字段要求】
- marker：固定为 "${READ_WORD_EXPORT_MARKER}"
- lemma：与上方单词完全一致（小写）
- phoneticUs：美式音标，不含斜杠，可留空字符串
- phoneticUk：英式音标，不含斜杠，可留空字符串
- examLevels：字符串数组，仅可从以下取值中选取（可多选）：中考、高考、CET4、CET6、考研、雅思、托福、GRE
- definitions：数组，至少 1 项；每项含 pos（词性，如 n. / v.，可空字符串）与 translation（中文释义，必填）
- forms：数组，可为空；每项含 label（如「复数」「过去式」）与 value（词形）

请现在只输出 JSON，不要输出其他任何文字。`
}

export async function copyDoubaoWordPrompt(lemma: string): Promise<string> {
  const prompt = buildDoubaoWordPrompt(lemma)
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: prompt })
  } else {
    await navigator.clipboard.writeText(prompt)
  }
  return prompt
}
