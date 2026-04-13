type CanvasImageFrameProps = {
  id: string
  src: string
  label: string
  refreshNonce: number
  isIllustrationFrame: boolean
  imageRotationDeg?: number
  hasFailedImage: boolean
  onLoadSuccess: (id: string) => void
  onLoadError: (id: string) => void
}

const CanvasImageFrame = ({
  id,
  src,
  label,
  refreshNonce,
  isIllustrationFrame,
  imageRotationDeg,
  hasFailedImage,
  onLoadSuccess,
  onLoadError,
}: CanvasImageFrameProps) => (
  <div className={`flex h-full flex-col ${isIllustrationFrame ? 'bg-transparent' : 'bg-white'}`}>
    {src && !hasFailedImage ? (
      <div className={`h-full w-full overflow-hidden ${isIllustrationFrame ? 'bg-transparent p-0' : 'bg-white p-2'}`}>
        <img
          key={`${id}-${refreshNonce}`}
          alt={label}
          src={src}
          className={`h-full w-full object-contain ${isIllustrationFrame ? '' : 'rounded'}`}
          style={isIllustrationFrame ? { transform: `rotate(${imageRotationDeg ?? 0}deg)` } : undefined}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => onLoadError(id)}
          onLoad={() => onLoadSuccess(id)}
        />
      </div>
    ) : (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--ax-text-subtle)]">
        Kunne ikke laste bilde fra denne URL-en.
      </div>
    )}
  </div>
)

export default CanvasImageFrame
