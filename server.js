import path from 'path';
import {fileURLToPath} from 'url';

import {createApp} from './src/server/app.js';
import {registerFrontend} from './src/server/frontend/serveFrontend.js';
import {createBigQueryClient} from './src/server/bigquery/client.js';
import {createBigQueryRouter} from './src/server/routes/bigquery/index.js';
import {createBackendProxyRouter} from './src/server/routes/backend/backendRoutes.js';
import {createSiteimproveProxyRouter} from './src/server/routes/siteimprove/siteimproveRoutes.js';
import {createUserRouter} from './src/server/routes/user/userRoutes.js';
import {authenticateUser} from './src/server/middleware/authenticateUser.js';

import {
    BIGQUERY_TIMEZONE, BACKEND_BASE_URL, SITEIMPROVE_BASE_URL, UMAMI_BASE_URL, GCP_PROJECT_ID,
} from './src/server/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildPath = path.resolve(__dirname, 'dist');

const app = createApp({buildPath});

// Initialize BigQuery client
const bigquery = createBigQueryClient({projectId: GCP_PROJECT_ID, dirname: __dirname});

// Apply authentication middleware to all /api/bigquery routes (except /api/user/me which has its own handling)
app.use('/api/bigquery', authenticateUser);

// Siteimprove proxy
app.use('/api/siteimprove', createSiteimproveProxyRouter({SITEIMPROVE_BASE_URL}));

// User routes
app.use('/api/user', createUserRouter({BACKEND_BASE_URL}));

// Backend proxy (Project/Dashboard/Graph/Query APIs)
app.use('/api/backend', createBackendProxyRouter({BACKEND_BASE_URL}));

// BigQuery routes (router paths already include /api/bigquery)
app.use(createBigQueryRouter({bigquery, GCP_PROJECT_ID, BIGQUERY_TIMEZONE}));

// Serve index.html with injected runtime config
registerFrontend(app, {buildPath, UMAMI_BASE_URL, GCP_PROJECT_ID});

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || (isProduction ? 8080 : 8081);

const server = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
    console.log('Server timeout set to 2 minutes');
});

// Set server timeout to 2 minutes
server.timeout = 120000;
server.keepAliveTimeout = 125000; // Slightly longer than timeout
server.headersTimeout = 130000; // Slightly longer than keepAliveTimeout
