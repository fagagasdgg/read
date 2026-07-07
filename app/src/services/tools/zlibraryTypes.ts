export interface ZLibraryMirrorCandidate {
  url: string
  label: string
  enabled?: boolean
}

export type ZLibraryProbeStatus = 'idle' | 'checking' | 'reachable' | 'unreachable'

export interface ZLibraryProbeResult {
  mirror: ZLibraryMirrorCandidate
  status: ZLibraryProbeStatus
  statusCode?: number
  latencyMs?: number
  finalUrl?: string
  method?: string
  attempts?: number
  error?: string
}

export interface ZLibraryProbeSettings {
  timeoutMs: number
  retryCount: number
  concurrency: number
  userAgent: string
  methods: Array<'HEAD' | 'GET'>
  /** 视为“可访问”的 HTTP 状态码（含常见跳转） */
  successStatusCodes: number[]
}

export interface ZLibraryRemoteConfig {
  schemaVersion: number
  updatedAt?: string
  remoteSources?: string[]
  probe?: Partial<ZLibraryProbeSettings>
  mirrors: ZLibraryMirrorCandidate[]
  tips: string[]
}

export type ZLibraryConfigSource = 'remote' | 'cache' | 'bundled' | 'builtin'

export interface ZLibraryConfigLoadResult {
  config: ZLibraryRemoteConfig
  probe: ZLibraryProbeSettings
  source: ZLibraryConfigSource
  sourceLabel: string
  fetchedAt: number
}
