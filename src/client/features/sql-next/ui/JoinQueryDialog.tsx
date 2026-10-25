import { useState } from 'react'
import { Alert, BodyShort, Button, CopyButton, Modal, ReadMore, Select } from '@navikt/ds-react'
import { getSqlJoinOptions, replaceSqlJoinSource } from '../model/sqlJoins'
import { getBigQueryTables, getFullTableName } from '../model/schemaAndSnippets'
import type { BigQueryTableDoc } from '../model/types'
import ErDiagramAccordion, { JoinRelationDiagram } from './ErDiagramAccordion'

export type JoinTableId = Exclude<BigQueryTableDoc['id'], 'event'>

interface JoinQueryDialogProps {
  projectId: string
  query: string
  initialTableId?: JoinTableId
  onApply: (query: string) => void
  onClose: () => void
}

const TABLE_CHOICES = [
  {
    id: 'event',
    title: 'Hendelser',
    fields: 'event.url_path',
  },
  {
    id: 'session',
    title: 'Brukerdetaljer',
    fields: 'session.browser',
  },
  {
    id: 'event_data',
    title: 'Hendelsesdetaljer',
    fields: 'ep.data_key, ep.string_value',
  },
  {
    id: 'website',
    title: 'Nettsider',
    fields: 'public_website.name',
  },
] as const

export default function JoinQueryDialog({
  projectId,
  query,
  initialTableId = 'session',
  onApply,
  onClose,
}: JoinQueryDialogProps) {
  const [tableId, setTableId] = useState<JoinTableId>(initialTableId)
  const tables = getBigQueryTables(projectId)
  const source = tables.find((table) => table.id === 'event')!
  const sourceChoice = TABLE_CHOICES.find((table) => table.id === 'event')!
  const choice = TABLE_CHOICES.filter((table) => table.id !== 'event').find((table) => table.id === tableId)!
  const options = getSqlJoinOptions(query, projectId)
  const option = options.find((join) => join.id === tableId)!
  const isNewQuery = !query.trim() || /^\s*SELECT\s*$/i.test(query)
  const example = `SELECT ${sourceChoice.fields}, ${choice.fields}\nFROM ${getFullTableName(projectId, source.datasetTable)}`
  const exampleOption = getSqlJoinOptions(example, projectId).find((join) => join.id === tableId)
  const replacementSource = exampleOption?.joinSql
    ? `FROM ${getFullTableName(projectId, source.datasetTable)}\n${exampleOption.joinSql}`
    : null
  const replacement =
    !option.sql && !isNewQuery && !option.alreadyJoined && replacementSource
      ? replaceSqlJoinSource(query, replacementSource)
      : null
  const sql = option.sql ?? (isNewQuery ? exampleOption?.sql : replacement)
  const preview = replacement ? replacementSource : (option.joinSql ?? exampleOption?.joinSql)
  const cannotExtend = !sql && !isNewQuery && !option.alreadyJoined
  const countWarning =
    tableId === 'event_data'
      ? 'En hendelse kan vises flere ganger. Tell unike hendelse-ID-er hvis du vil telle hendelser.'
      : null

  return (
    <Modal open onClose={onClose} header={{ heading: 'JOIN tabeller' }} width="medium">
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <JoinRelationDiagram
            projectId={projectId}
            tableId={tableId}
            targetSelector={
              <Select
                label="JOIN med"
                hideLabel
                size="small"
                value={tableId}
                onChange={(event) => setTableId(event.target.value as JoinTableId)}
              >
                {options.map((join) => {
                  const table = tables.find((candidate) => candidate.id === join.id)!
                  return (
                    <option key={table.id} value={table.id}>
                      {TABLE_CHOICES.find((choice) => choice.id === table.id)!.title} (
                      {table.datasetTable.split('.').pop()})
                    </option>
                  )
                })}
              </Select>
            }
          />
          {!option.alreadyJoined && countWarning && <BodyShort size="small">{countWarning}</BodyShort>}
          {option.alreadyJoined ? (
            <Alert variant="info" size="small">
              Denne tabellen er allerede koblet til {sourceChoice.title}.
            </Alert>
          ) : cannotExtend ? (
            <Alert variant="warning" size="small">
              Kan ikke finne FROM-delen sikkert. Bruk én SELECT-spørring uten UNION eller WITH.
            </Alert>
          ) : replacement ? (
            <Alert variant="info" size="small">
              Erstatter FROM og eksisterende JOIN-er. Resten av spørringen beholdes. Kontroller feltnavn og aliaser
              etterpå.
            </Alert>
          ) : null}
          {!option.alreadyJoined && preview && (
            <ReadMore header="Vis SQL" size="small">
              <div className="flex flex-col gap-2">
                <CopyButton
                  copyText={preview}
                  text="Kopier SQL"
                  activeText="SQL kopiert"
                  size="small"
                  className="self-start"
                />
                <pre
                  aria-label="JOIN-kode"
                  className="m-0 max-h-80 overflow-auto rounded border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3 text-xs whitespace-pre-wrap break-words"
                >
                  {preview}
                </pre>
              </div>
            </ReadMore>
          )}
          <ErDiagramAccordion projectId={projectId} onOpenJoin={setTableId} />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          disabled={!sql || option.alreadyJoined}
          onClick={() => {
            if (sql && !option.alreadyJoined) {
              onApply(sql)
              onClose()
            }
          }}
        >
          {replacement ? 'Erstatt FROM og JOIN' : 'Sett inn JOIN'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
