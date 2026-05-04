import React from 'react'

interface InfoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  'data-color'?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  children: React.ReactNode
}

const InfoCard = ({ children, 'data-color': dataColor = 'info', className, ...props }: InfoCardProps) => {
  let colorClasses = 'bg-[var(--ax-bg-info-soft)] border-[var(--ax-border-info-subtle)] text-[var(--ax-text-default)]'

  if (dataColor === 'info') {
    colorClasses = 'bg-[var(--ax-bg-info-soft)] border-[var(--ax-border-info-subtle)] text-[var(--ax-text-default)]'
  } else if (dataColor === 'success') {
    colorClasses =
      'bg-[var(--ax-bg-success-soft)] border-[var(--ax-border-success-subtle)] text-[var(--ax-text-default)]'
  } else if (dataColor === 'warning') {
    colorClasses =
      'bg-[var(--ax-bg-warning-soft)] border-[var(--ax-border-warning-subtle)] text-[var(--ax-text-default)]'
  } else if (dataColor === 'danger') {
    colorClasses = 'bg-[var(--ax-bg-danger-soft)] border-[var(--ax-border-danger-subtle)] text-[var(--ax-text-default)]'
  } else if (dataColor === 'neutral') {
    colorClasses =
      'bg-[var(--ax-bg-neutral-soft)] border-[var(--ax-border-neutral-subtle)] text-[var(--ax-text-default)]'
  }

  return (
    <div className={`p-5 rounded-lg border ${colorClasses} ${className || ''}`} {...props}>
      {children}
    </div>
  )
}

const Header = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`mb-2 flex items-center gap-2 ${className || ''}`} {...props}>
    {children}
  </div>
)

const Title = ({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-semibold ${className || ''}`} {...props}>
    {children}
  </h3>
)

const Content = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`text-base leading-relaxed ${className || ''}`} {...props}>
    {children}
  </div>
)

InfoCard.Header = Header
InfoCard.Title = Title
InfoCard.Content = Content

export default InfoCard
