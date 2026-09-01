/**
 * Employee-facing product policy for the administrator-managed My King build.
 *
 * Keep this module data-only and keep feature implementations intact. Upstream
 * updates can replace or extend those implementations without having to merge
 * a fork of each page; the small, stable navigation boundaries ask this module
 * whether an entry is visible. Privileged update execution is separately
 * enforced at Electron/backend boundaries.
 */
export const MANAGED_EMPLOYEE_MODE = true

export const MANAGED_EMPLOYEE_THEME_NAME = 'liquid-glass'

const MANAGED_EMPLOYEE_HIDDEN_APPEARANCE_SETTINGS = new Set([
  'appearance.backdrop',
  'appearance.composer-popout',
  'appearance.intro-splash',
  'appearance.session-list-density',
  'appearance.tab-strip',
  'appearance.theme',
  'appearance.tool-view',
  'appearance.translucency'
])

const EMPLOYEE_MESSAGING_PLATFORM_IDS = new Set(['dingtalk', 'feishu', 'wecom_callback', 'weixin'])

const EMPLOYEE_MESSAGING_PLATFORM_NAMES: Readonly<Record<string, string>> = {
  dingtalk: '钉钉',
  feishu: '飞书',
  wecom_callback: '企业微信',
  weixin: '微信'
}

const EMPLOYEE_MESSAGING_SESSION_SOURCES = new Set([
  ...EMPLOYEE_MESSAGING_PLATFORM_IDS,
  'wechat',
  // Both WeCom transports identify conversation history as `wecom`; only the
  // bidirectional callback application is exposed as a setup platform.
  'wecom'
])

export type EmployeeFeature =
  | 'appearance'
  | 'artifacts.read'
  | 'billing.manage'
  | 'capabilities.manage'
  | 'chat.preferences'
  | 'config.manage'
  | 'cron.manage'
  | 'developerTools'
  | 'gateways.manage'
  | 'keybinds'
  | 'logs.raw'
  | 'memory.manage'
  | 'messaging.manage'
  | 'notifications'
  | 'profiles.manage'
  | 'providers.manage'
  | 'sessions.read'
  | 'skills.marketplace'
  | 'terminal'
  | 'uninstall'
  | 'usage.read'
  | 'version.read'

const EMPLOYEE_CAPABILITIES: Readonly<Record<EmployeeFeature, boolean>> = {
  appearance: true,
  'artifacts.read': true,
  'billing.manage': false,
  'capabilities.manage': false,
  'chat.preferences': true,
  'config.manage': false,
  'cron.manage': false,
  developerTools: false,
  'gateways.manage': true,
  keybinds: true,
  'logs.raw': false,
  'memory.manage': false,
  'messaging.manage': true,
  notifications: true,
  'profiles.manage': false,
  'providers.manage': true,
  'sessions.read': true,
  'skills.marketplace': false,
  terminal: false,
  uninstall: false,
  'usage.read': true,
  'version.read': true
}

export function isEmployeeFeatureAvailable(
  feature: EmployeeFeature,
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): boolean {
  return !managedEmployeeMode || EMPLOYEE_CAPABILITIES[feature]
}

/**
 * Keep feature-owned data out of shared employee surfaces without deleting it
 * or changing the upstream feature implementation.
 */
export function employeeFeatureItems<T>(
  feature: EmployeeFeature,
  items: readonly T[],
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): readonly T[] {
  return isEmployeeFeatureAvailable(feature, managedEmployeeMode) ? items : []
}

/** Keep the employee channel roster on the four company-approved gateways. */
export function employeeMessagingPlatformItems<T extends { readonly id: string }>(
  items: readonly T[],
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): readonly T[] {
  return managedEmployeeMode ? items.filter(item => EMPLOYEE_MESSAGING_PLATFORM_IDS.has(item.id)) : items
}

/** Project the approved employee roster to concise Chinese product names without mutating gateway data. */
export function employeeMessagingPlatformName(
  platform: { readonly id: string; readonly name: string },
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): string {
  return managedEmployeeMode ? (EMPLOYEE_MESSAGING_PLATFORM_NAMES[platform.id] ?? platform.name) : platform.name
}

/** Project upstream product branding to My King without mutating source data. */
export function employeeVisibleBrandText(text: string, managedEmployeeMode = MANAGED_EMPLOYEE_MODE): string {
  return managedEmployeeMode ? text.replace(/hermes/gi, 'My King') : text
}

/** Apply the same channel allowlist to messaging history projected in chat. */
export function employeeMessagingSessionItems<T extends { readonly source?: null | string }>(
  items: readonly T[],
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): readonly T[] {
  return managedEmployeeMode
    ? items.filter(item => item.source != null && EMPLOYEE_MESSAGING_SESSION_SOURCES.has(item.source))
    : items
}

/** Managed builds always resolve a requested or persisted skin to My King glass. */
export function employeeThemeName(requestedName: string, managedEmployeeMode = MANAGED_EMPLOYEE_MODE): string {
  return managedEmployeeMode ? MANAGED_EMPLOYEE_THEME_NAME : requestedName
}

/** Preserve upstream theme data while exposing only the branded skin. */
export function employeeThemeItems<T extends { readonly name: string }>(
  items: readonly T[],
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): readonly T[] {
  return managedEmployeeMode ? items.filter(item => item.name === MANAGED_EMPLOYEE_THEME_NAME) : items
}

export function isEmployeeAppearanceSettingAvailable(
  setting: string,
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): boolean {
  return !managedEmployeeMode || !MANAGED_EMPLOYEE_HIDDEN_APPEARANCE_SETTINGS.has(setting)
}

/** Settings tabs that remain useful without changing the managed backend. */
export function isEmployeeSettingsViewAvailable(view: string, managedEmployeeMode = MANAGED_EMPLOYEE_MODE): boolean {
  if (!managedEmployeeMode) {
    return true
  }

  if (view === 'about' || view === 'sessions') {
    return true
  }

  if (view === 'notifications' || view === 'keybinds') {
    return true
  }

  if (view === 'gateway' || view === 'keys' || view === 'providers') {
    return true
  }

  return view === 'config:appearance' || view === 'config:chat'
}

/** Main navigation/page routes that are safe in the employee shell. */
export function isEmployeeRouteAvailable(
  pathname: string,
  search = '',
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): boolean {
  if (!managedEmployeeMode) {
    return true
  }

  if (pathname === '/settings') {
    const tab = new URLSearchParams(search).get('tab') ?? 'config:appearance'

    return isEmployeeSettingsViewAvailable(tab, managedEmployeeMode)
  }

  if (pathname === '/command-center') {
    const section = new URLSearchParams(search).get('section') ?? 'sessions'

    return section === 'sessions' || section === 'usage'
  }

  return !new Set(['/agents', '/cron', '/profiles', '/starmap', '/webhooks']).has(pathname)
}

/**
 * Safe replacement for a blocked deep link. A restricted Settings/Command
 * Center link stays in the same shell; management pages fall back to chat.
 */
export function managedEmployeeRedirect(pathname: string, search = ''): string | null {
  if (isEmployeeRouteAvailable(pathname, search)) {
    return null
  }

  if (pathname === '/settings') {
    return '/settings?tab=about'
  }

  if (pathname === '/command-center') {
    return '/command-center?section=sessions'
  }

  return '/'
}

const BLOCKED_PALETTE_IDS = new Set([
  'appearance-mode',
  'appearance-theme',
  'cc-system',
  'hermes-bots:new-agent',
  'logs.toggle',
  'nav-agents',
  'nav-cron',
  'nav-profiles',
  'nav-starmap',
  'plugins.reload',
  'profile.export',
  'profile.import',
  'session.yolo',
  'theme-install',
  'view.toggleTabStrip'
])

const BLOCKED_PALETTE_PREFIXES = ['mode-', 'search-mode-', 'search-theme-', 'theme-'] as const

/** Stable command IDs are filtered at one registry boundary. */
export function isEmployeePaletteItemAvailable(id: string, managedEmployeeMode = MANAGED_EMPLOYEE_MODE): boolean {
  if (!managedEmployeeMode) {
    return true
  }

  // Registry contributions can prepend several source namespaces. Match an
  // exact stable id or the same id after a colon boundary so adding/removing
  // an upstream source prefix cannot reopen a blocked management command.
  const blockedById = [...BLOCKED_PALETTE_IDS, 'view.showTerminal'].some(
    blockedId => id === blockedId || id.endsWith(`:${blockedId}`)
  )

  const stableId = id.slice(id.lastIndexOf(':') + 1)
  const blocked = blockedById || BLOCKED_PALETTE_PREFIXES.some(prefix => stableId.startsWith(prefix))

  if (blocked) {
    return false
  }

  const settingsPrefix = id.startsWith('set-') ? 'set-' : id.startsWith('sp-') ? 'sp-' : null

  if (!settingsPrefix) {
    return true
  }

  const settingsId = id.slice(settingsPrefix.length)

  if (settingsId.startsWith('config-field:')) {
    return false
  }

  if (settingsId.startsWith('config-')) {
    return isEmployeeSettingsViewAvailable(`config:${settingsId.slice('config-'.length)}`, managedEmployeeMode)
  }

  return isEmployeeSettingsViewAvailable(settingsId, managedEmployeeMode)
}

export function isEmployeeKeybindActionAvailable(
  id: string,
  managedEmployeeMode = MANAGED_EMPLOYEE_MODE
): boolean {
  if (!managedEmployeeMode) {
    return true
  }

  const stableId = id.slice(id.lastIndexOf(':') + 1)

  if (stableId.startsWith('profile.') || stableId === 'nav.profiles') {
    return isEmployeeFeatureAvailable('profiles.manage', managedEmployeeMode)
  }

  if (stableId === 'nav.cron') {
    return isEmployeeFeatureAvailable('cron.manage', managedEmployeeMode)
  }

  if (stableId === 'nav.agents') {
    return isEmployeeFeatureAvailable('capabilities.manage', managedEmployeeMode)
  }

  if (/^view\.(?:show|new|next|prev|close|terminal)/.test(stableId) && stableId.toLowerCase().includes('terminal')) {
    return isEmployeeFeatureAvailable('terminal', managedEmployeeMode)
  }

  if (stableId === 'layout.editMode') {
    return isEmployeeFeatureAvailable('config.manage', managedEmployeeMode)
  }

  if (stableId === 'appearance.toggleMode') {
    return isEmployeeAppearanceSettingAvailable('appearance.theme', managedEmployeeMode)
  }

  if (stableId === 'view.toggleTabStrip') {
    return isEmployeeAppearanceSettingAvailable('appearance.tab-strip', managedEmployeeMode)
  }

  return true
}
