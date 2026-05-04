import { useRef } from 'react'
import { Label, UNSAFE_Combobox, Modal, Textarea, Button } from '@navikt/ds-react'
import type { UrlPathFilterProps } from '../model/types.ts'
import { formatPathLabel } from '../utils/urlPathFilter.ts'
import { useUrlPathFilter } from '../hooks/useUrlPathFilter.ts'

export const UrlPathFilter = ({
  urlPaths,
  onUrlPathsChange,
  pathOperator,
  onPathOperatorChange,
  selectedWebsiteDomain,
  label = 'URL',
  size = 'small',
  hideLabel = false,
  showOperator = true,
  showSuggestions = false,
  isMultiSelect = true,
  className = '',
}: UrlPathFilterProps) => {
  const urlModalRef = useRef<HTMLDialogElement>(null)
  const switchModalRef = useRef<HTMLDialogElement>(null)

  const {
    uniqueUrlPaths,
    comboInputValue,
    setComboInputValue,

    isUrlModalOpen,
    urlPasteInput,
    setUrlPasteInput,
    urlPasteError,
    setUrlPasteError,
    handleBulkAddUrls,
    closeBulkModal,

    isSwitchModalOpen,
    pendingSwitchData,
    confirmSwitch,
    declineSwitch,
    closeSwitchModal,

    isMissingSlashModalOpen,
    pendingMissingSlash,
    confirmMissingSlash,
    closeMissingSlashModal,

    handlePaste,
    handleToggleSelected,
    handleBlur,
  } = useUrlPathFilter(urlPaths, onUrlPathsChange, selectedWebsiteDomain, isMultiSelect)

  return (
    <div className={className}>
      {showOperator && (
        <div className="flex items-center gap-2 mb-1">
          {!hideLabel && (
            <Label size={size} htmlFor="url-filter">
              {label}
            </Label>
          )}
          <select
            className="text-sm bg-[var(--ax-bg-default)] border border-[var(--ax-border-neutral-subtle)] rounded text-[var(--ax-text-accent)] font-medium cursor-pointer focus:outline-none py-1 px-2"
            value={pathOperator}
            onChange={(e) => onPathOperatorChange(e.target.value)}
          >
            <option value="equals">er lik</option>
            <option value="starts-with">starter med</option>
          </select>
        </div>
      )}
      <div onPaste={handlePaste} onBlur={handleBlur}>
        <UNSAFE_Combobox
          id="url-filter"
          label={label}
          hideLabel={showOperator || hideLabel}
          size={size}
          isMultiSelect={isMultiSelect}
          allowNewValues
          toggleListButton={showSuggestions}
          options={
            showSuggestions ? uniqueUrlPaths.map((p) => ({ label: formatPathLabel(p), value: formatPathLabel(p) })) : []
          }
          filteredOptions={showSuggestions ? undefined : []}
          selectedOptions={uniqueUrlPaths.map(formatPathLabel)}
          onToggleSelected={handleToggleSelected}
          value={comboInputValue}
          onChange={(val) => setComboInputValue(val)}
        />
      </div>

      {/* Bulk URL paste modal */}
      <Modal
        ref={urlModalRef}
        open={isUrlModalOpen}
        onClose={closeBulkModal}
        header={{ heading: 'Lim inn flere URL-er', closeButton: true }}
      >
        <Modal.Body>
          <Textarea
            label="Lim inn URL-er (én per linje, eller kommaseparert)"
            description="Du kan lime inn hele URL-er (f.eks. https://nav.no/side) eller bare stier (/side)"
            value={urlPasteInput}
            onChange={(e) => {
              setUrlPasteInput(e.target.value)
              setUrlPasteError('')
            }}
            minRows={6}
          />
          {urlPasteError && <p className="text-red-600 text-sm mt-2">{urlPasteError}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleBulkAddUrls}>Legg til</Button>
          <Button variant="secondary" onClick={closeBulkModal}>
            Avbryt
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Missing leading slash modal */}
      <Modal
        open={isMissingSlashModalOpen}
        onClose={closeMissingSlashModal}
        header={{
          heading: pendingMissingSlash ? `Mente du /${pendingMissingSlash}?` : '',
          closeButton: true,
        }}
      >
        <Modal.Body>
          {pendingMissingSlash && (
            <div className="space-y-4">
              <p>
                Du skrev <strong>{pendingMissingSlash}</strong>, men URL-er starter vanligvis med <strong>/</strong>.
              </p>
              <p>Vil du at vi skal legge til dette automatisk?</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeMissingSlashModal}>
            Avbryt
          </Button>
          <Button onClick={confirmMissingSlash}>Ja, legg til /</Button>
        </Modal.Footer>
      </Modal>

      {/* Website switch confirmation modal */}
      <Modal
        ref={switchModalRef}
        open={isSwitchModalOpen}
        onClose={closeSwitchModal}
        header={{ heading: 'Bytte nettsted?', closeButton: true }}
      >
        <Modal.Body>
          {pendingSwitchData && (
            <div className="space-y-4">
              <p>
                Denne siden hører til <strong>{pendingSwitchData.website.name}</strong>, ikke nettstedet du ser på nå.
              </p>
              <div className="bg-[var(--ax-bg-neutral-soft)] p-3 rounded-md text-sm break-all">
                {pendingSwitchData.originalUrl}
              </div>
              <p>
                Vil du se statistikk for <strong>{pendingSwitchData.website.name}</strong> i stedet?
              </p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={confirmSwitch}>Ja, bytt</Button>
          <Button variant="secondary" onClick={declineSwitch}>
            Nei, ikke bytt
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default UrlPathFilter
