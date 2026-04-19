import { ActionMenu, Button } from '@navikt/ds-react'
import { ArrowRightLeft, Copy, Edit2, Palette, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { CanvasSectionLayoutMode } from '../../model/types.ts'
import { ICON_ROTATION_STEP_DEG } from '../../utils/canvasUtils.ts'

const stopMouseDownPropagation = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation()
}

type CanvasFrameActionPointsProps = {
  frameKind:
    | 'website'
    | 'image'
    | 'heading'
    | 'text'
    | 'link'
    | 'sticky'
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
  onRotateDrawingLeft: () => void
  onRotateDrawingRight: () => void
  sectionLayoutMode?: CanvasSectionLayoutMode
  onOpenSectionOptions: () => void
  sectionMoveOptions?: Array<{ id: string; label: string }>
  stickyColorOptions?: Array<{ id: string; label: string; color: string }>
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

type IconBoxActionPointsProps = {
  actionButtonClassName: string
  onEditIcon: () => void
  onDuplicateIcon: () => void
  onRotateIcon: (delta: number) => void
}

type RotateActionMenuProps = {
  actionButtonClassName: string
  title?: string
  onRotateBy: (delta: number) => void
}

const RotateActionMenu = ({ actionButtonClassName, title = 'Roter', onRotateBy }: RotateActionMenuProps) => (
  <ActionMenu>
    <ActionMenu.Trigger>
      <Button
        size="xsmall"
        variant="tertiary"
        icon={<RotateCw size={14} />}
        onMouseDown={stopMouseDownPropagation}
        title={title}
        aria-label={title}
        className={actionButtonClassName}
      />
    </ActionMenu.Trigger>
    <ActionMenu.Content align="end">
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateBy(ICON_ROTATION_STEP_DEG)}>
        Roter ({ICON_ROTATION_STEP_DEG} grader)
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateBy(45)}>
        Roter (45 grader)
      </ActionMenu.Item>
      <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onRotateBy(90)}>
        Roter (90 grader)
      </ActionMenu.Item>
    </ActionMenu.Content>
  </ActionMenu>
)

const IconBoxActionPoints = ({
  actionButtonClassName,
  onEditIcon,
  onDuplicateIcon,
  onRotateIcon,
}: IconBoxActionPointsProps) => (
  <>
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Edit2 size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onEditIcon}
      title="Rediger ikon"
      aria-label="Rediger ikon"
      className={actionButtonClassName}
    />
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Copy size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onDuplicateIcon}
      title="Dupliser ikon"
      aria-label="Dupliser ikon"
      className={actionButtonClassName}
    />
    <RotateActionMenu actionButtonClassName={actionButtonClassName} title="Roter ikon" onRotateBy={onRotateIcon} />
  </>
)

type FigureBoxActionPointsProps = {
  actionButtonClassName: string
  onEditFigure: () => void
  onDuplicateFigure: () => void
  onRotateFigure: (delta: number) => void
}

const FigureBoxActionPoints = ({
  actionButtonClassName,
  onEditFigure,
  onDuplicateFigure,
  onRotateFigure,
}: FigureBoxActionPointsProps) => (
  <>
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Edit2 size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onEditFigure}
      title="Rediger figur"
      aria-label="Rediger figur"
      className={actionButtonClassName}
    />
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Copy size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onDuplicateFigure}
      title="Dupliser figur"
      aria-label="Dupliser figur"
      className={actionButtonClassName}
    />
    <RotateActionMenu actionButtonClassName={actionButtonClassName} title="Roter figur" onRotateBy={onRotateFigure} />
  </>
)

type HeadingBoxActionPointsProps = {
  actionButtonClassName: string
  headingFontSizePx: number
  onSetHeadingFontSize: (sizePx: number) => void
}

const HeadingBoxActionPoints = ({
  actionButtonClassName,
  headingFontSizePx,
  onDuplicateHeading,
  onSetHeadingFontSize,
}: HeadingBoxActionPointsProps & { onDuplicateHeading: () => void }) => (
  <>
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Copy size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onDuplicateHeading}
      title="Dupliser tittel"
      aria-label="Dupliser tittel"
      className={actionButtonClassName}
    />
    <ActionMenu>
      <ActionMenu.Trigger>
        <Button
          size="xsmall"
          variant="tertiary"
          onMouseDown={stopMouseDownPropagation}
          title="Endre tekststorrelse"
          aria-label="Endre tekststorrelse"
          className={actionButtonClassName}
        >
          A
        </Button>
      </ActionMenu.Trigger>
      <ActionMenu.Content align="end">
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
      </ActionMenu.Content>
    </ActionMenu>
  </>
)

type IllustrationActionPointsProps = {
  actionButtonClassName: string
  onRotateIllustration: (delta: number) => void
}

const IllustrationActionPoints = ({ actionButtonClassName, onRotateIllustration }: IllustrationActionPointsProps) => (
  <RotateActionMenu
    actionButtonClassName={actionButtonClassName}
    title="Roter bilde"
    onRotateBy={onRotateIllustration}
  />
)

const ImageOrDashboardEditActionPoint = ({
  frameKind,
  isInternalDashboard,
  isIllustrationFrame,
  actionButtonClassName,
  onEditImage,
  onEditIllustration,
  onEditDashboard,
}: Pick<
  CanvasFrameActionPointsProps,
  | 'frameKind'
  | 'isInternalDashboard'
  | 'isIllustrationFrame'
  | 'actionButtonClassName'
  | 'onEditImage'
  | 'onEditIllustration'
  | 'onEditDashboard'
>) => {
  if (!(frameKind === 'image' || (frameKind === 'website' && isInternalDashboard))) return null

  const isImage = frameKind === 'image'
  const title = isImage ? (isIllustrationFrame ? 'Rediger illustrasjon' : 'Rediger bilde') : 'Rediger dashboard'

  return (
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<Edit2 size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={() => {
        if (isImage) {
          if (isIllustrationFrame) {
            onEditIllustration()
          } else {
            onEditImage()
          }
        } else {
          onEditDashboard()
        }
      }}
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
  onRotateDrawingLeft,
  onRotateDrawingRight,
  sectionLayoutMode: _sectionLayoutMode,
  onOpenSectionOptions,
  sectionMoveOptions = [],
  stickyColorOptions = [],
  onSetStickyColor,
  onMoveToSection,
  onRemoveFrame,
  onSelectSectionAddAction,
}: CanvasFrameActionPointsProps) => {
  const showRemoveButton = frameKind !== 'website' || Boolean(isInternalDashboard)
  const actionPointsPositionClassName =
    frameKind === 'heading' ||
    frameKind === 'text' ||
    frameKind === 'link' ||
    frameKind === 'image' ||
    frameKind === 'icon' ||
    frameKind === 'figure' ||
    frameKind === 'drawing' ||
    isIllustrationFrame
      ? 'right-8 -top-6 flex items-center gap-1'
      : 'right-2 top-4 flex items-center gap-1'
  const actionPointsBackdropClassName =
    frameKind === 'sticky'
      ? 'rounded-md bg-[var(--ax-bg-default)]/85 p-1 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-within/frame:opacity-100'
      : frameKind === 'heading' || frameKind === 'text' || frameKind === 'link'
        ? 'rounded-md bg-[var(--ax-bg-default)]/85 p-1 shadow-sm backdrop-blur-sm opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-within/frame:opacity-100'
        : ''

  return (
    <div
      className={`pointer-events-none absolute z-40 ${actionPointsPositionClassName} ${actionPointsBackdropClassName}`}
    >
      <ImageOrDashboardEditActionPoint
        frameKind={frameKind}
        isInternalDashboard={isInternalDashboard}
        isIllustrationFrame={isIllustrationFrame}
        actionButtonClassName={actionButtonClassName}
        onEditImage={onEditImage}
        onEditIllustration={onEditIllustration}
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
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Edit2 size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onEditTable}
          title="Rediger tabell"
          aria-label="Rediger tabell"
          className={actionButtonClassName}
        />
      )}
      {frameKind === 'icon' && (
        <IconBoxActionPoints
          actionButtonClassName={actionButtonClassName}
          onEditIcon={onEditIcon}
          onDuplicateIcon={onDuplicateIcon}
          onRotateIcon={onRotateIcon}
        />
      )}
      {frameKind === 'figure' && (
        <FigureBoxActionPoints
          actionButtonClassName={actionButtonClassName}
          onEditFigure={onEditFigure}
          onDuplicateFigure={onDuplicateFigure}
          onRotateFigure={onRotateFigure}
        />
      )}
      {frameKind === 'heading' && (
        <HeadingBoxActionPoints
          actionButtonClassName={actionButtonClassName}
          headingFontSizePx={headingFontSizePx}
          onDuplicateHeading={onDuplicateHeading}
          onSetHeadingFontSize={onSetHeadingFontSize}
        />
      )}
      {isIllustrationFrame && (
        <IllustrationActionPoints
          actionButtonClassName={actionButtonClassName}
          onRotateIllustration={onRotateIllustration}
        />
      )}
      {frameKind === 'section' && (
        <ActionMenu>
          <ActionMenu.Trigger>
            <Button
              size="xsmall"
              variant="tertiary"
              onMouseDown={stopMouseDownPropagation}
              title="Legg til i seksjon"
              aria-label="Legg til i seksjon"
              className={actionButtonClassName}
            >
              Legg til
            </Button>
          </ActionMenu.Trigger>
          <ActionMenu.Content align="end">
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('section')}
            >
              Seksjon (ved siden av)
            </ActionMenu.Item>
            <ActionMenu.Divider />
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('heading')}
            >
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
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('sticky')}
            >
              Post-it-lapp
            </ActionMenu.Item>
            <ActionMenu.Divider />
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('image')}>
              Bilde
            </ActionMenu.Item>
            <ActionMenu.Item onMouseDown={stopMouseDownPropagation} onClick={() => onSelectSectionAddAction?.('icon')}>
              Ikon
            </ActionMenu.Item>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('figure')}
            >
              Figur
            </ActionMenu.Item>
            <ActionMenu.Item
              onMouseDown={stopMouseDownPropagation}
              onClick={() => onSelectSectionAddAction?.('drawing')}
            >
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
              <ActionMenu.Item
                onMouseDown={stopMouseDownPropagation}
                onClick={() => onSelectSectionAddAction?.('chart')}
              >
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
          </ActionMenu.Content>
        </ActionMenu>
      )}
      {frameKind === 'section' && (
        <Button
          size="xsmall"
          variant="tertiary"
          onMouseDown={stopMouseDownPropagation}
          onClick={onOpenSectionOptions}
          title="Tilpass seksjon"
          aria-label="Tilpass seksjon"
          className={actionButtonClassName}
        >
          Tilpass
        </Button>
      )}
      {(frameKind === 'sticky' || frameKind === 'text') && sectionMoveOptions.length > 0 && (
        <ActionMenu>
          <ActionMenu.Trigger>
            <Button
              size="xsmall"
              variant="tertiary"
              icon={<ArrowRightLeft size={14} />}
              onMouseDown={stopMouseDownPropagation}
              title="Flytt til seksjon"
              aria-label="Flytt til seksjon"
              className={actionButtonClassName}
            />
          </ActionMenu.Trigger>
          <ActionMenu.Content align="end">
            {sectionMoveOptions.map((option) => (
              <ActionMenu.Item
                key={option.id}
                onMouseDown={stopMouseDownPropagation}
                onClick={() => onMoveToSection(option.id)}
              >
                {option.label}
              </ActionMenu.Item>
            ))}
          </ActionMenu.Content>
        </ActionMenu>
      )}
      {frameKind === 'sticky' && stickyColorOptions.length > 0 && (
        <ActionMenu>
          <ActionMenu.Trigger>
            <Button
              size="xsmall"
              variant="tertiary"
              icon={<Palette size={14} />}
              onMouseDown={stopMouseDownPropagation}
              title="Bytt farge"
              aria-label="Bytt farge"
              className={actionButtonClassName}
            />
          </ActionMenu.Trigger>
          <ActionMenu.Content align="end">
            {stickyColorOptions.map((option) => (
              <ActionMenu.Item
                key={option.id}
                onMouseDown={stopMouseDownPropagation}
                onClick={() => onSetStickyColor(option.id)}
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
                    style={{ backgroundColor: option.color }}
                  />
                  {option.label}
                </span>
              </ActionMenu.Item>
            ))}
          </ActionMenu.Content>
        </ActionMenu>
      )}
      {(frameKind === 'sticky' || frameKind === 'text') && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Copy size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={frameKind === 'sticky' ? onDuplicateSticky : onDuplicateText}
          title={frameKind === 'sticky' ? 'Dupliser lapp' : 'Dupliser tekst'}
          aria-label={frameKind === 'sticky' ? 'Dupliser lapp' : 'Dupliser tekst'}
          className={actionButtonClassName}
        />
      )}
      {frameKind === 'drawing' && (
        <>
          <Button
            size="xsmall"
            variant="tertiary"
            icon={<Copy size={14} />}
            onMouseDown={stopMouseDownPropagation}
            onClick={onDuplicateDrawing}
            title="Dupliser tegning"
            aria-label="Dupliser tegning"
            className={actionButtonClassName}
          />
          <Button
            size="xsmall"
            variant="tertiary"
            icon={<RotateCcw size={14} />}
            onMouseDown={stopMouseDownPropagation}
            onClick={onRotateDrawingLeft}
            title="Roter venstre"
            aria-label="Roter venstre"
            className={actionButtonClassName}
          />
          <Button
            size="xsmall"
            variant="tertiary"
            icon={<RotateCw size={14} />}
            onMouseDown={stopMouseDownPropagation}
            onClick={onRotateDrawingRight}
            title="Roter høyre"
            aria-label="Roter høyre"
            className={actionButtonClassName}
          />
        </>
      )}
      {frameKind === 'image' && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Copy size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onDuplicateImage}
          title="Dupliser bilde"
          aria-label="Dupliser bilde"
          className={actionButtonClassName}
        />
      )}
      {showRemoveButton && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Trash2 size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onRemoveFrame}
          title="Fjern kort"
          aria-label="Fjern kort"
          className={actionButtonClassName}
        />
      )}
    </div>
  )
}

export default CanvasFrameActionPoints
