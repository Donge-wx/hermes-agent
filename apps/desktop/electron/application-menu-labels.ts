export const PUBLIC_APP_NAME = 'My King' as const
export const PUBLIC_APP_COPYRIGHT = 'Copyright © 2026 My King' as const
export const MY_KING_APP_ID = 'com.myking.workos.desktop' as const
export const MY_KING_PROTOCOL = 'myking' as const
export const MY_KING_HOME_DIRNAME = '.myking' as const
export const MY_KING_WINDOWS_HOME_DIRNAME = 'myking' as const
export const MY_KING_USER_DATA_DIRNAME = 'My King' as const

const DEFAULT_INTERNAL_APP_NAME = PUBLIC_APP_NAME

export function resolveApplicationIdentity(internalNameOverride?: string) {
  return {
    internalName: internalNameOverride || DEFAULT_INTERNAL_APP_NAME,
    publicName: PUBLIC_APP_NAME
  } as const
}

export function buildApplicationMenuRoleLabels() {
  return {
    hide: `Hide ${PUBLIC_APP_NAME}`,
    quit: `Quit ${PUBLIC_APP_NAME}`
  } as const
}

export function buildApplicationMenuRoleItems() {
  const labels = buildApplicationMenuRoleLabels()

  return {
    hide: { label: labels.hide, role: 'hide' },
    quit: { label: labels.quit, role: 'quit' }
  } as const
}
