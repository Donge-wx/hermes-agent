import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { useI18n } from '@/i18n'
import { BRAND } from '@/lib/brand'
import { isEmployeeFeatureAvailable } from '@/lib/managed-employee-policy'
import { $desktopVersion, refreshDesktopVersion } from '@/store/updates'

import { SettingsContent } from './primitives'
import { UninstallSection } from './uninstall-section'

export function AboutSettings() {
  const { t } = useI18n()
  const a = t.settings.about
  const version = useStore($desktopVersion)

  // The version atom is loaded once at app boot, which makes About show a
  // stale number after a self-update (the running binary is current, the
  // displayed string is not). Re-read on mount so opening About always
  // reflects the running build.
  useEffect(() => {
    void refreshDesktopVersion()
  }, [])

  return (
    <SettingsContent>
      <div className="flex flex-col items-center gap-3 pt-6 pb-2 text-center" data-slot="about-brand-stage">
        <BrandMark className="size-32" data-slot="about-brand-mark" />
        <p data-slot="about-tagline">{BRAND.tagline}</p>
        <div data-slot="about-version-stack">
          <h2 className="text-lg font-semibold tracking-tight">{a.heading}</h2>
          {version ? (
            <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span data-slot="desktop-package-version">{a.desktopPackageVersion(version.desktopPackageVersion)}</span>
              <span aria-hidden>·</span>
              <span data-slot="backend-runtime-version">{a.backendRuntimeVersion(version.appVersion)}</span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{a.versionUnavailable}</p>
          )}
        </div>
      </div>

      {isEmployeeFeatureAvailable('uninstall') && <UninstallSection />}
    </SettingsContent>
  )
}
