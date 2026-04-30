# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### EventSelector

- Microanimations, and remove layout shift

### Fix

- Sticky note marker tekst dark mode

### Canvas

- Toggle text selection on content manipulation events

### Fiks

- Teller når flere er i canvaset

### Quickfix

- Link to Trafikkanalyse in Header

### 🏗️ Build

- Dependabot
- Dependabot

### 🐛 Bug Fixes

- Use pnpm consistently in start script
- Remove setState calls inside useEffect in ThemeButton
- Identify umami user with innblikk_analytics_id on load
- Merge main into feature/user-settings-persistence, resolve conflicts in App.tsx
- Export Window type augmentation as module to fix umami type errors
- Rename #betaprogram fragment to #beta, fix hash scroll on profile page

### 👷 CI

- Change changelog workflow commit message
- Changelog
- Changelog

### 📚 Documentation

- Add local backend setup instructions to README

### 📦 Miscellaneous

- Bytte tenant til nav.no
- Remove preprod
- Proxy url based on env
- Proxy url based on env
- Proxy url based on env
- Proxy url
- Proxy url
- Env
- Fiks url
- Skriveleif
- Linting (#99)
- Refactor (#100)
- Refactor (#101)
- Refactor dashboardwidget into smaller components (#104)
- Refactor server client structure (#105)
- Cleanup unused files
- Move analysis and chartbuilder (#108)
- User feature structure (#110)
- Funnel feature structure (#113)
- Funnel feature structure
- Delete deploy-pr
- Traffic feature structure (#115)
- Retention feature structure (#116)
- Split event into eventjourney and eventexplorer
- Analysis feature structure (#117)
- Change to k8s urls
- Feature structure oversikt and prosjectmanager
- Split dashboardRoutes into smaller routes
- Shared components
- MAX_BYTES_BILLED 500 GB
- **deps:** Add ws@8.20.0 dependency

### 🔧 Refactor

- Improve security, error handling, and code structure (#120)
- Replace AnnouncementBanner with BetaBadge on home page
- Remove analytics_id from user settings, drop umami.identify()

### 🚀 Features

- Deploy dev
- Deploy dev
- Use url for dev
- UMAMI_BASE_URL is env
- Env based GCP_PROJECT_ID
- Env based GCP_PROJECT_ID
- Deploy-pr workflow
- Split into features (#106)
- Split settings and shared into feature (#107)
- Split settings and shared into feature
- Split settings and shared into feature
- Outbound start-umami-backend
- Lagre og vise grafer (#119)
- Validate and max bill bigquery
- Graph ordering (#122)
- Ingress innblikk
- Graph category
- Remove data-host-url reference (#129)
- Remove data-host-url reference formatting
- Remove data-host-url reference formatting
- Remove data-host-url reference formatting
- Bytte til innsikt website-id
- Load sporing-dev on localhost with data-before-send interceptor
- Persist feature flags to backend and track changes via umami
- Add AnnouncementBanner component
- Merge Innstillinger into Profil page, redirect /innstillinger
- Add BetaBadge component
- Sync user settings from backend on app load
- Use @navikt/analytics-types for typed umami tracking
- Add click tracking to BetaBadge using NAVIGERE_EVENT
- Add analytics tracking to teknisk meny (ActionMenu)
- Gate Måloppnåelse behind beta flag with visual indicators
- Beta indicators in navbar and profile page copy refresh
- Show generated SQL on personvernssjekk page
- Show generated SQL on brukerreiser, utforsk-hendelser, hendelsesreiser, brukerprofiler, brukerlojalitet
- Add generatedSql field to eventjourney types and retention hook
- **canvas:** Add BFF WebSocket server with room-based auth
- **canvas:** Add useCanvasWebSocket hook with exponential backoff reconnect
- **canvas:** Replace polling with WebSocket real-time sync
- Add Valkey pub/sub for cross-pod canvas WebSocket sync
- Move ws to backend
- Move ws to backend
- Move ws to backend
- Move ws to backend
- Move ws to backend
- Move ws to backend

### 🧪 Testing

- Update featureFlags tests after removing analytics_id


