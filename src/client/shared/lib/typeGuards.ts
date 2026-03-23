/**
 * Check whether a value is a non-null object (i.e. a record).
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
