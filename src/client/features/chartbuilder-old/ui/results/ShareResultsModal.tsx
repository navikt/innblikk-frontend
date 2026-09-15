import { useState, useEffect } from 'react'
import { Modal, Button, Textarea, Select, Checkbox, CheckboxGroup, ReadMore, CopyButton } from '@navikt/ds-react'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'

interface ShareResultsModalProps {
  sql: string
  open: boolean
  onClose: () => void
}

const ShareResultsModal = ({ sql, open, onClose }: ShareResultsModalProps) => {
  const [description, setDescription] = useState('')
  const [selectedTab, setSelectedTab] = useState('table')
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([])
  const maxChars = 200

  // On open, if description/selectedTab/hiddenTabs are default, set from URL params
  useEffect(() => {
    if (open) {
      const urlParams = new URLSearchParams(window.location.search)

      // Description
      if (description === '') {
        const descParam = urlParams.get('beskrivelse')
        if (descParam) {
          setDescription(descParam)
        }
      }

      // Tab
      if (selectedTab === 'table') {
        const tabParam = urlParams.get('tab')
        if (tabParam) {
          setSelectedTab(tabParam)
        }
      }

      // hideTabs
      if (hiddenTabs.length === 0) {
        const hideTabsParam = urlParams.get('hideTabs')
        if (hideTabsParam) {
          setHiddenTabs(hideTabsParam.split(',').filter(Boolean))
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Genererer delbar lenke for CopyButton
  const getShareUrl = () => {
    const encodedSql = encodeURIComponent(sql)
    const encodedDesc = description.trim() ? encodeURIComponent(description.trim()) : ''
    let baseUrl = `${window.location.origin}/grafdeling?sql=${encodedSql}`
    if (encodedDesc) {
      baseUrl += `&beskrivelse=${encodedDesc}`
    }
    if (selectedTab !== 'table') {
      baseUrl += `&tab=${selectedTab}`
    }
    if (hiddenTabs.length > 0) {
      baseUrl += `&hideTabs=${hiddenTabs.join(',')}`
    }
    return baseUrl
  }

  const handleClose = () => {
    setDescription('')
    setSelectedTab('table')
    setHiddenTabs([])
    onClose()
  }

  const tabOptions = [
    { label: 'Tabell', value: 'table' },
    { label: 'Linjediagram', value: 'linechart' },
    { label: 'Områdediagram', value: 'areachart' },
    { label: 'Stolpediagram', value: 'barchart' },
    { label: 'Kakediagram', value: 'piechart' },
  ]

  return (
    <Modal
      open={open}
      onClose={handleClose}
      header={{
        heading: 'Del tabell & graf',
        closeButton: true,
      }}
      width="medium"
    >
      <Modal.Body>
        <div className="space-y-4">
          <Textarea
            label="Tittel"
            description="Fullfør setningen: Grafen viser..."
            value={description}
            onChange={(e) => {
              const value = e.target.value
              if (value.length <= maxChars) {
                setDescription(value)
              }
            }}
            maxLength={maxChars}
            rows={2}
          />

          <Select label="Velg startfane" value={selectedTab} onChange={(e) => setSelectedTab(e.target.value)}>
            {tabOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <ReadMore header="Skjul graftyper">
            <CheckboxGroup
              legend="Skjul graftyper"
              description="Velg graftyper du vil skjule i delingsvisningen. Dette kan være nyttig hvis du kun ønsker å vise én eller noen få graf- eller tabelltyper til mottakeren."
              value={hiddenTabs}
              onChange={(val) => setHiddenTabs(val as string[])}
            >
              {tabOptions.map((option) => (
                <Checkbox key={option.value} value={option.value}>
                  {option.label}
                </Checkbox>
              ))}
            </CheckboxGroup>
          </ReadMore>

          {/* Kopier-knapp flyttet til footer */}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Lukk
        </Button>
        <CopyButton
          copyText={getShareUrl()}
          text="Kopier delingslenke"
          activeText="Kopiert!"
          size="medium"
          variant="action"
          className="mr-2"
          onClick={() => {
            const properties: KopierLenkeProperties = { seksjon: 'grafbygger-deling' }
            window.umami?.track(Events.KOPIER_LENKE, properties)
          }}
        />
      </Modal.Footer>
    </Modal>
  )
}

export default ShareResultsModal
