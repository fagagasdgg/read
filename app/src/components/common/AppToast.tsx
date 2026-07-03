import { createPortal } from 'react-dom'

export type AppToastVariant = 'default' | 'ok' | 'error'

interface AppToastProps {
  message: string
  variant?: AppToastVariant
  className?: string
}

/** 挂载到 body，避免 HomeShell 横向 transform 导致 fixed 定位错位 */
export function AppToast({ message, variant = 'default', className = '' }: AppToastProps) {
  if (!message) return null

  return createPortal(
    <p className={`app-toast app-toast-${variant}${className ? ` ${className}` : ''}`} role="status">
      {message}
    </p>,
    document.body,
  )
}
