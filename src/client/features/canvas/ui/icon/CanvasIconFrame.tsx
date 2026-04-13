import { getCanvasIconColor, getCanvasIconOptionById } from './CanvasIconRegistry.ts'

type CanvasIconFrameProps = {
  width: number
  height: number
  iconName?: string
  iconRotationDeg?: number
  iconColor?: string
}

const CanvasIconFrame = ({ width, height, iconName, iconRotationDeg, iconColor }: CanvasIconFrameProps) => {
  const selectedIcon = getCanvasIconOptionById(iconName)
  const Icon = selectedIcon.Icon
  const iconSize = Math.max(22, Math.floor(Math.min(width, height)))
  const resolvedRotation = iconRotationDeg ?? 0
  const resolvedColor = getCanvasIconColor(iconColor)

  return (
    <div className="flex h-full w-full items-center justify-center p-0">
      <Icon
        fontSize={`${iconSize}px`}
        style={{ transform: `rotate(${resolvedRotation}deg)`, color: resolvedColor }}
        aria-hidden="true"
      />
    </div>
  )
}

export default CanvasIconFrame
