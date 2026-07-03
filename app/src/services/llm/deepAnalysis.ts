import type { NotebookEntryAnalysis } from '../notes/notebooks'
import { DEEP_ANALYSIS_SYSTEM_PROMPT } from './analysisPrompt'
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

const SYSTEM_PROMPT = DEEP_ANALYSIS_SYSTEM_PROMPT

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
