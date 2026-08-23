import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'

import { Intro } from './intro'

describe('Intro', () => {
  it('uses the approved lockup even before theme attributes are available', () => {
    // Given: the shared empty state renders before any theme selector is guaranteed.
    const { container } = render(<Intro seed={0} />)

    // When: the default component tree is inspected without root theme attributes.
    const lockup = container.querySelector(
      'img[data-slot="aui_intro-lockup"][src$="my-king-lockup.png"]'
    )

    const body = container.querySelector('[data-slot="aui_intro-body"]')

    // Then: the approved artwork and body are the visible default presentation.
    expect(lockup?.getAttribute('alt')).toBe('My King — AI WROK OS')
    expect(lockup?.closest('.hidden')).toBeNull()
    expect(body?.textContent?.trim()).not.toBe('')
  })

  it('does not retain a text-built My King fallback that can flash during resize', () => {
    // Given: the intro is rendered at any window width or theme state.
    const { container } = render(<Intro seed={0} />)

    // When: all retired presentation hooks are queried.
    const legacyNodes = container.querySelectorAll('[data-slot^="aui_intro-legacy-"]')
    const lockups = container.querySelectorAll('img[data-slot="aui_intro-lockup"]')

    // Then: there is one image lockup and no alternate text-built brand tree.
    expect(legacyNodes).toHaveLength(0)
    expect(lockups).toHaveLength(1)
  })

  it('renders the welcome message in the selected interface language', () => {
    // Given: the desktop interface is explicitly Chinese.
    const { container } = render(
      <I18nProvider configClient={null} initialLocale="zh">
        <Intro seed={0} />
      </I18nProvider>
    )

    // When: the branded empty state is shown.
    const headline = container.querySelector('[data-slot="aui_intro-headline"]')
    const body = container.querySelector('[data-slot="aui_intro-body"]')

    const headlinePhrases = Array.from(
      container.querySelectorAll('[data-slot="aui_intro-headline"] [data-intro-phrase]')
    ).map(element => element.textContent)

    const bodyPhrases = Array.from(
      container.querySelectorAll('[data-slot="aui_intro-body"] [data-intro-phrase]')
    ).map(element => element.textContent)

    // Then: generated English copy cannot leak into the Chinese surface.
    expect(headline?.textContent).toBe('你的工作空间，一句话即可开始。')
    expect(body?.textContent).toBe('搜索项目、编辑文件、运行测试、推进任务。告诉我目标，其余交给 My King。')
    expect(headlinePhrases).toEqual(['你的工作空间，', '一句话即可开始。'])
    expect(bodyPhrases).toEqual([
      '搜索项目、',
      '编辑文件、',
      '运行测试、',
      '推进任务。',
      '告诉我目标，',
      '其余交给 My King。'
    ])
  })

  it('keeps Japanese semantic phrases intact for narrow layouts', () => {
    const { container } = render(
      <I18nProvider configClient={null} initialLocale="ja">
        <Intro seed={0} />
      </I18nProvider>
    )

    const headlinePhrases = Array.from(
      container.querySelectorAll('[data-slot="aui_intro-headline"] [data-intro-phrase]')
    ).map(element => element.textContent)

    expect(headlinePhrases).toEqual(['あなたのワークスペースを、', '一言で始めよう。'])
  })
})
