import { describe, expect, it } from 'vitest'

import { zh } from '@/i18n/zh'

import { apiKeyOptionName } from './api-key-option-copy'

describe('apiKeyOptionName', () => {
  it('uses translated provider copy when the locale supplies a title', () => {
    expect(apiKeyOptionName({ id: 'local', name: 'Local / custom endpoint' }, zh)).toBe(
      zh.onboarding.apiKeyOptions.local?.title
    )
  })

  it('preserves technical provider names without a translated title', () => {
    expect(apiKeyOptionName({ id: 'openai', name: 'OpenAI' }, zh)).toBe('OpenAI')
  })
})
