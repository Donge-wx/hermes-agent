import { BrandLockup } from '../components/brand-mark'
import { HackeryButton } from '../components/hackery-button'
import { copy } from '../i18n'
import { startInstall } from '../store'

/*
 * Welcome screen.
 *
 * Mirrors the desktop's chat intro (apps/desktop/src/components/chat/intro.tsx):
 *   - HERMES AGENT wordmark rendered in Collapse Bold, uppercase, tracked
 *   - mix-blend-plus-lighter so the type "glows" on the canvas
 *   - fit-text utility so the wordmark sizes itself to the column
 *
 * No install-path footer. The default install location is correct for
 * 99% of users; the rest will use the CLI installer with a -HermesHome
 * flag. Showing %LOCALAPPDATA% to grandma is developer-brain.
 */
export default function Welcome() {
  return (
    <div className="hermes-fade-in flex h-full flex-col items-center justify-center gap-10 px-12 py-10">
      {/* Approved My King lockup — shared with the desktop renderer masters. */}
      <div className="w-full max-w-2xl min-w-0 text-center">
        <BrandLockup className="mx-auto mb-6 max-w-xl" />

        <p className="m-0 text-center text-base leading-normal tracking-tight text-muted-foreground">
          {copy.welcome.description}
        </p>
      </div>

      <HackeryButton label={copy.welcome.install} onClick={() => void startInstall()} />
    </div>
  )
}
