import { useStore } from '@nanostores/react'
import { FileText, RefreshCw } from 'lucide-react'

import { BrandMark } from '../components/brand-mark'
import { Button } from '../components/button'
import { copy } from '../i18n'
import { $logPath, $mode, type BootstrapStateModel, openLogDir, startInstall, startUpdate } from '../store'

interface FailureProps {
  bootstrap: BootstrapStateModel
}

/*
 * Failure screen. Same hero treatment as Welcome/Success — the wordmark
 * carries the brand, so we keep it across every terminal state.
 *
 * The actual error message lives below in muted text. Two affordances on
 * shared Button tokens: Retry (primary) and Open logs (quiet text link).
 */
export default function Failure({ bootstrap }: FailureProps) {
  const logPath = useStore($logPath)
  const mode = useStore($mode)
  const isUpdate = mode === 'update'

  return (
    <div className="hermes-fade-in flex h-full flex-col items-center justify-center gap-6 px-12 py-10">
      <div className="w-full max-w-xl min-w-0 text-center">
        <BrandMark className="mx-auto mb-5 size-16" />
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-foreground">
          {isUpdate ? copy.failure.updateTitle : copy.failure.installTitle}
        </h1>

        <p className="m-0 mx-auto rounded-2xl border border-destructive/20 bg-destructive/[0.045] px-4 py-3 text-center text-sm leading-normal tracking-tight text-muted-foreground">
          {bootstrap.error ?? (isUpdate ? copy.failure.updateFallback : copy.failure.installFallback)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button className="gap-1.5" onClick={() => void (isUpdate ? startUpdate() : startInstall())}>
          <RefreshCw />
          {isUpdate ? copy.failure.retryUpdate : copy.failure.retryInstall}
        </Button>
        <Button className="gap-1.5" onClick={() => void openLogDir()} variant="text">
          <FileText />
          {copy.failure.openLogs}
        </Button>
      </div>

      {logPath && (
        <p className="max-w-lg text-center text-xs text-muted-foreground/70">
          {copy.failure.log}：<code className="font-mono">{logPath}</code>
        </p>
      )}
    </div>
  )
}
