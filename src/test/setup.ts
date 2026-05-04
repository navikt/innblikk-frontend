import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import React from 'react'

// Cleanup DOM after each test
afterEach(() => {
  cleanup()
})

// Monaco editor — heavy, not needed in unit tests
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => React.createElement('pre', { 'data-testid': 'monaco-editor' }, value),
}))

// ResizeObserver not in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub

// matchMedia not in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
