import type { Translations } from '@/i18n/types'

interface NamedApiKeyOption {
  readonly id: string
  readonly name: string
}

export function apiKeyOptionName(option: NamedApiKeyOption, t: Translations): string {
  return t.onboarding.apiKeyOptions[option.id]?.title ?? option.name
}
