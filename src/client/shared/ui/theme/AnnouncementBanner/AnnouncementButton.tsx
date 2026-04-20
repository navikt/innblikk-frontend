import { Button, type ButtonProps } from '@navikt/ds-react'

type AnnouncementButtonProps = Omit<ButtonProps, 'size' | 'variant'> & {
  href: string
}

export function AnnouncementButton({ href, children, ...props }: AnnouncementButtonProps) {
  return (
    <Button
      as="a"
      href={href}
      size="small"
      variant="secondary-neutral"
      {...props}
      style={
        {
          '--__axc-button-border-color': 'var(--ax-text-neutral-contrast)',
          color: 'var(--ax-text-neutral-contrast)',
          ...props.style,
        } as React.CSSProperties
      }
    >
      {children}
    </Button>
  )
}
