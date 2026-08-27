import type { ReactNode } from 'react'

import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n/types'

export function localizedPaneTitle(paneId: string, fallback: string, t: Translations): string {
  if (paneId === 'sessions') {
    return t.sidebar.sessions
  }

  if (paneId === 'hermes-bots:pane') {
    return t.sidebar.bots
  }

  return fallback
}

export function LocalizedPaneTitle({ fallback, paneId }: { readonly fallback: ReactNode; readonly paneId: string }) {
  const { t } = useI18n()

  return typeof fallback === 'string' ? localizedPaneTitle(paneId, fallback, t) : fallback
}
