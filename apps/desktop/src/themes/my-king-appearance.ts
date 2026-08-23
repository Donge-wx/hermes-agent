import { persistString, persistStringRecord, storedString, storedStringRecord } from '@/lib/storage'

import { DEFAULT_SKIN_NAME } from './presets'

export const SKIN_KEY = 'hermes-desktop-theme-v2'
export const MODE_KEY = 'hermes-desktop-mode-v1'
export const PROFILE_SKINS_KEY = 'hermes-desktop-profile-themes-v1'
export const PROFILE_MODES_KEY = 'hermes-desktop-profile-modes-v1'
export const LAST_PROFILE_KEY = 'hermes-desktop-active-profile-v1'

const MY_KING_APPEARANCE_MIGRATION_KEY = 'my-king-liquid-glass-default-v1'

/** Move pre-My-King defaults onto the branded light glass appearance once. */
export function migrateMyKingAppearanceDefaults(): void {
  if (storedString(MY_KING_APPEARANCE_MIGRATION_KEY)) {
    return
  }

  const globalSkin = storedString(SKIN_KEY)

  if (!globalSkin || globalSkin === 'nous') {
    persistString(SKIN_KEY, DEFAULT_SKIN_NAME)
  }

  const profileSkins = storedStringRecord(PROFILE_SKINS_KEY)

  const migratedSkins = Object.fromEntries(
    Object.entries(profileSkins).map(([profile, skin]) => [profile, skin === 'nous' ? DEFAULT_SKIN_NAME : skin])
  )

  if (Object.keys(profileSkins).length > 0) {
    persistStringRecord(PROFILE_SKINS_KEY, migratedSkins)
  }

  const globalMode = storedString(MODE_KEY)

  if (!globalMode || globalMode === 'system') {
    persistString(MODE_KEY, 'light')
  }

  const profileModes = storedStringRecord(PROFILE_MODES_KEY)

  const migratedModes = Object.fromEntries(
    Object.entries(profileModes).map(([profile, mode]) => [profile, mode === 'system' ? 'light' : mode])
  )

  if (Object.keys(profileModes).length > 0) {
    persistStringRecord(PROFILE_MODES_KEY, migratedModes)
  }

  persistString(MY_KING_APPEARANCE_MIGRATION_KEY, '1')
}
