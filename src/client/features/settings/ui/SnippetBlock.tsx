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
    <div className="relative group snippet-block">
      <style>{`
                .snippet-block pre {
                    margin: 0 !important;
                    padding: 1rem !important;
                    border-radius: 4px;
                    font-size: 14px;
                    overflow: auto;
                    ${wrapLongLines ? 'white-space: pre-wrap; word-break: break-word;' : ''}
                }
                .snippet-block code {
                    font-family: 'Source Code Pro', monospace;
                }
            `}</style>
      <Box className="overflow-hidden relative border border-border-subtle rounded-medium">
        <div className="absolute top-2 right-2 z-10">
          <CopyButton copyText={text} text="Kopier" activeText="Kopiert!" size="small" />
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
