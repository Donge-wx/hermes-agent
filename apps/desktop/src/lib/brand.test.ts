import { describe, expect, it } from 'vitest'

import introCopyJsonl from '@/components/chat/intro-copy.jsonl?raw'
import { ar } from '@/i18n/ar'
import { en } from '@/i18n/en'
import { ja } from '@/i18n/ja'
import { zh } from '@/i18n/zh'
import { zhHant } from '@/i18n/zh-hant'

import { BRAND, brandAssetPath, publicAgentName, publicBrandText } from './brand'

describe('My King brand contract', () => {
  it('keeps the approved public name and intentionally spelled tagline together', () => {
    expect(BRAND).toMatchObject({
      accessibleName: 'My King — AI WROK OS',
      name: 'My King',
      tagline: 'AI WROK OS'
    })
  })

  it('resolves the shared renderer assets without changing the app base path', () => {
    expect(brandAssetPath(BRAND.symbolPath)).toContain('brand/my-king-symbol.png')
    expect(brandAssetPath(BRAND.lockupPath)).toContain('brand/my-king-lockup.png')
  })

  it('keeps the compatibility wake phrase out of public composer labels', () => {
    const locales = [en, zh, zhHant, ja, ar]

    for (const locale of locales) {
      expect(locale.composer.wakeWordListening()).not.toMatch(/hermes/i)
      expect(locale.composer.wakeWordOff()).not.toMatch(/hermes/i)
      expect(locale.composer.wakeWordPausedVoice()).not.toMatch(/hermes/i)
      expect(locale.composer.commandDescs['/quit']).not.toMatch(/hermes/i)
    }
  })

  it('keeps generated intro headlines free of the compatibility name', () => {
    expect(introCopyJsonl).not.toMatch(/\bhermes\b/i)
  })

  it('maps only compatibility agent identities to the public brand', () => {
    expect(publicAgentName('Hermes')).toBe('My King')
    expect(publicAgentName('hermes')).toBe('My King')
    expect(publicAgentName('default')).toBe('My King')
    expect(publicAgentName('Research King')).toBe('Research King')
  })

  it('removes compatibility branding from public copy without rewriting internal paths or identities', () => {
    // Given a backend error that mixes public copy with compatibility identifiers.
    const backendError =
      'Failed to connect to Hermes backend (hermes:connection, com.nousresearch.hermes, ~/.hermes/state.db)'

    // When the error crosses the renderer display boundary.
    const displayedError = publicBrandText(backendError)

    // Then public prose and protocol-shaped copy are friendly while raw identifiers remain untouched.
    expect(displayedError).toBe(
      'Failed to connect to My King backend (My King connection, com.nousresearch.hermes, ~/.hermes/state.db)'
    )
    expect(backendError).toContain('hermes:connection')
    expect(publicBrandText('Launch /Applications/Hermes.app/Contents/MacOS/Hermes')).toBe(
      'Launch /Applications/Hermes.app/Contents/MacOS/Hermes'
    )
  })
})
