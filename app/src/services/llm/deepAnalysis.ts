import type { NotebookEntryAnalysis } from '../notes/notebooks'
import { parseAnalysisResponse } from './analysisParse'
import { zhipuChatCompletion } from './zhipuClient'
import { getZhipuModelOption, loadZhipuSettings } from './zhipuSettings'

const SYSTEM_PROMPT = `你是英语阅读学习助手。用户给出英文句子或段落，请仅输出一个 JSON 对象，不要 markdown 代码块，不要任何前后说明文字。

JSON 字段（均为字符串）：
- translation：自然流畅的中文翻译
- collocations：重要搭配/词组，每条一行，格式「英文 — 中文」；没有则写「无」
- slangs：俚语、习语、口语表达，每条一行；没有则写「无」
- sentencePattern：句式结构简要分析（1-3 句中文）`

export async function analyzeSentenceDeep(sentence: string): Promise<NotebookEntryAnalysis> {
  const text = sentence.trim()
  if (!text) throw new Error('请先选择要解析的文本')

  const settings = await loadZhipuSettings()
  const modelOption = getZhipuModelOption(settings.model, settings.customModels)
  const content = await zhipuChatCompletion(
    settings,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    { maxTokens: modelOption?.maxOutputTokens ?? 1024 },
  )

  return parseAnalysisResponse(content)
}
