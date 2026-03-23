/** Replace dots, Norwegian characters, and other special characters for BigQuery column names */
export const sanitizeColumnName = (key: string): string => {
  return key
    .replace(/\./g, '_')
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'oe')
    .replace(/å/gi, 'aa')
    .replace(/[^a-z0-9_]/gi, '_')
}

/** Replace spaces, parentheses and other special chars with underscores for BigQuery field names */
export const sanitizeFieldNameForBigQuery = (name: string): string => {
  return name.replace(/[^\w]/g, '_').replace(/^[0-9]/, '_$&')
}
