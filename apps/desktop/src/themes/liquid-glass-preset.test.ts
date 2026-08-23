import { describe, expect, it } from 'vitest'

import { liquidGlassTheme } from './liquid-glass-preset'
import { BUILTIN_THEME_LIST, BUILTIN_THEMES } from './presets'

describe('Liquid Glass preset', () => {
  it('is registered additively as a built-in theme', () => {
    // Given: the canonical Liquid Glass preset.
    // When: the Appearance theme registry is read.
    const registered = BUILTIN_THEMES[liquidGlassTheme.name]

    // Then: the registry exposes the same preset without replacing Nous.
    expect(registered).toBe(liquidGlassTheme)
    expect(BUILTIN_THEME_LIST).toContain(liquidGlassTheme)
    expect(BUILTIN_THEMES.nous).toBeDefined()
  })
})
