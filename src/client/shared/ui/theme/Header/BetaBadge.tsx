import { ArrowRightIcon } from '@navikt/aksel-icons'
import styles from './BetaBadge.module.css'

export function BetaBadge() {
  return (
    <a href="/profil#betaprogram" className={styles.promoTag}>
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
