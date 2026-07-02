const VOICE_BASE = 'https://dict.youdao.com/dictvoice'

let playing: HTMLAudioElement | null = null

/** 播放时始终用单词原文拼 URL，避免缓存或 API 字段导致发音截断 */
export function playSpeechWord(word: string, type: 1 | 2): void {
  const token = word.trim().toLowerCase()
  if (!token) return

  const url = `${VOICE_BASE}?audio=${encodeURIComponent(token)}&type=${type}`

  if (playing) {
    playing.pause()
    playing = null
  }

  const audio = new Audio(url)
  playing = audio
  audio.addEventListener('ended', () => {
    if (playing === audio) playing = null
  })
  void audio.play().catch(() => {
    if (playing === audio) playing = null
  })
}

/** @deprecated 优先使用 playSpeechWord；iciba 等外链发音可直接传入完整 URL */
export function playSpeech(url: string): void {
  if (!url) return

  if (url.includes('dict.youdao.com/dictvoice')) {
    try {
      const parsed = new URL(url)
      const audio = parsed.searchParams.get('audio')
      const type = Number(parsed.searchParams.get('type') ?? 2) as 1 | 2
      if (audio) {
        playSpeechWord(decodeURIComponent(audio), type === 1 ? 1 : 2)
        return
      }
    } catch {
      // fall through
    }
  }

  if (playing) {
    playing.pause()
    playing = null
  }

  const audio = new Audio(url)
  playing = audio
  audio.addEventListener('ended', () => {
    if (playing === audio) playing = null
  })
  void audio.play().catch(() => {
    if (playing === audio) playing = null
  })
}
