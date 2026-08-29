import assert from 'node:assert/strict'

import { test } from 'vitest'

import { renderNativeLoginPage } from './native-oauth-login-page'

test('native auth status copy meets the WCAG AA normal-text contrast floor', () => {
  const rendered = renderNativeLoginPage('success')
  const foregroundMatch = rendered.match(/--mk-tertiary:\s*(#[0-9a-f]{6})/i)
  const backgroundMatch = rendered.match(/--mk-canvas:\s*(#[0-9a-f]{6})/i)

  assert.ok(foregroundMatch)
  assert.ok(backgroundMatch)

  const luminances = [foregroundMatch[1], backgroundMatch[1]].map(hexColor => {
    assert.ok(hexColor)
    const channels = [1, 3, 5].map(offset => Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255)
    const linear = channels.map(channel =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    )

    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  })
  const lighter = Math.max(...luminances)
  const darker = Math.min(...luminances)

  assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5)
})
