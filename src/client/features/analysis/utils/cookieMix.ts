import { format } from 'date-fns'
import { nb } from 'date-fns/locale'

export const formatCookieDate = (date: Date | null | undefined): string =>
  date ? format(date, 'd. MMMM yyyy', { locale: nb }) : 'i denne perioden'

export const getCookieMixNoticeContent = (
  variant: 'mix' | 'pre',
  websiteName?: string | null,
  cookieStartDate?: Date | null,
) => {
  const name = websiteName || 'denne siden'
  const dateStr = formatCookieDate(cookieStartDate)

  const title =
    variant === 'pre'
      ? 'Merk: Identiisering av brukere uten cookies'
      : 'Merk: Blanding av metoder for identifisering av brukere'

  const content =
    variant === 'pre'
      ? `${name} startet måling med cookies ${dateStr}. Perioden du har valgt er før dette, så brukere identifiseres uten cookies.`
      : `${name} startet måling og sammenkobling av events på brukernivå på tvers av kalendermåneder ${dateStr}. Perioden du har valgt dekker både tiden før og etter.`

  return { title, content }
}
