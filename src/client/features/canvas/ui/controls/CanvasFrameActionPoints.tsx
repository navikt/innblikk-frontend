import { ActionMenu, Button } from '@navikt/ds-react'
import { Check, Edit2, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { CanvasSectionLayoutMode } from '../../model/types.ts'
import { ICON_ROTATION_STEP_DEG } from '../../utils/canvasUtils.ts'

const stopMouseDownPropagation = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation()
}

const SECTION_MENU_BUTTON_CLASSNAME =
  '!h-8 !w-8 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] shadow-sm'

type CanvasFrameActionPointsProps = {
  frameKind:
    | 'website'
    | 'image'
    | 'heading'
    | 'text'
    | 'link'
    | 'sticky'
    | 'code-block'
    | 'section'
    | 'chart'
    | 'sql-editor'
    | 'icon'
    | 'figure'
    | 'drawing'
  isInternalDashboard?: boolean
  isIllustrationFrame: boolean
  actionButtonClassName: string
  onEditImage: () => void
  onEditDrawing: () => void
  onEditIllustration: () => void
  onEditDashboard: () => void
  onEditLink: () => void
  onEditTable: () => void
  isTableFrame?: boolean
  onEditIcon: () => void
  onDuplicateIcon: () => void
  onRotateIcon: (delta: number) => void
  onEditFigure: () => void
  onDuplicateFigure: () => void
  onDuplicateSection: () => void
  onDuplicateSticky: () => void
  onDuplicateText: () => void
  onDuplicateHeading: () => void
  onDuplicateDrawing: () => void
  onDuplicateImage: () => void
  headingFontSizePx: number
  onSetHeadingFontSize: (sizePx: number) => void
  onRotateIllustration: (delta: number) => void
  onRotateFigure: (delta: number) => void
  onRotateDrawing: (delta: number) => void
  sectionLayoutMode?: CanvasSectionLayoutMode
  onOpenSectionOptions: () => void
  sectionMoveOptions?: Array<{ id: string; label: string }>
  stickyColorOptions?: Array<{ id: string; label: string; color: string }>
  selectedStickyColorId?: string
  onSetStickyColor: (colorId: string) => void
  onMoveToSection: (sectionId: string) => void
  onRemoveFrame: () => void
  onSelectSectionAddAction?: (action: SectionAddAction) => void
}

export type SectionAddAction =
  | 'section'
  | 'tab'
  | 'heading'
  | 'text'
  | 'table'
  | 'link'
  | 'sticky'
  | 'code-block'
  | 'image'
  | 'icon'
  | 'figure'
  | 'drawing'
  | 'illustration'
  | 'website'
  | 'chart'
  | 'sql-editor'
  | 'dashboard'
  | 'import-sticky-csv'

type HeadingActionMenuProps = {
  actionButtonClassName: string
  headingFontSizePx: number
  onSetHeadingFontSize: (sizePx: number) => void
  onDuplicateHeading: () => void
  onRemoveFrame: () => void
}

const HeadingActionMenu = ({
  actionButtonClassName,
  headingFontSizePx,
  onDuplicateHeading,
  onSetHeadingFontSize,
  onRemoveFrame,
}: HeadingActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<Edit2 size={14} />}
        onMouseDown={stopMouseDownPropagation}
        title="Rediger"
        aria-label="Rediger"
        className={actionButtonClassName}
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Sub>
        <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Tekststorrelse</ActionMenu.SubTrigger>
        <ActionMenu.SubContent>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSetHeadingFontSize(40)}
            disabled={headingFontSizePx === 40}
          >
            Ekstra stor
          </ActionMenu.Item>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSetHeadingFontSize(32)}
            disabled={headingFontSizePx === 32}
          >
            Stor
          </ActionMenu.Item>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSetHeadingFontSize(24)}
            disabled={headingFontSizePx === 24}
          >
            Middels
          </ActionMenu.Item>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSetHeadingFontSize(20)}
            disabled={headingFontSizePx === 20}
          >
            Liten
          </ActionMenu.Item>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSetHeadingFontSize(18)}
            disabled={headingFontSizePx === 18}
          >
            Ekstra liten
          </ActionMenu.Item>
        </ActionMenu.SubContent>
      </ActionMenu.Sub>
      <ActionMenu.Divider />
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateHeading}>
        Dupliser
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemoveFrame}>
        Fjern
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

type TextActionMenuProps = {
  actionButtonClassName: string
  sectionMoveOptions: Array<{ id: string; label: string }>
  onMoveToSection: (sectionId: string) => void
  onDuplicateText: () => void
  onRemoveFrame: () => void
}

const TextActionMenu = ({
  actionButtonClassName,
  sectionMoveOptions,
  onMoveToSection,
  onDuplicateText,
  onRemoveFrame,
}: TextActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<Edit2 size={14} />}
        onMouseDown={stopMouseDownPropagation}
        title="Rediger"
        aria-label="Rediger"
        className={actionButtonClassName}
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      {sectionMoveOptions.length > 0 && (
        <ActionMenu.Sub>
          <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Flytt til seksjon</ActionMenu.SubTrigger>
          <ActionMenu.SubContent>
            {sectionMoveOptions.map((option) => (
              <ActionMenu.Item
                key={option.id}
                onMouseDown={stopMouseDownPropagation}
                onClick={() => onMoveToSection(option.id)}
              >
                {option.label}
              </ActionMenu.Item>
            ))}
          </ActionMenu.SubContent>
        </ActionMenu.Sub>
      )}
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateText}>
        Dupliser tekst
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemoveFrame}>
        Fjern
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

type StickyActionMenuProps = {
  actionButtonClassName: string
  sectionMoveOptions: Array<{ id: string; label: string }>
  stickyColorOptions: Array<{ id: string; label: string; color: string }>
  selectedStickyColorId?: string
  onMoveToSection: (sectionId: string) => void
  onSetStickyColor: (colorId: string) => void
  onDuplicateSticky: () => void
  onRemoveFrame: () => void
}

type SectionActionMenuProps = {
  actionButtonClassName: string
  onOpenSectionOptions: () => void
  onRemoveFrame: () => void
  onSelectSectionAddAction?: (action: SectionAddAction) => void
}

type TableActionMenuProps = {
  actionButtonClassName: string
  sectionMoveOptions: Array<{ id: string; label: string }>
  onEditTable: () => void
  onMoveToSection: (sectionId: string) => void
  onDuplicateText: () => void
  onRemoveFrame: () => void
}

type VisualAssetActionMenuProps = {
  frameKind: CanvasFrameActionPointsProps['frameKind']
  isIllustrationFrame: boolean
  actionButtonClassName: string
  onEditImage: () => void
  onEditDrawing: () => void
  onEditIllustration: () => void
  onEditFigure: () => void
  onEditIcon: () => void
  onDuplicateIcon: () => void
  onDuplicateFigure: () => void
  onDuplicateDrawing: () => void
  onDuplicateImage: () => void
  onRotateIcon: (delta: number) => void
  onRotateIllustration: (delta: number) => void
  onRotateFigure: (delta: number) => void
  onRotateDrawing: (delta: number) => void
  onRemoveFrame: () => void
}

const VisualAssetActionMenu = ({
  frameKind,
  isIllustrationFrame,
  actionButtonClassName,
  onEditImage,
  onEditDrawing,
  onEditIllustration,
  onEditFigure,
  onEditIcon,
  onDuplicateIcon,
  onDuplicateFigure,
  onDuplicateDrawing,
  onDuplicateImage,
  onRotateIcon,
  onRotateIllustration,
  onRotateFigure,
  onRotateDrawing,
  onRemoveFrame,
}: VisualAssetActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<Edit2 size={14} />}
        onMouseDown={stopMouseDownPropagation}
        title="Rediger"
        aria-label="Rediger"
        className={actionButtonClassName}
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      {frameKind === 'icon' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onEditIcon}>
          Rediger ikon
        </ActionMenu.Item>
      )}
      {frameKind === 'image' && (
        <ActionMenu.Item
          onMouseDown={stopMouseDownPropagation}
          onClick={isIllustrationFrame ? onEditIllustration : onEditImage}
        >
          {isIllustrationFrame ? 'Rediger illustrasjon' : 'Rediger bilde'}
        </ActionMenu.Item>
      )}
      {frameKind === 'drawing' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onEditDrawing}>
          Rediger tegning
        </ActionMenu.Item>
      )}
      {frameKind === 'figure' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onEditFigure}>
          Rediger figur
        </ActionMenu.Item>
      )}
      {frameKind === 'icon' && (
        <ActionMenu.Sub>
          <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Roter ikon</ActionMenu.SubTrigger>
          <ActionMenu.SubContent>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onRotateIcon(ICON_ROTATION_STEP_DEG)}
            >
              Roter ({ICON_ROTATION_STEP_DEG} grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateIcon(45)}>
              Roter (45 grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateIcon(90)}>
              Roter (90 grader)
            </ActionMenu.Item>
          </ActionMenu.SubContent>
        </ActionMenu.Sub>
      )}
      {frameKind === 'image' && isIllustrationFrame && (
        <ActionMenu.Sub>
          <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Roter bilde</ActionMenu.SubTrigger>
          <ActionMenu.SubContent>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onRotateIllustration(ICON_ROTATION_STEP_DEG)}
            >
              Roter ({ICON_ROTATION_STEP_DEG} grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateIllustration(45)}>
              Roter (45 grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateIllustration(90)}>
              Roter (90 grader)
            </ActionMenu.Item>
          </ActionMenu.SubContent>
        </ActionMenu.Sub>
      )}
      {frameKind === 'drawing' && (
        <ActionMenu.Sub>
          <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Roter tegning</ActionMenu.SubTrigger>
          <ActionMenu.SubContent>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onRotateDrawing(ICON_ROTATION_STEP_DEG)}
            >
              Roter ({ICON_ROTATION_STEP_DEG} grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateDrawing(45)}>
              Roter (45 grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateDrawing(90)}>
              Roter (90 grader)
            </ActionMenu.Item>
          </ActionMenu.SubContent>
        </ActionMenu.Sub>
      )}
      {frameKind === 'figure' && (
        <ActionMenu.Sub>
          <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Roter figur</ActionMenu.SubTrigger>
          <ActionMenu.SubContent>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onRotateFigure(ICON_ROTATION_STEP_DEG)}
            >
              Roter ({ICON_ROTATION_STEP_DEG} grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateFigure(45)}>
              Roter (45 grader)
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateFigure(90)}>
              Roter (90 grader)
            </ActionMenu.Item>
          </ActionMenu.SubContent>
        </ActionMenu.Sub>
      )}
      {frameKind === 'image' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateImage}>
          Dupliser bilde
        </ActionMenu.Item>
      )}
      {frameKind === 'drawing' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateDrawing}>
          Dupliser tegning
        </ActionMenu.Item>
      )}
      {frameKind === 'figure' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateFigure}>
          Dupliser figur
        </ActionMenu.Item>
      )}
      {frameKind === 'icon' && (
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateIcon}>
          Dupliser ikon
        </ActionMenu.Item>
      )}
      <ActionMenu.Divider />
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemoveFrame}>
        Fjern
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

const TableActionMenu = ({
  actionButtonClassName,
  sectionMoveOptions,
  onEditTable,
  onMoveToSection,
  onDuplicateText,
  onRemoveFrame,
}: TableActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<Edit2 size={14} />}
        onMouseDown={stopMouseDownPropagation}
        title="Rediger"
        aria-label="Rediger"
        className={actionButtonClassName}
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onEditTable}>
        Rediger tabell
      </ActionMenu.Item>
      {sectionMoveOptions.length > 0 && (
        <ActionMenu.Sub>
          <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Flytt til seksjon</ActionMenu.SubTrigger>
          <ActionMenu.SubContent>
            {sectionMoveOptions.map((option) => (
              <ActionMenu.Item
                key={option.id}
                onMouseDown={stopMouseDownPropagation}
                onClick={() => onMoveToSection(option.id)}
              >
                {option.label}
              </ActionMenu.Item>
            ))}
          </ActionMenu.SubContent>
        </ActionMenu.Sub>
      )}
      <ActionMenu.Divider />
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateText}>
        Dupliser tabell
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemoveFrame}>
        Fjern
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

const SectionActionMenu = ({
  actionButtonClassName,
  onOpenSectionOptions,
  onRemoveFrame,
  onSelectSectionAddAction,
}: SectionActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<Edit2 size={14} />}
        onMouseDown={stopMouseDownPropagation}
        title="Rediger"
        aria-label="Rediger"
        className={`${actionButtonClassName} ${SECTION_MENU_BUTTON_CLASSNAME}`}
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Sub>
        <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Legg til</ActionMenu.SubTrigger>
        <ActionMenu.SubContent>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('section')}>
            Seksjon (ved siden av)
          </ActionMenu.Item>
          <ActionMenu.Divider />
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('heading')}>
            Overskrift
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('text')}>
            Tekst
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('table')}>
            Tabell
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('link')}>
            Lenke
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('sticky')}>
            Post-it-lapp
          </ActionMenu.Item>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSelectSectionAddAction?.('code-block')}
          >
            Kodeblokk
          </ActionMenu.Item>
          <ActionMenu.Divider />
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('image')}>
            Bilde
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('icon')}>
            Ikon
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('figure')}>
            Figur
          </ActionMenu.Item>
          <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('drawing')}>
            Tegning
          </ActionMenu.Item>
          <ActionMenu.Item
            onMouseDown={stopMouseDownPropagation}
            onClick={() => onSelectSectionAddAction?.('illustration')}
          >
            Illustrasjoner
          </ActionMenu.Item>
          <ActionMenu.Divider />
          <ActionMenu.Group label="Fra Innblikk" className="mt-1">
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('website')}
            >
              <span className="block pl-4">Nettside</span>
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('chart')}>
              <span className="block pl-4">Graf</span>
            </ActionMenu.Item>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('sql-editor')}
            >
              <span className="block pl-4">SQL-editor</span>
            </ActionMenu.Item>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('dashboard')}
            >
              <span className="block pl-4">Dashboard</span>
            </ActionMenu.Item>
          </ActionMenu.Group>
          <ActionMenu.Group label="Fra Skyra / Lumi" className="mt-1">
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('import-sticky-csv')}
            >
              <span className="block pl-4">Undersøkelse → lapper</span>
            </ActionMenu.Item>
          </ActionMenu.Group>
        </ActionMenu.SubContent>
      </ActionMenu.Sub>
      <ActionMenu.Divider />
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onOpenSectionOptions}>
        Tilpass
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemoveFrame}>
        Fjern
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

const StickyActionMenu = ({
  actionButtonClassName,
  sectionMoveOptions,
  stickyColorOptions,
  selectedStickyColorId,
  onMoveToSection,
  onSetStickyColor,
  onDuplicateSticky,
  onRemoveFrame,
}: StickyActionMenuProps) => {
  const hasGroupedOptions = sectionMoveOptions.length > 0 || stickyColorOptions.length > 0

  return (
    <ActionMenu>
      <ActionMenu.Trigger>
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Edit2 size={14} />}
          onMouseDown={stopMouseDownPropagation}
          title="Rediger"
          aria-label="Rediger"
          className={actionButtonClassName}
        />
      </ActionMenu.Trigger>
      <ActionMenu.Content align="end">
        {sectionMoveOptions.length > 0 && (
          <ActionMenu.Sub>
            <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Flytt til seksjon</ActionMenu.SubTrigger>
            <ActionMenu.SubContent>
              {sectionMoveOptions.map((option) => (
                <ActionMenu.Item
                  key={option.id}
                  onMouseDown={stopMouseDownPropagation}
                  onClick={() => onMoveToSection(option.id)}
                >
                  {option.label}
                </ActionMenu.Item>
              ))}
            </ActionMenu.SubContent>
          </ActionMenu.Sub>
        )}
        {stickyColorOptions.length > 0 && (
          <ActionMenu.Sub>
            <ActionMenu.SubTrigger onMouseDown={stopMouseDownPropagation}>Bytt farge</ActionMenu.SubTrigger>
            <ActionMenu.SubContent>
              {stickyColorOptions.map((option) => (
                <ActionMenu.Item
                  key={option.id}
                  onMouseDown={stopMouseDownPropagation}
                  onClick={() => onSetStickyColor(option.id)}
                >
                  <span className="inline-flex w-full items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ backgroundColor: option.color }}
                    />
                    {option.label}
                    <span className="ml-auto" aria-hidden="true">
                      {selectedStickyColorId === option.id ? <Check size={14} /> : null}
                    </span>
                  </span>
                </ActionMenu.Item>
              ))}
            </ActionMenu.SubContent>
          </ActionMenu.Sub>
        )}
        {hasGroupedOptions && <ActionMenu.Divider />}
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onDuplicateSticky}>
          Dupliser
        </ActionMenu.Item>
        <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={onRemoveFrame}>
          Fjern
        </ActionMenu.Item>
      </ActionMenu.Content>
    </ActionMenu>
  )
}

const ImageOrDashboardEditActionPoint = ({
  frameKind,
  isInternalDashboard,
  actionButtonClassName,
  onEditDashboard,
}: Pick<
  CanvasFrameActionPointsProps,
  'frameKind' | 'isInternalDashboard' | 'actionButtonClassName' | 'onEditDashboard'
>) => {
  if (!(frameKind === 'website' && isInternalDashboard)) return null

  const title = 'Rediger dashboard'

  return (
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Edit2 size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onEditDashboard}
      title={title}
      aria-label={title}
      className={actionButtonClassName}
    />
  )
}

const CanvasFrameActionPoints = ({
  frameKind,
  isInternalDashboard,
  isIllustrationFrame,
  actionButtonClassName,
  onEditImage,
  onEditDrawing,
  onEditIllustration,
  onEditDashboard,
  onEditLink,
  onEditTable,
  isTableFrame = false,
  onEditIcon,
  onDuplicateIcon,
  onRotateIcon,
  onEditFigure,
  onDuplicateFigure,
  onDuplicateSection: _onDuplicateSection,
  onDuplicateSticky,
  onDuplicateText,
  onDuplicateHeading,
  onDuplicateDrawing,
  onDuplicateImage,
  headingFontSizePx,
  onSetHeadingFontSize,
  onRotateIllustration,
  onRotateFigure,
  onRotateDrawing,
  sectionLayoutMode: _sectionLayoutMode,
  onOpenSectionOptions,
  sectionMoveOptions = [],
  stickyColorOptions = [],
  selectedStickyColorId,
  onSetStickyColor,
  onMoveToSection,
  onRemoveFrame,
  onSelectSectionAddAction,
}: CanvasFrameActionPointsProps) => {
  const showRemoveButton =
    (frameKind !== 'website' || Boolean(isInternalDashboard)) &&
    frameKind !== 'sticky' &&
    frameKind !== 'section' &&
    frameKind !== 'heading' &&
    frameKind !== 'text' &&
    frameKind !== 'link' &&
    frameKind !== 'website' &&
    frameKind !== 'image' &&
    frameKind !== 'icon' &&
    frameKind !== 'figure' &&
    frameKind !== 'drawing'
  const actionPointsPositionClassName =
    frameKind === 'heading' || frameKind === 'text'
      ? 'right-8 -top-8 flex items-center gap-1'
      : frameKind === 'link' ||
          frameKind === 'image' ||
          frameKind === 'icon' ||
          frameKind === 'figure' ||
          frameKind === 'drawing' ||
          Boolean(isInternalDashboard) ||
          isIllustrationFrame
        ? 'right-8 -top-4 flex items-center gap-1'
        : 'right-2 top-4 flex items-center gap-1'
  const actionPointsBackdropClassName =
    frameKind === 'sticky'
      ? 'rounded-md bg-[var(--ax-bg-default)]/85 p-1 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-within/frame:opacity-100'
      : frameKind === 'heading' || frameKind === 'text' || frameKind === 'link'
        ? 'rounded-md bg-[var(--ax-bg-default)]/85 p-1 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-within/frame:opacity-100'
        : ''

  return (
    <div
      className={`pointer-events-auto absolute z-40 ${actionPointsPositionClassName} ${actionPointsBackdropClassName}`}
      onMouseDown={stopMouseDownPropagation}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <ImageOrDashboardEditActionPoint
        frameKind={frameKind}
        isInternalDashboard={isInternalDashboard}
        actionButtonClassName={actionButtonClassName}
        onEditDashboard={onEditDashboard}
      />
      {frameKind === 'link' && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Edit2 size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onEditLink}
          title="Rediger lenke"
          aria-label="Rediger lenke"
          className={actionButtonClassName}
        />
      )}
      {frameKind === 'text' && isTableFrame && (
        <TableActionMenu
          actionButtonClassName={actionButtonClassName}
          sectionMoveOptions={sectionMoveOptions}
          onEditTable={onEditTable}
          onMoveToSection={onMoveToSection}
          onDuplicateText={onDuplicateText}
          onRemoveFrame={onRemoveFrame}
        />
      )}
      {(frameKind === 'image' || frameKind === 'icon' || frameKind === 'figure' || frameKind === 'drawing') && (
        <VisualAssetActionMenu
          frameKind={frameKind}
          isIllustrationFrame={isIllustrationFrame}
          actionButtonClassName={actionButtonClassName}
          onEditImage={onEditImage}
          onEditDrawing={onEditDrawing}
          onEditIllustration={onEditIllustration}
          onEditFigure={onEditFigure}
          onEditIcon={onEditIcon}
          onDuplicateIcon={onDuplicateIcon}
          onDuplicateFigure={onDuplicateFigure}
          onDuplicateDrawing={onDuplicateDrawing}
          onDuplicateImage={onDuplicateImage}
          onRotateIcon={onRotateIcon}
          onRotateIllustration={onRotateIllustration}
          onRotateFigure={onRotateFigure}
          onRotateDrawing={onRotateDrawing}
          onRemoveFrame={onRemoveFrame}
        />
      )}
      {frameKind === 'heading' && (
        <HeadingActionMenu
          actionButtonClassName={actionButtonClassName}
          headingFontSizePx={headingFontSizePx}
          onDuplicateHeading={onDuplicateHeading}
          onSetHeadingFontSize={onSetHeadingFontSize}
          onRemoveFrame={onRemoveFrame}
        />
      )}
      {frameKind === 'section' && (
        <SectionActionMenu
          actionButtonClassName={actionButtonClassName}
          onOpenSectionOptions={onOpenSectionOptions}
          onRemoveFrame={onRemoveFrame}
          onSelectSectionAddAction={onSelectSectionAddAction}
        />
      )}
      {frameKind === 'sticky' && (
        <StickyActionMenu
          actionButtonClassName={actionButtonClassName}
          sectionMoveOptions={sectionMoveOptions}
          stickyColorOptions={stickyColorOptions}
          selectedStickyColorId={selectedStickyColorId}
          onMoveToSection={onMoveToSection}
          onSetStickyColor={onSetStickyColor}
          onDuplicateSticky={onDuplicateSticky}
          onRemoveFrame={onRemoveFrame}
        />
      )}
      {frameKind === 'text' && !isTableFrame && (
        <TextActionMenu
          actionButtonClassName={actionButtonClassName}
          sectionMoveOptions={sectionMoveOptions}
          onMoveToSection={onMoveToSection}
          onDuplicateText={onDuplicateText}
          onRemoveFrame={onRemoveFrame}
        />
      )}
      {showRemoveButton && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Trash2 size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onRemoveFrame}
          title="Fjern"
          aria-label="Fjern"
          className={actionButtonClassName}
        />
      )}
    </div>
  )
}

export default CanvasFrameActionPoints
