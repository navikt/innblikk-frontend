import React from 'react'
import { Detail } from '@navikt/ds-react'

/** Inline monospace chip for technical terms / formulas */
export const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code
    style={{
      fontFamily: 'monospace',
      fontSize: '0.8em',
      background: 'var(--ax-bg-neutral-moderate)',
      border: '1px solid var(--ax-border-neutral-subtle)',
      borderRadius: '3px',
      padding: '1px 4px',
    }}
  >
    {children}
  </code>
)

/** Muted uppercase section header */
export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Detail
    as="p"
    style={{
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--ax-text-neutral-subtle)',
      marginBottom: '2px',
    }}
  >
    {children}
  </Detail>
)
