import { LinkCard } from '@navikt/ds-react'

type CanvasLinkFrameProps = {
  title: string
  href: string
  description?: string
}

const CanvasLinkFrame = ({ title, href, description }: CanvasLinkFrameProps) => (
  <div className="h-full w-full p-2">
    <LinkCard>
      <LinkCard.Title>
        <LinkCard.Anchor
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            window.open(href, '_blank', 'noopener,noreferrer')
          }}
        >
          {title}
        </LinkCard.Anchor>
      </LinkCard.Title>
      {description?.trim() ? <LinkCard.Description>{description}</LinkCard.Description> : null}
    </LinkCard>
  </div>
)

export default CanvasLinkFrame
