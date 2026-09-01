import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [diagnostics, setDiagnostics] = useState<readonly string[] | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [gateNode, setGateNode] = useState<HTMLDivElement | null>(null)
  const [gateDismissed, setGateDismissed] = useState(false)
  const [sawEnrollmentProgress, setSawEnrollmentProgress] = useState(false)
  const [unbindOpen, setUnbindOpen] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

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
  const canSubmit = email.trim().length > 0 && password.length >= 8 && !busy

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

  useEffect(() => {
    if (placement !== 'gate' || !gateNode) {
      return
    }

    const appRoot = document.getElementById('root')

    if (!appRoot || appRoot.contains(gateNode)) {
      return
    }

    const wasInert = appRoot.inert === true
    appRoot.inert = true

    return () => {
      appRoot.inert = wasInert
    }
  }, [gateNode, placement])

  const run = async (operation: () => Promise<MyKingEmployeeEnrollmentStatus>) => {
    setSubmitting(true)

    try {
      setStatus(await operation())
    } catch (error) {
      try {
        if (!api) {
          throw new Error('Employee enrollment is unavailable.')
        }

        setStatus(await api.getStatus())
      } catch (statusError) {
        if (!(statusError instanceof Error)) {
          throw statusError
        }

        setStatus(current => (current ? { ...current, error: enrollmentErrorCode(error), stage: 'error' } : current))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const diagnosticsBody = useMemo(
    () => (diagnostics && diagnostics.length > 0 ? diagnostics.join('\n') : (errorCopy ?? copy.diagnosticsEmpty)),
    [copy.diagnosticsEmpty, diagnostics, errorCopy]
  )

  if (!api || !status || !status.configured || status.managedGateway || (placement === 'gate' && gateDismissed)) {
    return null
  }

  const content = (
    <section className="employee-enrollment" data-placement={placement} data-slot="employee-enrollment">
      <header className="employee-enrollment__header">
        {placement === 'gate' ? <BrandMark className="employee-enrollment__brand" decorative={false} /> : <Link2 />}
        <div>
          {placement === 'gate' ? (
            <DialogPrimitive.Title asChild>
              <h2>{connected ? copy.connectedTitle : copy.title}</h2>
            </DialogPrimitive.Title>
          ) : (
            <h2>{connected ? copy.connectedTitle : copy.title}</h2>
          )}
          {placement === 'gate' ? (
            <DialogPrimitive.Description asChild>
              <p className={connected ? 'sr-only' : undefined}>{connected ? copy.secureConnection : copy.description}</p>
            </DialogPrimitive.Description>
          ) : !connected ? (
            <p>{copy.description}</p>
          ) : null}
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

          <form
            className="employee-enrollment__entry"
            onSubmit={event => {
              event.preventDefault()
              if (!canSubmit || errorCode === 'permission-required') {
                return
              }

              const credentials = { email: email.trim(), password }
              setPassword('')
              void run(() => api.login(credentials))
            }}
          >
            {errorCode === 'permission-required' ? (
              <Button disabled={busy} onClick={() => void run(() => api.enroll(''))} type="button">
                {copy.reauthorize}
              </Button>
            ) : (
              <>
                <div className="employee-enrollment__credentials">
                  <Input
                    aria-label={copy.emailPlaceholder}
                    autoComplete="username"
                    disabled={busy}
                    inputMode="email"
                    onChange={event => setEmail(event.target.value)}
                    placeholder={copy.emailPlaceholder}
                    ref={emailInputRef}
                    type="email"
                    value={email}
                  />
                  <Input
                    aria-label={copy.passwordPlaceholder}
                    autoComplete="current-password"
                    disabled={busy}
                    onChange={event => setPassword(event.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    type="password"
                    value={password}
                  />
                </div>
                <Button disabled={!canSubmit} type="submit">
                  {copy.connect}
                </Button>
              </>
            )}
          </form>
        </>
      )}

      <footer className="employee-enrollment__actions">
        {connected ? (
          <Button disabled={busy} onClick={() => void run(api.check)} variant="text">
            <RefreshCw /> {copy.recheck}
          </Button>
        ) : null}
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
        {status.binding ? (
          <Button onClick={() => setUnbindOpen(true)} variant="text">
            {copy.unbind}
          </Button>
        ) : null}
      </footer>

      <Dialog onOpenChange={setDiagnosticsOpen} open={diagnosticsOpen}>
        <DialogContent portalContainer={placement === 'gate' ? gateNode : null}>
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
        portalContainer={placement === 'gate' ? gateNode : null}
        title={copy.unbindTitle}
      />
    </section>
  )

  return placement === 'gate' ? (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-modal="true"
          className="employee-enrollment-gate fixed inset-0 z-(--z-crash) grid place-items-center"
          data-glass-opaque=""
          data-slot="employee-enrollment-gate"
          onCloseAutoFocus={event => {
            event.preventDefault()
            previousFocusRef.current?.focus()
          }}
          onEscapeKeyDown={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
          onOpenAutoFocus={event => {
            event.preventDefault()
            previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            emailInputRef.current?.focus()
          }}
          onPointerDownOutside={event => event.preventDefault()}
          ref={setGateNode}
        >
          {content}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  ) : (
    content
  )
}
