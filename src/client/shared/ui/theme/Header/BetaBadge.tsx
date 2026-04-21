import { ArrowRightIcon } from '@navikt/aksel-icons'
import { Events, type NavigereProperties } from '@navikt/analytics-types'
import styles from './BetaBadge.module.css'

export function BetaBadge() {
  function handleClick() {
    const properties: NavigereProperties = {
      lenketekst: 'Meld deg på betaprogrammet',
      destinasjon: '/profil#betaprogram',
      seksjon: 'header',
    }
    window.umami?.track(Events.NAVIGERE, properties)
  }

  return (
    <a href="/profil#betaprogram" className={styles.promoTag} onClick={handleClick}>
      <span className={styles.promoTagContent}>
        <span className={styles.promoTagLabel}>Beta</span>
        <span className={styles.promoTagText}>
          Meld deg på betaprogrammet 💖
          <ArrowRightIcon aria-hidden fontSize="1.25rem" className={styles.animatedArrow} />
        </span>
      </span>
    </a>
  )
}
