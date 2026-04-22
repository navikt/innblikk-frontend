import { useState, useMemo } from 'react'
import { Button, CopyButton, ReadMore, Heading, Link } from '@navikt/ds-react'
import { Copy, ExternalLink } from 'lucide-react'
import Editor from '@monaco-editor/react'
import * as sqlFormatter from 'sql-formatter'

interface SqlViewerProps {
  sql: string
  showEditButton?: boolean
  withoutReadMore?: boolean
  showMetabaseActions?: boolean
}

const SqlViewer = ({
  sql,
  showEditButton = false,
  withoutReadMore = false,
  showMetabaseActions = true,
}: SqlViewerProps) => {
  const [copiedMetabase, setCopiedMetabase] = useState(false)
  const isDevEnvironment = typeof window !== 'undefined' && window.location.hostname.includes('.dev.nav.no')

  const formattedSql = useMemo(() => {
    try {
      return sqlFormatter.format(sql)
    } catch {
      return sql
    }
  }, [sql])
  const metabaseQuestionUrl = isDevEnvironment
    ? 'https://metabase.ansatt.dev.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjo1Njg2LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'
    : 'https://metabase.ansatt.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjoxNTQ4LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'

  if (!sql) return null

  const handleCopyToMetabase = () => {
    void navigator.clipboard.writeText(sql)
    setCopiedMetabase(true)
    setTimeout(() => setCopiedMetabase(false), 3000)
  }

  const content = (
    <div className="space-y-2">
      <div className="flex justify-end gap-2 items-center">
        <CopyButton copyText={sql} text="Kopier" activeText="Kopiert!" size="small" />
        {showEditButton &&
          (() => {
            const encodedSql = encodeURIComponent(sql)
            const urlLength = `/sql?sql=${encodedSql}`.length
            const isTooLong = urlLength > 2000

            return (
              <Button
                size="xsmall"
                variant="tertiary"
                type="button"
                onClick={() => {
                  if (isTooLong) {
                    window.open('/sql', '_blank')
                  } else {
                    window.open(`/sql?sql=${encodedSql}`, '_blank')
                  }
                }}
                aria-label="Åpne redigeringsverktøy"
              >
                Åpne redigeringsverktøy
              </Button>
            )
          })()}
      </div>
      <div className="border rounded-md overflow-hidden bg-[#1e1e1e]">
        <Editor
          height="400px"
          defaultLanguage="sql"
          value={formattedSql}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            fixedOverflowWidgets: true,
            stickyScroll: { enabled: false },
            lineNumbersMinChars: 4,
            glyphMargin: false,
            renderLineHighlight: 'none', // cleaner look for read-only
            contextmenu: false, // disable context menu for cleaner feel
          }}
        />
      </div>

      {showMetabaseActions && (
        <div className="pt-2 border-t border-[var(--ax-border-neutral-subtle)] space-y-2">
          <Heading level="3" size="xsmall">
            Legg til i Metabase
          </Heading>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="xsmall"
              variant="secondary"
              type="button"
              onClick={handleCopyToMetabase}
              icon={<Copy size={14} />}
            >
              {copiedMetabase ? 'Kopiert!' : 'Kopier spørringen'}
            </Button>
            <Link
              href={metabaseQuestionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm"
            >
              Åpne Metabase <ExternalLink size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )

  if (withoutReadMore) {
    return <div className="mt-2">{content}</div>
  }

  return (
    <div className="mt-2">
      <ReadMore header="Vis SQL-kode" size="medium">
        {content}
      </ReadMore>
    </div>
  )
}

export default SqlViewer
