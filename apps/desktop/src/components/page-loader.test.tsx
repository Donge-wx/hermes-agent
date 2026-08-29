// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PageLoader } from './page-loader'

afterEach(cleanup)

describe('PageLoader presentation', () => {
  it('renders a complete branded loading composition with visible localized status copy', () => {
    render(<PageLoader label="正在载入技能与工具" />)

    const status = screen.getByRole('status', { name: '正在载入技能与工具' })

    expect(status.querySelector('[data-slot="page-loader-glyph"]')).toBeTruthy()
    expect(status.querySelector('[data-slot="page-loader-label"]')?.textContent).toBe('正在载入技能与工具')
  })
})
