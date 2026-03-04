import { getUmamiBaseUrl } from '../../../shared/lib/runtimeConfig';

const html = (strings: TemplateStringsArray, ...values: Array<string | number>) =>
  strings.reduce((acc, part, i) => acc + part + (values[i] ?? ''), '');

const getTrackingScriptUrl = () => {
  const hostname = window.location.hostname;
  const isDevEnvironment =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('.dev.nav.no');
  const scriptName = isDevEnvironment ? 'sporing-dev.js' : 'sporing.js';
  return `https://cdn.nav.no/team-researchops/sporing/${scriptName}`;
};

export const getStandardSnippet = (websiteId: string) => {
  const baseUrl = getUmamiBaseUrl();
  const trackingScriptUrl = getTrackingScriptUrl();
  return html`<script
    defer
    src="${trackingScriptUrl}"
    data-host-url="${baseUrl}"
    data-website-id="${websiteId}"
  ></script>`;
};

export const getNextJsSnippet = (websiteId: string) => {
  const baseUrl = getUmamiBaseUrl();
  const trackingScriptUrl = getTrackingScriptUrl();
  return html`<script
    defer
    strategy="afterInteractive"
    src="${trackingScriptUrl}"
    data-host-url="${baseUrl}"
    data-website-id="${websiteId}"
  />`;
};

export const getReactViteProviderSnippet = () =>
  html`import { createHead, UnheadProvider } from "@unhead/react";

const head = createHead();

function App() {
  return (
    <UnheadProvider head={head}>
      {/* Your app content */}
    </UnheadProvider>
  );
}`;

export const getReactViteHeadSnippet = (websiteId: string) => {
  const baseUrl = getUmamiBaseUrl();
  const trackingScriptUrl = getTrackingScriptUrl();
  return html`import { Head } from "@unhead/react";

<Head>
  <script
    defer
    src="${trackingScriptUrl}"
    data-host-url="${baseUrl}"
    data-website-id="${websiteId}"
  />
</Head>`;
};

export const getAstroSnippet = (websiteId: string) => {
  const baseUrl = getUmamiBaseUrl();
  const trackingScriptUrl = getTrackingScriptUrl();
  return html`<script
    is:inline
    defer
    data-astro-rerun
    src="${trackingScriptUrl}"
    data-host-url="${baseUrl}"
    data-website-id="${websiteId}"
  ></script>`;
};

export const getGTMSnippet = (websiteId: string) => {
  const baseUrl = getUmamiBaseUrl();
  const trackingScriptUrl = getTrackingScriptUrl();
  return html`<script>
    (function () {
      var el = document.createElement("script");
      el.setAttribute(
        "src",
        "${trackingScriptUrl}",
      );
      el.setAttribute("data-host-url", "${baseUrl}");
      el.setAttribute("data-website-id", "${websiteId}");
      document.body.appendChild(el);
    })();
  </script>`;
};
