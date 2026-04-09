import { ActionMenu, Alert, Button, Tabs } from '@navikt/ds-react'
import { MoreVertical, Plus } from 'lucide-react'
import type { RefObject } from 'react'
import PeriodPicker from '../../analysis/ui/PeriodPicker.tsx'
import type { GraphCategoryDto } from '../../oversikt/model/types.ts'

type CanvasTopBarProps = {
  canvasToolbarRef: RefObject<HTMLDivElement>
  projectId: number | null
  canvasTitle: string
  period: string
  customStartDate?: Date
  customEndDate?: Date
  onPeriodChange: (period: string) => void
  onCustomStartDateChange: (date?: Date) => void
  onCustomEndDateChange: (date?: Date) => void
  canvasInitMode: 'checking' | 'existing' | 'create'
  onOpenAddPage: () => void
  onOpenCreateChart: () => void
  onOpenImportChart: () => void
  onOpenAddDashboard: () => void
  onOpenAddHeading: () => void
  onOpenAddText: () => void
  onOpenAddSticky: () => void
  onOpenAddImage: () => void
  onOpenAddIcon: () => void
  onOpenAddFigure: () => void
  onOpenAddDrawing: () => void
  onOpenAddIllustration: () => void
  isGrafbyggerEmbedded: boolean
  onCloseGrafbygger: () => void
  isProjectManagerEmbedded: boolean
  onOpenProjectManagerWorkspace: () => void
  onCloseProjectManagerWorkspace: () => void
  onOpenCreateTab: () => void
  onOpenManageTabs: () => void
  onOpenCanvasSettings: () => void
  canManageTabs: boolean
  canPersistToDashboard: boolean
  shouldShowCreateCanvasModal: boolean
  syncError: string | null
  onDismissSyncError: () => void
  canvasCategories: GraphCategoryDto[]
  activeCanvasCategoryId: number | null
  onChangeActiveCanvasCategory: (categoryId: number) => void
  getCanvasCategoryDisplayName: (name?: string) => string
  isCanvasFrontpage: boolean
}

const CanvasTopBar = ({
  canvasToolbarRef,
  projectId,
  canvasTitle,
  period,
  customStartDate,
  customEndDate,
  onPeriodChange,
  onCustomStartDateChange,
  onCustomEndDateChange,
  canvasInitMode,
  onOpenAddPage,
  onOpenCreateChart,
  onOpenImportChart,
  onOpenAddDashboard,
  onOpenAddHeading,
  onOpenAddText,
  onOpenAddSticky,
  onOpenAddImage,
  onOpenAddIcon,
  onOpenAddFigure,
  onOpenAddDrawing,
  onOpenAddIllustration,
  isGrafbyggerEmbedded,
  onCloseGrafbygger,
  isProjectManagerEmbedded,
  onOpenProjectManagerWorkspace,
  onCloseProjectManagerWorkspace,
  onOpenCreateTab,
  onOpenManageTabs,
  onOpenCanvasSettings,
  canManageTabs,
  canPersistToDashboard,
  shouldShowCreateCanvasModal,
  syncError,
  onDismissSyncError,
  canvasCategories,
  activeCanvasCategoryId,
  onChangeActiveCanvasCategory,
  getCanvasCategoryDisplayName,
  isCanvasFrontpage,
}: CanvasTopBarProps) => (
  <div ref={canvasToolbarRef} className="pointer-events-none fixed left-4 right-4 top-4 z-30">
    <div className="pointer-events-auto rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href="/canvas"
          aria-label={`Til canvas-forside${projectId !== null ? ` fra prosjekt ${projectId}` : ''}`}
          className="min-w-0 flex flex-1 items-center gap-1.5 rounded-sm border-0 bg-transparent p-0 text-left text-[var(--ax-text-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M16.5 10.5C16.5 13.8137 13.8137 16.5 10.5 16.5C7.18629 16.5 4.5 13.8137 4.5 10.5C4.5 7.18629 7.18629 4.5 10.5 4.5C13.8137 4.5 16.5 7.18629 16.5 10.5Z"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <path d="M15.2 15.2L20.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path
                d="M7.9 12.5V10.2M10.5 12.5V8.5M13.1 12.5V9.3"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h1 className="m-0 truncate text-[20px] font-semibold leading-none" title={canvasTitle}>
            {canvasTitle}
          </h1>
        </a>
        {!isCanvasFrontpage && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[152px] shrink-0 [&_label]:sr-only">
              <PeriodPicker
                period={period}
                onPeriodChange={onPeriodChange}
                startDate={customStartDate}
                onStartDateChange={onCustomStartDateChange}
                endDate={customEndDate}
                onEndDateChange={onCustomEndDateChange}
                className="w-full sm:w-auto min-w-[152px]"
              />
            </div>
            <ActionMenu>
              <ActionMenu.Trigger>
                <Button
                  size="small"
                  icon={<Plus size={16} />}
                  className="shrink-0 whitespace-nowrap"
                  disabled={canvasInitMode !== 'existing'}
                >
                  Legg til
                </Button>
              </ActionMenu.Trigger>
              <ActionMenu.Content align="end">
                <ActionMenu.Item onClick={onOpenAddPage}>Nettside</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenCreateChart}>Lag ny graf</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenImportChart}>Importer graf</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddDashboard}>Dashboard</ActionMenu.Item>
                <ActionMenu.Divider />
                <ActionMenu.Item onClick={onOpenAddHeading}>Overskrift</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddText}>Tekst</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddSticky}>Post-it-lapp</ActionMenu.Item>
                <ActionMenu.Divider />
                <ActionMenu.Item onClick={onOpenAddImage}>Bilde</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddIcon}>Ikon</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddFigure}>Figur</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddDrawing}>Tegning</ActionMenu.Item>
                <ActionMenu.Item onClick={onOpenAddIllustration}>Illustrasjoner</ActionMenu.Item>
                <ActionMenu.Divider />
                <ActionMenu.Item onClick={onOpenCreateTab}>Legg til fane</ActionMenu.Item>
              </ActionMenu.Content>
            </ActionMenu>
            {isGrafbyggerEmbedded && (
              <Button size="small" variant="secondary" onClick={onCloseGrafbygger}>
                Lukk grafbygger
              </Button>
            )}
            {isProjectManagerEmbedded && (
              <Button size="small" variant="secondary" onClick={onCloseProjectManagerWorkspace}>
                Lukk teamområde
              </Button>
            )}
            <ActionMenu>
              <ActionMenu.Trigger>
                <Button
                  size="small"
                  variant="tertiary"
                  icon={<MoreVertical size={16} />}
                  aria-label="Innstillinger"
                  disabled={canvasInitMode !== 'existing'}
                />
              </ActionMenu.Trigger>
              <ActionMenu.Content align="end">
                <ActionMenu.Item onClick={onOpenProjectManagerWorkspace}>Teamområde</ActionMenu.Item>
                {canManageTabs && <ActionMenu.Item onClick={onOpenManageTabs}>Administrer faner</ActionMenu.Item>}
                <ActionMenu.Item onClick={onOpenCanvasSettings}>Innstillinger</ActionMenu.Item>
              </ActionMenu.Content>
            </ActionMenu>
          </div>
        )}
      </div>
      {!isCanvasFrontpage && !canPersistToDashboard && !shouldShowCreateCanvasModal && (
        <div className="mt-2">
          <Alert variant="warning" size="small">
            Canvas er ikke koblet til et dashboard. Åpne canvas fra ProjectManager for lagring.
          </Alert>
        </div>
      )}
      {syncError && (
        <div className="mt-2">
          <Alert variant="error" size="small" closeButton onClose={onDismissSyncError}>
            {syncError}
          </Alert>
        </div>
      )}
      {canvasCategories.length > 1 && (
        <div className="mt-2">
          <Tabs
            value={activeCanvasCategoryId !== null ? String(activeCanvasCategoryId) : undefined}
            onChange={(value) => {
              const categoryId = Number(value)
              if (!Number.isFinite(categoryId)) return
              onChangeActiveCanvasCategory(categoryId)
            }}
          >
            <Tabs.List>
              {canvasCategories.map((category) => (
                <Tabs.Tab
                  key={category.id}
                  value={String(category.id)}
                  label={getCanvasCategoryDisplayName(category.name)}
                />
              ))}
            </Tabs.List>
          </Tabs>
        </div>
      )}
    </div>
  </div>
)

export default CanvasTopBar
