import type { NotebookEntryAnalysis } from '../notes/notebooks'
import { parseAnalysisResponse } from './analysisParse'
import {
  estimateDoubaoSelectionTooLong,
  getDoubaoModelOption,
  hasDoubaoApiKey,
  loadDoubaoSettings,
} from './doubaoSettings'
import { doubaoChatCompletion } from './doubaoClient'
import { loadLlmProviderSettings } from './llmProvider'
import {
  estimateSelectionTooLong,
  getZhipuModelOption,
  hasZhipuApiKey,
  loadZhipuSettings,
} from './zhipuSettings'
import { zhipuChatCompletion } from './zhipuClient'

const SYSTEM_PROMPT = `你是英语阅读学习助手。用户给出英文句子或段落，请仅输出一个 JSON 对象，不要 markdown 代码块，不要任何前后说明文字。

JSON 字段（均为字符串）：
- translation：自然流畅的中文翻译
- collocations：重要搭配/词组，每条一行，格式「英文 — 中文」；没有则写「无」
- slangs：俚语、习语、口语表达，每条一行；没有则写「无」
- sentencePattern：句式结构简要分析（1-3 句中文）`

export async function hasActiveLlmApiKey(): Promise<boolean> {
  const { provider } = await loadLlmProviderSettings()
  if (provider === 'doubao') return hasDoubaoApiKey()
  return hasZhipuApiKey()
}

async function analyzeWithZhipu(sentence: string): Promise<NotebookEntryAnalysis> {
  const settings = await loadZhipuSettings()
  const modelOption = getZhipuModelOption(
    settings.model,
    settings.customModels,
    settings.hiddenModelIds,
  )
  const content = await zhipuChatCompletion(
    settings,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: sentence },
    ],
    { maxTokens: modelOption?.maxOutputTokens ?? 1024 },
  )
  return parseAnalysisResponse(content)
}

async function analyzeWithDoubao(sentence: string): Promise<NotebookEntryAnalysis> {
  const settings = await loadDoubaoSettings()
  const modelOption = getDoubaoModelOption(
    settings.model,
    settings.customModels,
    settings.hiddenModelIds,
  )
  const content = await doubaoChatCompletion(
    settings,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: sentence },
    ],
    { maxTokens: modelOption?.maxOutputTokens ?? 2048 },
  )
  return parseAnalysisResponse(content)
}

export async function analyzeSentenceDeep(sentence: string): Promise<NotebookEntryAnalysis> {
  const text = sentence.trim()
  if (!text) throw new Error('请先选择要解析的文本')

  const { provider } = await loadLlmProviderSettings()
  if (provider === 'doubao') {
    if (!(await hasDoubaoApiKey())) {
      throw new Error('请先在首页「设置」中配置豆包 API Key')
    }
    return analyzeWithDoubao(text)
  }

  if (!(await hasZhipuApiKey())) {
    throw new Error('请先在首页「设置」中配置智谱 API Key')
  }
  return analyzeWithZhipu(text)
}

export async function estimateSelectionTooLongForActiveProvider(text: string): Promise<string | null> {
  const { provider } = await loadLlmProviderSettings()
  if (provider === 'doubao') {
    const settings = await loadDoubaoSettings()
    return estimateDoubaoSelectionTooLong(
      text,
      settings.model,
      settings.customModels,
      settings.hiddenModelIds,
    )
  }
  const settings = await loadZhipuSettings()
  return estimateSelectionTooLong(text, settings.model, settings.customModels)
}
