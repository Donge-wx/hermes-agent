import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'
import { zh } from '@/i18n/zh'

import { localizedPaneTitle } from './localized-pane-title'

describe('localizedPaneTitle', () => {
  it('uses the active locale for managed sidebar panes', () => {
    expect(localizedPaneTitle('sessions', 'sessions', zh)).toBe(zh.sidebar.sessions)
    expect(localizedPaneTitle('hermes-bots:pane', 'Bots', zh)).toBe(zh.sidebar.bots)
  })

  it('preserves contributed titles outside the managed sidebar panes', () => {
    expect(localizedPaneTitle('plugin:custom-pane', 'Custom pane', en)).toBe('Custom pane')
  })
})
