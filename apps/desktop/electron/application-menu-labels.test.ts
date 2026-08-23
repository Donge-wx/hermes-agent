import { describe, expect, it } from 'vitest'

import {
  MY_KING_APP_ID,
  MY_KING_HOME_DIRNAME,
  MY_KING_PROTOCOL,
  MY_KING_USER_DATA_DIRNAME,
  MY_KING_WINDOWS_HOME_DIRNAME,
  buildApplicationMenuRoleItems,
  buildApplicationMenuRoleLabels,
  resolveApplicationIdentity
} from './application-menu-labels'

describe('My King public installation identity', () => {
  it('uses paths and protocol identifiers that do not collide with Hermes', () => {
    expect(MY_KING_APP_ID).toBe('com.myking.workos.desktop')
    expect(MY_KING_PROTOCOL).toBe('myking')
    expect(MY_KING_HOME_DIRNAME).toBe('.myking')
    expect(MY_KING_WINDOWS_HOME_DIRNAME).toBe('myking')
    expect(MY_KING_USER_DATA_DIRNAME).toBe('My King')
  })

  it('uses an independent internal and keychain identity by default', () => {
    expect(resolveApplicationIdentity()).toEqual({
      internalName: 'My King',
      publicName: 'My King'
    })
  })
})

describe('buildApplicationMenuRoleLabels', () => {
  it('uses the public app name for native hide and quit roles', () => {
    expect(buildApplicationMenuRoleLabels()).toEqual({
      hide: 'Hide My King',
      quit: 'Quit My King'
    })
  })

  it('builds a labeled native quit role for every platform menu', () => {
    expect(buildApplicationMenuRoleItems().quit).toEqual({
      label: 'Quit My King',
      role: 'quit'
    })
  })

  it('keeps the public brand fixed when an internal test identity is supplied', () => {
    expect(resolveApplicationIdentity('HermesE2E-123')).toEqual({
      internalName: 'HermesE2E-123',
      publicName: 'My King'
    })
  })
})
