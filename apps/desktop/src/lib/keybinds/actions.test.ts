import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'
import { zh } from '@/i18n/zh'

import { allKeybindActions, defaultBindings, KEYBIND_ACTIONS, keybindAction } from './actions'

describe('managed employee keybind registry', () => {
  it('does not register backend-management, terminal, or managed-appearance actions', () => {
    const actions = new Set(allKeybindActions().map(action => action.id))
    const bindings = defaultBindings()

    for (const actionId of [
      'profile.default',
      'nav.profiles',
      'nav.cron',
      'nav.agents',
      'view.showTerminal',
      'view.newTerminal',
      'appearance.toggleMode',
      'view.toggleTabStrip'
    ]) {
      expect(actions.has(actionId), actionId).toBe(false)
      expect(bindings).not.toHaveProperty(actionId)
      expect(keybindAction(actionId)).toBeUndefined()
    }

    expect(actions.has('session.new')).toBe(true)
  })
})

describe('session.archive keybind action', () => {
  it('is registered under the session category', () => {
    const action = keybindAction('session.archive')

    expect(action).toBeDefined()
    expect(action?.category).toBe('session')
  })

  it('ships unbound so it does not claim a chord for every user', () => {
    const action = keybindAction('session.archive')

    expect(action?.defaults).toEqual([])
    // A missing entry would silently drop from the panel; an accidental
    // default binding would change behaviour for everyone. Guard both.
    expect(defaultBindings()['session.archive']).toEqual([])
  })

  it('has an English label so it renders in the shortcuts panel', () => {
    expect(en.keybinds.actions['session.archive']).toBe('Archive current session')
  })

  it('appears exactly once in KEYBIND_ACTIONS', () => {
    const matches = KEYBIND_ACTIONS.filter(action => action.id === 'session.archive')

    expect(matches).toHaveLength(1)
  })
})

describe('layout.editMode contributed action label', () => {
  it('keeps the stable action id while providing English and Simplified Chinese labels', () => {
    const actionId = 'layout.editMode'

    expect(en.keybinds.actions[actionId]).toBe('Toggle layout edit mode')
    expect(zh.keybinds.actions[actionId]).toBe('切换布局编辑模式')
  })
})
