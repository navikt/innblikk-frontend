# Innblikk

Innblikk er et analyseverktøy for å måle brukeradferd, bygget av Team ResearchOps.

Spørsmål? Slack: [#researchops](https://nav-it.slack.com/archives/C02UGFS2J4B) eller opprett et issue her på GitHub.

---

## Utvikling

### 1. Opprett `.env`

```bash
cp .env.example .env
```

> `BACKEND_BASE_URL` trenger du ikke å sette — den peker automatisk mot dev-miljøet lokalt.

### 2. Installer avhengigheter

```bash
pnpm i
```

### 3. Start serveren

Serveren krever GCP-autentisering og et mock-nav-ident for lokal utvikling:

```bash
GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/application_default_credentials.json" \
  MOCK_NAV_IDENT="Z123456" \
  pnpm run server
```

Ikke logget inn i gcloud ennå? Kjør:

```bash
gcloud auth application-default login
```

### 4. Start frontend

I et nytt terminalvindu:

```bash
pnpm run dev
```

---

## Kjøre mot lokal backend (innblikk-backend)

Vil du teste mot en lokal backend i stedet for dev-miljøet? Start backend først:

```bash
# I innblikk-backend-repoet
docker compose up                        # start databasen
./gradlew bootRun -Dspring-boot.run.profiles=local   # start Spring Boot på :8086
```

> Flyway-migrasjoner kjøres automatisk ved oppstart. Feiler migrasjonene (f.eks. etter en schemaendring),
> kjør `docker compose down -v && docker compose up` for å nullstille databasen.

Start så frontend-serveren med `BACKEND_BASE_URL` pekende mot lokal backend:

```bash
BACKEND_BASE_URL=http://localhost:8086 \
  MOCK_NAV_IDENT="Z123456" \
  pnpm run server
```

```bash
pnpm run dev
```

---

## Miljøvariabler

| Variabel                         | Påkrevd | Beskrivelse                                    |
| -------------------------------- | ------- | ---------------------------------------------- |
| `GCP_PROJECT_ID`                 | Ja      | GCP-prosjekt-ID for BigQuery-spørringer        |
| `SITEIMPROVE_BASE_URL`           | Ja      | Base URL for Siteimprove-proxyen               |
| `BACKEND_BASE_URL`               | Nei     | Overstyrer backend-URL (standard: dev-miljøet) |
| `MOCK_NAV_IDENT`                 | Lokalt  | Mocker innlogget bruker (f.eks. `Z123456`)     |
| `GOOGLE_APPLICATION_CREDENTIALS` | Lokalt  | Sti til GCP-nøkkelfil for BigQuery-tilgang     |

---

## Canvas WebSocket – arkitektur

Sanntidssamarbeid på canvas bruker WebSocket. WS-endepunktet (`/api/canvas/ws`) håndteres av [innblikk-backend](https://github.com/navikt/innblikk-backend) (Spring WebSocket). Synkronisering på tvers av pods skjer via PostgreSQL `NOTIFY/LISTEN` (`CanvasPgNotifyBridge`), ikke Valkey.

```mermaid
graph TD
    subgraph Browser A ["Nettleser A"]
        CA[useCanvasWebSocket]
    end

    subgraph Browser B ["Nettleser B"]
        CB[useCanvasWebSocket]
    end

    subgraph Pod1 ["Backend Pod 1"]
        WS1[CanvasWebSocketHandler\n/api/canvas/ws]
    end

    subgraph Pod2 ["Backend Pod 2"]
        WS2[CanvasWebSocketHandler\n/api/canvas/ws]
    end

    subgraph PG ["PostgreSQL"]
        NOTIFY["NOTIFY / LISTEN\n(canvas_ws)"]
    end

    CA -- "WS upgrade" --> WS1
    CB -- "WS upgrade" --> WS2

    WS1 -- "NOTIFY" --> NOTIFY
    NOTIFY -- "event" --> WS1
    NOTIFY -- "event" --> WS2
    WS2 -- "forward" --> CB

    WS1 -- "lokal levering\n(samme pod)" --> CA
```

**Meldingsflyt:**

1. Klient sender `{type: "join", projectId, dashboardId}` → backend registrerer klienten i rommet
2. Klient sender `{type: "broadcast", event, payload}` → backend leverer direkte til lokale klienter og sender `NOTIFY` til PostgreSQL for andre pods
3. Andre pods mottar via `LISTEN` og videresender til sine lokale WS-klienter
4. Backend fjerner klienten fra rommet når WebSocket-tilkoblingen lukkes

**Lokal utvikling:** `vite.config.ts` proxyer `/api/canvas/ws` til backend (`ws://localhost:8081`).
