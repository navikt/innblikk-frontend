import { readFile } from 'fs/promises'

export function registerFrontend(app, { buildPath, GCP_PROJECT_ID, BACKEND_WS_HOST }) {
  // Serve index.html with injected runtime config
  let cachedHtmlPromise

  const buildIndexHtml = async () => {
    const indexPath = `${buildPath}/index.html`
    const html = await readFile(indexPath, 'utf8')

    const runtimeConfig = {
      GCP_PROJECT_ID,
      BACKEND_WS_HOST,
    }

    // Prevent </script> injection by escaping < in JSON string.
    const runtimeConfigJson = JSON.stringify(runtimeConfig).replace(/</g, '\\u003c')

    const runtimeConfigScript = `
        <script>
          window.__RUNTIME_CONFIG__ = ${runtimeConfigJson};
          // Legacy globals for main UI code paths
          window.__GCP_PROJECT_ID__ = window.__GCP_PROJECT_ID__ || window.__RUNTIME_CONFIG__.GCP_PROJECT_ID || "";
        </script>
      `

    return html.replace('</head>', `${runtimeConfigScript}</head>`)
  }

  app.use(/^(?!.*\/(api|internal|static)\/).*$/, async (req, res) => {
    try {
      if (!cachedHtmlPromise) {
        cachedHtmlPromise = buildIndexHtml()
      }

      const html = await cachedHtmlPromise
      res.send(html)
    } catch (err) {
      console.error('Failed to serve index.html:', err)
      res.status(500).send('Failed to load frontend')
    }
  })
}
