import { describe, expect, it, vi } from 'vitest'

import { defaultBindings, KEYBIND_ACTION_IDS, KEYBIND_CATEGORIES, keybindAction } from './actions'
import { buildProfileKeybindHandlers } from './profile-handlers'

describe('managed employee profile keybinds', () => {
  it('omits profile actions and their category from the keybind catalog', () => {
    expect(KEYBIND_CATEGORIES).not.toContain('profiles')
    expect(KEYBIND_ACTION_IDS.filter(id => id === 'nav.profiles' || id.startsWith('profile.'))).toEqual([])
    expect(keybindAction('nav.profiles')).toBeUndefined()
    expect(keybindAction('profile.default')).toBeUndefined()
    expect(defaultBindings()).not.toHaveProperty('profile.default')
  })

  it('does not register profile handlers in the managed release', () => {
    const handler = vi.fn()
    const handlers = buildProfileKeybindHandlers({
      createProfile: handler,
      cycleProfile: handler,
      navigateToProfiles: handler,
      switchToDefaultProfile: handler,
      switchToProfileSlot: handler,
      toggleShowAllProfiles: handler
    })

    expect(handlers).toEqual({})
    expect(handler).not.toHaveBeenCalled()
  })
})
