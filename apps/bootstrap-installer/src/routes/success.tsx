import { AlertCircle } from 'lucide-react'
import { useState } from 'react'

import { BrandLockup } from '../components/brand-mark'
import { HackeryButton } from '../components/hackery-button'
import { copy } from '../i18n'
import { launchHermesDesktop } from '../store'

/*
 * Success screen. HERMES AGENT wordmark stays as the visual anchor
 * (same Collapse Bold treatment as Welcome + the desktop chat intro),
 * with a status line below.
 *
 * Launching the desktop can fail (e.g. Stage-Desktop was skipped and
 * Hermes.exe doesn't exist). We catch the Tauri error and surface it
 * inline rather than silently doing nothing — the previous version
 * had `onClick={() => void launchHermesDesktop()}` which swallowed
 * the rejection and left the user staring at an unresponsive button.
 */
export default function Success() {
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)

  async function handleLaunch() {
    setError(null)
    setLaunching(true)

    try {
      await launchHermesDesktop()
      // On success the installer exits — control never returns here.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLaunching(false)
    }
  }

  return (
    <div className="hermes-fade-in flex h-full flex-col items-center justify-center gap-8 px-12 py-10">
      <div className="w-full max-w-2xl min-w-0 text-center">
        <BrandLockup className="mx-auto mb-6 max-w-xl" />

        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-foreground">{copy.success.title}</h1>

        <p className="m-0 text-center text-base leading-normal tracking-tight text-muted-foreground">
          {copy.success.description}{' '}
          <code className="font-mono text-sm text-foreground/80" title={copy.success.compatibility}>
            hermes desktop
          </code>
          。
        </p>
      </div>

      <HackeryButton
        disabled={launching}
        label={launching ? copy.success.launching : copy.success.launch}
        loading={launching}
        onClick={() => void handleLaunch()}
      />

      {error && (
        <div className="flex max-w-2xl items-start gap-2 text-sm" role="alert">
          <AlertCircle className="mt-0.5 shrink-0 text-destructive" size={16} />
          <div className="min-w-0">
            <div className="font-medium text-destructive">{copy.success.failed}</div>
            <div className="mt-0.5 text-muted-foreground">{error}</div>
          </div>
        </div>
      )}
    </div>
  )
}
