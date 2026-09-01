import { describe, expect, it } from 'vitest'

import {
  employeeFeatureItems,
  employeeMessagingPlatformItems,
  employeeMessagingPlatformName,
  employeeMessagingSessionItems,
  employeeThemeItems,
  employeeThemeName,
  employeeVisibleBrandText,
  isEmployeeAppearanceSettingAvailable,
  isEmployeeFeatureAvailable,
  isEmployeeKeybindActionAvailable,
  isEmployeePaletteItemAvailable,
  isEmployeeRouteAvailable,
  isEmployeeSettingsViewAvailable,
  managedEmployeeRedirect
} from './managed-employee-policy'

describe('managed employee policy', () => {
  it('keeps employee read surfaces while hiding backend administration', () => {
    expect(isEmployeeFeatureAvailable('version.read')).toBe(true)
    expect(isEmployeeFeatureAvailable('sessions.read')).toBe(true)
    expect(isEmployeeFeatureAvailable('profiles.manage')).toBe(false)
    expect(isEmployeeFeatureAvailable('gateways.manage')).toBe(true)
    expect(isEmployeeFeatureAvailable('messaging.manage')).toBe(true)
    expect(isEmployeeFeatureAvailable('config.manage')).toBe(false)
    expect(isEmployeeFeatureAvailable('skills.marketplace')).toBe(false)
    expect(isEmployeeFeatureAvailable('terminal')).toBe(false)
  })

  it('keeps operational API and gateway Settings tabs', () => {
    expect(isEmployeeSettingsViewAvailable('config:appearance')).toBe(true)
    expect(isEmployeeSettingsViewAvailable('config:chat')).toBe(true)
    expect(isEmployeeSettingsViewAvailable('about')).toBe(true)
    expect(isEmployeeSettingsViewAvailable('providers')).toBe(true)
    expect(isEmployeeSettingsViewAvailable('gateway')).toBe(true)
    expect(isEmployeeSettingsViewAvailable('keys')).toBe(true)
    expect(isEmployeeSettingsViewAvailable('config:memory')).toBe(false)
  })

  it('blocks direct management routes and supplies safe replacements', () => {
    expect(isEmployeeRouteAvailable('/skills')).toBe(true)
    expect(isEmployeeRouteAvailable('/messaging')).toBe(true)
    expect(isEmployeeRouteAvailable('/settings', '?tab=gateway')).toBe(true)
    expect(isEmployeeRouteAvailable('/command-center', '?section=system')).toBe(false)
    expect(managedEmployeeRedirect('/skills')).toBeNull()
    expect(managedEmployeeRedirect('/settings', '?tab=keys')).toBeNull()
    expect(managedEmployeeRedirect('/command-center', '?section=system')).toBe('/command-center?section=sessions')
  })

  it('removes matching command-palette escape hatches', () => {
    expect(isEmployeePaletteItemAvailable('nav-skills')).toBe(true)
    expect(isEmployeePaletteItemAvailable('nav-messaging')).toBe(true)
    expect(isEmployeePaletteItemAvailable('view.showTerminal')).toBe(false)
    expect(isEmployeePaletteItemAvailable('view.toggleTabStrip')).toBe(false)
    expect(isEmployeePaletteItemAvailable('core:view.toggleTabStrip')).toBe(false)
    expect(isEmployeePaletteItemAvailable('core:plugins.reload')).toBe(false)
    expect(isEmployeePaletteItemAvailable('core:profile.export')).toBe(false)
    expect(isEmployeePaletteItemAvailable('core:profile.import')).toBe(false)
    expect(isEmployeePaletteItemAvailable('core:session.yolo')).toBe(false)
    expect(isEmployeePaletteItemAvailable('plugin:hermes-bots:hermes-bots:new-agent')).toBe(false)
    expect(isEmployeePaletteItemAvailable('set-gateway')).toBe(true)
    expect(isEmployeePaletteItemAvailable('theme-install')).toBe(false)
    expect(isEmployeePaletteItemAvailable('appearance-theme')).toBe(false)
    expect(isEmployeePaletteItemAvailable('appearance-mode')).toBe(false)
    expect(isEmployeePaletteItemAvailable('search-theme-liquid-glass')).toBe(false)
    expect(isEmployeePaletteItemAvailable('search-mode-dark')).toBe(false)
    expect(isEmployeePaletteItemAvailable('theme-liquid-glass')).toBe(false)
    expect(isEmployeePaletteItemAvailable('theme-mode-dark')).toBe(false)
    expect(isEmployeePaletteItemAvailable('mode-dark')).toBe(false)
    expect(isEmployeePaletteItemAvailable('sp-config-memory')).toBe(false)
    expect(isEmployeePaletteItemAvailable('sp-about')).toBe(true)
    expect(isEmployeePaletteItemAvailable('view.toggleTabStrip', false)).toBe(true)
  })

  it('removes restricted shortcut actions before managed registries render or dispatch them', () => {
    for (const actionId of [
      'profile.default',
      'profile.switch.1',
      'nav.profiles',
      'nav.cron',
      'nav.agents',
      'view.showTerminal',
      'view.terminalCopy',
      'layout.editMode',
      'appearance.toggleMode',
      'view.toggleTabStrip'
    ]) {
      expect(isEmployeeKeybindActionAvailable(actionId), actionId).toBe(false)
      expect(isEmployeeKeybindActionAvailable(actionId, false), `${actionId} outside managed mode`).toBe(true)
    }

    expect(isEmployeeKeybindActionAvailable('session.new')).toBe(true)
    expect(isEmployeeKeybindActionAvailable('view.toggleSidebar')).toBe(true)
  })

  it('hides only the eight administrator-managed appearance controls', () => {
    const visibility = [
      ['appearance.theme', false],
      ['appearance.session-list-density', false],
      ['appearance.tab-strip', false],
      ['appearance.translucency', false],
      ['appearance.backdrop', false],
      ['appearance.intro-splash', false],
      ['appearance.composer-popout', false],
      ['appearance.tool-view', false],
      ['appearance.language', true],
      ['appearance.ui-scale', true],
      ['appearance.reactions', true],
      ['appearance.reasoning-collapsed', true],
      ['appearance.embeds', true],
      ['appearance.pet', true]
    ] as const

    for (const [setting, expected] of visibility) {
      expect(isEmployeeAppearanceSettingAvailable(setting), setting).toBe(expected)
      expect(isEmployeeAppearanceSettingAvailable(setting, false), `${setting} outside managed mode`).toBe(true)
    }
  })

  it('restores every feature when the managed shell is disabled', () => {
    expect(isEmployeeFeatureAvailable('terminal', false)).toBe(true)
    expect(isEmployeeSettingsViewAvailable('providers', false)).toBe(true)
    expect(isEmployeeRouteAvailable('/skills', '', false)).toBe(true)
    expect(isEmployeePaletteItemAvailable('nav-skills', false)).toBe(true)
  })

  it('keeps ordinary pinnable sessions while excluding managed feature sessions', () => {
    const ordinarySessions = [{ id: 'chat-1' }]
    const cronSessions = [{ id: 'cron-1' }]
    const messagingSessions = [{ id: 'messaging-1' }]

    expect(employeeFeatureItems('sessions.read', ordinarySessions)).toBe(ordinarySessions)
    expect(employeeFeatureItems('cron.manage', cronSessions)).toEqual([])
    expect(employeeFeatureItems('messaging.manage', messagingSessions)).toBe(messagingSessions)
  })

  it('shows only the four approved gateway messaging platforms', () => {
    const platforms = [
      { id: 'telegram' },
      { id: 'dingtalk' },
      { id: 'weixin' },
      { id: 'wecom' },
      { id: 'wecom_callback' },
      { id: 'feishu' },
      { id: 'slack' }
    ]

    expect(employeeMessagingPlatformItems(platforms).map(platform => platform.id)).toEqual([
      'dingtalk',
      'weixin',
      'wecom_callback',
      'feishu'
    ])
    expect(employeeMessagingPlatformItems(platforms, false)).toBe(platforms)
  })

  it('projects managed gateway and skill labels without changing source data', () => {
    const wecom = { id: 'wecom_callback', name: 'WeCom (app)' }

    expect(employeeMessagingPlatformName({ id: 'dingtalk', name: 'DingTalk' })).toBe('钉钉')
    expect(employeeMessagingPlatformName({ id: 'feishu', name: 'Feishu / Lark' })).toBe('飞书')
    expect(employeeMessagingPlatformName(wecom)).toBe('企业微信')
    expect(employeeMessagingPlatformName({ id: 'weixin', name: 'Weixin / WeChat (Personal)' })).toBe('微信')
    expect(employeeMessagingPlatformName(wecom, false)).toBe('WeCom (app)')
    expect(employeeVisibleBrandText('hermes')).toBe('My King')
    expect(employeeVisibleBrandText('hermes:\n  version: 1')).toBe('My King:\n  version: 1')
    expect(employeeVisibleBrandText('author')).toBe('author')
  })

  it('keeps sidebar messaging sessions aligned with the approved platforms', () => {
    const sessions = [
      { id: 'ding', source: 'dingtalk' },
      { id: 'wechat', source: 'weixin' },
      { id: 'wechat-alias', source: 'wechat' },
      { id: 'wecom', source: 'wecom_callback' },
      { id: 'lark', source: 'feishu' },
      { id: 'telegram', source: 'telegram' }
    ]

    expect(employeeMessagingSessionItems(sessions).map(session => session.id)).toEqual([
      'ding',
      'wechat',
      'wechat-alias',
      'wecom',
      'lark'
    ])
  })

  it('locks managed employees to the branded Liquid Glass theme', () => {
    const themes = [{ name: 'liquid-glass' }, { name: 'nous' }, { name: 'cyberpunk' }]

    expect(employeeThemeName('cyberpunk')).toBe('liquid-glass')
    expect(employeeThemeName('cyberpunk', false)).toBe('cyberpunk')
    expect(employeeThemeItems(themes)).toEqual([{ name: 'liquid-glass' }])
    expect(employeeThemeItems(themes, false)).toBe(themes)
  })

  it('restores managed feature sessions to pinnable candidates outside employee mode', () => {
    const cronSessions = [{ id: 'cron-1' }]
    const messagingSessions = [{ id: 'messaging-1' }]

    expect(employeeFeatureItems('cron.manage', cronSessions, false)).toBe(cronSessions)
    expect(employeeFeatureItems('messaging.manage', messagingSessions, false)).toBe(messagingSessions)
  })
})
