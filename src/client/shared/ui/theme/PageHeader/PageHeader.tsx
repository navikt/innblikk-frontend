import { BodyLong, BodyShort, Heading, Tag } from '@navikt/ds-react'
import { TestFlaskIcon } from '@navikt/aksel-icons'
import React from 'react'
import { AppBlock } from '../AppBlock/AppBlock.tsx'

interface PageHeaderProps {
  title: string
  subtitle?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  variant?: 'regular' | 'article'
  beta?: boolean
}

export const PageHeader = ({ title, subtitle, description, actions, variant = 'regular', beta }: PageHeaderProps) => {
  const isArticle = variant === 'article'
  const padding = isArticle ? '64px' : '32px'

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: 'var(--ax-bg-accent-soft)',
        color: 'var(--ax-text-default)',
        paddingTop: padding,
        paddingBottom: padding,
        marginBottom: '24px',
      }}
    >
      <AppBlock>
        <div
          className={`grid gap-[10px] md:grid-cols-[minmax(0,1fr)_auto] md:items-start ${
            isArticle ? 'max-w-[800px] mx-auto' : ''
          }`}
        >
          <div className="flex flex-col gap-[6px] md:col-start-1 md:row-start-1">
            <div className="flex items-center gap-3 flex-wrap">
              <Heading level="1" size="xlarge">
                {title}
              </Heading>
              {beta && (
                <Tag variant="moderate" size="small" data-color="meta-purple" icon={<TestFlaskIcon aria-hidden />}>
                  Beta
                </Tag>
              )}
            </div>
            {subtitle && (
              <Heading level="2" size="medium" className="text-[var(--ax-text-neutral-subtle)] font-normal">
                {subtitle}
              </Heading>
            )}
          </div>

          {description && (
            <div
              className={`text-[var(--ax-text-neutral-subtle)] md:col-start-1 md:row-start-2 ${actions ? 'md:col-span-1' : 'md:col-span-2'}`}
            >
              {typeof description === 'string' ? (
                isArticle ? (
                  <BodyLong size="large">{description}</BodyLong>
                ) : (
                  <BodyShort size="medium">{description}</BodyShort>
                )
              ) : (
                <BodyLong size={isArticle ? 'large' : 'medium'} as="div">
                  {description}
                </BodyLong>
              )}
            </div>
          )}

          {actions && (
            <div className="flex justify-end gap-2 md:col-start-2 md:row-start-1 md:row-span-2 md:self-center">
              {actions}
            </div>
          )}
        </div>
      </AppBlock>
    </div>
  )
}
