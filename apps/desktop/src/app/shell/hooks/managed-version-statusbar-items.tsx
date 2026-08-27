import { Hash } from '@/lib/icons'
import { resolveVersionStatus, type VersionStatusCopy } from '@/lib/version-status'

import type { StatusbarItem } from '../statusbar-controls'

type ManagedVersionStatusbarCopy = VersionStatusCopy & {
  readonly toggleBackendVersion: string
  readonly toggleVersion: string
}

interface ManagedVersionStatusbarItemsOptions {
  readonly appVersion: null | string | undefined
  readonly backendVersion: null | string | undefined
  readonly copy: ManagedVersionStatusbarCopy
  readonly desktopPackageVersion: null | string | undefined
  readonly remote: boolean
}

/**
 * Builds the two read-only version rows from already-resolved desktop and
 * gateway facts. Version updates stay owned by the update surfaces.
 */
export function createManagedVersionStatusbarItems({
  appVersion,
  backendVersion,
  copy,
  desktopPackageVersion,
  remote
}: ManagedVersionStatusbarItemsOptions): readonly StatusbarItem[] {
  const clientStatus = resolveVersionStatus({
    applying: false,
    copy,
    remote,
    restarting: false,
    target: 'client',
    version: desktopPackageVersion ?? appVersion
  })

  const clientItem: StatusbarItem = {
    detail: clientStatus.detail,
    hidden: clientStatus.unknown,
    icon: <Hash className="size-3" />,
    id: 'version-client',
    label: clientStatus.label,
    lockedVisible: true,
    title: clientStatus.tooltip,
    toggleLabel: copy.toggleVersion,
    variant: 'text'
  }

  if (!remote) {
    return [clientItem]
  }

  const backendStatus = resolveVersionStatus({
    applying: false,
    copy,
    remote: true,
    restarting: false,
    target: 'backend',
    version: backendVersion
  })

  return [
    clientItem,
    {
      hidden: backendStatus.unknown,
      icon: <Hash className="size-3" />,
      id: 'version-backend',
      label: backendStatus.label,
      lockedVisible: true,
      title: backendStatus.tooltip,
      toggleLabel: copy.toggleBackendVersion,
      variant: 'text'
    }
  ]
}
