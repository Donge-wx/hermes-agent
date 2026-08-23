import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CircleIcon } from '@/lib/icons'

import { OverlayNavItem } from './overlay-split-layout'

describe('OverlayNavItem', () => {
  it('exposes the active page to assistive technology', () => {
    render(<OverlayNavItem active icon={CircleIcon} label="Appearance" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Appearance' }).getAttribute('aria-current')).toBe('page')
  })
})
