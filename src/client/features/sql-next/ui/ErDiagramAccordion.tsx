import { useState } from 'react'
import { ReadMore, Button, Tooltip } from '@navikt/ds-react'
import { CheckmarkIcon, FilesIcon, PlusIcon, LinkIcon } from '@navikt/aksel-icons'
import { getBigQueryTables, getFullTableName } from '../model/schemaAndSnippets'
import type { BigQueryTableDoc } from '../model/types'
import styles from './ErDiagramAccordion.module.css'

interface ErDiagramAccordionProps {
  projectId: string
  onOpenJoin?: (tableId: Exclude<BigQueryTableDoc['id'], 'event'>) => void
  onInsertSnippet: (code: string) => void
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

export default function ErDiagramAccordion({ projectId, onOpenJoin, onInsertSnippet }: ErDiagramAccordionProps) {
  const tables = getBigQueryTables(projectId)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<BigQueryTableDoc['id']>('event')

  const copyTable = async (table: BigQueryTableDoc) => {
    await navigator.clipboard.writeText(getFullTableName(projectId, table.datasetTable))
    setCopiedId(table.id)
    window.setTimeout(() => setCopiedId((previous) => (previous === table.id ? null : previous)), 1800)
  }

  return (
    <ReadMore header="Datamodell" size="small" className={styles.accordion}>
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
              ...table.columns.filter((column) => !keys.includes(column.name)),
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
                  {orderedColumns.map((column) => (
                    <li key={column.name}>
                      <Tooltip content={column.label}>
                        <button
                          type="button"
                          draggable
                          className={`${styles.field} ${keys.includes(column.name) ? styles.keyField : ''}`}
                          aria-label={`Sett inn ${table.shortName}.${column.name}`}
                          onClick={() => onInsertSnippet(column.insertSnippet || column.name)}
                          onDragStart={(event) =>
                            event.dataTransfer.setData('text/plain', column.insertSnippet || column.name)
                          }
                        >
                          <span className={styles.fieldMarker} aria-hidden="true">
                            {keys.includes(column.name) ? <span className={styles.keyDot} /> : null}
                          </span>
                          <code>{column.name}</code>
                          <PlusIcon className={styles.insertIcon} aria-hidden="true" />
                        </button>
                      </Tooltip>
                    </li>
                  ))}
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
                </div>
              </section>
            )
          })}
          <div className={styles.legend}>
            <span className={styles.legendLine} aria-hidden="true" />
            <span>Én til mange</span>
            <span className={styles.keyDot} aria-hidden="true" />
            <span>Felt som kobler tabellene</span>
          </div>
        </div>
      </div>
    </ReadMore>
  )
}
