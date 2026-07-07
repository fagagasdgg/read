import { useState, type ReactNode } from 'react'

interface CollapsibleSettingsSectionProps {
  title: string
  summary?: string
  defaultExpanded?: boolean
  children: ReactNode
}

export function CollapsibleSettingsSection({
  title,
  summary,
  defaultExpanded = false,
  children,
}: CollapsibleSettingsSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <section className={`settings-section settings-section-collapsible${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="settings-section-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="settings-section-toggle-text">
          <h4 className="settings-section-title">{title}</h4>
          {!expanded && summary && <p className="settings-section-summary">{summary}</p>}
        </div>
        <span className="settings-section-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && <div className="settings-section-content">{children}</div>}
    </section>
  )
}
