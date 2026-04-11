import { ActionMenu, Button } from '@navikt/ds-react'
import { ArrowRightLeft, Copy, Edit2, Grid3X3, Move, RotateCcw, RotateCw, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { CanvasSectionLayoutMode } from '../../model/types.ts'

const stopMouseDownPropagation = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation()
}

type CanvasFrameActionPointsProps = {
  frameKind: 'website' | 'image' | 'heading' | 'text' | 'sticky' | 'section' | 'chart' | 'icon' | 'figure' | 'drawing'
  isInternalDashboard?: boolean
  isIllustrationFrame: boolean
  actionButtonClassName: string
  onEditImage: () => void
  onEditIllustration: () => void
  onEditDashboard: () => void
  onEditIcon: () => void
  onDuplicateIcon: () => void
  onRotateIconLeft: () => void
  onRotateIconRight: () => void
  onEditFigure: () => void
  onDuplicateFigure: () => void
  onDuplicateSection: () => void
  onDecreaseHeadingFontSize: () => void
  onIncreaseHeadingFontSize: () => void
  onRotateIllustrationLeft: () => void
  onRotateIllustrationRight: () => void
  sectionLayoutMode?: CanvasSectionLayoutMode
  onToggleSectionLayout: () => void
  sectionMoveOptions?: Array<{ id: string; label: string }>
  stickyColorOptions?: Array<{ id: string; label: string; color: string }>
  onSetStickyColor: (colorId: string) => void
  onMoveToSection: (sectionId: string) => void
  onRemoveFrame: () => void
}

type IconBoxActionPointsProps = {
  actionButtonClassName: string
  onEditIcon: () => void
  onDuplicateIcon: () => void
  onRotateIconLeft: () => void
  onRotateIconRight: () => void
}

const IconBoxActionPoints = ({
  actionButtonClassName,
  onEditIcon,
  onDuplicateIcon,
  onRotateIconLeft,
  onRotateIconRight,
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
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<RotateCcw size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onRotateIconLeft}
      title="Roter venstre"
      aria-label="Roter venstre"
      className={actionButtonClassName}
    />
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<RotateCw size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onRotateIconRight}
      title="Roter hoyre"
      aria-label="Roter hoyre"
      className={actionButtonClassName}
    />
  </>
)

type FigureBoxActionPointsProps = {
  actionButtonClassName: string
  onEditFigure: () => void
  onDuplicateFigure: () => void
}

const FigureBoxActionPoints = ({
  actionButtonClassName,
  onEditFigure,
  onDuplicateFigure,
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
  </>
)

type HeadingBoxActionPointsProps = {
  actionButtonClassName: string
  onDecreaseHeadingFontSize: () => void
  onIncreaseHeadingFontSize: () => void
}

const HeadingBoxActionPoints = ({
  actionButtonClassName,
  onDecreaseHeadingFontSize,
  onIncreaseHeadingFontSize,
}: HeadingBoxActionPointsProps) => (
  <>
    <Button
      size="xsmall"
      variant="tertiary"
      onMouseDown={stopMouseDownPropagation}
      onClick={onDecreaseHeadingFontSize}
      title="Mindre tekststorrelse"
      aria-label="Mindre tekststorrelse"
      className={actionButtonClassName}
    >
      A-
    </Button>
    <Button
      size="xsmall"
      variant="tertiary"
      onMouseDown={stopMouseDownPropagation}
      onClick={onIncreaseHeadingFontSize}
      title="Storre tekststorrelse"
      aria-label="Storre tekststorrelse"
      className={actionButtonClassName}
    >
      A+
    </Button>
  </>
)

type IllustrationActionPointsProps = {
  actionButtonClassName: string
  onRotateIllustrationLeft: () => void
  onRotateIllustrationRight: () => void
}

const IllustrationActionPoints = ({
  actionButtonClassName,
  onRotateIllustrationLeft,
  onRotateIllustrationRight,
}: IllustrationActionPointsProps) => (
  <>
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<RotateCcw size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onRotateIllustrationLeft}
      title="Roter venstre"
      aria-label="Roter venstre"
      className={actionButtonClassName}
    />
    <Button
      size="xsmall"
      variant="tertiary"
      icon={<RotateCw size={14} />}
      onMouseDown={stopMouseDownPropagation}
      onClick={onRotateIllustrationRight}
      title="Roter hoyre"
      aria-label="Roter hoyre"
      className={actionButtonClassName}
    />
  </>
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
  onEditIcon,
  onDuplicateIcon,
  onRotateIconLeft,
  onRotateIconRight,
  onEditFigure,
  onDuplicateFigure,
  onDuplicateSection,
  onDecreaseHeadingFontSize,
  onIncreaseHeadingFontSize,
  onRotateIllustrationLeft,
  onRotateIllustrationRight,
  sectionLayoutMode,
  onToggleSectionLayout,
  sectionMoveOptions = [],
  stickyColorOptions = [],
  onSetStickyColor,
  onMoveToSection,
  onRemoveFrame,
}: CanvasFrameActionPointsProps) => {
  const showRemoveButton = frameKind !== 'website' || Boolean(isInternalDashboard)
  const isSectionGrid = frameKind === 'section' && sectionLayoutMode === 'grid'
  const actionPointsPositionClassName =
    frameKind === 'heading' ||
    frameKind === 'icon' ||
    frameKind === 'figure' ||
    frameKind === 'drawing' ||
    isIllustrationFrame
      ? 'right-8 -top-6 flex items-center gap-1'
      : 'right-8 top-4 flex items-center gap-1'

  return (
    <div className={`pointer-events-none absolute z-30 ${actionPointsPositionClassName}`}>
      <ImageOrDashboardEditActionPoint
        frameKind={frameKind}
        isInternalDashboard={isInternalDashboard}
        isIllustrationFrame={isIllustrationFrame}
        actionButtonClassName={actionButtonClassName}
        onEditImage={onEditImage}
        onEditIllustration={onEditIllustration}
        onEditDashboard={onEditDashboard}
      />
      {frameKind === 'icon' && (
        <IconBoxActionPoints
          actionButtonClassName={actionButtonClassName}
          onEditIcon={onEditIcon}
          onDuplicateIcon={onDuplicateIcon}
          onRotateIconLeft={onRotateIconLeft}
          onRotateIconRight={onRotateIconRight}
        />
      )}
      {frameKind === 'figure' && (
        <FigureBoxActionPoints
          actionButtonClassName={actionButtonClassName}
          onEditFigure={onEditFigure}
          onDuplicateFigure={onDuplicateFigure}
        />
      )}
      {frameKind === 'heading' && (
        <HeadingBoxActionPoints
          actionButtonClassName={actionButtonClassName}
          onDecreaseHeadingFontSize={onDecreaseHeadingFontSize}
          onIncreaseHeadingFontSize={onIncreaseHeadingFontSize}
        />
      )}
      {isIllustrationFrame && (
        <IllustrationActionPoints
          actionButtonClassName={actionButtonClassName}
          onRotateIllustrationLeft={onRotateIllustrationLeft}
          onRotateIllustrationRight={onRotateIllustrationRight}
        />
      )}
      {frameKind === 'section' && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={<Copy size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onDuplicateSection}
          title="Dupliser tom"
          aria-label="Dupliser tom"
          className={actionButtonClassName}
        >
          Dupliser tom
        </Button>
      )}
      {frameKind === 'section' && (
        <Button
          size="xsmall"
          variant="tertiary"
          icon={isSectionGrid ? <Move size={14} /> : <Grid3X3 size={14} />}
          onMouseDown={stopMouseDownPropagation}
          onClick={onToggleSectionLayout}
          title={isSectionGrid ? 'Bytt til friform' : 'Bytt til rutenett'}
          aria-label={isSectionGrid ? 'Bytt til friform' : 'Bytt til rutenett'}
          className={actionButtonClassName}
        >
          {isSectionGrid ? 'Rutenett' : 'Friform'}
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
              icon={<Edit2 size={14} />}
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
