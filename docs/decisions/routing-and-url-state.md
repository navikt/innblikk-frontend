# Routing and URL state

Decisions agreed on 2026-11-19.

## Audit and route map

The app already used one React Router instance, not competing routers. The inconsistency was around it: raw `pushState`/`replaceState`, one-time URL initialization, document reloads for internal links, and local state that switched whole screens. The event explorer replaced its history entry after fetching; its local return button left `event` in the address bar. Sidebar links could read stale router search parameters after a raw history write. The old editor guard intercepted links but not browser Back/Forward.

| Area                                | Routes / implementation                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application shell                   | `src/client/App.tsx`: one module-level Data Router, persistent sidebar, lazy page content, built-in scroll restoration                                                                                     |
| Route registry and static hierarchy | `src/client/routes.tsx`: canonical routes, legacy redirects, route breadcrumb metadata                                                                                                                     |
| Analysis                            | Traffic, campaigns, user/event journeys, funnel, retention, goals, user composition/profiles, click maps, events, privacy/diagnosis, and quality reports                                                   |
| Builders and data                   | Grafbygger editions, graph sharing, SQL editors, table builder, user groups, and side groups                                                                                                               |
| Saved views                         | `/dashboard`, `/dashboard/:dashboardId`, `/canvas`, `/canvas/share`, `/canvas/presentation`                                                                                                                |
| Content / settings / internal       | Home, guides, taxonomy, tracking codes, settings, stats, gated ResearchOps and website-management pages                                                                                                    |
| Breadcrumb UI                       | `PageBreadcrumbs` is shared; `RouteBreadcrumbs` supplies the route hierarchy to page headers. Dashboard breadcrumbs retain their data-driven team and dashboard names using the same UI.                   |
| Common query state                  | `analysisNavigation.ts` allowlists cross-page context; `useReplaceSearchParams` updates it through the router; `useRestoreAnalysisContext` restores legacy local controls on links and history navigation. |

The Express frontend fallback already supports deep URLs and refresh. It remains unchanged. Focused/presentation/canvas experiences retain their existing specialized chrome rather than acquiring a second page header.

## Foundation

- Keep React Router and move from `BrowserRouter` declarative mode to Data Mode.
- Keep Vite, the Express SPA fallback, and existing data fetching. No framework migration or dependency upgrade is required for this work.
- React Router owns application navigation and history. Do not write application URLs with the raw History API or reload the document for same-origin application navigation.
- Use router links with their actual destination in `href`. Preserve modified clicks, open-in-new-tab, and copy-link behavior.

## History and forms

- Pages and drilldowns push history entries. Ordinary analysis controls replace the current entry without scrolling to the top. Do not add a history entry for each keystroke, filter adjustment, or automatic normalization.
- Browser Back/Forward follow the visit history; breadcrumbs navigate to an explicit ancestor. A breadcrumb is not `navigate(-1)`.
- Dirty editors must offer discard/stay for in-app navigation, including browser history. Reload and tab close use the native browser warning.
- No automatic saving or silent draft discard is introduced.

## Shared analysis context

- Carry website, period/date range, URL-path filters/operator, and compatible metric/view selections between analysis destinations.
- Clear page-specific selections when following a sidebar destination. For example, Egendefinerte hendelser always opens its list, not the previously explored event.
- Shared context must restore from the URL on navigation, not merely initialize on first mount. Explicit URL values take precedence over local preferences.
- Relative periods remain relative when shared. Users choose an absolute range when they want fixed dates. Results can still change with source data, permissions, and feature availability.
- Use `URLSearchParams` serialization: query spaces become `+`, literal plus becomes `%2B`; both `+` and `%20` inputs remain accepted.

## Screen hierarchy and breadcrumbs

- Distinct screens have distinct routes. Event list: `/utforsk-hendelser`; event detail: `/utforsk-hendelser/hendelse?event=...`; parameter drilldown: `/utforsk-hendelser/hendelse/parameter?event=...&parameter=...`.
- Preserve existing shared event URLs through replace redirects/normalization.
- Standardize nested screens on the existing `PageBreadcrumbs` design, with actual page ancestors and current page. No breadcrumbs on first-level screens. Remove redundant custom parent-return controls; retain meaningful cancel/save actions.
- Place breadcrumbs above the title and description, inside the colored banner. Keep the compact 16px text with 24px-minimum link targets and decorative separators outside the links, so arrows are not underlined. Match content gutters across route-driven and data-driven breadcrumbs.
- Keep the full horizontal trail whenever it fits. On overflow, show only the last navigable ancestor with an Aksel left arrow; this is a deterministic parent link, not browser Back. Include this back arrow inside the link's hit area, but underline only the text. Other hierarchy separators remain outside links.
- Vertical overflow is an opt-in alfa experiment (`breadcrumbs_vertical_overflow`), disabled by default and listed under Settings → Funksjoner i alfa. Only when the full trail cannot fit does it show one row per level, using Aksel's decorative `ArrowDownRightIcon` and slight indentation. The first elbow needs no extra indentation. Long labels may wrap within their row; never clip them or fix the component's height.
- Layout detection is CSS-only: a hidden, noninteractive full-width measurement trail supplies a scroll timeline. An animation with identical endpoints sets an overflow custom property only while that timeline is active; a style query switches the visible trail. The measurement is independent of the visible layout, preventing oscillation. No `ResizeObserver`, resize listener, or layout state is needed.
- Browsers without scroll-driven animation support and users requesting reduced motion use a conservative 36rem container-query fallback to the parent link. They do not enable the experimental vertical layout. Aksel's global reduced-motion reset changes animation timing, so the exact-fit CSS trick is intentionally disabled there rather than overriding accessibility rules. Compatibility was checked against live MDN browser data; the CSS mechanism was prototyped with repeated grow/shrink checks in Chromium.
- Keep route/breadcrumb metadata central rather than inventing navigation logic per page.

## Adding or changing a page

- Register the screen and its actual ancestors in `routes.tsx`. Prefer URL-derived selection, as in event explorer, over duplicating navigation state in `useState`.
- Use React Router `Link` (or Aksel `Link as={RouterLink}`) for navigation. The link's actual destination must include its required context; do not make `href` and `onClick` disagree.
- Use `preserveSharedAnalysisParams` to carry compatible context. It excludes event/parameter selections and report-specific sidegroups; explicit destination parameters override inherited values.
- Use `useReplaceSearchParams` for existing view-configuration serialization. It preserves hashes, skips unchanged URLs, prevents scroll reset, and ignores writes from departed pages. Do not write application URLs with `window.history`.
- For legacy reports with local control state, `useRestoreAnalysisContext` handles `PUSH`/`POP`; ordinary `REPLACE` writes publish the controls' existing state and must not restore over newer edits. Do not use replace navigation to switch to a different analysis configuration expecting that legacy restoration hook to apply it; use an ordinary link/navigation, or derive the controls directly from the URL.
- Publish validated input-derived configuration before waiting for a request, so a failed/slow request cannot leave sidebar/share context stale. Funnel's response-derived share parameters remain guarded against writes after navigation.
- New editable routes should use the shared unsaved-changes guard. Resume blocked navigation rather than pushing a fresh destination after the user confirms; that distinction matters for Back/Forward. Bypass the guard on save only after a successful save.

## Explicitly out of scope

- Do not expand Grafbygger form serialization or attempt to serialize every control across the app.
- Saved queries, short IDs, URL-length infrastructure limits, and draft sharing are separate work. There is no assumed universal 1,024-character URL limit.
- No data snapshots, new beta feature, or broad data-fetching rewrite.

## References

- [React Router modes](https://reactrouter.com/start/modes)
- [Route metadata and breadcrumbs](https://reactrouter.com/how-to/using-handle)
- [Navigation blocking](https://reactrouter.com/how-to/navigation-blocking)
- [URL state and history conventions](https://nuqs.dev/docs/options)
- [URLSearchParams serialization](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/toString)

## Verification

Checks run from an isolated scratchpad copy, using the repository's installed dependencies and a neutral Vite/Vitest configuration that does not read local environment files. No dependency or deployment changes were made.

- [x] Data router and existing route/alias tests
- [x] Event list/detail/parameter navigation, legacy URLs, reload, Back/Forward
- [x] Sidebar context preservation and canonical nested active states
- [x] Shared context restoration on same-route URL navigation
- [x] Breadcrumb consistency across nested screens; visual check at 320px and desktop
- [x] Dirty-editor link/programmatic/history navigation, discard, stay, save
- [x] Internal links, modified clicks, no remaining raw application history writes (cross-origin environment changes remain document navigations)
- [x] Formatting, ESLint without errors, TypeScript, production bundle, and real-browser checks after integration
- [x] Final full-suite rerun after the sidegroup-context regression fix: 1,678 tests across 118 files

The final full suite passed 1,678 tests across 118 files. All three browser tests in `e2e/navigation.spec.ts` passed after integration: real history, deep links, reload, sidebar/breadcrumb navigation without document reloads, and dirty-editor stay/discard behavior. No live backend or real user data is required. Existing ESLint warnings and bundle-size/static-vs-dynamic-import warnings remain outside this routing cleanup.

Breadcrumb design iteration: retain compact 16px text with 24px-minimum link targets; the enlarged hit-area experiment was dropped. Placement remains above the title/description inside the colored banner. Overflow defaults to a single parent link; the vertical alternative requires explicit alfa opt-in. During visual iteration, use focused layout checks rather than the full test suite.

Design references: [NN/g breadcrumb guidelines](https://www.nngroup.com/articles/breadcrumbs/) and [Pencil & Paper's enterprise breadcrumb guide](https://www.pencilandpaper.io/articles/breadcrumbs-ux). Both support prominent, consistent placement near the top and contextual navigation. Retain the canonical hierarchy with query context rather than a session-history trail. The default parent-link fallback follows the shortening guidance; the opt-in vertical experiment preserves every ancestor instead.

CSS implementation references: [Temani Afif's overflow detection technique](https://css-tip.com/overflow-detection/), [MDN scroll-state queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Conditional_rules/Container_scroll-state_queries), and [MDN browser compatibility data](https://github.com/mdn/browser-compat-data). Scroll-state queries are a different mechanism, with narrower browser support; they are not used here.
