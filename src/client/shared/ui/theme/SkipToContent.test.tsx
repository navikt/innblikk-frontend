import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppBlock } from './AppBlock/AppBlock.tsx'
import { SkipToContent } from './SkipToContent.tsx'

describe('SkipToContent', () => {
  it.each([false, true])('skips navigation and focuses content (AppBlock: %s)', async (useAppBlock) => {
    const user = userEvent.setup()
    const content = <button>Innholdshandling</button>
    render(
      <>
        <SkipToContent />
        <nav aria-label="Hovedmeny">
          <a href="/">Hjem</a>
        </nav>
        {useAppBlock ? (
          <AppBlock as="main" id="main-content" tabIndex={-1}>
            {content}
          </AppBlock>
        ) : (
          <main id="main-content" tabIndex={-1}>
            {content}
          </main>
        )}
      </>,
    )
    const main = screen.getByRole('main')
    const scrollIntoView = vi.fn()
    main.scrollIntoView = scrollIntoView

    await user.tab()
    expect(screen.getByRole('link', { name: 'Hopp til innhold' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(main).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    await user.tab()
    expect(screen.getByRole('button', { name: 'Innholdshandling' })).toHaveFocus()
  })
})
