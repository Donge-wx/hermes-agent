import { describe, expect, it } from 'vitest'

import { af } from './af'
import { ar } from './ar'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { ga } from './ga'
import { hu } from './hu'
import { it as italian } from './it'
import { ja } from './ja'
import { ko } from './ko'
import { pt } from './pt'
import { ru } from './ru'
import { tr } from './tr'
import { uk } from './uk'
import { zhHant } from './zh-hant'
import { zh } from './zh'

const translations = [
  af,
  ar,
  de,
  en,
  es,
  fr,
  ga,
  hu,
  italian,
  ja,
  ko,
  pt,
  ru,
  tr,
  uk,
  zhHant,
  zh,
] as const

function expectTokenUnit(value: string): void {
  expect(value.split(' ')).toContain('token')
}

describe('web LLM usage units', () => {
  it('renders the singular token unit in every shipped locale', () => {
    // Given: every locale selectable by the web dashboard.
    // When: analytics and model usage units are rendered.
    // Then: the user-visible unit is the literal singular English token.
    for (const translation of translations) {
      expectTokenUnit(translation.analytics.totalTokens)
      expectTokenUnit(translation.analytics.dailyTokenUsage)
      expect(translation.analytics.tokens).toBe('token')
      expect(translation.models.tokens).toBe('token')
    }
  })
})
