const getTrackingScriptUrl = () => {
  const hostname = window.location.hostname
  const isDevEnvironment = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.dev.nav.no')
  const scriptName = isDevEnvironment ? 'sporing-dev.js' : 'sporing.js'
  return `https://cdn.nav.no/team-researchops/sporing/${scriptName}`
}

export const getStandardSnippet = (websiteId: string) => {
  const src = getTrackingScriptUrl()
  return `<script
  defer
  src="${src}"
  data-website-id="${websiteId}"
></script>`
}

export const getNextJsSnippet = (websiteId: string) => {
  const src = getTrackingScriptUrl()
  return `<Script
  defer
  strategy="afterInteractive"
  src="${src}"
  data-website-id="${websiteId}"
/>`
}

export const getReactViteProviderSnippet = () =>
  `import { createHead, UnheadProvider } from "@unhead/react";

const head = createHead();

function App() {
  return (
    <UnheadProvider head={head}>
      {/* Your app content */}
    </UnheadProvider>
  );
}`

export const getReactViteHeadSnippet = (websiteId: string) => {
  const src = getTrackingScriptUrl()
  return `import { Head } from "@unhead/react";

<Head>
  <script
    defer
    src="${src}"
    data-website-id="${websiteId}"
  />
</Head>`
}

export const getAstroSnippet = (websiteId: string) => {
  const src = getTrackingScriptUrl()
  return `<script
  is:inline
  defer
  data-astro-rerun
  src="${src}"
  data-website-id="${websiteId}"
></script>`
}

export const getGTMSnippet = (websiteId: string) => {
  const src = getTrackingScriptUrl()
  return `<script>
  (function () {
    var el = document.createElement('script');
    el.setAttribute('src', '${src}');
    el.setAttribute('data-website-id', '${websiteId}');
    document.body.appendChild(el);
  })();
</script>`
}
