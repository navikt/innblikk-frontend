import dotenv from 'dotenv';

// Load .env file BEFORE accessing any process.env values
dotenv.config();

const normalizeBaseUrl = (value) => {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
};

export const BIGQUERY_TIMEZONE = 'Europe/Oslo';
const defaultDevBackendBaseUrl =
  process.env.NODE_ENV === 'production'
    ? undefined
    : 'https://start-umami-backend.intern.dev.nav.no';

export const BACKEND_BASE_URL = normalizeBaseUrl(
  process.env.BACKEND_BASE_URL
  || process.env.VITE_BACKEND_BASE_URL
  || defaultDevBackendBaseUrl,
);
export const SITEIMPROVE_BASE_URL = normalizeBaseUrl(process.env.SITEIMPROVE_BASE_URL || process.env.VITE_SITEIMPROVE_BASE_URL);
export const UMAMI_BASE_URL = normalizeBaseUrl(process.env.UMAMI_BASE_URL || process.env.VITE_UMAMI_BASE_URL);
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.VITE_GCP_PROJECT_ID;

if (!BACKEND_BASE_URL) {
  throw new Error('Missing env var: BACKEND_BASE_URL');
}
if (!SITEIMPROVE_BASE_URL) {
  throw new Error('Missing env var: SITEIMPROVE_BASE_URL');
}
if (!UMAMI_BASE_URL) {
  throw new Error('Missing env var: UMAMI_BASE_URL');
}
if (!GCP_PROJECT_ID) {
  throw new Error('Missing env var: GCP_PROJECT_ID');
}
