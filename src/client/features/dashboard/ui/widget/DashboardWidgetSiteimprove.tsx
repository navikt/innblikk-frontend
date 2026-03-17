// @ts-expect-error Untyped JS module
import SiteScores from './SiteScores';
// @ts-expect-error Untyped JS module
import SiteGroupScores from './SiteGroupScores';
import teamsData from '../../../../../data/teamsData.json';
import type { SavedChart } from '../../../../shared/types/savedChart';

type SelectedWebsite = {
    domain: string;
    [key: string]: unknown;
};

type TeamData = {
    teamDomain?: string;
    teamSiteimproveSite?: string | number | boolean;
    [key: string]: unknown;
};

interface DashboardWidgetSiteimproveProps {
    chart: SavedChart;
    colClass: string;
    selectedWebsite?: SelectedWebsite;
    urlPath: string | undefined;
    siteimproveGroupId?: string;
}

const DashboardWidgetSiteimprove = ({ chart, colClass, selectedWebsite, urlPath, siteimproveGroupId }: DashboardWidgetSiteimproveProps) => {
    const baseUrl = '/api/siteimprove';

    if (chart.siteimprove_id) {
        return (
            <SiteGroupScores
                className={colClass}
                siteId={chart.siteimprove_id}
                portalSiteId={chart.siteimprove_portal_id}
                groupId={siteimproveGroupId}
                baseUrl={baseUrl}
            />
        );
    }

    if (!selectedWebsite) return null;

    let team: TeamData | null = null;
    let siteDomain = selectedWebsite.domain;
    if (!siteDomain.startsWith('http')) {
        siteDomain = `https://${siteDomain}`;
    }

    try {
        const urlObj = new URL(siteDomain);
        const domain = urlObj.origin;
        team = (teamsData as TeamData[]).find((t) => {
            if (!t.teamDomain) return false;
            try {
                const teamUrl = new URL(t.teamDomain);
                return domain === teamUrl.origin;
            } catch {
                return domain.startsWith(t.teamDomain);
            }
        }) ?? null;
    } catch {
        team =
            (teamsData as TeamData[]).find(
                (t) =>
                    !!t.teamDomain &&
                    (t.teamDomain === selectedWebsite.domain ||
                        selectedWebsite.domain.includes(t.teamDomain) ||
                        t.teamDomain.includes(selectedWebsite.domain))
            ) ?? null;
    }

    if (!team || !team.teamSiteimproveSite || !team.teamDomain) {
        return null;
    }

    const path = urlPath || '/';
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${team.teamDomain}${safePath}`;

    return (
        <SiteScores
            className={colClass}
            pageUrl={fullUrl}
            siteimproveSelectedDomain={team.teamSiteimproveSite}
            baseUrl={baseUrl}
        />
    );
};

export default DashboardWidgetSiteimprove;
