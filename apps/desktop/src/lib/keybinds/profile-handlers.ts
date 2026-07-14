import { IS_VANYUE_MANAGED_RELEASE } from '../managed-release'
import { PROFILE_SLOT_COUNT } from './actions'

export type ProfileKeybindHandlerMap = Record<string, () => void>

export interface ProfileKeybindHandlerDeps {
  createProfile: () => void
  cycleProfile: (direction: 1 | -1) => void
  navigateToProfiles: () => void
  switchToDefaultProfile: () => void
  switchToProfileSlot: (slot: number) => void
  toggleShowAllProfiles: () => void
}

/**
 * Build profile navigation handlers only for the full upstream client.
 *
 * The managed employee edition has no profile catalog entries, but this second
 * guard also keeps stale persisted bindings from reaching profile UI actions.
 */
export function buildProfileKeybindHandlers(deps: ProfileKeybindHandlerDeps): ProfileKeybindHandlerMap {
  if (IS_VANYUE_MANAGED_RELEASE) {
    return {}
  }

  const handlers: ProfileKeybindHandlerMap = {
    'nav.profiles': deps.navigateToProfiles,
    'profile.create': deps.createProfile,
    'profile.default': deps.switchToDefaultProfile,
    'profile.next': () => deps.cycleProfile(1),
    'profile.prev': () => deps.cycleProfile(-1),
    'profile.toggleAll': deps.toggleShowAllProfiles
  }

  for (let slot = 1; slot <= PROFILE_SLOT_COUNT; slot += 1) {
    handlers[`profile.switch.${slot}`] = () => deps.switchToProfileSlot(slot)
  }

  return handlers
}
