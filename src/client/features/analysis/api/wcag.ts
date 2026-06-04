import type { SiteimproveWcagResponse, WcagIssue } from '../model/types.ts'

const getCredentials = (): RequestCredentials => (window.location.hostname === 'localhost' ? 'omit' : 'include')

export interface PageWcagIssuesResult {
  confirmedIssues: WcagIssue[]
  potentialIssues: WcagIssue[]
  passedIssues: WcagIssue[]
}

export const fetchPageWcagIssues = async (
  baseUrl: string,
  siteId: string,
  pageId: number,
): Promise<PageWcagIssuesResult> => {
  const credentials = getCredentials()

  const [confirmedResponse, potentialResponse, passedResponse] = await Promise.all([
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/a11y/issue_kinds/confirmed/pages/${pageId}/issues`, {
      credentials,
    }),
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/a11y/issue_kinds/potential/pages/${pageId}/issues`, {
      credentials,
    }),
    fetch(`${baseUrl}/siteimprove/sites/${siteId}/a11y/issue_kinds/passed/pages/${pageId}/issues`, {
      credentials,
    }),
  ])

  if (!confirmedResponse.ok && !potentialResponse.ok && !passedResponse.ok) {
    throw new Error('Kunne ikke hente universell utforming-data fra Siteimprove.')
  }

  let confirmedIssues: WcagIssue[] = []
  let potentialIssues: WcagIssue[] = []
  let passedIssues: WcagIssue[] = []

  if (confirmedResponse.ok) {
    const data = (await confirmedResponse.json()) as SiteimproveWcagResponse
    confirmedIssues = data.items || []
  }

  if (potentialResponse.ok) {
    const data = (await potentialResponse.json()) as SiteimproveWcagResponse
    potentialIssues = data.items || []
  }

  if (passedResponse.ok) {
    const data = (await passedResponse.json()) as SiteimproveWcagResponse
    passedIssues = data.items || []
  }

  return { confirmedIssues, potentialIssues, passedIssues }
}
