import { useRef, useState } from 'react'
import { ActionMenu, Alert, Button, Tooltip } from '@navikt/ds-react'
import {
  PlusIcon,
  ExclamationmarkTriangleIcon,
  ChevronDownIcon,
  TrashIcon,
  LinkIcon,
  CheckmarkIcon,
} from '@navikt/aksel-icons'
import Editor, { type OnMount } from '@monaco-editor/react'
import { getSqlBuildingBlocks, INITIAL_SQL_QUERY } from '../model/schemaAndSnippets'
import { getSqlSuggestionFragment, getSqlSuggestions, prepareSqlBlockInsertion } from '../model/sqlSuggestions'
import { registerSqlNextLanguage, SQL_NEXT_LANGUAGE_ID } from '../model/sqlLanguage'
import type { BlockSectionId, MonacoEditorInstance, QueryStats } from '../model/types'

interface CompletionPosition {
  lineNumber: number
  column: number
}

interface CompletionModel {
  getValueInRange(range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }): string
  getValue(): string
  getOffsetAt(position: CompletionPosition): number
  getLineContent(lineNumber: number): string
  getWordAtPosition(position: CompletionPosition): { endColumn: number } | null
}

interface SqlBuilderPanelProps {
  projectId: string
  showBuildingBlocks?: boolean
  selectedWebsiteId?: string
  query: string
  loading: boolean
  estimating: boolean
  estimate: QueryStats | null
  dryRunError: string | null
  validateError: string | null
  incompleteQueryMessage?: string | null
  oldTableWarning: boolean
  shareSuccess: boolean
  selectedWebsiteSelected: boolean
  safetyLimit: number | null
  explicitLimit: number | null
  isSelectStarOnBigTable: boolean
  isMissingPartitionFilter: boolean
  isHighCost: boolean
  onQueryChange: (value: string) => void
  onUpgradeTables: () => void
  onAddDateFilter: () => void
  onAddWebsiteFilter: () => void
  onShare: () => void
  onExecute: () => void
  onFormat: () => void
  onOpenJoin: () => void
  onValidate?: () => void
  editorInstanceRef: React.MutableRefObject<MonacoEditorInstance | null>
}

const SECTIONS: { id: BlockSectionId; title: string }[] = [
  { id: 'keywords', title: 'SQL-ord' },
  { id: 'fields', title: 'Felter' },
  { id: 'tables', title: 'Tabeller' },
  { id: 'filters', title: 'Filtre' },
]

export default function SqlBuilderPanel({
  projectId,
  showBuildingBlocks = false,
  selectedWebsiteId,
  query,
  loading,
  estimating,
  estimate,
  dryRunError,
  validateError,
  incompleteQueryMessage,
  oldTableWarning,
  shareSuccess,
  selectedWebsiteSelected,
  isHighCost,
  onQueryChange,
  onUpgradeTables,
  onShare,
  onExecute,
  onFormat,
  onOpenJoin,
  onValidate,
  editorInstanceRef,
}: SqlBuilderPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mountedEditorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const blocks = getSqlBuildingBlocks(projectId, selectedWebsiteId)

  const insertSnippetIntoEditor = (codeToInsert: string) => {
    const ed = editorInstanceRef.current
    if (ed) {
      const selection = ed.getSelection()
      if (selection) {
        const mountedEditor = mountedEditorRef.current
        const model = mountedEditor?.getModel()
        const editorSelection = mountedEditor?.getSelection()
        const insertionOffset = model && editorSelection ? model.getOffsetAt(editorSelection.getStartPosition()) : null
        const insertion = prepareSqlBlockInsertion(
          model && insertionOffset !== null ? model.getValue().slice(0, insertionOffset) : '',
          codeToInsert,
        )
        const insertionRange = editorSelection
          ? editorSelection.setStartPosition(
              editorSelection.startLineNumber,
              Math.max(1, editorSelection.startColumn - insertion.replaceBefore),
            )
          : selection
        ed.executeEdits('sql-next-block', [
          {
            range: insertionRange,
            text: insertion.text,
            forceMoveMarkers: true,
          },
        ])
        if (model && insertionOffset !== null && mountedEditor) {
          mountedEditor.setPosition(
            model.getPositionAt(insertionOffset - insertion.replaceBefore + insertion.text.length),
          )
          mountedEditor.trigger('sql-next', 'editor.action.triggerSuggest', {})
        }
        ed.focus()
        return
      }
    }

    onQueryChange(query ? `${query.trimEnd()}\n${codeToInsert}` : codeToInsert)
  }

  const gb = Number(estimate?.totalBytesProcessedGB ?? 0)
  const mb = gb * 1024
  const cost = Number(estimate?.estimatedCostUSD ?? NaN) || (isFinite(gb) ? gb * 0.00625 : 0)

  const formatDataAmount = () => {
    if (!estimate) return ''
    if (gb >= 1) return `${gb.toFixed(2)} GB`
    if (mb >= 1) return `${mb.toFixed(0)} MB`
    return '< 1 MB'
  }

  return (
    <div className="flex flex-col gap-3">
      {oldTableWarning && (
        <Alert variant="warning" size="small">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Spørringen bruker gamle tabellnavn. Bytt til umami_views.</span>
            <Button size="xsmall" variant="primary" type="button" onClick={onUpgradeTables}>
              Oppdater tabellnavn
            </Button>
          </div>
        </Alert>
      )}

      {/* Monaco SQL Editor */}
      <div
        ref={containerRef}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          const droppedCode = e.dataTransfer.getData('text/plain')
          if (droppedCode) {
            insertSnippetIntoEditor(droppedCode)
          }
        }}
        className={`rounded-lg border overflow-hidden transition-colors bg-[var(--ax-bg-default)] ${
          isDragOver
            ? 'border-[var(--ax-border-accent)] ring-2 ring-[var(--ax-border-accent)]'
            : 'border-[var(--ax-border-neutral-subtle)]'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] px-2 py-1">
          {showBuildingBlocks && (
            <div role="group" aria-label="Byggeklosser" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {SECTIONS.map((section) => {
                const sectionBlocks = blocks.filter((block) => block.section === section.id)
                return (
                  <ActionMenu key={section.id}>
                    <ActionMenu.Trigger>
                      <Button
                        type="button"
                        variant="tertiary"
                        size="small"
                        icon={<ChevronDownIcon aria-hidden />}
                        iconPosition="right"
                      >
                        {section.title}
                      </Button>
                    </ActionMenu.Trigger>
                    <ActionMenu.Content align="start">
                      {sectionBlocks.map((block) => (
                        <ActionMenu.Item
                          key={block.id}
                          icon={<PlusIcon aria-hidden />}
                          draggable
                          onDragStart={(event) => event.dataTransfer.setData('text/plain', block.code)}
                          onSelect={() => {
                            window.requestAnimationFrame(() => insertSnippetIntoEditor(block.code))
                          }}
                        >
                          <span className="block max-w-[min(24rem,calc(100vw-4rem))] whitespace-normal break-words text-sm">
                            {block.label}
                          </span>
                        </ActionMenu.Item>
                      ))}
                      {section.id === 'tables' && (
                        <>
                          <ActionMenu.Divider />
                          <ActionMenu.Item icon={<LinkIcon aria-hidden />} onSelect={onOpenJoin}>
                            <span className="text-sm">Legg til JOIN</span>
                          </ActionMenu.Item>
                        </>
                      )}
                    </ActionMenu.Content>
                  </ActionMenu>
                )
              })}
            </div>
          )}
          <div role="group" aria-label="Editorhandlinger" className="ml-auto flex shrink-0 items-center gap-1">
            <Button size="xsmall" variant="tertiary" type="button" onClick={onOpenJoin}>
              Legg til JOIN
            </Button>
            <Tooltip content="Tøm spørringen">
              <Button
                size="small"
                variant="tertiary"
                type="button"
                className="h-8 w-8 shrink-0"
                aria-label="Tøm"
                disabled={!query.trim()}
                icon={<TrashIcon aria-hidden />}
                onClick={() => {
                  onQueryChange(INITIAL_SQL_QUERY)
                  window.requestAnimationFrame(() => {
                    mountedEditorRef.current?.setPosition({ lineNumber: 1, column: INITIAL_SQL_QUERY.length + 1 })
                    mountedEditorRef.current?.focus()
                  })
                }}
              />
            </Tooltip>
            <Tooltip content={shareSuccess ? 'Lenke kopiert' : 'Del spørringen'}>
              <Button
                size="small"
                variant="tertiary"
                type="button"
                className="h-8 w-8 shrink-0"
                aria-label="Del"
                icon={shareSuccess ? <CheckmarkIcon aria-hidden /> : <LinkIcon aria-hidden />}
                onClick={onShare}
                disabled={!query.trim()}
              />
            </Tooltip>
            <span role="status" className="sr-only">
              {shareSuccess ? 'Lenke kopiert' : ''}
            </span>
          </div>
        </div>

        {isHighCost && (
          <div className="px-3 py-2 border-b border-[var(--ax-border-warning-subtle)] bg-[var(--ax-bg-warning-soft)] text-xs flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-[var(--ax-text-default)]">
              Spørringen leser mye data ({formatDataAmount()}). Begrens gjerne med nettside og kortere tidsperiode.
            </p>
          </div>
        )}

        <div
          className="border border-[var(--ax-border-neutral)] rounded focus-within:outline focus-within:outline-2 focus-within:outline-[var(--ax-border-focus)] focus-within:outline-offset-[-2px]"
          style={{ position: 'relative', isolation: 'isolate', height: 'clamp(260px, 50vh, 420px)' }}
        >
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={query}
            onChange={(value) => onQueryChange(value || '')}
            onMount={(editor, monaco) => {
              mountedEditorRef.current = editor
              editorInstanceRef.current = editor as unknown as MonacoEditorInstance
              void registerSqlNextLanguage(monaco).then((registered) => {
                const model = editor.getModel()
                if (registered && model && !model.isDisposed()) {
                  monaco.editor.setModelLanguage(model, SQL_NEXT_LANGUAGE_ID)
                }
              })
              const provider = monaco.languages.registerCompletionItemProvider(['sql', SQL_NEXT_LANGUAGE_ID], {
                triggerCharacters: [' ', '.', '=', "'", '`'],
                provideCompletionItems: (model: CompletionModel, position: CompletionPosition) => {
                  if (model !== editor.getModel()) return { suggestions: [] }
                  const prefix = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  })
                  const suffix = model.getValue().slice(model.getOffsetAt(position))
                  const suggestions = getSqlSuggestions(prefix, projectId, suffix)
                  return {
                    suggestions: suggestions.map((suggestion) => {
                      const fragment = getSqlSuggestionFragment(prefix, suggestion.kind)
                      const closingQuote = suggestion.kind === 'table' ? '`' : "'"
                      const hasClosingQuote =
                        (suggestion.kind === 'table' || suggestion.kind === 'value') &&
                        model.getLineContent(position.lineNumber)[position.column - 1] === closingQuote
                      return {
                        ...suggestion,
                        label: suggestion.labelDescription
                          ? { label: suggestion.label, description: suggestion.labelDescription }
                          : suggestion.label,
                        detail: suggestion.labelDescription ? undefined : suggestion.detail,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
                        kind:
                          suggestion.kind === 'keyword'
                            ? monaco.languages.CompletionItemKind.Keyword
                            : suggestion.kind === 'table'
                              ? monaco.languages.CompletionItemKind.Struct
                              : suggestion.kind === 'value'
                                ? monaco.languages.CompletionItemKind.Value
                                : monaco.languages.CompletionItemKind.Field,
                        range: {
                          startLineNumber: position.lineNumber,
                          endLineNumber: position.lineNumber,
                          startColumn: Math.max(1, position.column - (suggestion.replaceBefore ?? fragment.length)),
                          endColumn:
                            suggestion.kind === 'keyword'
                              ? (model.getWordAtPosition(position)?.endColumn ?? position.column)
                              : position.column + (hasClosingQuote ? 1 : 0),
                        },
                      }
                    }),
                  }
                },
              })
              const contentListener = editor.onDidChangeModelContent((event) => {
                if (event.changes.some((change) => /[\s=]$/.test(change.text))) {
                  editor.trigger('sql-next', 'editor.action.triggerSuggest', {})
                }
              })
              editor.onDidDispose(() => {
                provider.dispose()
                contentListener.dispose()
                mountedEditorRef.current = null
              })
              if (editor.getValue() === INITIAL_SQL_QUERY) {
                editor.setPosition({ lineNumber: 1, column: INITIAL_SQL_QUERY.length + 1 })
                editor.focus()
              }
            }}
            theme="vs-dark"
            options={{
              ariaLabel: 'SQL-spørring',
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              fixedOverflowWidgets: true,
              stickyScroll: { enabled: false },
              lineNumbersMinChars: 3,
              glyphMargin: false,
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
              wordBasedSuggestions: 'off',
            }}
          />
        </div>

        {/* Status Bar: Auto Validation + Dry Run Cost + Run Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)]">
          <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
            {!query.trim() ? null : incompleteQueryMessage ? (
              <span className="text-[var(--ax-text-subtle)]">{incompleteQueryMessage}</span>
            ) : validateError ? (
              <span className="inline-flex items-center gap-1 text-[var(--ax-text-danger)] font-medium">
                <ExclamationmarkTriangleIcon aria-hidden />
                {validateError}
              </span>
            ) : estimating ? (
              <span className="text-[var(--ax-text-subtle)]">Sjekker spørring...</span>
            ) : dryRunError ? (
              <span className="inline-flex items-center gap-1 text-[var(--ax-text-danger)]">
                <ExclamationmarkTriangleIcon aria-hidden className="shrink-0" />
                Spørringen har feil.
              </span>
            ) : estimate ? (
              <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1 text-[var(--ax-text-success)] font-medium">
                  <CheckmarkIcon aria-hidden />
                  Gyldig SQL
                </span>
                <span className="text-[var(--ax-text-subtle)]">
                  {'· '}
                  <strong>{formatDataAmount()}</strong>
                  {cost >= 0.01 ? ` (~$${cost.toFixed(2)})` : ' (~$0.00)'}
                  {estimate.cacheHit ? ' · Hurtigminne' : ''}
                </span>
              </div>
            ) : !selectedWebsiteSelected ? (
              <span className="text-[var(--ax-text-subtle)]">Velg en nettside øverst for å sjekke kostnad.</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="small"
              variant="secondary"
              type="button"
              onClick={onFormat}
              disabled={!query.trim() || loading || estimating}
            >
              Formater
            </Button>
            <Button
              size="small"
              variant="secondary"
              type="button"
              onClick={onValidate}
              loading={estimating}
              disabled={!query.trim() || loading}
            >
              Valider
            </Button>
            <Button
              size="small"
              variant="primary"
              type="button"
              onClick={onExecute}
              loading={loading}
              disabled={!query.trim() || Boolean(incompleteQueryMessage)}
            >
              Vis resultater
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
