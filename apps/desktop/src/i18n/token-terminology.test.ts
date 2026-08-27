import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'

const translations = Object.values(TRANSLATIONS)

function expectTokenUnit(value: string): void {
  expect(value.split(/[\s/]+/)).toContain('token')
}

describe('desktop LLM usage units', () => {
  it('renders the singular token unit in every shipped locale', () => {
    // Given: every locale selectable by the desktop app.
    // When: it renders usage, cost, and context quantities.
    // Then: the user-visible unit is the literal singular English token.
    for (const translation of translations) {
      expect(translation.agents.tokens(42)).toBe('42 token')
      expectTokenUnit(translation.settings.mcp.costTokens('42'))
      expectTokenUnit(translation.commandCenter.statTokens)
      expectTokenUnit(translation.commandCenter.dailyTokens)
      expectTokenUnit(translation.onboarding.price('42', '84'))
      expectTokenUnit(translation.modelPicker.priceTitle)
      expect(translation.shell.statusbar.contextUsagePanel.tokenSummary('42', '84')).toBe('42 / 84 token')
    }
  })
})
