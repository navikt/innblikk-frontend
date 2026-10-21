import type { EventName, EventPropertiesMap } from '@navikt/analytics-types'

/**
 * Single choke point for sending taxonomy events to the Innblikk/ReOps pipeline.
 *
 * - No-ops when the tracking script isn't loaded (dev, ad blockers).
 * - Type-safe: properties are checked against the event's interface from
 *   `@navikt/analytics-types`.
 */
export function trackEvent<K extends EventName>(name: K, properties: EventPropertiesMap[K]): void {
  window.sporing?.track(name, properties)
}
