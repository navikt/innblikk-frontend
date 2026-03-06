import { Search, Alert, BodyShort, Link, ReadMore, List, Skeleton } from "@navikt/ds-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Website } from '../model/types.ts';
import { fetchWebsites } from '../api/bigquery.ts';
import { PROD_TEAM_ID } from '../../settings/model/constants.ts';

interface UrlSearchFormProps {
    children?: React.ReactNode;
}

function UrlSearchForm({ children }: UrlSearchFormProps) {
    const navigate = useNavigate();
    const [filteredData, setFilteredData] = useState<Website[] | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [akselSearchQuery, setAkselSearchQuery] = useState<string>('');
    const [alertVisible, setAlertVisible] = useState<boolean>(false);
    const [hasLoadedData, setHasLoadedData] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const isLocalEnvironment = hostname === "localhost" || hostname === "127.0.0.1";
    const isDevEnvironment = hostname.includes(".dev.nav.no");
    const isProdEnvironment = hostname.includes(".nav.no") && !isDevEnvironment;
    const normalizedAkselSearchQuery = akselSearchQuery.trim().toLowerCase();
    const visibleWebsites = filteredData?.filter((item) => {
        if (!normalizedAkselSearchQuery) return true;
        return (
            item.domain.toLowerCase().includes(normalizedAkselSearchQuery) ||
            item.name.toLowerCase().includes(normalizedAkselSearchQuery)
        );
    });
    const hasVisibleWebsites = (visibleWebsites?.length ?? 0) > 0;
    const showNoMatches = hasLoadedData && !hasVisibleWebsites && !isLoading;

    const normalizeDomain = (domain: string) => {
        const cleaned = domain
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/\.$/, "")
            .replace(/^www\./, "");
        return cleaned === "nav.no" ? "www.nav.no" : cleaned;
    };

    const navigateToTrafficAnalysis = (website: Website, path: string) => {
        navigate(
            `/trafikkanalyse?websiteId=${website.id}&domain=${website.domain}&urlPath=${encodeURIComponent(path)}`
        );
    };

    const loadWebsitesData = async (): Promise<Website[]> => {
        // If we already have data, return it
        if (hasLoadedData && filteredData) {
            return filteredData;
        }

        setIsLoading(true);

        try {
            const websitesData = await fetchWebsites();

            const environmentFilteredWebsites = websitesData.filter((website: Website) => {
                if (isProdEnvironment) {
                    return website.teamId === PROD_TEAM_ID;
                }

                if (isDevEnvironment) {
                    return website.teamId !== PROD_TEAM_ID;
                }

                return true;
            });

            // Filter out exactly "nav.no" if desired, though logic below handles matching
            const filteredItems = environmentFilteredWebsites.filter((item: Website) => item.domain !== "nav.no");

            // Deduplicate by domain
            const uniqueWebsites = filteredItems.filter((website: Website, index: number, self: Website[]) =>
                index === self.findIndex((w) => w.domain === website.domain)
            );

            // Sort by domain, but feature www.nav.no first in prod environment.
            uniqueWebsites.sort((a: Website, b: Website) => {
                if (isProdEnvironment) {
                    const aIsFeatured = normalizeDomain(a.domain) === "www.nav.no";
                    const bIsFeatured = normalizeDomain(b.domain) === "www.nav.no";

                    if (aIsFeatured && !bIsFeatured) return -1;
                    if (!aIsFeatured && bIsFeatured) return 1;
                }

                return a.domain.localeCompare(b.domain, "nb");
            });

            setFilteredData(uniqueWebsites);
            setHasLoadedData(true);
            setIsLoading(false);
            return uniqueWebsites;
        } catch (error) {
            console.error("Error fetching data:", error);
            setIsLoading(false);
            throw error;
        }
    };

    const handleReadMoreToggle = (open: boolean) => {
        if (open && !hasLoadedData) {
            loadWebsitesData().catch(() => { });
        }
    };

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setAlertVisible(false);
        setSearchError(null);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!searchQuery) {
            setSearchError("Du må sette inn en URL-adresse.");
            return;
        }
        setSearchError(null);
        setAlertVisible(false);

        let inputUrl = searchQuery.trim();
        const isPathOnlyInput = inputUrl.startsWith("/");

        if ((isProdEnvironment || isLocalEnvironment) && isPathOnlyInput) {
            inputUrl = `https://www.nav.no${inputUrl}`;
        } else if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
            inputUrl = 'https://' + inputUrl;
        }

        try {
            let urlObj = new URL(inputUrl);

            // Normalize nav.no to www.nav.no for matching consistency,
            // copying logic from Umami.jsx
            if (urlObj.hostname === "nav.no") {
                inputUrl = inputUrl.replace("://nav.no", "://www.nav.no");
                urlObj = new URL(inputUrl);
            }

            const websites = await loadWebsitesData();

            const inputDomain = urlObj.hostname;
            const normalizedInputDomain = normalizeDomain(inputDomain);

            // Find best match: prefer exact match, then longest suffix match (most specific subdomain)
            const matchedWebsite = websites.reduce<Website | null>((best, item) => {
                const normalizedDomain = normalizeDomain(item.domain);

                // Exact match wins immediately
                if (normalizedDomain === normalizedInputDomain) {
                    return item;
                }

                // Suffix match: input is a subdomain of this website's domain
                if (normalizedInputDomain.endsWith(`.${normalizedDomain}`)) {
                    // Keep the longer (more specific) domain
                    if (!best) return item;
                    const bestLen = normalizeDomain(best.domain).length;
                    return normalizedDomain.length > bestLen ? item : best;
                }

                return best;
            }, null);

            if (matchedWebsite) {
                navigateToTrafficAnalysis(
                    matchedWebsite,
                    decodeURIComponent(urlObj.pathname)
                );
            } else {
                setAlertVisible(true);
            }

        } catch (error) {
            setSearchError("Ugyldig URL-format eller feil ved oppslag.");
            console.error("Error:", error);
        }
    };

    return (
        <div>
            <form role="search" onSubmit={handleSubmit}>
                <div style={{ maxWidth: "600px" }}>
                    <Search
                        label="Lim inn URL for å se webstatistikk"
                        hideLabel={false}
                        variant="primary"
                        value={searchQuery}
                        error={searchError}
                        onChange={handleSearchChange}
                        onClear={() => setSearchQuery("")}
                    />
                    {alertVisible && <Alert style={{ marginTop: "20px" }} variant="warning">Denne siden har ikke fått støtte for Umami enda. Fortvil ikke — kontakt Team ResearchOps for å få lagt den til :)</Alert>}
                </div>
                {children}
                <ReadMore size="small" style={{ marginTop: "24px" }} header="Hvilke nettsider støttes?" onOpenChange={handleReadMoreToggle}>
                    <div role="search" aria-label="Søk i Aksel" style={{ maxWidth: "460px", marginBottom: "16px" }}>
                        <Search
                            label="Hvilke nettsider støttes?"
                            variant="simple"
                            size="small"
                            value={akselSearchQuery}
                            onChange={setAkselSearchQuery}
                            onClear={() => setAkselSearchQuery("")}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                }
                            }}
                        />
                    </div>
                    {isLoading ? (
                        <List as="ul" style={{ marginBottom: "16px" }}>
                            {[...Array(3)].map((_, index) => (
                                <List.Item key={`skeleton-${index}`}>
                                    <Skeleton variant="text" width="60%" />
                                </List.Item>
                            ))}
                        </List>
                    ) : (
                        hasVisibleWebsites ? (
                            <List as="ul" style={{ marginBottom: "16px" }}>
                                {visibleWebsites?.map(item => (
                                    <List.Item key={item.id}>
                                        <Link
                                            href={`/trafikkanalyse?websiteId=${item.id}&domain=${item.domain}&urlPath=%2F`}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                navigateToTrafficAnalysis(item, "/");
                                            }}
                                        >
                                            {item.domain}
                                        </Link>
                                    </List.Item>
                                ))}
                            </List>
                        ) : showNoMatches ? (
                            <BodyShort style={{ marginBottom: "16px" }}>
                                Ingen nettsider matcher søket.
                            </BodyShort>
                        ) : null
                        
                    )}
                    <BodyShort className="mt-4 mb-2">
                        Savner du en nettside eller app? <Link href="/komigang">Følg kom-i-gang-guiden!</Link>
                    </BodyShort>
                </ReadMore>
            </form>
        </div>
    );
}

export default UrlSearchForm;
