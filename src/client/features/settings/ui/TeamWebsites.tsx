import React, { useEffect, useMemo, useState, useRef } from 'react'
import { BodyShort, Link, Table, Button, Tag, Search, Select } from '@navikt/ds-react'
import { useWebsites, useWebsiteFilters, useWebsiteModal } from '../hooks'
import { TrackingCodeModal } from './TrackingCodeModal'
import { formatDate } from '../utils'
import type { FilterType, SelectedWebsite } from '../model'

const styles = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '20px',
    marginTop: '25px',
    alignItems: 'flex-end',
  },
} as const

export function TeamWebsites() {
  const { data, groupedData, filteredData, setFilteredData } = useWebsites()
  const { searchQuery, setSearchQuery, filter, setFilter } = useWebsiteFilters(groupedData, setFilteredData)
  const { pendingSporingskode, openModal, closeModal } = useWebsiteModal()
  const [selectedItem, setSelectedItem] = useState<SelectedWebsite>({ name: '', id: '' })
  const modalRef = useRef<HTMLDialogElement>(null)
  const { hostname, pathname, search, hash } = window.location
  const currentPath = `${pathname}${search}${hash}`
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  const isDev = hostname.includes('.dev.nav.no')
  const isProd = hostname.includes('.nav.no') && !isDev

  const environmentLink = (() => {
    if (isProd) {
      const devHostname = hostname.replace('.nav.no', '.dev.nav.no')
      return {
        href: `https://${devHostname}${currentPath}`,
        text: 'Leter du etter dev-sporingskode? Bruk ',
        label: 'dev-miljøet',
      }
    }

    if (isDev) {
      const prodHostname = hostname.replace('.dev.nav.no', '.nav.no')
      return {
        href: `https://${prodHostname}${currentPath}`,
        text: 'Leter du etter prod-sporingskode? Bruk ',
        label: 'prod-miljøet',
      }
    }

    return null
  })()

  const visibleData = isProd
    ? filteredData.filter((group) => !!group.prod).map((group) => ({ ...group, dev: undefined }))
    : filteredData

  const pendingSelectedItem = useMemo(() => {
    if (!data || !pendingSporingskode) return null
    const website = data.find((w) => w.id === pendingSporingskode)
    if (!website) return null
    return {
      name: website.name,
      id: website.id,
      domain: website.domain,
      createdAt: website.createdAt,
      updatedAt: website.updatedAt,
    }
  }, [data, pendingSporingskode])

  // Open modal when we can resolve the requested website from URL params
  useEffect(() => {
    if (pendingSelectedItem) {
      modalRef.current?.showModal()
    }
  }, [pendingSelectedItem])

  const handleButtonClick = (name: string, id: string, domain?: string, createdAt?: string, updatedAt?: string) => {
    setSelectedItem({ name, id, domain, createdAt, updatedAt })
    openModal(id)
    modalRef.current?.showModal()
  }

  return (
    <div className="px-6 md:px-8 lg:px-10 py-4 md:py-6">
      <div className="search-controls" style={styles.container}>
        <form role="search" style={{ width: '250px' }}>
          <Search
            label="Søk"
            hideLabel={false}
            variant="simple"
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
            size="small"
          />
        </form>
        {isLocalhost && (
          <Select
            label="Filtrer miljø"
            size="small"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            style={{ width: '180px' }}
          >
            <option value="all">Alle</option>
            <option value="prod-only">Kun prod</option>
            <option value="dev-only">Kun dev</option>
          </Select>
        )}
      </div>
      {environmentLink && (
        <BodyShort className="my-8">
          {environmentLink.text}
          <Link href={environmentLink.href}>{environmentLink.label}</Link>.
        </BodyShort>
      )}
      <div style={{ overflowX: 'auto' }}>
        <div className="my-2 text-md text-[var(--ax-text-default)]">{visibleData.length} nettsider/apper</div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell scope="col" style={{ width: '20%' }}>
                Umami-prosjekt
              </Table.HeaderCell>
              <Table.HeaderCell scope="col" style={{ width: '10%' }}>
                Miljø
              </Table.HeaderCell>
              <Table.HeaderCell scope="col" style={{ width: '30%' }}>
                Hoveddomene
              </Table.HeaderCell>
              <Table.HeaderCell scope="col" style={{ width: '12%' }}>
                Opprettet
              </Table.HeaderCell>
              <Table.HeaderCell scope="col" style={{ width: '12%' }}>
                Sist endret
              </Table.HeaderCell>
              <Table.HeaderCell scope="col" style={{ width: '20%' }}>
                Sporingskode
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visibleData.map((group) => {
              const rowCount = (group.prod ? 1 : 0) + (group.dev ? 1 : 0)
              const isLastRowProd = group.prod && !group.dev
              const groupSeparatorStyle = { borderBottom: '2px solid var(--ax-border-default)' }

              return (
                <React.Fragment key={group.baseName}>
                  {group.prod && (
                    <Table.Row style={!isLastRowProd ? undefined : groupSeparatorStyle}>
                      <Table.HeaderCell scope="row" rowSpan={rowCount} style={{ verticalAlign: 'middle' }}>
                        {group.baseName}
                      </Table.HeaderCell>
                      <Table.DataCell>
                        <Tag variant="success" size="small">
                          prod
                        </Tag>
                      </Table.DataCell>
                      <Table.DataCell>{group.prod.domain}</Table.DataCell>
                      <Table.DataCell>{formatDate(group.prod.createdAt)}</Table.DataCell>
                      <Table.DataCell>{formatDate(group.prod.updatedAt)}</Table.DataCell>
                      <Table.DataCell>
                        <Button
                          variant="primary"
                          size="small"
                          onClick={() =>
                            handleButtonClick(
                              group.prod!.name,
                              group.prod!.id,
                              group.prod!.domain,
                              group.prod!.createdAt,
                              group.prod!.updatedAt,
                            )
                          }
                        >
                          Sporingskode prod
                        </Button>
                      </Table.DataCell>
                    </Table.Row>
                  )}
                  {group.dev && (
                    <Table.Row style={groupSeparatorStyle}>
                      {!group.prod && (
                        <Table.HeaderCell scope="row" style={{ verticalAlign: 'middle' }}>
                          {group.baseName}
                        </Table.HeaderCell>
                      )}
                      <Table.DataCell>
                        <Tag variant="alt1" size="small">
                          dev
                        </Tag>
                      </Table.DataCell>
                      <Table.DataCell>{group.dev.domain}</Table.DataCell>
                      <Table.DataCell>{formatDate(group.dev.createdAt)}</Table.DataCell>
                      <Table.DataCell>{formatDate(group.dev.updatedAt)}</Table.DataCell>
                      <Table.DataCell>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() =>
                            handleButtonClick(
                              group.dev!.name,
                              group.dev!.id,
                              group.dev!.domain,
                              group.dev!.createdAt,
                              group.dev!.updatedAt,
                            )
                          }
                        >
                          Sporingskode dev
                        </Button>
                      </Table.DataCell>
                    </Table.Row>
                  )}
                </React.Fragment>
              )
            })}
          </Table.Body>
        </Table>
      </div>
      <TrackingCodeModal ref={modalRef} selectedItem={pendingSelectedItem ?? selectedItem} onClose={closeModal} />
    </div>
  )
}
