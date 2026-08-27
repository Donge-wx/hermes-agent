import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

import { createManagedVersionStatusbarItems } from './managed-version-statusbar-items'

const copy = en.shell.statusbar

describe('createManagedVersionStatusbarItems', () => {
  it('uses the desktop package version before the backend runtime fallback', () => {
    // Given: a desktop install reports both independently versioned packages.
    const desktopItems = createManagedVersionStatusbarItems({
      appVersion: '9.9.9',
      copy,
      desktopPackageVersion: '0.17.0',
      remote: false,
      backendVersion: null
    })

    // When: the statusbar derives its managed version items.
    const client = desktopItems[0]

    // Then: the client row names the desktop package and carries the original read-only chrome.
    expect(desktopItems.map(item => item.id)).toEqual(['version-client'])
    expect(client).toMatchObject({
      hidden: false,
      id: 'version-client',
      label: 'v0.17.0',
      lockedVisible: true,
      title: 'My King Desktop v0.17.0',
      toggleLabel: copy.toggleVersion,
      variant: 'text'
    })
    expect(client?.icon).toMatchObject({ props: { className: 'size-3' } })
    expect(client).not.toHaveProperty('onSelect')
  })

  it('adds the backend version after the client only for a remote connection', () => {
    // Given: a remote desktop reports both client and backend versions.
    const remoteItems = createManagedVersionStatusbarItems({
      appVersion: '0.16.0',
      backendVersion: '0.17.1',
      copy,
      desktopPackageVersion: '0.17.0',
      remote: true
    })

    // When: the statusbar derives its managed version items.
    const remoteIds = remoteItems.map(item => item.id)
    const backend = remoteItems[1]

    // Then: the two read-only rows preserve their client-first order and backend labels.
    expect(remoteIds).toEqual(['version-client', 'version-backend'])
    expect(backend).toMatchObject({
      hidden: false,
      id: 'version-backend',
      label: 'My King backend v0.17.1',
      lockedVisible: true,
      title: 'My King backend v0.17.1',
      toggleLabel: copy.toggleBackendVersion,
      variant: 'text'
    })
    expect(backend?.icon).toMatchObject({ props: { className: 'size-3' } })
    expect(backend).not.toHaveProperty('onSelect')
  })
})
