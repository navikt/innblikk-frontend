import { useEffect, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'

// Languages - imports must be side-effectual to register with Prism
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-markup' // html

import { Box, CopyButton } from '@navikt/ds-react'

interface SnippetBlockProps {
  text: string
  language: string
  wrapLongLines?: boolean
}

export function SnippetBlock({ text, language, wrapLongLines = true }: SnippetBlockProps) {
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current)
    }
  }, [text, language])

  // Map language names for Prism
  const langMap: Record<string, string> = {
    html: 'markup',
    jsx: 'jsx',
    javascript: 'javascript',
    js: 'javascript',
  }

  const prismLang = langMap[language.toLowerCase()] || language

  return (
    <div className="relative group snippet-block min-w-0 max-w-full">
      <style>{`
                .snippet-block pre {
                    margin: 0 !important;
                    padding: 1rem !important;
                    border-radius: 4px;
                    font-size: 14px;
                    overflow-x: auto;
                    ${wrapLongLines ? 'white-space: pre-wrap !important; word-break: break-word !important; word-wrap: break-word !important;' : ''}
                }
                .snippet-block code {
                    font-family: 'Source Code Pro', monospace;
                    ${wrapLongLines ? 'white-space: pre-wrap !important; word-break: break-word !important; word-wrap: break-word !important;' : ''}
                }
            `}</style>
      <Box className="relative min-w-0 overflow-hidden border border-border-subtle rounded-medium">
        {/*
          CopyButton on dark prism-tomorrow bg: Aksel tertiary renders transparent bg +
          --ax-text-default (dark) text → invisible on dark. Override on the button itself
          (not a wrapper, which would square off the pill-shaped hover) so it reads as a
          solid light chip: bg + border + hover tint all on the same rounded element.
          Hover uses solid --ax-bg-neutral-moderate-hover, NOT the *-hoverA alpha variant —
          hoverA is translucent and would let the dark prism bg show through (looks black).
        */}
        <div className="absolute top-2 right-2 z-10">
          <CopyButton
            copyText={text}
            text="Kopier"
            activeText="Kopiert!"
            size="small"
            className="!bg-[var(--ax-bg-default)] !border !border-solid !border-[var(--ax-border-default)] hover:!bg-[var(--ax-bg-neutral-moderate-hover)]"
          />
        </div>
        <pre className={`language-${prismLang}`}>
          <code ref={codeRef} className={`language-${prismLang}`}>
            {text}
          </code>
        </pre>
      </Box>
    </div>
  )
}
