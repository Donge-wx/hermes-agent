import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Loader } from './loader'

describe('Loader reduced-motion behavior', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders a still frame without scheduling animation when reduced motion is requested', () => {
    // Given: the operating system requests reduced motion.
    const requestAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        removeEventListener: vi.fn()
      }))
    )

    // When: the installer loader is rendered.
    const { container } = render(<Loader />)

    // Then: it paints a meaningful still frame without entering a frame loop.
    expect(container.querySelector('path')?.getAttribute('d')).toBeTruthy()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
})
