import { afterEach, describe, expect, it, vi } from 'vitest'

const originalHermesHome = process.env.HERMES_HOME

afterEach(() => {
  if (originalHermesHome === undefined) {
    delete process.env.HERMES_HOME
  } else {
    process.env.HERMES_HOME = originalHermesHome
  }

  vi.resetModules()
})

describe('managed My King TUI update policy', () => {
  it('recognizes the dedicated My King root and hides the update command', async () => {
    process.env.HERMES_HOME = '/Users/employee/.myking'
    vi.resetModules()

    const { MY_KING_MANAGED_MODE } = await import('./env.js')
    const { SLASH_COMMANDS } = await import('../app/slash/registry.js')

    expect(MY_KING_MANAGED_MODE).toBe(true)
    expect(SLASH_COMMANDS.some(command => command.name === 'update')).toBe(false)
  })

  it('keeps the ordinary Hermes TUI update command available', async () => {
    process.env.HERMES_HOME = '/Users/developer/.hermes'
    vi.resetModules()

    const { MY_KING_MANAGED_MODE } = await import('./env.js')
    const { SLASH_COMMANDS } = await import('../app/slash/registry.js')

    expect(MY_KING_MANAGED_MODE).toBe(false)
    expect(SLASH_COMMANDS.some(command => command.name === 'update')).toBe(true)
  })
})
