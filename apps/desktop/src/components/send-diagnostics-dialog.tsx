// Send Diagnostics — the consent-gated debug-bundle upload dialog.
//
// Rendered globally (wiring.tsx, beside ConfirmHost) and driven by the
// $sendDiagnostics store: any surface (the failed-turn error card today)
// opens it via requestSendDiagnostics(). Three faces:
//   consent   — privacy notice (what's collected, who can see it, retention)
//               with an explicit Upload button; nothing is sent before it.
//   uploading — spinner while the backend collects, redacts and uploads.
//   done      — the private view link (copyable) + where to pick up the
//               discussion: GitHub Issues · Nous Portal Support · Discord.
import { useStore } from '@nanostores/react'

import { ActionStatus } from '@/components/ui/action-status'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ErrorState } from '@/components/ui/error-state'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { ExternalLink, Lock } from '@/lib/icons'
import { $sendDiagnostics, confirmSendDiagnostics, dismissSendDiagnostics } from '@/store/send-diagnostics'

const SUPPORT_LINKS = [
  { key: 'github', url: 'https://github.com/NousResearch/hermes-agent/issues' },
  { key: 'portal', url: 'https://portal.nousresearch.com/help' },
  { key: 'discord', url: 'https://discord.gg/NousResearch' }
] as const

export function SendDiagnosticsHost() {
  const { t } = useI18n()
  const copy = t.sendDiagnostics
  const state = useStore($sendDiagnostics)

  if (!state) {
    return null
  }

  const busy = state.phase === 'uploading'

  return (
    // Dismissal is allowed in EVERY phase, including mid-upload: the store's
    // generation guard makes a dismissed upload's completion a no-op, so Esc/
    // backdrop/Cancel are always an immediate way out (cancellation of the
    // in-flight request itself stays best-effort).
    <Dialog onOpenChange={open => (!open ? dismissSendDiagnostics() : undefined)} open>
      <DialogContent className="max-w-[30rem]" data-send-diagnostics="">
        {state.phase === 'consent' || state.phase === 'uploading' ? (
          <>
            <DialogHeader>
              <DialogTitle icon={Lock}>{copy.title}</DialogTitle>
              <DialogDescription className="whitespace-pre-line text-left">{copy.privacyNotice}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={dismissSendDiagnostics} variant="ghost">
                {copy.cancel}
              </Button>
              <Button disabled={busy} onClick={() => void confirmSendDiagnostics()}>
                <ActionStatus
                  busy={copy.uploading}
                  done={copy.uploading}
                  idle={copy.upload}
                  state={busy ? 'saving' : 'idle'}
                />
              </Button>
            </DialogFooter>
          </>
        ) : state.phase === 'error' ? (
          <ErrorState
            description={
              <DialogDescription className="whitespace-pre-line text-center">
                {state.error}
                {'\n'}
                {copy.failedHint}
              </DialogDescription>
            }
            title={<DialogTitle className="text-center">{copy.failedTitle}</DialogTitle>}
          >
            <DialogFooter>
              <Button onClick={dismissSendDiagnostics} variant="ghost">
                {copy.close}
              </Button>
            </DialogFooter>
          </ErrorState>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{copy.doneTitle}</DialogTitle>
              <DialogDescription className="text-left">{copy.doneDescription}</DialogDescription>
            </DialogHeader>
            {(state.result?.viewUrl || state.result?.uploadId) && (
              <div
                className="flex items-center gap-2 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2"
                data-slot="send-diagnostics-result"
              >
                <code className="min-w-0 flex-1 truncate text-[0.78rem] text-(--ui-text-secondary)">
                  {state.result.viewUrl ?? copy.uploadIdFallback(state.result.uploadId ?? '')}
                </code>
                <CopyButton
                  appearance="inline"
                  label={copy.copyLink}
                  text={state.result.viewUrl ?? state.result.uploadId ?? ''}
                />
              </div>
            )}
            <div className="text-[0.8rem] text-(--ui-text-secondary)">{copy.handoffLead}</div>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORT_LINKS.map(link => (
                <Button key={link.key} onClick={() => openExternalLink(link.url)} size="sm" variant="outline">
                  <ExternalLink />
                  {copy.links[link.key]}
                </Button>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={dismissSendDiagnostics} variant="ghost">
                {copy.close}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
