import { useEffect, useMemo, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ErrorBanner } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Loader } from '@/components/ui/loader'
import { LogView } from '@/components/ui/log-view'
import type { MyKingEmployeeEnrollmentStage, MyKingEmployeeEnrollmentStatus } from '@/global'
import { useI18n } from '@/i18n'
import { Check, FileText, Link2, Lock, Monitor, Network, RefreshCw, Users } from '@/lib/icons'

type EnrollmentApi = NonNullable<Window['hermesDesktop']['employeeEnrollment']>
type Placement = 'gate' | 'settings'

const ACTIVE_STAGES = [
  'validating-invitation',
  'confirming-identity',
  'configuring-secure-connection',
  'enabling-device-access',
  'connecting-remote-gateway',
  'verifying-isolation'
] as const satisfies readonly MyKingEmployeeEnrollmentStage[]

function enrollmentErrorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }

  return 'connector-failed'
}

function EnrollmentFacts({ status }: { status: MyKingEmployeeEnrollmentStatus }) {
  const { locale, t } = useI18n()
  const copy = t.settings.gateway.employeeEnrollment
  const binding = status.binding

  if (!binding) {
    return null
  }

  const recent = binding.lastCheckAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(binding.lastCheckAt))
    : copy.neverChecked

  const facts = [
    { icon: Users, label: copy.employee, value: binding.employeeName },
    { icon: Monitor, label: copy.localAccess, value: copy.normal },
    { icon: Network, label: copy.remoteGateway, value: copy.normal },
    { icon: Lock, label: copy.secureConnection, value: copy.normal }
  ]

  return (
    <div className="employee-enrollment__facts" data-slot="employee-enrollment-facts">
      {facts.map(({ icon: Icon, label, value }) => (
        <div className="employee-enrollment__fact" key={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <div className="employee-enrollment__recent">
        <span>{copy.recentCheck}</span>
        <time dateTime={binding.lastCheckAt ?? undefined}>{recent}</time>
      </div>
    </div>
  )
}

export function MyKingEmployeeEnrollmentAssistant({ placement = 'settings' }: { placement?: Placement }) {
  const { t } = useI18n()
  const copy = t.settings.gateway.employeeEnrollment
  const api: EnrollmentApi | undefined = window.hermesDesktop?.employeeEnrollment
  const [status, setStatus] = useState<MyKingEmployeeEnrollmentStatus | null>(null)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [diagnostics, setDiagnostics] = useState<readonly string[] | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [gateDismissed, setGateDismissed] = useState(false)
  const [sawEnrollmentProgress, setSawEnrollmentProgress] = useState(false)
  const [unbindOpen, setUnbindOpen] = useState(false)

  useEffect(() => {
    if (!api) {
      return
    }

    let cancelled = false
    let receivedEvent = false

    const dispose = api.onStatus(next => {
      receivedEvent = true
      setStatus(next)
    })

    void api.getStatus().then(next => {
      if (!cancelled && !receivedEvent) {
        setStatus(next)
      }
    })

    return () => {
      cancelled = true
      dispose()
    }
  }, [api])

  const activeStageIndex = status ? ACTIVE_STAGES.indexOf(status.stage as (typeof ACTIVE_STAGES)[number]) : -1
  const busy = submitting || activeStageIndex >= 0
  const connected = Boolean(status?.binding && status.connectorReady && !status.error)
  const errorCode = status?.error ?? (status?.binding && !status.connectorReady ? 'secure-connection-failed' : null)
  const errorCopy = errorCode ? (copy.errors[errorCode] ?? copy.errors['connector-failed']) : null
  const stageCopy = status ? (copy.stages[status.stage] ?? copy.stages.idle) : copy.stages.idle
  const canSubmit = code.trim().length > 0 && !busy

  useEffect(() => {
    if (placement !== 'gate' || !status) {
      return
    }

    if (activeStageIndex >= 0) {
      setSawEnrollmentProgress(true)
      setGateDismissed(false)

      return
    }

    if (!connected) {
      setGateDismissed(false)

      return
    }

    if (!sawEnrollmentProgress) {
      setGateDismissed(true)

      return
    }

    const timer = window.setTimeout(() => setGateDismissed(true), 1_800)

    return () => window.clearTimeout(timer)
  }, [activeStageIndex, connected, placement, sawEnrollmentProgress, status])

  const run = async (operation: () => Promise<MyKingEmployeeEnrollmentStatus>) => {
    setSubmitting(true)

    try {
      setStatus(await operation())
    } catch (error) {
      setStatus(current => (current ? { ...current, error: enrollmentErrorCode(error), stage: 'error' } : current))
    } finally {
      setSubmitting(false)
    }
  }

  const diagnosticsBody = useMemo(
    () => (diagnostics && diagnostics.length > 0 ? diagnostics.join('\n') : copy.diagnosticsEmpty),
    [copy.diagnosticsEmpty, diagnostics]
  )

  if (!api || !status || !status.configured || status.managedGateway || (placement === 'gate' && gateDismissed)) {
    return null
  }

  const content = (
    <section className="employee-enrollment" data-placement={placement} data-slot="employee-enrollment">
      <header className="employee-enrollment__header">
        {placement === 'gate' ? <BrandMark className="employee-enrollment__brand" decorative={false} /> : <Link2 />}
        <div>
          <h2>{connected ? copy.connectedTitle : copy.title}</h2>
          {!connected ? <p>{copy.description}</p> : null}
        </div>
      </header>

      {connected ? (
        <EnrollmentFacts status={status} />
      ) : (
        <>
          {busy ? (
            <div aria-live="polite" className="employee-enrollment__progress" data-slot="employee-enrollment-progress">
              <div className="employee-enrollment__current">
                <Loader label={stageCopy} type="lemniscate-bloom" />
                <strong>{stageCopy}</strong>
              </div>
              <ol>
                {ACTIVE_STAGES.map((stage, index) => (
                  <li data-state={index < activeStageIndex ? 'complete' : index === activeStageIndex ? 'active' : 'pending'} key={stage}>
                    <span>{index < activeStageIndex ? <Check aria-hidden="true" /> : index + 1}</span>
                    {index < activeStageIndex
                      ? (copy.completedStages[stage] ?? copy.stages[stage])
                      : index === activeStageIndex
                        ? copy.stages[stage]
                        : (copy.pendingStages[stage] ?? copy.stages[stage])}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {errorCopy ? <ErrorBanner>{errorCopy}</ErrorBanner> : null}

          <div className="employee-enrollment__entry">
            {errorCode === 'permission-required' ? (
              <Button disabled={busy} onClick={() => void run(() => api.enroll(''))}>
                {copy.reauthorize}
              </Button>
            ) : (
              <>
                <Input
                  aria-label={copy.codePlaceholder}
                  disabled={busy}
                  onChange={event => setCode(event.target.value)}
                  placeholder={copy.codePlaceholder}
                  value={code}
                />
                <Button
                  disabled={!canSubmit}
                  onClick={() => {
                    const submittedCode = code.trim()
                    setCode('')
                    void run(() => api.enroll(submittedCode))
                  }}
                >
                  {copy.connect}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      <footer className="employee-enrollment__actions">
        <Button disabled={busy} onClick={() => void run(api.check)} variant="text">
          <RefreshCw /> {connected ? copy.recheck : copy.check}
        </Button>
        <Button
          onClick={() => {
            setDiagnostics(null)
            setDiagnosticsOpen(true)
            void api.diagnostics().then(result => setDiagnostics(result.lines))
          }}
          variant="textStrong"
        >
          <FileText /> {copy.diagnostics}
        </Button>
        {connected ? (
          <Button onClick={() => setUnbindOpen(true)} variant="text">
            {copy.unbind}
          </Button>
        ) : null}
      </footer>

      <Dialog onOpenChange={setDiagnosticsOpen} open={diagnosticsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle icon={FileText}>{copy.diagnosticsTitle}</DialogTitle>
            <DialogDescription>{copy.diagnostics}</DialogDescription>
          </DialogHeader>
          <LogView className="max-h-80">{diagnosticsBody}</LogView>
          <DialogFooter>
            <Button onClick={() => setDiagnosticsOpen(false)}>{copy.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel={copy.unbind}
        description={copy.unbindDescription}
        destructive
        onClose={() => setUnbindOpen(false)}
        onConfirm={() => run(api.unbind)}
        open={unbindOpen}
        title={copy.unbindTitle}
      />
    </section>
  )

  return placement === 'gate' ? (
    <div
      className="employee-enrollment-gate fixed inset-0 z-(--z-crash) grid place-items-center"
      data-glass-opaque=""
      data-slot="employee-enrollment-gate"
    >
      {content}
    </div>
  ) : (
    content
  )
}
