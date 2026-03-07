import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Heading, Button, Alert, Tabs, Search, Switch, ReadMore, CopyButton, Select, Label, ActionMenu, TextField, Tooltip } from '@navikt/ds-react';
import { PlayIcon, Download, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, MoreVertical, Search as SearchIcon } from 'lucide-react';
import type { ILineChartProps, IVerticalBarChartProps, IVerticalBarChartDataPoint} from '@fluentui/react-charting';
import { LineChart, VerticalBarChart, AreaChart, PieChart, ResponsiveContainer } from '@fluentui/react-charting';
import { translateValue } from '../../../../shared/lib/translations.ts';
import { format, startOfWeek, startOfMonth, isValid } from 'date-fns';
import { nb } from 'date-fns/locale';
import SqlViewer from './SqlViewer.tsx';
import ShareResultsModal from './ShareResultsModal.tsx';
import AnalysisActionModal from '../../../analysis/ui/AnalysisActionModal.tsx';
import { encode } from '@toon-format/toon';

interface ResultsPanelProps {
  result: any;
  loading: boolean;
  error: string | null;
  queryStats: any;
  lastAction: 'copy' | 'estimate' | 'execute' | 'run' | null;
  showLoadingMessage: boolean;
  executeQuery: () => void;
  handleRetry: () => void;
  prepareLineChartData: (includeAverage?: boolean) => ILineChartProps | null;
  prepareBarChartData: () => IVerticalBarChartProps | null;
  preparePieChartData: () => { data: Array<{ y: number; x: string }>; total: number } | null;
  hideHeading?: boolean;
  sql?: string;
  showSqlCode?: boolean;
  showEditButton?: boolean;
  hiddenTabs?: string[];
  containerStyle?: 'green' | 'white' | 'none';
  showCost?: boolean;
  showDownloadReadMore?: boolean;
  hideTabList?: boolean;
  compactTableActions?: boolean;
  hideTableFooter?: boolean;
  compactTableTitle?: string;
  // Optional props for AnalysisActionModal
  websiteId?: string;
  period?: string;
  onAddToDashboard?: () => void;
}

const ResultsPanel = ({
  result,
  loading,
  error,
  queryStats,
  lastAction,
  showLoadingMessage,
  executeQuery,
  handleRetry,
  hideHeading = false,
  sql,
  showSqlCode = false,
  showEditButton = false,
  prepareLineChartData,
  prepareBarChartData,
  preparePieChartData,
  hiddenTabs: propHiddenTabs = [],
  containerStyle = 'green',
  showCost = false,
  showDownloadReadMore = true,
  hideTabList = false,
  compactTableActions = false,
  hideTableFooter = false,
  compactTableTitle,
  websiteId,
  period,
  onAddToDashboard,
}: ResultsPanelProps) => {
  // Read initial tab from URL parameter
  const [activeTab, setActiveTab] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const validTabs = ['table', 'linechart', 'areachart', 'barchart', 'piechart'];
    return tabParam && validTabs.includes(tabParam) ? tabParam : 'table';
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>(''); // The actual search query being used for filtering
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showAverage, setShowAverage] = useState<boolean>(false);
  const [isPercentageStacked, setIsPercentageStacked] = useState<boolean>(false);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [rowLimit] = useState<number>(5000); // Limit rows for performance
  const [showAllRows, setShowAllRows] = useState<boolean>(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [showTableSearch, setShowTableSearch] = useState<boolean>(false);
  const tableSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showTableSearch) tableSearchInputRef.current?.focus();
  }, [showTableSearch]);

  // Helper to check if a value is a clickable URL path
  const isClickablePath = (val: any): boolean => {
    return typeof val === 'string' && val.startsWith('/') && val !== '/' && websiteId !== undefined;
  };

  // Helper to aggregate chart data by week or month
  const aggregateChartData = (chartData: ILineChartProps, granularity: 'day' | 'week' | 'month'): ILineChartProps => {
    if (granularity === 'day' || !chartData.data?.lineChartData) return chartData;

    const newSeries = chartData.data.lineChartData.map((series: any) => {
      const points = series.data;
      const aggregatedPoints: Record<string, { x: Date, y: number, count: number }> = {};

      points.forEach((point: any) => {
        const date = point.x instanceof Date ? point.x : new Date(point.x);
        if (!isValid(date)) return;

        let key = '';
        let displayDate: Date = date;

        if (granularity === 'week') {
          const start = startOfWeek(date, { weekStartsOn: 1 });
          key = format(start, 'yyyy-MM-dd');
          displayDate = start;
        } else if (granularity === 'month') {
          const start = startOfMonth(date);
          key = format(start, 'yyyy-MM');
          displayDate = start;
        }

        if (!aggregatedPoints[key]) {
          aggregatedPoints[key] = { x: displayDate, y: 0, count: 0 };
        }
        aggregatedPoints[key].y += point.y;
        aggregatedPoints[key].count += 1;
      });

      const newPoints = Object.values(aggregatedPoints)
        .sort((a, b) => a.x.getTime() - b.x.getTime())
        .map(p => ({
          x: p.x,
          y: p.y,
          xAxisCalloutData: granularity === 'week' ? `Uke ${format(p.x, 'w', { locale: nb })}` : format(p.x, 'MMMM yyyy', { locale: nb }),
          yAxisCalloutData: p.y.toLocaleString('nb-NO')
        }));

      return {
        ...series,
        data: newPoints
      };
    });

    return {
      ...chartData,
      data: {
        ...chartData.data,
        lineChartData: newSeries
      }
    };
  };

  // Get hidden tabs from URL or props
  const hiddenTabs = (() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hideTabsParam = urlParams.get('hideTabs');
    const urlHiddenTabs = hideTabsParam ? hideTabsParam.split(',') : [];
    return [...new Set([...urlHiddenTabs, ...propHiddenTabs])];
  })();

  useEffect(() => {
    if (hiddenTabs.includes(activeTab)) {
      setActiveTab('table');
    }
  }, [activeTab, hiddenTabs]);

  // Update URL when tab changes
  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('tab', newTab);
    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.replaceState({}, '', newUrl);
  };

  // Handler for executing search
  const handleSearch = () => {
    setActiveSearchQuery(searchQuery);
  };

  // Handler for clearing search
  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery('');
  };

  // Reset visualization settings when result changes
  useEffect(() => {
    setIsPercentageStacked(false);
    setGranularity('day');
  }, [result]);

  // For small datasets, auto-submit search as you type
  useEffect(() => {
    if (!result || !result.data) return;

    const isLargeDataset = result.data.length > rowLimit;
    if (!isLargeDataset) {
      // For small datasets, automatically sync searchQuery to activeSearchQuery
      setActiveSearchQuery(searchQuery);
    }
  }, [searchQuery, result, rowLimit]);

  // Memoize the expensive table data processing
  const processedTableData = useMemo(() => {
    if (!result || !result.data || result.data.length === 0) {
      return null;
    }

    const totalRows = result.data.length;
    const isLargeDataset = totalRows > rowLimit;
    const shouldLimitRows = isLargeDataset && !showAllRows && !activeSearchQuery;

    // Filter the data based on active search query
    const filteredData = result.data.filter((row: any) => {
      if (!activeSearchQuery) return true;
      const query = activeSearchQuery.toLowerCase();
      return Object.keys(row).some((key) => {
        const value = row[key];
        if (value === null || value === undefined) return false;
        // Use translated value for search
        const translatedValue = translateValue(key, value);
        return String(translatedValue).toLowerCase().includes(query);
      });
    });

    // Apply row limit if needed (only when not searching)
    const limitedData = shouldLimitRows ? filteredData.slice(0, rowLimit) : filteredData;

    // Sort the filtered/limited data
    const sortedData = sortColumn
      ? [...limitedData].sort((a: any, b: any) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        // Handle null/undefined values
        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

        // Numeric comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // String comparison
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();

        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr, 'nb-NO');
        } else {
          return bStr.localeCompare(aStr, 'nb-NO');
        }
      })
      : limitedData;

    return sortedData;
  }, [result, activeSearchQuery, showAllRows, rowLimit, sortColumn, sortDirection]);

  // Handler for sorting (memoized to prevent recreating on every render)
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      // Same column - toggle direction
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - set column and default to descending for numbers (most useful default)
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  // Memoize the table rendering to prevent re-renders when only searchQuery changes
  const tableContent = useMemo(() => {
    const sortedData = processedTableData;

    if (!sortedData || sortedData.length === 0) {
      return (
        <div className="p-8 text-center text-[var(--ax-text-subtle)]">
          <p>Ingen resultater funnet for "{activeSearchQuery}"</p>
        </div>
      );
    }

    if (!result || !result.data || result.data.length === 0) {
      return null;
    }

    return (
      <>
        <table className="min-w-full divide-y divide-[var(--ax-border-neutral-subtle)]">
          <thead className="bg-[var(--ax-bg-neutral-soft)] sticky top-0">
            <tr>
              {Object.keys(result.data[0]).map((key) => (
                <th
                  key={key}
                  className="px-4 py-2 text-left text-xs font-medium text-[var(--ax-text-subtle)] uppercase tracking-wider cursor-pointer hover:bg-[var(--ax-bg-subtle-hover)] select-none"
                  onClick={() => handleSort(key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{key}</span>
                    {sortColumn === key ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp size={14} className="text-blue-600" />
                      ) : (
                        <ArrowDown size={14} className="text-blue-600" />
                      )
                    ) : (
                      <ArrowUpDown size={14} className="text-[var(--ax-text-subtle)]" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[var(--ax-bg-default)] divide-y divide-[var(--ax-border-neutral-subtle)]">
            {sortedData.map((row: any, idx: number) => {
              const keys = Object.keys(row);
              return (
                <tr key={idx} className="hover:bg-[var(--ax-bg-neutral-soft)]">
                  {keys.map((key, cellIdx: number) => {
                    const value = row[key];
                    const translatedValue = translateValue(key, value);
                    const clickable = isClickablePath(value);

                    // Format the display value
                    const displayValue = typeof translatedValue === 'number'
                      ? translatedValue.toLocaleString('nb-NO')
                      : translatedValue !== null && translatedValue !== undefined
                        ? (typeof translatedValue === 'object'
                          ? (translatedValue instanceof Date && !isNaN(translatedValue as any)
                            ? translatedValue.toISOString()
                            : (Object.keys(translatedValue).length === 1 && 'value' in translatedValue
                              ? (typeof translatedValue.value === 'string' && !isNaN(Date.parse(translatedValue.value))
                                ? new Date(translatedValue.value).toISOString()
                                : String(translatedValue.value))
                              : JSON.stringify(translatedValue)))
                          : String(translatedValue))
                        : '-';

                    return (
                      <td
                        key={cellIdx}
                        className={`px-4 py-2 whitespace-nowrap text-sm ${clickable ? 'cursor-pointer' : 'text-[var(--ax-text-default)]'}`}
                        onClick={clickable ? () => setSelectedUrl(value) : undefined}
                      >
                        {clickable ? (
                          <span className="text-blue-600 hover:underline flex items-center gap-1">
                            {displayValue} <ExternalLink className="h-3 w-3" />
                          </span>
                        ) : (
                          displayValue
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }, [processedTableData, activeSearchQuery, result, sortColumn, sortDirection, handleSort, isClickablePath, setSelectedUrl]);

  // Helper functions to generate content
  const getCSVContent = () => {
    if (!result || !result.data || result.data.length === 0) return '';
    const headers = Object.keys(result.data[0]);
    const csvRows = [
      headers.join(','),
      ...result.data.map((row: any) =>
        headers
          .map((header) => {
            const value = row[header];
            const translatedValue = translateValue(header, value);
            const stringValue = translatedValue !== null && translatedValue !== undefined ? String(translatedValue) : '';
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(',')
      ),
    ];
    return csvRows.join('\n');
  };

  const getJSONContent = () => {
    if (!result || !result.data || result.data.length === 0) return '';
    const translatedData = result.data.map((row: any) => {
      const translatedRow: any = {};
      Object.keys(row).forEach((key) => {
        translatedRow[key] = translateValue(key, row[key]);
      });
      return translatedRow;
    });
    return JSON.stringify(translatedData, null, 2);
  };

  const getTOONContent = () => {
    if (!result || !result.data || result.data.length === 0) return '';
    const translatedData = result.data.map((row: any) => {
      const translatedRow: any = {};
      Object.keys(row).forEach((key) => {
        translatedRow[key] = translateValue(key, row[key]);
      });
      return translatedRow;
    });
    return encode(translatedData);
  };

  // Function to convert results to CSV
  const downloadCSV = () => {
    const csvContent = getCSVContent();
    if (!csvContent) return;

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel compatibility
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `query_results_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to convert results to a real XLSX file
  const downloadExcel = async () => {
    if (!result || !result.data || result.data.length === 0) return;

    const headers = Object.keys(result.data[0]);
    const worksheetData = [
      headers,
      ...result.data.map((row: any) =>
        headers.map((header) => {
          const value = row[header];
          const translatedValue = translateValue(header, value);
          return translatedValue !== null && translatedValue !== undefined ? translatedValue : '';
        })
      ),
    ];

    let xlsx: any;
    try {
      const preferred = 'xlsx-js-style';
      xlsx = await import(/* @vite-ignore */ preferred);
    } catch {
      try {
        const fallback = 'xlsx';
        xlsx = await import(/* @vite-ignore */ fallback);
      } catch {
        console.error('Mangler XLSX-bibliotek (xlsx-js-style/xlsx). Kjør npm install.');
        return;
      }
    }

    const XLSXUtils = xlsx.utils;
    const XLSXWrite = xlsx.write;
    const worksheet = XLSXUtils.aoa_to_sheet(worksheetData);
    const workbook = XLSXUtils.book_new();
    XLSXUtils.book_append_sheet(workbook, worksheet, 'Query Results');
    const wbout = XLSXWrite(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `query_results_${new Date().toISOString().slice(0, 10)}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Function to convert results to JSON
  const downloadJSON = () => {
    const jsonContent = getJSONContent();
    if (!jsonContent) return;

    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `query_results_${new Date().toISOString().slice(0, 10)}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Function to convert results to TOON (Token-Oriented Object Notation)
  const downloadTOON = () => {
    const toonContent = getTOONContent();
    if (!toonContent) return;

    const blob = new Blob([toonContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `query_results_${new Date().toISOString().slice(0, 10)}.toon`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getContainerClass = () => {
    switch (containerStyle) {
      case 'white':
        return "bg-[var(--ax-bg-default)] p-6 rounded-lg border border-[var(--ax-border-neutral-subtle)] shadow-sm";
      case 'none':
        return "";
      case 'green':
      default:
        return "bg-[var(--ax-bg-default)]";
    }
  };

  const containerClass = getContainerClass();

  return (
    <div className="space-y-2 mb-6">
      {!hideHeading && <Heading level="2" size="small" className="mb-2 pb-2">Vis resultater</Heading>}

      <div className={containerClass}>
        {/* Only show button if no results yet */}
        {!result && !error && (
          <div className="space-y-2">
            <Button
              onClick={executeQuery}
              loading={loading}
              icon={<PlayIcon size={18} />}
              variant="primary"
              size="medium"
            >
              Vis resultater
            </Button>
            {loading && showLoadingMessage && (
              <Alert variant="info" className="text-sm mt-2">
                <p className="font-medium">Spørring kjører...</p>
                <p className="mt-1">Dette kan ta opptil 20-30 sekunder for store datasett. Vennligst vent.</p>
              </Alert>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <>
            <Alert variant="error" className="mt-3">
              <div className="text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="font-medium">Feil ved kjøring</p>
                  <p className="mt-1">{error}</p>
                </div>
                {lastAction && (
                  <div className="flex-shrink-0">
                    <Button size="small" variant="primary" onClick={handleRetry}>
                      Prøv igjen
                    </Button>
                  </div>
                )}
              </div>
            </Alert>
          </>
        )}

        {/* Results Display */}
        {result && result.data && result.data.length > 0 && (
          <div className="mt-2 space-y-3">
            {/* Tabbed Display */}
            <Tabs value={activeTab} onChange={handleTabChange}>
              {!hideTabList && (
                <Tabs.List>
                  {!hiddenTabs.includes('table') && <Tabs.Tab value="table" label="Tabell" />}
                  {!hiddenTabs.includes('linechart') && <Tabs.Tab value="linechart" label="Linje" />}
                  {!hiddenTabs.includes('areachart') && <Tabs.Tab value="areachart" label="Område" />}
                  {!hiddenTabs.includes('barchart') && <Tabs.Tab value="barchart" label="Stolpe" />}
                  {!hiddenTabs.includes('piechart') && <Tabs.Tab value="piechart" label="Kake" />}
                </Tabs.List>
              )}

              {/* Table Tab */}
              <Tabs.Panel value="table" className="pt-4">
                <div className="space-y-3">
                  {compactTableActions && (
                    <div className="space-y-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        {compactTableTitle ? (
                          <Heading level="3" size="small">{compactTableTitle}</Heading>
                        ) : <span />}
                        <div className="flex items-center gap-1">
                          <Tooltip content="Søk" placement="top">
                            <Button
                              type="button"
                              variant={showTableSearch ? 'secondary' : 'tertiary'}
                              size="xsmall"
                              icon={<SearchIcon aria-hidden />}
                              aria-label="Søk i tabellen"
                              aria-pressed={showTableSearch}
                              onClick={() => {
                                setShowTableSearch((prev) => !prev);
                                if (showTableSearch) handleClearSearch();
                              }}
                            />
                          </Tooltip>
                          <ActionMenu>
                            <Tooltip content="Flere valg" placement="top">
                              <ActionMenu.Trigger>
                                <Button
                                  type="button"
                                  variant="tertiary"
                                  size="xsmall"
                                  icon={<MoreVertical aria-hidden />}
                                  aria-label="Flere valg for tabell"
                                />
                              </ActionMenu.Trigger>
                            </Tooltip>
                            <ActionMenu.Content align="end">
                              <ActionMenu.Item onClick={downloadCSV}>
                                Last ned CSV
                              </ActionMenu.Item>
                              {onAddToDashboard && (
                                <ActionMenu.Item onClick={onAddToDashboard}>
                                  Legg til i dashboard
                                </ActionMenu.Item>
                              )}
                            </ActionMenu.Content>
                          </ActionMenu>
                        </div>
                      </div>
                      {showTableSearch && (
                        <div className="w-full sm:w-64 min-w-0">
                          <TextField
                            label="Søk i tabellen"
                            hideLabel
                            size="small"
                            value={searchQuery}
                            placeholder="Søk..."
                            onChange={(e) => setSearchQuery(e.target.value)}
                            ref={tableSearchInputRef}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSearch();
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="border rounded-lg overflow-hidden bg-[var(--ax-bg-default)]">
                    {/* Search Input */}
                    {!compactTableActions && (
                      <div className="p-3 bg-[var(--ax-bg-neutral-soft)] border-b space-y-2">
                        <Search
                          label="Søk i tabellen"
                          hideLabel={false}
                          size="small"
                          value={searchQuery}
                          onChange={(value) => setSearchQuery(value)}
                          onClear={handleClearSearch}
                          variant={result.data.length > rowLimit ? "primary" : "simple"}
                          onSearchClick={result.data.length > rowLimit ? handleSearch : undefined}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSearch();
                            }
                          }}
                          htmlSize={result.data.length > rowLimit ? 40 : undefined}
                        />
                        {/* Large dataset warning and controls */}
                        {result.data.length > rowLimit && (
                          <div className="space-y-2">
                            {!showAllRows && !activeSearchQuery && (
                              <Alert variant="warning" size="small">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <span className="text-sm">
                                    Viser bare {rowLimit.toLocaleString('nb-NO')} av {result.data.length.toLocaleString('nb-NO')} rader for ytelse
                                  </span>
                                  <Button
                                    size="xsmall"
                                    variant="secondary"
                                    onClick={() => setShowAllRows(true)}
                                  >
                                    Vis alle rader
                                  </Button>
                                </div>
                              </Alert>
                            )}
                            {showAllRows && !activeSearchQuery && (
                              <Alert variant="info" size="small">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <span className="text-sm">
                                    Viser alle {result.data.length.toLocaleString('nb-NO')} rader (kan være tregt)
                                  </span>
                                  <Button
                                    size="xsmall"
                                    variant="secondary"
                                    onClick={() => setShowAllRows(false)}
                                  >
                                    Begrens til {rowLimit.toLocaleString('nb-NO')} rader
                                  </Button>
                                </div>
                              </Alert>
                            )}
                            {activeSearchQuery && processedTableData && (
                              <Alert variant="info" size="small">
                                <span className="text-sm">
                                  Fant {processedTableData.length.toLocaleString('nb-NO')} av {result.data.length.toLocaleString('nb-NO')} rader
                                </span>
                              </Alert>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      {tableContent}
                    </div>
                    {/* Table Footer */}
                    {!hideTableFooter && (
                      <div className="px-4 py-3 bg-[var(--ax-bg-neutral-soft)] text-sm text-[var(--ax-text-subtle)] border-t">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={downloadCSV}
                              icon={<Download size={16} />}
                            >
                              Last ned CSV
                            </Button>
                            <span>
                              {(() => {
                                const totalRows = result.data.length;
                                const isLargeDataset = totalRows > rowLimit;
                                const shouldLimitRows = isLargeDataset && !showAllRows && !activeSearchQuery;

                                if (activeSearchQuery) {
                                  // Showing search results
                                  const filteredCount = result.data.filter((row: any) => {
                                    const query = activeSearchQuery.toLowerCase();
                                    return Object.values(row).some((value: any) => {
                                      if (value === null || value === undefined) return false;
                                      return String(value).toLowerCase().includes(query);
                                    });
                                  }).length;
                                  return <>Viser {filteredCount.toLocaleString('nb-NO')} av {totalRows.toLocaleString('nb-NO')} rader</>;
                                } else if (shouldLimitRows) {
                                  // Showing limited rows
                                  return <>Viser {rowLimit.toLocaleString('nb-NO')} av {totalRows.toLocaleString('nb-NO')} rader</>;
                                } else {
                                  // Showing all rows
                                  return <>{totalRows.toLocaleString('nb-NO')} {totalRows === 1 ? 'rad' : 'rader'}</>;
                                }
                              })()}
                            </span>
                          </div>
                          {queryStats && (
                            <span>
                              Data prosessert: {queryStats.totalBytesProcessedGB} GB
                              {showCost && (() => {
                                const gb = parseFloat(queryStats.totalBytesProcessedGB);
                                const cost = parseFloat(queryStats.estimatedCostUSD) || (gb * 0.00625);
                                return cost > 0 ? ` • Kostnad: $${cost.toFixed(2)}` : '';
                              })()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Tabs.Panel>

              {/* Line Chart Tab */}
              <Tabs.Panel value="linechart" className="pt-4">
                <div className="border rounded-lg bg-[var(--ax-bg-default)] p-4">
                  {(() => {
                    let chartData = prepareLineChartData(showAverage);

                    if (chartData && granularity !== 'day') {
                      chartData = aggregateChartData(chartData, granularity);
                    }

                    console.log('Line Chart Data:', chartData);
                    console.log('Raw Result Data:', result.data);

                    if (!chartData) {
                      return (
                        <Alert variant="info">
                          Kunne ikke lage linjediagram fra dataene. Trenger minst to kolonner (x-akse og y-akse).
                        </Alert>
                      );
                    }
                    return (
                      <div style={{ overflow: 'visible' }}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                          <Switch
                            checked={showAverage}
                            onChange={(e) => setShowAverage(e.target.checked)}
                            size="small"
                          >
                            Vis gjennomsnitt
                          </Switch>
                          <div className="flex items-center gap-2">
                            <Label size="small" htmlFor="line-granularity">Tidsoppløsning</Label>
                            <Select
                              id="line-granularity"
                              label="Tidsoppløsning"
                              hideLabel
                              size="small"
                              value={granularity}
                              onChange={(e) => setGranularity(e.target.value as any)}
                            >
                              <option value="day">Daglig</option>
                              <option value="week">Ukentlig</option>
                              <option value="month">Månedlig</option>
                            </Select>
                          </div>
                        </div>
                        <div style={{ width: '100%', height: '400px' }}>
                          <ResponsiveContainer>
                            <LineChart
                              data={chartData.data}
                              legendsOverflowText="Flere"
                              yAxisTickCount={10}
                              allowMultipleShapesForPoints={false}
                              enablePerfOptimization={true}
                              margins={{ left: 50, right: 40, top: 20, bottom: 35 }}
                              legendProps={{
                                allowFocusOnLegends: true,
                                styles: {
                                  text: { color: 'var(--ax-text-default)' },
                                }
                              }}
                            />
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-2 text-xs text-[var(--ax-text-subtle)]">
                          Viser {chartData.data.lineChartData?.[0]?.data?.length || 0} datapunkter
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Tabs.Panel>

              {/* Area Chart Tab */}
              <Tabs.Panel value="areachart" className="pt-4">
                <div className="border rounded-lg bg-[var(--ax-bg-default)] p-4">
                  {(() => {
                    let baseChartData = prepareLineChartData(false);

                    if (!baseChartData) {
                      return (
                        <Alert variant="info">
                          Kunne ikke lage områdediagram fra dataene. Trenger minst to kolonner (x-akse og y-akse).
                        </Alert>
                      );
                    }

                    // Apply granularity aggregation
                    if (granularity !== 'day') {
                      baseChartData = aggregateChartData(baseChartData, granularity);
                    }

                    // Check if we have multiple series
                    const hasMultipleSeries = baseChartData.data.lineChartData && baseChartData.data.lineChartData.length > 1;

                    // Transform data for percentage view if needed
                    let chartData = baseChartData;
                    if (isPercentageStacked && baseChartData.data.lineChartData) {
                      // Create a map of x values to total y values
                      const xTotals = new Map<number, number>();

                      // Calculate totals for each x value
                      baseChartData.data.lineChartData.forEach((series: any) => {
                        series.data.forEach((point: any) => {
                          const xVal = point.x instanceof Date ? point.x.getTime() : Number(point.x);
                          const currentTotal = xTotals.get(xVal) || 0;
                          xTotals.set(xVal, currentTotal + point.y);
                        });
                      });

                      // Transform each series to percentages
                      const percentageData = baseChartData.data.lineChartData.map((series: any) => ({
                        ...series,
                        data: series.data.map((point: any) => {
                          const xVal = point.x instanceof Date ? point.x.getTime() : Number(point.x);
                          const total = xTotals.get(xVal) || 1;
                          const percentage = (point.y / total) * 100;

                          return {
                            ...point,
                            y: percentage,
                            yAxisCalloutData: `${percentage.toFixed(1)}%`,
                            originalY: point.y,
                          };
                        }),
                      }));

                      chartData = {
                        ...baseChartData,
                        data: {
                          lineChartData: percentageData,
                        },
                      };
                    }

                    return (
                      <div style={{ overflow: 'visible' }}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                          {hasMultipleSeries && (
                            <Switch
                              checked={isPercentageStacked}
                              onChange={(e) => setIsPercentageStacked(e.target.checked)}
                              size="small"
                            >
                              Stablet 100%
                            </Switch>
                          )}
                          <div className="flex items-center gap-2">
                            <Label size="small" htmlFor="area-granularity">Tidsoppløsning</Label>
                            <Select
                              id="area-granularity"
                              label="Tidsoppløsning"
                              hideLabel
                              size="small"
                              value={granularity}
                              onChange={(e) => setGranularity(e.target.value as any)}
                            >
                              <option value="day">Daglig</option>
                              <option value="week">Ukentlig</option>
                              <option value="month">Månedlig</option>
                            </Select>
                          </div>
                        </div>

                        <div style={{ width: '100%', height: '400px' }}>
                          <ResponsiveContainer>
                            <AreaChart
                              data={chartData.data}
                              legendsOverflowText="Flere"
                              yAxisTickCount={isPercentageStacked ? 5 : 10}
                              enablePerfOptimization={true}
                              margins={{ left: 50, right: 50, top: 20, bottom: 35 }}
                              yMinValue={isPercentageStacked ? 0 : undefined}
                              yMaxValue={isPercentageStacked ? 100 : undefined}
                              legendProps={{
                                allowFocusOnLegends: true,
                                styles: {
                                  text: { color: 'var(--ax-text-default)' },
                                }
                              }}
                            />
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-2 text-xs text-[var(--ax-text-subtle)]">
                          Viser {chartData.data.lineChartData?.[0]?.data?.length || 0} datapunkter
                          {isPercentageStacked && ' (prosent av totalen per tidspunkt)'}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Tabs.Panel>

              {/* Bar Chart Tab */}
              <Tabs.Panel value="barchart" className="pt-4">
                <div className="border rounded-lg bg-[var(--ax-bg-default)] p-4">
                  {(() => {
                    const chartData = prepareBarChartData();
                    console.log('Bar Chart Data:', chartData);
                    // Check if too many items
                    let displayData: IVerticalBarChartDataPoint[] = [];
                    let limitMessage = null;

                    if (chartData && Array.isArray(chartData.data)) {
                      if (chartData.data.length > 12) {
                        const top11 = chartData.data.slice(0, 11);
                        const others = chartData.data.slice(11);
                        const otherSum = others.reduce((sum, item) => sum + (item.y), 0);

                        displayData = [
                          ...top11,
                          { x: 'Andre', y: otherSum }
                        ];

                        limitMessage = (
                          <Alert variant="info" className="mb-4">
                            Viser topp 11 kategorier, pluss "Andre" som samler de resterende {others.length} kategoriene.
                          </Alert>
                        );
                      } else {
                        displayData = chartData.data;
                      }
                    }

                    if (!chartData || !chartData.data || (Array.isArray(chartData.data) && chartData.data.length === 0)) {
                      return (
                        <Alert variant="info">
                          Kunne ikke lage stolpediagram fra dataene. Trenger minst to kolonner (kategori og verdi).
                        </Alert>
                      );
                    }
                    // Check if all y values are NaN, 0, or invalid
                    const hasValidBarData = Array.isArray(displayData) && displayData.some((item) => {
                      return !Number.isNaN(item.y) && typeof item.y === 'number' && item.y !== 0;
                    });

                    if (!hasValidBarData) {
                      return (
                        <Alert variant="info">
                          Klarer ikke å vise stolpediagram, egner seg trolig ikke for denne grafen
                        </Alert>
                      );
                    }
                    return (
                      <div className="w-full">
                        {limitMessage}
                        <div className="overflow-y-auto max-h-[500px]" style={{ overflow: 'visible' }}>
                          <style>{`
                            .bar-chart-hide-xaxis .ms-Chart-xAxis text,
                            .bar-chart-hide-xaxis g[class*="xAxis"] text {
                              display: none !important;
                            }
                          `}</style>
                          <div className="bar-chart-hide-xaxis" style={{ width: '100%', height: '500px' }}>
                            <ResponsiveContainer>
                              <VerticalBarChart
                                data={displayData}
                                barWidth={chartData.barWidth}
                                yAxisTickCount={chartData.yAxisTickCount}
                                margins={{ left: 50, right: 40, top: 20, bottom: 35 }}
                              />
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-[var(--ax-text-subtle)]">
                          Viser {displayData.length} kategorier (hold markøren over stolpene for detaljer)
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Tabs.Panel>

              {/* Pie Chart Tab */}
              <Tabs.Panel value="piechart" className="pt-4">
                <div className="border rounded-lg bg-[var(--ax-bg-default)] p-4">
                  {(() => {
                    const chartData = preparePieChartData();
                    console.log('Pie Chart Data:', chartData);
                    // Check if too many items
                    let displayData: any[] = [];
                    let limitMessage = null;

                    if (chartData && Array.isArray(chartData.data)) {
                      if (chartData.data.length > 12) {
                        const top11 = chartData.data.slice(0, 11);
                        const others = chartData.data.slice(11);
                        const otherSum = others.reduce((sum, item) => sum + (item.y), 0);

                        displayData = [
                          ...top11,
                          { x: 'Andre', y: otherSum }
                        ];

                        limitMessage = (
                          <Alert variant="info" className="mb-4">
                            Viser topp 11 kategorier, pluss "Andre" som samler de resterende {others.length} kategoriene.
                          </Alert>
                        );
                      } else {
                        displayData = chartData.data;
                      }
                    }

                    if (!chartData || !chartData.data || (Array.isArray(chartData.data) && chartData.data.length === 0)) {
                      return (
                        <Alert variant="info">
                          Kunne ikke lage sirkeldiagram fra dataene. Trenger minst to kolonner (kategori og verdi).
                        </Alert>
                      );
                    }
                    // Check if all y values are NaN or if no valid values exist
                    const hasValidY = Array.isArray(displayData) && displayData.some((item) => !Number.isNaN(item.y) && item.y !== 0);

                    if (!hasValidY || (Array.isArray(displayData) && displayData.every((item) => Number.isNaN(item.y)))) {
                      return (
                        <Alert variant="info">
                          Klarer ikke å vise sirkeldiagram, egner seg trolig ikke for denne grafen.
                        </Alert>
                      );
                    }

                    return (
                      <div>
                        {limitMessage}
                        <div className="flex flex-col items-center">
                          <style>{`
                            /* Make the labels transparent but keep them for hover functionality */
                            .pie-chart-wrapper text[class*="pieLabel"],
                            .pie-chart-wrapper g[class*="arc"] text {
                              opacity: 0 !important;
                              pointer-events: none !important;
                            }
                            /* Make the pie slices hoverable */
                            .pie-chart-wrapper path {
                              cursor: pointer !important;
                            }
                            /* Style the callout to be larger and more readable */
                            .pie-chart-wrapper .ms-Callout-main {
                              padding: 24px !important;
                              background: var(--ax-bg-default) !important;
                              border: 3px solid #0067C5 !important;
                              border-radius: 8px !important;
                              box-shadow: 0 6px 20px rgba(0,0,0,0.3) !important;
                              min-width: 300px !important;
                            }
                            .pie-chart-wrapper .ms-Callout-main div {
                              font-size: 24px !important;
                              line-height: 1.8 !important;
                              font-weight: 700 !important;
                              color: var(--ax-text-default) !important;
                            }
                          `}</style>
                          <div className="pie-chart-wrapper" style={{ width: '100%', height: '400px' }}>
                            <ResponsiveContainer>
                              <PieChart
                                data={displayData}
                                chartTitle=""
                              />
                            </ResponsiveContainer>
                          </div>
                          <div className="mt-4 text-lg text-[var(--ax-text-default)]">
                            <p className="font-medium mb-3">Viser {displayData.length} kategorier med prosentandeler:</p>
                            <div className="mt-2 flex flex-col gap-2">
                              {displayData.map((item, idx) => {
                                // Ensure chartData is not null before accessing total
                                const total = chartData ? chartData.total : 0;
                                const percentage = ((item.y / total) * 100).toFixed(1);
                                // Skip displaying if percentage is NaN
                                if (isNaN(parseFloat(percentage))) return null;
                                return (
                                  <div key={idx} className="flex justify-between items-center py-1 px-2 hover:bg-[var(--ax-bg-neutral-soft)] rounded">
                                    <span>{item.x}</span>
                                    <strong className="ml-4">{percentage}%</strong>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </Tabs.Panel>
            </Tabs>

            {/* Download Options */}
            {showDownloadReadMore && (
              <div className="pt-2">
                <ReadMore header="Last ned resultater">
                  <div className="space-y-4 mt-2">
                    {/* Download Section */}
                    <div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <Button
                          onClick={downloadCSV}
                          variant="secondary"
                          size="small"
                          icon={<Download size={16} />}
                        >
                          CSV
                        </Button>

                        <Button
                          onClick={downloadExcel}
                          variant="secondary"
                          size="small"
                          icon={<Download size={16} />}
                        >
                          Excel
                        </Button>

                        <Button
                          onClick={downloadJSON}
                          variant="secondary"
                          size="small"
                          icon={<Download size={16} />}
                        >
                          JSON
                        </Button>

                        <Button
                          onClick={downloadTOON}
                          variant="secondary"
                          size="small"
                          icon={<Download size={16} />}
                        >
                          TOON
                        </Button>
                      </div>
                    </div>

                    {/* Copy Section */}
                    <div>
                      <p className="text-sm font-medium text-[var(--ax-text-subtle)] mb-2">Eller kopier dem:</p>
                      <div className="flex gap-2 flex-wrap items-center">
                        <CopyButton
                          copyText={getCSVContent()}
                          text="CSV"
                          activeText="CSV kopiert!"
                          size="small"
                          variant="action"
                        />

                        <CopyButton
                          copyText={getJSONContent()}
                          text="JSON"
                          activeText="JSON kopiert!"
                          size="small"
                          variant="action"
                        />

                        <CopyButton
                          copyText={getTOONContent()}
                          text="TOON"
                          activeText="TOON kopiert!"
                          size="small"
                          variant="action"
                        />
                      </div>
                    </div>
                  </div>
                </ReadMore>
              </div>
            )}

            {/* Share Button
            {sql && result && result.data && result.data.length > 0 && (
              <div className="mt-3 flex justify-end">
                <Button
                  onClick={() => setShowShareModal(true)}
                  variant="secondary"
                  size="small"
                  icon={<Share2 size={18} />}
                >
                  Del tabell & graf
                </Button>
              </div>
            )} */}

          </div>
        )}


        {result && result.data && result.data.length === 0 && (
          <Alert variant="info" className="mt-3">
            Spørringen returnerte ingen resultater.
          </Alert>
        )}

        {/* SQL Code Display */}
        {showSqlCode && sql && result && (
          <SqlViewer sql={sql} showEditButton={showEditButton} />
        )}
      </div>

      {/* Share Modal */}
      {
        sql && (
          <ShareResultsModal
            sql={sql}
            open={showShareModal}
            onClose={() => setShowShareModal(false)}
          />
        )
      }

      {/* Analysis Action Modal */}
      <AnalysisActionModal
        open={!!selectedUrl}
        onClose={() => setSelectedUrl(null)}
        urlPath={selectedUrl}
        websiteId={websiteId}
        period={period}
      />
    </div >
  );
};

export default ResultsPanel;
