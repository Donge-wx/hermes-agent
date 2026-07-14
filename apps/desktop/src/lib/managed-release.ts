/**
 * VanYue desktop releases are distributed by the administrator as complete
 * installers. Upstream Hermes self-update would rebuild the app from the
 * public source tree and silently remove the branded UI and employee-specific
 * history/upload fixes, so it is intentionally disabled in this release fork.
 */
export const IS_VANYUE_MANAGED_RELEASE = true
