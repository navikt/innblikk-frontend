type OpenSqlEditorOptions = {
  sql: string;
  websiteId?: string;
};

export const openSqlEditorWithContext = ({ sql, websiteId }: OpenSqlEditorOptions): void => {
  if (typeof window === 'undefined' || !sql.trim()) return;

  const params = new URLSearchParams(window.location.search);
  params.set('sql', sql);

  if (websiteId) {
    params.set('websiteId', websiteId);
  }

  let url = `/sql?${params.toString()}`;
  if (url.length > 2000) {
    try {
      const storageKey = `sql_editor_prefill_${Date.now()}`;
      window.sessionStorage.setItem(storageKey, sql);
      params.delete('sql');
      params.set('sqlStorageKey', storageKey);
      url = `/sql?${params.toString()}`;
    } catch {
      window.open('/sql', '_blank', 'noopener,noreferrer');
      return;
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};
