import type { ReactNode } from 'react'

import { type PluginTranslate, useI18n, usePluginI18n } from '@/i18n'
import type { Translations } from '@/i18n/types'

export function localizedPaneTitle(
  paneId: string,
  fallback: string,
  t: Translations,
  botsT?: PluginTranslate
): string {
  if (paneId === 'sessions') {
    return t.sidebar.sessions
  }

  if (paneId === 'hermes-bots:pane') {
    return botsT?.('pane.bots') ?? t.sidebar.bots
  }

  if (paneId === 'hermes-bots:routines') {
    return botsT?.('pane.cronjobs') ?? fallback
  }

  return fallback
}

export function LocalizedPaneTitle({ fallback, paneId }: { readonly fallback: ReactNode; readonly paneId: string }) {
  const { t } = useI18n()
  const botsT = usePluginI18n('hermes-bots')

  return typeof fallback === 'string' ? localizedPaneTitle(paneId, fallback, t, botsT) : fallback
}
