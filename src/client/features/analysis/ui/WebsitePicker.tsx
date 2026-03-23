import { useState, useEffect, useRef, useCallback } from "react";
import { UNSAFE_Combobox, Alert, Button } from "@navikt/ds-react";
import type { Website } from "../../../shared/types/chart.ts";
import type {
  EventProperty,
  ApiCache,
  WebsiteApiResponse,
} from "../model/types.ts";
import {
  saveToLocalStorage,
  getFromLocalStorage,
  WEBSITES_CACHE_KEY,
  SELECTED_WEBSITE_CACHE_KEY,
} from "../storage/websiteCache.ts";

export type { Website };

interface WebsitePickerProps {
  selectedWebsite: Website | null;
  onWebsiteChange: (website: Website | null) => void;
  onEventsLoad?: (
    events: string[],
    autoParameters?: { key: string; type: "string" }[],
    maxDays?: number,
  ) => void;
  dateRangeInDays?: number; // Add this prop to accept date range from parent
  shouldReload?: boolean; // Add flag to force reload
  onIncludeParamsChange?: (includeParams: boolean) => void; // Callback to notify parent of includeParams state
  resetIncludeParams?: boolean; // Add flag to reset includeParams
  requestIncludeParams?: boolean; // Add flag to request loading params
  variant?: "default" | "minimal"; // Add variant prop
  disableAutoEvents?: boolean; // Add flag to disable auto-fetching of events
  requestLoadEvents?: boolean; // Add flag to manually trigger event loading
  onLoadingChange?: (isLoading: boolean) => void; // Add callback for loading state
  onInitialLoadingChange?: (isInitialLoading: boolean) => void;
  disableAutoRestore?: boolean; // Disable auto-restore from localStorage/URL (for SQL editor)
  customLabel?: string; // Custom label for the combobox
  labelClassName?: string; // Extra className applied to the combobox root (use e.g. "[&_label]:text-white" to override label color)
  id?: string; // HTML id applied to the combobox root element
}

const API_TIMEOUT_MS = 120000; // timeout

const timeoutPromise = (ms: number) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);
  });
};

const WebsitePicker = ({
  selectedWebsite,
  onWebsiteChange,
  onEventsLoad,
  dateRangeInDays: externalDateRange,
  shouldReload = false,
  onIncludeParamsChange,
  resetIncludeParams = false,
  requestIncludeParams = false,
  variant = "default",
  disableAutoEvents = false,
  requestLoadEvents = false,
  onLoadingChange,
  onInitialLoadingChange,
  disableAutoRestore = false,
  customLabel,
  labelClassName,
  id,
}: WebsitePickerProps) => {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loadedWebsiteId, setLoadedWebsiteId] = useState<string | null>(null);
  const [setMaxDaysAvailable] = useState<number>(30);
  const [dateRangeInDays, setDateRangeInDays] = useState<number>(
    externalDateRange || 14,
  );
  const apiCache = useRef<ApiCache>({});
  const fetchInProgress = useRef<{ [key: string]: boolean }>({});
  const websitesLoaded = useRef<boolean>(false);
  const prevExternalDateRange = useRef<number>(externalDateRange || 14);
  const prevShouldReload = useRef<boolean>(shouldReload);
  const initialUrlChecked = useRef<boolean>(false);

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoading, setShowLoading] = useState<boolean>(false);
  const loadingTimerRef = useRef<number | null>(null);
  // const [gbProcessed, setGbProcessed] = useState<string | null>(null);
  // const [estimatedGbProcessed, setEstimatedGbProcessed] = useState<string | null>(null);
  const [includeParams, setIncludeParams] = useState<boolean>(false);
  const prevIncludeParams = useRef<boolean>(false);
  const [showDevSites, setShowDevSites] = useState<boolean>(false);

  // Reset includeParams when resetIncludeParams prop changes
  useEffect(() => {
    if (resetIncludeParams) {
      setIncludeParams(false);
    }
  }, [resetIncludeParams]);

  // Set includeParams when requestIncludeParams prop changes to true
  useEffect(() => {
    if (requestIncludeParams && !includeParams) {
      setIncludeParams(true);
    }
  }, [requestIncludeParams, includeParams]);

  // Notify parent when includeParams changes
  useEffect(() => {
    if (onIncludeParamsChange) {
      onIncludeParamsChange(includeParams);
    }
  }, [includeParams, onIncludeParamsChange]);

  useEffect(() => {
    if (onInitialLoadingChange) {
      onInitialLoadingChange(isInitialLoading);
    }
  }, [isInitialLoading, onInitialLoadingChange]);

  // Function to update URL with website ID
  const updateUrlWithWebsiteId = useCallback((website: Website | null) => {
    const url = new URL(window.location.href);

    if (website && website.id) {
      url.searchParams.set("websiteId", website.id);
    } else {
      url.searchParams.delete("websiteId");
    }

    // Update URL without full page reload
    window.history.pushState({}, "", url.toString());
  }, []);

  // Handle website selection and update URL
  const handleWebsiteChange = useCallback(
    (website: Website | null) => {
      onWebsiteChange(website);
      updateUrlWithWebsiteId(website);

      // Save/clear selected website in localStorage
      if (website) {
        saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, website);
      } else {
        localStorage.removeItem(SELECTED_WEBSITE_CACHE_KEY);
      }

      // Reset to cheap query when switching websites
      setIncludeParams(false);
    },
    [onWebsiteChange, updateUrlWithWebsiteId],
  );

  // Check for website ID in URL on initial load
  useEffect(() => {
    if (
      websitesLoaded.current &&
      !initialUrlChecked.current &&
      websites.length > 0
    ) {
      const urlParams = new URLSearchParams(window.location.search);
      const websiteIdFromUrl = urlParams.get("websiteId");

      if (websiteIdFromUrl) {
        const website = websites.find((w) => w.id === websiteIdFromUrl);
        if (website && !selectedWebsite) {
          handleWebsiteChange(website); // Use handleWebsiteChange to ensure caching
        }
      }

      initialUrlChecked.current = true;
    }
  }, [websites, selectedWebsite, handleWebsiteChange]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      if (websitesLoaded.current) {
        const urlParams = new URLSearchParams(window.location.search);
        const websiteIdFromUrl = urlParams.get("websiteId");

        if (websiteIdFromUrl) {
          const website = websites.find((w) => w.id === websiteIdFromUrl);
          if (
            website &&
            (!selectedWebsite || website.id !== selectedWebsite.id)
          ) {
            // Note: We call onWebsiteChange here instead of handleWebsiteChange
            // because handleWebsiteChange would update the URL again via pushState,
            // which we don't want during popstate (back/forward navigation)
            onWebsiteChange(website);
            // But we still need to save to localStorage
            saveToLocalStorage(SELECTED_WEBSITE_CACHE_KEY, website);
          }
        } else if (selectedWebsite) {
          // No website ID in URL, but we have a selected website, clear it
          onWebsiteChange(null);
          localStorage.removeItem(SELECTED_WEBSITE_CACHE_KEY);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [websites, selectedWebsite, onWebsiteChange]);

  const handleLoadingState = useCallback(
    (loading: boolean) => {
      if (onLoadingChange) {
        onLoadingChange(loading);
      }

      if (loading) {
        loadingTimerRef.current = window.setTimeout(() => {
          setShowLoading(true);
        }, 600);
      } else {
        // Clear both loading states
        setShowLoading(false);

        // Clear any pending timers
        if (loadingTimerRef.current) {
          window.clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }
      }
    },
    [onLoadingChange],
  ); // Remove showLoading dependency since we handle it directly

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        window.clearTimeout(loadingTimerRef.current);
      }
    };
  }, []);

  const [fullEventsLoadedId, setFullEventsLoadedId] = useState<string | null>(
    null,
  );

  const fetchEventNames = useCallback(
    async (
      website: Website,
      _forceFresh = false,
      daysToFetch = dateRangeInDays,
      metadataOnly = false,
    ) => {
      const websiteId = website.id;
      if (fetchInProgress.current[websiteId]) return;

      // Calculate max available days using website creation date
      const endDate = new Date();
      const startDate = website.createdAt
        ? new Date(website.createdAt)
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      // Calculate difference in milliseconds
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      // Convert to days and round up to include partial days
      let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Ensure totalDays is valid and at least 1
      if (isNaN(totalDays) || totalDays < 1) {
        totalDays = 1;
      }

      if (metadataOnly) {
        if (onEventsLoad) {
          onEventsLoad([], [], totalDays);
        }
        return;
      }

      fetchInProgress.current[websiteId] = true;
      setError(null); // Clear any previous errors
      // setGbProcessed(null); // Clear previous GB count
      // setEstimatedGbProcessed(null); // Clear previous estimated GB

      try {
        // Show loading UI
        handleLoadingState(true);

        // Use local API endpoint that queries BigQuery
        const apiBase = "/api/bigquery";

        // Use the daysToFetch parameter instead of the state variable
        const calculatedEndDate = new Date();
        const calculatedStartDate = new Date(calculatedEndDate);
        calculatedStartDate.setDate(
          calculatedStartDate.getDate() - daysToFetch,
        );

        const startAt = calculatedStartDate.getTime();
        const endAt = calculatedEndDate.getTime();

        console.log(
          `Fetching data for ${daysToFetch} days from ${new Date(startAt).toLocaleDateString()} to ${new Date(endAt).toLocaleDateString()}`,
        );

        // Fetch BOTH query types to get both estimates
        const propertiesResponse = await Promise.race([
          fetch(
            `${apiBase}/websites/${websiteId}/event-properties?startAt=${startAt}&endAt=${endAt}&includeParams=${includeParams}`,
          ),
          timeoutPromise(API_TIMEOUT_MS),
        ]);
        // @ts-expect-error — Promise.race return type is overly broad
        const responseData = await propertiesResponse.json();

        console.log("API Response:", responseData);

        // Extract properties and GB processed from response
        const properties: EventProperty[] = responseData.properties || [];
        const gbProcessedValue = responseData.gbProcessed;
        const estimatedGbValue = responseData.estimatedGbProcessed;

        /* if (gbProcessedValue) {
        setGbProcessed(gbProcessedValue);
      }

      if (estimatedGbValue) {
        setEstimatedGbProcessed(estimatedGbValue);
      } */

        console.log(
          `Fetched ${properties.length} event entries from the API, estimated ${estimatedGbValue} GB, actual ${gbProcessedValue} GB`,
        );

        // Process events and parameters
        const eventMap = new Map<string, string[]>();
        properties.forEach((prop) => {
          if (!eventMap.has(prop.eventName)) {
            eventMap.set(prop.eventName, []);
          }
          // Only add property name if it exists (when includeParams=true)
          if (
            prop.propertyName &&
            !eventMap.get(prop.eventName)!.includes(prop.propertyName)
          ) {
            eventMap.get(prop.eventName)!.push(prop.propertyName);
          }
        });

        const uniqueEventNames = Array.from(eventMap.keys());
        const paramsByEvent: { key: string; type: "string" }[] = [];
        eventMap.forEach((props, eventName) => {
          props.forEach((prop) => {
            paramsByEvent.push({
              key: `${eventName}.${prop}`,
              type: "string",
            });
          });
        });

        console.log(
          `Found ${uniqueEventNames.length} unique events and ${paramsByEvent.length} parameters`,
        );

        if (onEventsLoad) {
          onEventsLoad(uniqueEventNames, paramsByEvent, totalDays);
        }

        // Move loading cleanup here after all processing is done
        handleLoadingState(false);
      } catch (error) {
        console.error("Error fetching event data:", error);
        if (error instanceof Error) {
          const message = error.message.includes("timed out")
            ? "Forespørselen tok for lang tid. Prøv igjen senere."
            : "Det oppstod en feil ved lasting av data. Forsøk å laste siden inn på nytt.";
          setError(message);
        }
        handleLoadingState(false);
      } finally {
        fetchInProgress.current[websiteId] = false;
      }
    },
    [onEventsLoad, setMaxDaysAvailable, handleLoadingState, includeParams],
  );

  // Load websites on mount
  useEffect(() => {
    if (websitesLoaded.current) {
      return;
    }

    setIsInitialLoading(true);
    let didLoadFromCache = false;

    // Try to load websites from cache first
    const cachedWebsites = getFromLocalStorage<Website[]>(WEBSITES_CACHE_KEY);

    if (cachedWebsites && cachedWebsites.length > 0) {
      console.log("Using cached websites list");
      setWebsites(cachedWebsites);
      didLoadFromCache = true;
    }

    // Fetch from API to ensure cache is fresh and complete
    const baseUrl = "";

    fetch(`${baseUrl}/api/bigquery/websites`)
      .then((response) => response.json() as Promise<WebsiteApiResponse>)
      .then((response) => {
        const websitesData = response.data || [];
        setWebsites(websitesData);
        saveToLocalStorage(WEBSITES_CACHE_KEY, websitesData);
        websitesLoaded.current = true;
        setIsInitialLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching websites:", error);
        if (didLoadFromCache) {
          websitesLoaded.current = true;
        }
        setIsInitialLoading(false);
      });
  }, []);

  // On mount, try to restore from localStorage
  useEffect(() => {
    // Skip auto-restore if disabled (e.g., for SQL editor where query has its own website ID)
    if (disableAutoRestore) {
      initialUrlChecked.current = true;
      return;
    }

    if (initialUrlChecked.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const websiteIdFromUrl = urlParams.get("websiteId");

    // Priority 1: URL parameter (need to load websites to find it)
    if (websiteIdFromUrl) {
      // Websites will load automatically via the effect above
      initialUrlChecked.current = true;
      return;
    }

    // Priority 2: localStorage cache
    const cachedWebsite = getFromLocalStorage<Website>(
      SELECTED_WEBSITE_CACHE_KEY,
    );
    if (cachedWebsite && !selectedWebsite) {
      console.log(
        "[WebsitePicker] Restoring from localStorage:",
        cachedWebsite.name,
      );
      handleWebsiteChange(cachedWebsite); // Use handleWebsiteChange to ensure URL is updated
    }

    initialUrlChecked.current = true;
  }, [selectedWebsite, handleWebsiteChange, disableAutoRestore]);

  // Check for website ID in URL after websites are loaded
  useEffect(() => {
    // Skip if auto-restore is disabled
    if (disableAutoRestore) return;

    if (!websitesLoaded.current || websites.length === 0) return;

    const urlParams = new URLSearchParams(window.location.search);
    const websiteIdFromUrl = urlParams.get("websiteId");

    if (websiteIdFromUrl) {
      const website = websites.find((w) => w.id === websiteIdFromUrl);
      if (website) {
        console.log("[WebsitePicker] Applying website from URL:", website.name);
        handleWebsiteChange(website);
      }
    }
  }, [websites, handleWebsiteChange, disableAutoRestore]);

  // Fetch events when a website is selected (only if onEventsLoad callback is provided)
  useEffect(() => {
    if (!selectedWebsite || !onEventsLoad) {
      if (!selectedWebsite && loadedWebsiteId) {
        setLoadedWebsiteId(null);
        setFullEventsLoadedId(null);
      }
      return;
    }

    const isNewWebsite = selectedWebsite.id !== loadedWebsiteId;
    const needsFullLoad =
      requestLoadEvents && fullEventsLoadedId !== selectedWebsite.id;

    if (isNewWebsite) {
      if (disableAutoEvents && !requestLoadEvents) {
        // Metadata only fetch
        void fetchEventNames(selectedWebsite, false, dateRangeInDays, true);
        setLoadedWebsiteId(selectedWebsite.id);
        setFullEventsLoadedId(null);
      } else {
        // Full fetch
        apiCache.current = {};
        void fetchEventNames(selectedWebsite, false, dateRangeInDays, false);
        setLoadedWebsiteId(selectedWebsite.id);
        setFullEventsLoadedId(selectedWebsite.id);
      }
    } else if (needsFullLoad) {
      // We are on the same website, but now requesting full load
      // Skip if requestIncludeParams is also true - let the includeParams effect handle it
      // to ensure we fetch with includeParams=true instead of false
      if (!requestIncludeParams) {
        apiCache.current = {};
        void fetchEventNames(selectedWebsite, false, dateRangeInDays, false);
      }
      setFullEventsLoadedId(selectedWebsite.id);
    }
  }, [
    selectedWebsite,
    loadedWebsiteId,
    onEventsLoad,
    fetchEventNames,
    dateRangeInDays,
    disableAutoEvents,
    requestLoadEvents,
    fullEventsLoadedId,
    requestIncludeParams,
  ]);

  // Reload when includeParams changes (only if onEventsLoad callback is provided)
  useEffect(() => {
    if (
      selectedWebsite &&
      loadedWebsiteId === selectedWebsite.id &&
      includeParams !== prevIncludeParams.current &&
      onEventsLoad
    ) {
      prevIncludeParams.current = includeParams;
      apiCache.current[selectedWebsite.id] = {};
      void fetchEventNames(selectedWebsite, true, dateRangeInDays);
    }
  }, [
    includeParams,
    selectedWebsite,
    loadedWebsiteId,
    fetchEventNames,
    dateRangeInDays,
    onEventsLoad,
  ]);

  // Combine the reload effects to avoid loops (only if onEventsLoad callback is provided)
  useEffect(() => {
    // Only proceed if we have a selected website and onEventsLoad callback
    if (!selectedWebsite || !onEventsLoad) return;

    const dateRangeChanged =
      externalDateRange !== prevExternalDateRange.current;
    const reloadFlagChanged = shouldReload !== prevShouldReload.current;

    // Update the refs to track current values
    prevExternalDateRange.current = externalDateRange || 14;
    prevShouldReload.current = shouldReload;

    // Only reload if something actually changed
    if (dateRangeChanged || reloadFlagChanged) {
      console.log(
        `Reload triggered - dateRange: ${dateRangeChanged}, reloadFlag: ${reloadFlagChanged}`,
      );

      if (dateRangeChanged) {
        // Update the internal state
        setDateRangeInDays(externalDateRange || 14);
      }

      // Clear cache and force a fresh fetch
      apiCache.current[selectedWebsite.id] = {};

      // Always use API data when explicitly reloading
      void fetchEventNames(
        selectedWebsite,
        true,
        externalDateRange || dateRangeInDays,
      );
    }
  }, [
    externalDateRange,
    shouldReload,
    selectedWebsite,
    fetchEventNames,
    dateRangeInDays,
    onEventsLoad,
  ]);

  const sortedWebsites = [...websites].sort((a, b) => {
    const priorityIds = [
      "35abb2b7-3f97-42ce-931b-cf547d40d967",
      "83b80c84-b551-4dff-a679-f21be5fa0453",
    ];
    const aIndex = priorityIds.indexOf(a.id);
    const bIndex = priorityIds.indexOf(b.id);

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    return a.name.localeCompare(b.name);
  });

  const isProdHost = !window.location.hostname.includes(".dev.nav.no");
  const isDevWebsite = (website: Website) =>
    website.domain.includes(".dev.nav.no") ||
    website.name.includes(".dev.nav.no") ||
    /\s-\sdev$/i.test(website.name.trim());
  const devToggleOptionValue = "__toggle_dev_sites__";
  const toggleDevSitesLabel = showDevSites
    ? "Skjul dev sider"
    : "Vis dev sider";
  const getDisplayName = (website: Website) => {
    const name = website.name.trim();
    if (!name) return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const getBaseName = (name: string) =>
    name
      .replace(/\s*-\s*prod$/i, "")
      .trim()
      .toLowerCase();

  const visibleWebsites = sortedWebsites.filter((website) => {
    if (!isProdHost) return true;
    if (showDevSites) return true;
    return !isDevWebsite(website);
  });

  const displayLabelCounts = visibleWebsites.reduce(
    (acc, website) => {
      const label = getDisplayName(website);
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const comboboxOptions = [
    ...visibleWebsites.map((website) => {
      const displayName = getDisplayName(website);
      const isProdVariant = /\s*-\s*prod$/i.test(displayName);
      const hasProdSibling = visibleWebsites.some((other) => {
        if (other.id === website.id) return false;
        return (
          getBaseName(other.name) === getBaseName(website.name) &&
          /\s*-\s*prod$/i.test(other.name)
        );
      });
      const oldLabel =
        !isProdVariant && hasProdSibling
          ? `${displayName} (gammel)`
          : displayName;
      const finalLabel =
        displayLabelCounts[displayName] > 1
          ? `${oldLabel} (${website.domain})`
          : oldLabel;

      return {
        label: finalLabel,
        value: finalLabel,
        website: website,
      };
    }),
    ...(isProdHost
      ? [{ label: toggleDevSitesLabel, value: devToggleOptionValue }]
      : []),
  ];

  return (
    <div id={id} className={`${variant === "minimal" ? "" : ""}`}>
      <div>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        <UNSAFE_Combobox
          className={`website-picker-combobox${labelClassName ? ` ${labelClassName}` : ""}`}
          size="small"
          label={customLabel || "Nettside"}
          options={comboboxOptions}
          selectedOptions={(() => {
            if (!selectedWebsite) return [];
            const selectedOption = comboboxOptions.find(
              (opt) =>
                "website" in opt && opt.website.id === selectedWebsite.id,
            );
            return selectedOption ? [selectedOption.value] : [];
          })()}
          onToggleSelected={(option: string, isSelected: boolean) => {
            if (option === devToggleOptionValue) {
              if (isSelected) {
                setShowDevSites((prev) => !prev);
              }
              return;
            }

            if (isSelected) {
              const selectedOption = comboboxOptions.find(
                (opt) => opt.value === option && "website" in opt,
              );
              const website =
                selectedOption && "website" in selectedOption
                  ? selectedOption.website
                  : undefined;
              if (website) {
                handleWebsiteChange(website);
              }
            } else {
              handleWebsiteChange(null);
            }
          }}
          clearButton
          isMultiSelect={false}
        />
        {!isInitialLoading &&
          !selectedWebsite &&
          !window.location.hostname.includes(".dev.nav.no") && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm">Hurtigvalg:</span>
              <Button
                size="xsmall"
                variant="secondary"
                onClick={() => {
                  const website = websites.find(
                    (w) => w.id === "35abb2b7-3f97-42ce-931b-cf547d40d967",
                  );
                  if (website) {
                    handleWebsiteChange(website);
                  }
                }}
              >
                nav.no
              </Button>
              <Button
                size="xsmall"
                variant="secondary"
                onClick={() => {
                  const website = websites.find(
                    (w) => w.id === "83b80c84-b551-4dff-a679-f21be5fa0453",
                  );
                  if (website) {
                    handleWebsiteChange(website);
                  }
                }}
              >
                navet
              </Button>
            </div>
          )}
      </div>

      {/* {selectedWebsite && includeParams && (
          <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
            <div className="text-sm text-[var(--ax-text-default)]">
              Hentet hendelser med hendelsesdetaljer for siste {dateRangeInDays} {dateRangeInDays === 1 ? 'dag' : 'dager'}.
            </div>
          </div>
          )}  
        */}

      {showLoading && <>{/* Show loading content here if needed */}</>}
    </div>
  );
};

export default WebsitePicker;
