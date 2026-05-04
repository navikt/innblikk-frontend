import InfoCard from '../../../shared/ui/InfoCard.tsx'
import type { CookieMixNoticeProps } from '../model/types.ts'
import { getCookieMixNoticeContent } from '../utils/cookieMix.ts'

const CookieMixNotice = ({ websiteName, cookieStartDate, variant = 'mix' }: CookieMixNoticeProps) => {
  const { title, content } = getCookieMixNoticeContent(variant, websiteName, cookieStartDate)
  return (
    <InfoCard data-color="info" className="mb-4">
      <InfoCard.Header>
        <InfoCard.Title>{title}</InfoCard.Title>
      </InfoCard.Header>
      <InfoCard.Content>{content}</InfoCard.Content>
    </InfoCard>
  )
}

export default CookieMixNotice
