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

## Miljøvariabler

| Variabel                         | Påkrevd | Beskrivelse                                    |
| -------------------------------- | ------- | ---------------------------------------------- |
| `GCP_PROJECT_ID`                 | Ja      | GCP-prosjekt-ID for BigQuery-spørringer        |
| `SITEIMPROVE_BASE_URL`           | Ja      | Base URL for Siteimprove-proxyen               |
| `BACKEND_BASE_URL`               | Nei     | Overstyrer backend-URL (standard: dev-miljøet) |
| `MOCK_NAV_IDENT`                 | Lokalt  | Mocker innlogget bruker (f.eks. `Z123456`)     |
| `GOOGLE_APPLICATION_CREDENTIALS` | Lokalt  | Sti til GCP-nøkkelfil for BigQuery-tilgang     |
