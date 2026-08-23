import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { setBackdrop } from '@/store/backdrop'

import { Backdrop } from './Backdrop'

describe('Backdrop', () => {
  afterEach(() => setBackdrop(true))

  it('exposes one semantic hook so a theme can suppress identifiable artwork', () => {
    // Given: the optional application backdrop is enabled.
    setBackdrop(true)

    // When: the backdrop renders behind the chat surface.
    const { container } = render(<Backdrop />)

    // Then: themes can target the entire painter without relying on utility classes.
    expect(container.querySelector('[data-slot="app-backdrop"]')).not.toBeNull()
  })

  it('exposes the brand symbol as its own token-driven layer', () => {
    // Given: the optional application backdrop is enabled.
    setBackdrop(true)

    // When: the backdrop renders the ambient artwork and brand symbol.
    const { container } = render(<Backdrop />)

    // Then: the design system can control the symbol without parsing utility classes.
    expect(container.querySelector('[data-slot="app-backdrop-symbol"]')).not.toBeNull()
  })
})
