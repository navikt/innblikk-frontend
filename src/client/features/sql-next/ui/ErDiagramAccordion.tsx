import { Fragment, useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { ReadMore, Button, Heading, Search, Tooltip as AkselTooltip } from '@navikt/ds-react'
import { CheckmarkIcon, FilesIcon, PlusIcon, LinkIcon, KeyHorizontalIcon } from '@navikt/aksel-icons'
import { getBigQueryTables, getFullTableName } from '../model/schemaAndSnippets'
import type { BigQueryTableDoc } from '../model/types'
import styles from './ErDiagramAccordion.module.css'

function Tooltip(props: ComponentProps<typeof AkselTooltip>) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('scroll', close, true)
    return () => document.removeEventListener('scroll', close, true)
  }, [open])

  return <AkselTooltip {...props} open={open} onOpenChange={setOpen} />
}

interface ErDiagramAccordionProps {
  projectId: string
  onOpenJoin?: (tableId: Exclude<BigQueryTableDoc['id'], 'event'>) => void
  onInsertSnippet?: (code: string) => void
}

const RELATIONS = [
  {
    id: 'website',
    source: 'website_id',
    target: 'website_id',
    path: 'M 296 124 H 392',
    ends: 'M 302 118 V 130 M 382 124 L 392 118 M 382 124 L 392 130',
  },
  {
    id: 'session',
    source: 'session_id',
    target: 'session_id',
    path: 'M 760 580 H 704 V 188 H 680',
    ends: 'M 754 574 V 586 M 690 188 L 680 182 M 690 188 L 680 194',
  },
  {
    id: 'event_data',
    source: 'event_id',
    target: 'website_event_id',
    path: 'M 680 156 H 720 V 124 H 760',
    ends: 'M 686 150 V 162 M 750 124 L 760 118 M 750 124 L 760 130',
  },
] as const

const KEY_FIELDS: Record<BigQueryTableDoc['id'], string[]> = {
  event: ['website_id', 'event_id', 'session_id'],
  website: ['website_id'],
  session: ['session_id'],
  event_data: ['website_event_id'],
}

const KEY_ROLES: Record<BigQueryTableDoc['id'], Record<string, 'PK' | 'FK'>> = {
  event: { event_id: 'PK', website_id: 'FK', session_id: 'FK' },
  website: { website_id: 'PK' },
  session: { session_id: 'PK', website_id: 'FK' },
  event_data: { website_event_id: 'FK', website_id: 'FK' },
}

const matchesField = (column: BigQueryTableDoc['columns'][number], search: string) =>
  `${column.name} ${column.label}`.toLowerCase().includes(search.trim().toLowerCase())

export function JoinRelationDiagram({
  projectId,
  tableId,
  targetSelector,
}: {
  projectId: string
  tableId: Exclude<BigQueryTableDoc['id'], 'event'>
  targetSelector?: ReactNode
}) {
  const tables = getBigQueryTables(projectId)
  const source = tables.find((table) => table.id === 'event')!
  const target = tables.find((table) => table.id === tableId)!
  const relation = RELATIONS.find((candidate) => candidate.id === tableId)!

  return (
    <figure className={styles.joinDiagram} aria-label="Valgt JOIN">
      <figcaption className="sr-only">
        {source.title} kobles til {target.title} med {relation.source} og {relation.target}.
      </figcaption>
      {[source, target].map((table, index) => {
        const field = index === 0 ? relation.source : relation.target
        const role = KEY_ROLES[table.id][field]
        return (
          <Fragment key={table.id}>
            {index === 1 && (
              <div className={styles.joinConnection} aria-hidden="true">
                <svg viewBox="0 0 64 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M 0 12 H 64" />
                  <path
                    d={
                      tableId === 'event_data'
                        ? 'M 8 5 V 19 M 56 12 L 64 4 M 56 12 L 64 20'
                        : 'M 0 4 L 8 12 L 0 20 M 56 5 V 19'
                    }
                  />
                </svg>
              </div>
            )}
            <div className={styles.joinColumn}>
              <Heading level="2" size="xsmall" className={styles.joinLabel}>
                {index === 0 ? 'Hovedtabell' : 'JOIN med'}
              </Heading>
              <section className={`${styles.table} ${styles.joinTable}`} aria-label={table.shortName}>
                <div className={`${styles.tableHeader} ${styles.joinHeader}`}>
                  {index === 1 && targetSelector ? (
                    targetSelector
                  ) : (
                    <span className={styles.tableName}>{table.title}</span>
                  )}
                  <span className={styles.dataset}>{table.shortName}</span>
                </div>
                <div className={`${styles.keyField} ${styles.joinField}`}>
                  <Tooltip content={role === 'PK' ? 'Primærnøkkel' : 'Fremmednøkkel'}>
                    <KeyHorizontalIcon
                      className={`${styles.keyIcon} ${role === 'PK' ? styles.primaryKey : styles.foreignKey}`}
                      aria-label={role === 'PK' ? 'Primærnøkkel' : 'Fremmednøkkel'}
                    />
                  </Tooltip>
                  <code>{field}</code>
                  <code>({role})</code>
                </div>
                <ReadMore
                  header={`${table.columns.length - 1} andre felt`}
                  defaultOpen
                  size="small"
                  className={styles.joinOtherFields}
                >
                  <ul className={`${styles.fields} ${styles.joinExpandedFields}`}>
                    {table.columns
                      .filter((column) => column.name !== field)
                      .map((column) => {
                        const keyRole = KEY_ROLES[table.id][column.name]
                        return (
                          <li key={column.name}>
                            <Tooltip content={column.label}>
                              <span className={styles.joinField}>
                                <span className={styles.fieldMarker} aria-hidden="true">
                                  {keyRole && (
                                    <KeyHorizontalIcon
                                      className={`${styles.keyIcon} ${keyRole === 'PK' ? styles.primaryKey : styles.foreignKey}`}
                                    />
                                  )}
                                </span>
                                <code>{column.name}</code>
                                {keyRole && <code>({keyRole})</code>}
                              </span>
                            </Tooltip>
                          </li>
                        )
                      })}
                  </ul>
                </ReadMore>
              </section>
            </div>
          </Fragment>
        )
      })}
    </figure>
  )
}

export default function ErDiagramAccordion({ projectId, onOpenJoin, onInsertSnippet }: ErDiagramAccordionProps) {
  const tables = getBigQueryTables(projectId)
  const Field = onInsertSnippet ? 'button' : 'span'
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<BigQueryTableDoc['id']>('event')
  const [fieldSearch, setFieldSearch] = useState('')
  const matchingFields = tables.reduce(
    (count, table) => count + table.columns.filter((column) => matchesField(column, fieldSearch)).length,
    0,
  )

  const copyTable = async (table: BigQueryTableDoc) => {
    await navigator.clipboard.writeText(getFullTableName(projectId, table.datasetTable))
    setCopiedId(table.id)
    window.setTimeout(() => setCopiedId((previous) => (previous === table.id ? null : previous)), 1800)
  }

  return (
    <ReadMore header="Datamodell – tabeller og felter" size="small" className={styles.accordion}>
      <div className="mb-3 max-w-xs">
        <Search label="Søk etter felt" variant="simple" size="small" value={fieldSearch} onChange={setFieldSearch} />
      </div>
      {fieldSearch.trim() && matchingFields === 0 && (
        <p role="status" className="mb-3 text-sm text-[var(--ax-text-subtle)]">
          Ingen felt funnet.
        </p>
      )}
      <div className={styles.scrollArea} role="region" aria-label="ER-diagram med fire tabeller" tabIndex={0}>
        <div className={styles.diagram}>
          <svg className={styles.connections} viewBox="0 0 1056 1280" aria-hidden="true">
            {RELATIONS.map((relation) => (
              <g
                key={relation.id}
                className={
                  selectedTableId === 'event' || selectedTableId === relation.id
                    ? styles.activeConnection
                    : styles.connection
                }
                data-relation={`${relation.source}:${relation.target}`}
              >
                <path d={relation.path} />
                <path d={relation.ends} />
              </g>
            ))}
          </svg>
          {tables.map((table) => {
            const keys = KEY_FIELDS[table.id]
            const orderedColumns = [
              ...keys.flatMap((name) => table.columns.filter((column) => column.name === name)),
              ...table.columns.filter((column) => !keys.includes(column.name) && matchesField(column, fieldSearch)),
            ]
            return (
              <section
                key={table.id}
                aria-label={table.shortName}
                className={`${styles.table} ${styles[table.id]} ${selectedTableId === table.id ? styles.selected : ''}`}
              >
                <button
                  type="button"
                  className={styles.tableHeader}
                  aria-pressed={selectedTableId === table.id}
                  onClick={() => setSelectedTableId(table.id)}
                >
                  <span className={styles.dataset}>{table.datasetTable.split('.')[0]}</span>
                  <span className={styles.tableName}>{table.id === 'website' ? 'public_website' : table.id}</span>
                  <span className={styles.tableTitle}>{table.title}</span>
                </button>
                <ul className={styles.fields}>
                  {orderedColumns.map((column) => {
                    const keyRole = KEY_ROLES[table.id][column.name]
                    const keyDescription = keyRole === 'PK' ? 'Primærnøkkel' : keyRole === 'FK' ? 'Fremmednøkkel' : null
                    return (
                      <li key={column.name}>
                        <Tooltip content={keyDescription ? `${column.label}. ${keyDescription}` : column.label}>
                          <Field
                            type={onInsertSnippet ? 'button' : undefined}
                            draggable={Boolean(onInsertSnippet)}
                            className={`${styles.field} ${keys.includes(column.name) ? styles.keyField : ''}`}
                            style={onInsertSnippet ? undefined : { cursor: 'default' }}
                            aria-label={onInsertSnippet ? `Sett inn ${table.shortName}.${column.name}` : undefined}
                            onClick={
                              onInsertSnippet ? () => onInsertSnippet(column.insertSnippet || column.name) : undefined
                            }
                            onDragStart={
                              onInsertSnippet
                                ? (event) =>
                                    event.dataTransfer.setData('text/plain', column.insertSnippet || column.name)
                                : undefined
                            }
                          >
                            <span className={styles.fieldMarker} aria-hidden="true">
                              {keyRole === 'PK' && (
                                <KeyHorizontalIcon
                                  className={`${styles.keyIcon} ${styles.primaryKey}`}
                                  aria-hidden="true"
                                />
                              )}
                              {keyRole === 'FK' && (
                                <KeyHorizontalIcon
                                  className={`${styles.keyIcon} ${styles.foreignKey}`}
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <code>{column.name}</code>
                            {keyRole && <code>({keyRole})</code>}
                            {onInsertSnippet && <PlusIcon className={styles.insertIcon} aria-hidden="true" />}
                          </Field>
                        </Tooltip>
                      </li>
                    )
                  })}
                </ul>
                <div className={styles.tableActions}>
                  {table.id !== 'event' && onOpenJoin && (
                    <Tooltip content={`Legg til JOIN med ${table.title}`}>
                      <Button
                        size="xsmall"
                        variant="tertiary"
                        type="button"
                        aria-label={`Legg til JOIN med ${table.title}`}
                        icon={<LinkIcon aria-hidden />}
                        onClick={() => {
                          if (table.id !== 'event') onOpenJoin(table.id)
                        }}
                      />
                    </Tooltip>
                  )}
                  <Tooltip content={copiedId === table.id ? 'Kopiert' : 'Kopier tabellnavn'}>
                    <Button
                      size="xsmall"
                      variant="tertiary"
                      type="button"
                      aria-label={`Kopier ${table.shortName}`}
                      icon={copiedId === table.id ? <CheckmarkIcon aria-hidden /> : <FilesIcon aria-hidden />}
                      onClick={() => void copyTable(table)}
                    />
                  </Tooltip>
                  {onInsertSnippet && (
                    <Tooltip content="Sett inn tabellnavn">
                      <Button
                        size="xsmall"
                        variant="tertiary"
                        type="button"
                        aria-label={`Sett inn ${table.shortName}`}
                        icon={<PlusIcon aria-hidden />}
                        onClick={() => onInsertSnippet(getFullTableName(projectId, table.datasetTable))}
                      />
                    </Tooltip>
                  )}
                </div>
              </section>
            )
          })}
          <div className={styles.legend}>
            <span className={styles.legendLine} aria-hidden="true" />
            <span>Én til mange</span>
            <KeyHorizontalIcon className={`${styles.keyIcon} ${styles.primaryKey}`} aria-hidden="true" />
            <span>Primærnøkkel (PK)</span>
            <KeyHorizontalIcon className={`${styles.keyIcon} ${styles.foreignKey}`} aria-hidden="true" />
            <span>Fremmednøkkel (FK)</span>
          </div>
        </div>
      </div>
    </ReadMore>
  )
}
