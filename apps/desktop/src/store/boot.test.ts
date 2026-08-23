import { beforeEach, describe, expect, it } from 'vitest'

import { $desktopBoot, applyDesktopBootProgress, failDesktopBoot } from './boot'

describe('desktop boot terminal state', () => {
  beforeEach(() => {
    $desktopBoot.set({
      error: null,
      fakeMode: false,
      message: 'Starting My King',
      phase: 'renderer.boot',
      progress: 6,
      running: true,
      timestamp: 1,
      visible: true
    })
  })

  it('keeps a terminal failure latched when an older running progress snapshot arrives', () => {
    // Given: renderer boot reached a terminal failure.
    failDesktopBoot('My King backend did not become ready')
    const failed = $desktopBoot.get()

    // When: an older main-process progress snapshot arrives after the failure.
    applyDesktopBootProgress({
      error: null,
      fakeMode: false,
      message: 'Resolving My King backend',
      phase: 'backend.resolve',
      progress: 8,
      running: true,
      timestamp: 2
    })

    // Then: generic progress cannot unlock or overwrite the terminal state.
    expect($desktopBoot.get()).toEqual(failed)
  })
})
