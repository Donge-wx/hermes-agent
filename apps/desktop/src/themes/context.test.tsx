import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetBackendSkinSync, ingestBackendSkin } from './backend-sync'
import { modePref, skinPref, ThemeProvider, useTheme } from './context'
import { migrateMyKingAppearanceDefaults } from './my-king-appearance'
import { everforestTheme } from './presets'

// The live-authoring loop: Hermes writes/edits one skin file and every surface
// repaints. An in-place edit keeps the NAME — only the palette moves.
const bloomberg = (foreground: string) => ({
  name: 'bloomberg',
  colors: { background: '#000000', ui_text: foreground, ui_accent: '#ff8000' }
})

const cssVar = (name: string) => window.document.documentElement.style.getPropertyValue(name)

describe('ThemeProvider ← backend skin sync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
  })

  afterEach(cleanup)

  it('applies an activated backend skin', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
    expect(cssVar('--theme-background-seed')).toBe('#000000')
  })

  it('repaints an in-place edit of the ACTIVE skin (same name, new palette)', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')

    // Recolor the same skin file. The same-name apply guard correctly no-ops
    // (protects manual desktop picks), so the repaint must come from the
    // registry update reaching the active theme derivation.
    act(() => ingestBackendSkin(bloomberg('#ff2d95'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff2d95')
  })

  it('does not repaint an edit to an INACTIVE skin', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    // A different skin registered without apply (e.g. seeded on reconnect)
    // must not touch the painted theme.
    act(() =>
      ingestBackendSkin({ name: 'forest', colors: { background: '#001100', ui_text: '#66ff66' } }, { apply: false })
    )
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
  })
})

describe('My King appearance migration', () => {
  beforeEach(() => window.localStorage.clear())

  it('migrates legacy Classic/System defaults and profile assignments once', () => {
    window.localStorage.setItem('hermes-desktop-theme-v2', 'nous')
    window.localStorage.setItem('hermes-desktop-mode-v1', 'system')
    window.localStorage.setItem('hermes-desktop-profile-themes-v1', JSON.stringify({ work: 'nous', custom: 'mono' }))
    window.localStorage.setItem('hermes-desktop-profile-modes-v1', JSON.stringify({ work: 'system', custom: 'dark' }))

    migrateMyKingAppearanceDefaults()

    expect(skinPref.resolve('default')).toBe('liquid-glass')
    expect(skinPref.resolve('work')).toBe('liquid-glass')
    expect(skinPref.resolve('custom')).toBe('mono')
    expect(modePref.resolve('default')).toBe('light')
    expect(modePref.resolve('work')).toBe('light')
    expect(modePref.resolve('custom')).toBe('dark')
  })

  it('preserves a deliberate non-default appearance', () => {
    skinPref.assign('default', 'everforest')
    modePref.assign('default', 'dark')

    migrateMyKingAppearanceDefaults()

    expect(skinPref.resolve('default')).toBe('everforest')
    expect(modePref.resolve('default')).toBe('dark')
  })
})

describe('ThemeProvider highlight preview', () => {
  beforeEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
  })

  afterEach(cleanup)

  // Read the live context so the tests drive the real provider, not a mock.
  let ctx: ReturnType<typeof useTheme>

  function Probe() {
    ctx = useTheme()

    return null
  }

  const renderProbe = () =>
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

  it('paints the previewed theme without persisting it', () => {
    renderProbe()

    const committed = ctx.themeName

    act(() => ctx.previewTheme('everforest', 'dark'))

    expect(cssVar('--theme-foreground')).toBe(everforestTheme.darkColors!.foreground)
    // The commit surface does not change. The context name and the stored
    // preference keep their values.
    expect(ctx.themeName).toBe(committed)
    expect(skinPref.resolve('default')).toBe(committed)
  })

  it('clearThemePreview repaints the committed appearance', () => {
    renderProbe()

    act(() => ctx.previewTheme('everforest', 'dark'))
    expect(cssVar('--theme-foreground')).toBe(everforestTheme.darkColors!.foreground)

    act(() => ctx.clearThemePreview())
    expect(cssVar('--theme-foreground')).not.toBe(everforestTheme.darkColors!.foreground)
  })

  it('a commit replaces the preview and persists', () => {
    renderProbe()

    act(() => ctx.previewTheme('everforest', 'dark'))
    act(() => ctx.setTheme('mono'))

    expect(ctx.themeName).toBe('mono')
    expect(skinPref.resolve('default')).toBe('mono')
    expect(cssVar('--theme-foreground')).not.toBe(everforestTheme.darkColors!.foreground)
  })

  it('ignores a preview of an unknown theme', () => {
    renderProbe()

    const painted = cssVar('--theme-foreground')

    act(() => ctx.previewTheme('does-not-exist', 'dark'))
    expect(cssVar('--theme-foreground')).toBe(painted)
  })
})
