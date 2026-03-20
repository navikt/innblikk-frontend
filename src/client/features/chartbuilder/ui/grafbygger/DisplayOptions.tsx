import { Button, Heading, Select, TextField, Switch, ReadMore } from '@navikt/ds-react';
import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import type {
  ColumnGroup,
  OrderBy,
  Metric,
  Filter
} from '../../../../shared/types/chart.ts';
import AlertWithCloseButton from './AlertWithCloseButton.tsx';
import DateRangeSelector from './DateRangeSelector.tsx';

interface DisplayOptionsProps {
  groupByFields: string[];
  orderBy: OrderBy | null;
  columnOrderMode: 'default' | 'metrics_first';
  paramAggregation: 'representative' | 'unique';
  limit: number | null;
  COLUMN_GROUPS: Record<string, ColumnGroup>;
  setOrderBy: (column: string, direction: 'ASC' | 'DESC') => void;
  clearOrderBy: () => void;
  setDateFormat: (format: string) => void;
  setParamAggregation: (strategy: 'representative' | 'unique') => void;
  setLimit: (limit: number | null) => void;
  setColumnOrderMode: (mode: 'default' | 'metrics_first') => void;
  metrics: Metric[];
  filters: Filter[];
  setFilters: (filters: Filter[]) => void;
  maxDaysAvailable: number;
  hideHeader?: boolean;
  interactiveMode: boolean;
  setInteractiveMode: (mode: boolean) => void;
}

const DisplayOptions = forwardRef(({
  groupByFields,
  orderBy,
  columnOrderMode,
  limit,
  COLUMN_GROUPS,
  setOrderBy,
  clearOrderBy,
  setDateFormat,
  setParamAggregation,
  setLimit,
  setColumnOrderMode,
  metrics,
  filters,
  setFilters,
  maxDaysAvailable,
  hideHeader = false,
  interactiveMode,
  setInteractiveMode
}: DisplayOptionsProps, ref) => {
  const [showCustomSort, setShowCustomSort] = useState<boolean>(false);
  const [showCustomLimit, setShowCustomLimit] = useState<boolean>(false);
  const [alertInfo, setAlertInfo] = useState<{ show: boolean, message: string }>({
    show: false,
    message: ''
  });
  const [limitInput, setLimitInput] = useState<string>('');
  const [customPeriodInputs, setCustomPeriodInputs] = useState<Record<number, { amount: string, unit: string }>>({});
  const [selectedDateRange, setSelectedDateRange] = useState<string>('last7days');
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetOptions = (silent = false) => {
    clearOrderBy();
    setDateFormat('day');
    setLimit(1000);
    setColumnOrderMode('default');
    setParamAggregation('representative');
    setShowCustomSort(false);
    setShowCustomLimit(false);
    setLimitInput('1000');

    if (!silent) {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }

      setAlertInfo({
        show: true,
        message: 'Alle visningsvalg ble tilbakestilt'
      });

      alertTimeoutRef.current = setTimeout(() => {
        setAlertInfo(prev => ({ ...prev, show: false }));
        alertTimeoutRef.current = null;
      }, 4000);
    }
  };

  const handleAlertClose = () => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    setAlertInfo(prev => ({ ...prev, show: false }));
  };

  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    resetOptions
  }));

  useEffect(() => {
    setLimitInput(limit?.toString() || '');
  }, [limit]);

  return (
    <>
      {!hideHeader && (
        <div className="flex justify-between items-center mb-4">
          <Heading level="2" size="small">
            Hvordan vil du vise resultatene?
          </Heading>

          <Button
            variant="tertiary"
            size="small"
            onClick={() => resetOptions(false)}
          >
            Tilbakestill visningsvalg
          </Button>
        </div>
      )}

      {alertInfo.show && (
        <div className="mb-4">
          <AlertWithCloseButton
            variant="success"
            onClose={handleAlertClose}
          >
            {alertInfo.message}
          </AlertWithCloseButton>
        </div>
      )}

      <ReadMore header="Visningsvalg" size="medium">
        <div className="flex flex-col gap-4 pb-4 pt-2">
          <Switch
            size="small"
            description={interactiveMode
              ? 'Tidsperiode velges via filter i dasboardet (standard)'
              : 'Bruk valgt tidsperiode fra grafbyggeren som standard'}
            checked={!interactiveMode}
            onChange={(e) => setInteractiveMode(!e.target.checked)}
          >
            Overstyr tidsperiode
          </Switch>

          <div className={interactiveMode ? 'hidden' : undefined}>
            <DateRangeSelector
              filters={filters}
              setFilters={setFilters}
              maxDaysAvailable={maxDaysAvailable}
              selectedDateRange={selectedDateRange}
              setSelectedDateRange={setSelectedDateRange}
              customPeriodInputs={customPeriodInputs}
              setCustomPeriodInputs={setCustomPeriodInputs}
              interactiveMode={interactiveMode}
            />
          </div>

          <Switch
            className="mt-1"
            size="small"
            description={orderBy
              ? `Sorterer etter ${orderBy.column ? orderBy.column.toLowerCase() : 'første kolonne'} i ${orderBy.direction === 'ASC' ? 'stigende' : 'synkende'} rekkefølge`
              : 'Sorterer etter første kolonne i synkende rekkefølge'}
            checked={showCustomSort}
            onChange={() => setShowCustomSort(!showCustomSort)}
          >
            Tilpass sortering
          </Switch>

          {showCustomSort && (
            <div className="flex flex-col gap-2 bg-[var(--ax-bg-default)] p-3 rounded-md border">
              <div className="flex gap-2">
                <Select
                  label="Sorter etter"
                  value={orderBy?.column || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const direction = e.target.value === 'dato' ? 'ASC' : 'DESC';
                      setOrderBy(e.target.value, direction);
                    } else {
                      clearOrderBy();
                    }
                  }}
                  size="small"
                  className="flex-grow"
                >
                  <option value="">Standard sortering</option>
                  <optgroup label="Grupperinger">
                    {groupByFields.map((field) => {
                      const column = Object.values(COLUMN_GROUPS)
                        .flatMap(group => group.columns)
                        .find(col => col.value === field);

                      return (
                        <option key={field} value={field === 'created_at' ? 'dato' : field}>
                          {field === 'created_at' ? 'Dato' : column?.label || field}
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="Metrikker">
                    {metrics.map((metric, index) => (
                      <option
                        key={`metrikk_${index}`}
                        value={metric.alias || `metrikk_${index + 1}`}
                      >
                        {metric.alias || `metrikk_${index + 1}`}
                      </option>
                    ))}
                  </optgroup>
                </Select>

                <Select
                  label="Retning"
                  value={orderBy?.direction || 'ASC'}
                  onChange={(e) => setOrderBy(
                    orderBy?.column || '',
                    e.target.value as 'ASC' | 'DESC'
                  )}
                  size="small"
                >
                  <option value="ASC">Stigende (A-Å, 0-9)</option>
                  <option value="DESC">Synkende (Å-A, 9-0)</option>
                </Select>
              </div>
            </div>
          )}

          <Switch
            size="small"
            description={limit && limit !== 1000
              ? `Begrenser til ${limit} rader`
              : 'F.eks. for en topp 10-liste (standard: 1000 rader)'}
            checked={showCustomLimit}
            onChange={(e) => {
              setShowCustomLimit(e.target.checked);
              if (!e.target.checked) {
                setLimit(1000);
                setLimitInput('1000');
              }
            }}
          >
            Begrens antall rader
          </Switch>

          {showCustomLimit && (
            <div className="flex gap-2 items-center bg-[var(--ax-bg-default)] p-3 rounded-md border">
              <TextField
                label="Maksimalt antall rader"
                type="number"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onBlur={() => {
                  const numValue = parseInt(limitInput, 10);
                  if (!isNaN(numValue) && numValue > 0) {
                    setLimit(numValue);
                  } else {
                    setLimit(1000);
                    setLimitInput('1000');
                  }
                }}
                min="1"
                size="small"
                className="flex-grow"
              />
            </div>
          )}

          <Switch
            size="small"
            description={columnOrderMode === 'metrics_first'
              ? 'Måltall før grupperingskolonner'
              : 'Standard rekkefølge: Grupperinger før måltall'}
            checked={columnOrderMode === 'metrics_first'}
            onChange={(e) => setColumnOrderMode(e.target.checked ? 'metrics_first' : 'default')}
          >
            Bytt kolonnerekkefølge
          </Switch>
        </div>
      </ReadMore>
    </>
  );
});

export default DisplayOptions;
