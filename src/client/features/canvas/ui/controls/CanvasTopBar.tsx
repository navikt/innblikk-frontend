import { ActionMenu, Alert, Button, Tabs, TextField } from '@navikt/ds-react'
import { PersonGroupIcon, PersonIcon, ThemeIcon } from '@navikt/aksel-icons'
import { House, FileText, MoreVertical, Presentation } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject, type TouchEvent } from 'react'
import PeriodPicker from '../../../analysis/ui/PeriodPicker.tsx'
import type { GraphCategoryDto } from '../../../oversikt/model/types.ts'
import CanvasAddActionMenu from './CanvasAddActionMenu.tsx'
import CanvasFacilitatorActionMenu from './CanvasFacilitatorActionMenu.tsx'

type CanvasTopBarProps = {
  canvasToolbarRef: RefObject<HTMLDivElement | null>
  canvasTitle: string
  projectId: number | null
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
  onOpenAddSqlEditor: () => void
  onOpenAddDashboard: () => void
  onOpenAddHeading: () => void
  onOpenAddText: () => void
  onOpenAddTable: () => void
  onOpenAddLink: () => void
  onOpenAddSticky: () => void
  onOpenAddCodeBlock: () => void
  onOpenAddSection: () => void
  onOpenImportStickyCsv: () => void
  onOpenAddImage: () => void
  onOpenAddIcon: () => void
  onOpenAddFigure: () => void
  onOpenAddDrawing: () => void
  onOpenAddIllustration: () => void
  onOpenTimer: () => void
  onOpenDotVoting: () => void
  onOpenShareView: () => void
  onOpenPresentationView: () => void
  timerLabel: string | null
  dotVotingLabel: string | null
  isTimerRunning: boolean
  isTimerPaused: boolean
  isDotVotingActive: boolean
  isDotVotingPaused: boolean
  isGrafbyggerEmbedded: boolean
  onCloseGrafbygger: () => void
  onOpenCreateTab: () => void
  onOpenManageTabs: (tabId?: number) => void
  onOpenCanvasSettings: () => void
  onOpenInventory: () => void
  onOpenChangeLog: () => void
  canManageTabs: boolean
  canPersistToDashboard: boolean
  shouldShowCreateCanvasModal: boolean
  canvasCategories: GraphCategoryDto[]
  activeCanvasCategoryId: number | null
  onChangeActiveCanvasCategory: (categoryId: number) => void
  getCanvasCategoryDisplayName: (name?: string) => string
  isCanvasFrontpage: boolean
  showDateFilter: boolean
  showUrlPathFilter: boolean
  urlPathFilterValue: string
  onUrlPathFilterChange: (value: string) => void
  activeParticipantCount?: number
  activeOtherParticipantCount?: number
  participantLabels?: string[]
  isInteractionLocked?: boolean
  isCanvasLocked?: boolean
  isCanvasReadOnly?: boolean
  onToggleCanvasLock?: () => void
  onToggleLockedModeEditing?: () => void
}

const CanvasTopBar = ({
  canvasToolbarRef,
  canvasTitle,
  projectId,
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
  onOpenAddSqlEditor,
  onOpenAddDashboard,
  onOpenAddHeading,
  onOpenAddText,
  onOpenAddTable,
  onOpenAddLink,
  onOpenAddSticky,
  onOpenAddCodeBlock,
  onOpenAddSection,
  onOpenImportStickyCsv,
  onOpenAddImage,
  onOpenAddIcon,
  onOpenAddFigure,
  onOpenAddDrawing,
  onOpenAddIllustration,
  onOpenTimer,
  onOpenDotVoting,
  onOpenShareView,
  onOpenPresentationView,
  timerLabel,
  dotVotingLabel,
  isTimerRunning,
  isTimerPaused,
  isDotVotingActive,
  isDotVotingPaused,
  isGrafbyggerEmbedded,
  onCloseGrafbygger,
  onOpenCreateTab,
  onOpenManageTabs,
  onOpenCanvasSettings,
  onOpenInventory,
  onOpenChangeLog,
  canManageTabs,
  canPersistToDashboard,
  shouldShowCreateCanvasModal,
  canvasCategories,
  activeCanvasCategoryId,
  onChangeActiveCanvasCategory,
  getCanvasCategoryDisplayName,
  isCanvasFrontpage,
  showDateFilter,
  showUrlPathFilter,
  urlPathFilterValue,
  onUrlPathFilterChange,
  activeParticipantCount = 1,
  participantLabels = [],
  isInteractionLocked = false,
  isCanvasLocked = false,
  isCanvasReadOnly = isCanvasLocked,
  onToggleCanvasLock,
  onToggleLockedModeEditing,
}: CanvasTopBarProps) => {
  const canvasHomeHref = projectId !== null ? `/canvas?projectId=${projectId}` : '/canvas'
  const participantCountText = `${activeParticipantCount} ${activeParticipantCount === 1 ? 'person' : 'personer'} i canvas`
  const canEditCanvas = !isCanvasReadOnly
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('umami-theme')
    return storedTheme === 'dark' ? 'dark' : 'light'
  })
  const normalizedCanvasTitle = canvasTitle.trim()
  const headingTitle =
    canvasInitMode === 'checking'
      ? 'Innblikk'
      : isCanvasFrontpage || normalizedCanvasTitle.toLowerCase() === 'innblikk'
        ? normalizedCanvasTitle || 'Innblikk'
        : `Innblikk: ${normalizedCanvasTitle}`
  const lastTabTouchRef = useRef<{ tabId: number; at: number } | null>(null)

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<'light' | 'dark'>
      setTheme(customEvent.detail === 'dark' ? 'dark' : 'light')
    }

    window.addEventListener('themeChange', handleThemeChange as EventListener)
    return () => {
      window.removeEventListener('themeChange', handleThemeChange as EventListener)
    }
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    const themeElement = document.querySelector('.aksel-theme')

    root.classList.remove('light', 'dark')
    themeElement?.classList.remove('light', 'dark')

    root.classList.add(nextTheme)
    themeElement?.classList.add(nextTheme)

    localStorage.setItem('umami-theme', nextTheme)
    setTheme(nextTheme)
    window.dispatchEvent(new CustomEvent('themeChange', { detail: nextTheme }))
  }

  const handleTabRename = (tabId: number) => {
    if (canvasInitMode !== 'existing') return
    onOpenManageTabs(tabId)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLElement>, tabId: number) => {
    if (event.key !== 'F2') return
    event.preventDefault()
    handleTabRename(tabId)
  }

  const handleTabTouchEnd = (event: TouchEvent<HTMLElement>, tabId: number) => {
    const now = event.timeStamp
    const lastTap = lastTabTouchRef.current
    const isDoubleTap = lastTap !== null && lastTap.tabId === tabId && now - lastTap.at <= 350
    lastTabTouchRef.current = { tabId, at: now }
    if (!isDoubleTap) return
    event.preventDefault()
    handleTabRename(tabId)
  }

  return (
    <div
      ref={canvasToolbarRef}
      role="region"
      aria-label="Canvas toppfelt"
      className="pointer-events-none fixed left-4 right-4 top-4 z-30"
    >
      <div className="pointer-events-auto rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-2 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <a
            href={canvasHomeHref}
            aria-label={`${headingTitle}. Til dashboard-oversikt`}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-left text-[var(--ax-text-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ax-border-accent)]"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <h1 className="m-0 truncate text-[20px] font-semibold leading-none" title={headingTitle}>
              {headingTitle}
            </h1>
          </a>
          {!isCanvasFrontpage && (
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end">
              {showDateFilter && (
                <div className="w-[220px] shrink-0">
                  <PeriodPicker
                    period={period}
                    onPeriodChange={onPeriodChange}
                    startDate={customStartDate}
                    onStartDateChange={onCustomStartDateChange}
                    endDate={customEndDate}
                    onEndDateChange={onCustomEndDateChange}
                    className="w-full sm:w-auto min-w-[220px]"
                  />
                </div>
              )}
              {showUrlPathFilter && (
                <div className="w-[220px] shrink-0">
                  <TextField
                    label="URL-sti"
                    size="small"
                    value={urlPathFilterValue}
                    onChange={(event) => onUrlPathFilterChange(event.target.value)}
                    placeholder="/"
                    className="w-full sm:w-auto min-w-[220px]"
                  />
                </div>
              )}
              {isCanvasLocked && (
                <Button
                  size="small"
                  variant={'secondary'}
                  onClick={onToggleLockedModeEditing}
                  disabled={canvasInitMode !== 'existing' || isInteractionLocked}
                  className="shrink-0 whitespace-nowrap"
                >
                  {isCanvasReadOnly ? 'Rediger' : 'Avslutt redigering'}
                </Button>
              )}
              {canEditCanvas && (
                <CanvasAddActionMenu
                  onAddWebsite={onOpenAddPage}
                  onOpenGrafbygger={onOpenCreateChart}
                  onImportChart={onOpenImportChart}
                  onAddSqlEditor={onOpenAddSqlEditor}
                  onAddDashboard={onOpenAddDashboard}
                  onAddHeading={onOpenAddHeading}
                  onAddText={onOpenAddText}
                  onAddTable={onOpenAddTable}
                  onAddLink={onOpenAddLink}
                  onAddSticky={onOpenAddSticky}
                  onAddCodeBlock={onOpenAddCodeBlock}
                  onAddSection={onOpenAddSection}
                  onImportStickyCsv={onOpenImportStickyCsv}
                  onAddImage={onOpenAddImage}
                  onAddIcon={onOpenAddIcon}
                  onAddFigure={onOpenAddFigure}
                  onAddDrawing={onOpenAddDrawing}
                  onAddIllustration={onOpenAddIllustration}
                  onAddTab={onOpenCreateTab}
                  onOpenDotVoting={onOpenDotVoting}
                  disabled={canvasInitMode !== 'existing' || isInteractionLocked}
                  buttonSize="small"
                  buttonVariant="primary"
                  buttonClassName="shrink-0 whitespace-nowrap"
                  iconSize={16}
                  withFloatingFrame={false}
                />
              )}
              {canEditCanvas && (
                <CanvasFacilitatorActionMenu
                  onOpenTimer={onOpenTimer}
                  onOpenDotVoting={onOpenDotVoting}
                  onOpenShareView={onOpenShareView}
                  onOpenPresentationView={onOpenPresentationView}
                  isCanvasLocked={isCanvasLocked}
                  onToggleCanvasLock={onToggleCanvasLock}
                  timerLabel={timerLabel}
                  dotVotingLabel={dotVotingLabel}
                  disabled={canvasInitMode !== 'existing'}
                  buttonSize="small"
                  buttonVariant="secondary"
                  buttonClassName="shrink-0 whitespace-nowrap"
                  iconSize={16}
                  withFloatingFrame={false}
                />
              )}
              {timerLabel && (
                <Button
                  size="small"
                  variant={isTimerRunning ? 'danger' : 'secondary'}
                  onClick={onOpenTimer}
                  className="shrink-0 whitespace-nowrap"
                >
                  {isTimerPaused ? `Pauset nedtelling: ${timerLabel}` : `Nedtelling: ${timerLabel}`}
                </Button>
              )}
              {dotVotingLabel && isDotVotingActive && (
                <Button
                  size="small"
                  variant={isDotVotingPaused ? 'secondary' : 'danger'}
                  onClick={onOpenDotVoting}
                  className="shrink-0 whitespace-nowrap"
                >
                  {isDotVotingPaused ? `Pauset prikkvotering: ${dotVotingLabel}` : `Prikkvotering: ${dotVotingLabel}`}
                </Button>
              )}
              {canEditCanvas && (
                <ActionMenu>
                  <ActionMenu.Trigger>
                    <Button
                      size="small"
                      variant="tertiary"
                      icon={
                        activeParticipantCount > 1 ? (
                          <PersonGroupIcon aria-hidden fontSize="0.95rem" />
                        ) : (
                          <PersonIcon aria-hidden fontSize="0.95rem" />
                        )
                      }
                      aria-label={participantCountText}
                      title={participantCountText}
                      className="shrink-0 whitespace-nowrap"
                    >
                      <span className="text-sm font-medium leading-none">{activeParticipantCount}</span>
                    </Button>
                  </ActionMenu.Trigger>
                  <ActionMenu.Content align="end">
                    {participantLabels.map((label, index) => (
                      <ActionMenu.Item key={`canvas-participant-${index}`} onSelect={() => undefined}>
                        {label}
                      </ActionMenu.Item>
                    ))}
                  </ActionMenu.Content>
                </ActionMenu>
              )}
              {isGrafbyggerEmbedded && (
                <Button size="small" variant="secondary" onClick={onCloseGrafbygger}>
                  Lukk grafbygger
                </Button>
              )}
              <ActionMenu>
                <ActionMenu.Trigger>
                  <Button
                    size="small"
                    variant="tertiary"
                    icon={<MoreVertical size={16} />}
                    aria-label="Innstillinger"
                    disabled={canvasInitMode !== 'existing' || isInteractionLocked}
                  />
                </ActionMenu.Trigger>
                <ActionMenu.Content align="end">
                  <ActionMenu.Item onClick={() => window.location.assign('/canvas')}>Canvas-oversikt</ActionMenu.Item>
                  <ActionMenu.Divider />
                  <ActionMenu.Item onClick={onOpenInventory}>Elementer</ActionMenu.Item>
                  <ActionMenu.Item onClick={onOpenChangeLog}>Endringslogg</ActionMenu.Item>
                  {canManageTabs && (
                    <ActionMenu.Item onClick={() => onOpenManageTabs()}>Administrer faner</ActionMenu.Item>
                  )}
                  <ActionMenu.Item onClick={onOpenCanvasSettings}>Innstillinger</ActionMenu.Item>
                  <ActionMenu.Divider />
                  <ActionMenu.Item onClick={() => window.location.assign('/')}>
                    <span className="inline-flex items-center gap-1">
                      Innblikk
                      <House size={14} />
                    </span>
                  </ActionMenu.Item>
                  <ActionMenu.Divider />
                  <ActionMenu.Item onClick={toggleTheme}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <ThemeIcon aria-hidden fontSize="1rem" />
                      Bytt til {theme === 'dark' ? 'lyst' : 'mørkt'} tema
                    </span>
                  </ActionMenu.Item>
                  <ActionMenu.Item onClick={onOpenShareView}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <FileText size={14} />
                      Artikkelvisning
                    </span>
                  </ActionMenu.Item>
                  <ActionMenu.Item onClick={onOpenPresentationView}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <Presentation size={14} />
                      Presentasjon
                    </span>
                  </ActionMenu.Item>
                </ActionMenu.Content>
              </ActionMenu>
            </div>
          )}
        </div>
        {!isCanvasFrontpage && !canPersistToDashboard && !shouldShowCreateCanvasModal && (
          <div className="mt-2">
            <Alert variant="warning" size="small">
              Canvas er ikke koblet til et dashboard.
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
                    onDoubleClick={() => handleTabRename(category.id)}
                    onTouchEnd={(event) => handleTabTouchEnd(event, category.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, category.id)}
                    title="Dobbeltklikk eller dobbelttrykk for å endre navn. Tastatur: F2."
                  />
                ))}
              </Tabs.List>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}

export default CanvasTopBar
