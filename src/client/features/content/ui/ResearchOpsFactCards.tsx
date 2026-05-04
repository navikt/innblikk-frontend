const cards = [
  {
    emoji: '🔥',
    color: 'var(--ax-bg-danger-soft)',
    borderColor: 'var(--ax-border-danger-subtle)',
    label: 'Penger brukt på å forsvare oss',
    value: '355 000 kr',
    valueSub: 'per år',
    description: '8 teammedlemmer × 2 timer/uke med møter om støy fra tvilerne',
    footnote: 'Basert på 800 000 kr årslønn og 1 872 arbeidstimer/år',
  },
  {
    emoji: '💰',
    color: 'var(--ax-bg-success-soft)',
    borderColor: 'var(--ax-border-success-subtle)',
    label: 'Penger spart fra teamene',
    value: '38,9M kr',
    valueSub: 'per år',
    description: '800 teammedlemmer sparer 2,5 timer/uke = 104 000 timer spart i org',
    footnote: 'Kilde: Forrester/McKinsey benchmark – 2,5 t/uke per person ved selvbetjent analyse',
  },
  {
    emoji: '🚀',
    color: 'var(--ax-bg-info-soft)',
    borderColor: 'var(--ax-border-info-subtle)',
    label: 'Team som bruker plattformen',
    value: '80 %',
    valueSub: 'adopsjon',
    description: '80 av 100 verdistrømteam bruker Innblikk aktivt',
    footnote: 'Målet er 100 % – vi er nesten der',
  },
]

export function ResearchOpsFactCards() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--ax-space-16)',
        width: '100%',
        marginTop: 'var(--ax-space-32)',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            backgroundColor: card.color,
            border: `1px solid ${card.borderColor}`,
            borderRadius: '12px',
            padding: 'var(--ax-space-24)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ax-space-8)',
          }}
        >
          <div style={{ fontSize: '2rem', lineHeight: 1 }}>{card.emoji}</div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ax-text-subtle)',
            }}
          >
            {card.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                lineHeight: 1,
                color: 'var(--ax-text-default)',
              }}
            >
              {card.value}
            </span>
            <span
              style={{
                fontSize: '0.875rem',
                color: 'var(--ax-text-subtle)',
              }}
            >
              {card.valueSub}
            </span>
          </div>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--ax-text-default)',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {card.description}
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--ax-text-subtle)',
              margin: 0,
              marginTop: 'auto',
              paddingTop: 'var(--ax-space-8)',
              borderTop: `1px solid ${card.borderColor}`,
            }}
          >
            {card.footnote}
          </p>
        </div>
      ))}
    </div>
  )
}
