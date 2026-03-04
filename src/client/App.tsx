import { Loader, Page, Theme } from "@navikt/ds-react";
import { Suspense, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  useLocation,
  Link,
} from "react-router-dom";
import routes, { isFullWidthPath } from "./routes.tsx";
import Footer from "./shared/ui/theme/Footer/Footer.tsx";
import ScrollToTop from "./shared/ui/theme/ScrollToTop/ScrollToTop.tsx";
import Header from "./shared/ui/theme/Header/Header.tsx";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary.tsx";
import { useHead } from "@unhead/react";

import "./App.css";

// Create a wrapper component for ScrollToTop
const ScrollToTopWrapper = () => {
  const location = useLocation();

  // Don't show on /grafbygger route
  if (location.pathname === "/grafbygger") {
    return null;
  }

  return <ScrollToTop />;
};

// Create a wrapper component for Page Layout
const PageLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isFullWidthPage = isFullWidthPath(location.pathname);

  if (isFullWidthPage) {
    return <main style={{ width: "100%" }}>{children}</main>;
  }

  return (
    <Page.Block as="main" width="xl" gutters>
      {children}
    </Page.Block>
  );
};

// Loading fallback for lazy-loaded routes
const PageLoader = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: "4rem 0" }}>
    <Loader size="xlarge" title="Laster inn..." />
  </div>
);

// 404 page for unknown routes
const NotFound = () => (
  <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
    <h1>404 — Siden ble ikke funnet</h1>
    <p style={{ marginTop: "1rem" }}>
      Siden du leter etter finnes ikke.{" "}
      <Link to="/">Gå til forsiden</Link>
    </p>
  </div>
);

function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const storedTheme = localStorage.getItem("umami-theme") as "light" | "dark" | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return storedTheme || (prefersDark ? "dark" : "light");
  });

  useEffect(() => {
    // Listen for theme changes from ThemeButton
    const handleThemeChange = (event: CustomEvent<"light" | "dark">) => {
      setTheme(event.detail);
    };

    window.addEventListener("themeChange", handleThemeChange as EventListener);
    return () => {
      window.removeEventListener("themeChange", handleThemeChange as EventListener);
    };
  }, []);

  useHead({
    script: [
      {
        defer: true,
        src: "https://cdn.nav.no/team-researchops/sporing/sporing.js",
        'data-host-url': "https://umami.nav.no",
        'data-domains': "innblikk.ansatt.nav.no",
        'data-website-id': "8e935f84-fb1e-4d07-be28-410eb2ab8cb9"
      },
      {
        type: 'text/javascript',
        innerHTML: `
          window.SKYRA_CONFIG = {
            org: 'arbeids-og-velferdsetaten-nav'
          };
          var script = document.createElement('script');
          script.src = 'https://survey.skyra.no/skyra-survey.js';
          document.body.appendChild(script);
        `
      }
    ]
  });

  return (
    <Theme theme={theme}>
      <Page>
        <Header theme={theme} />
        <Router>
          <PageLayout>
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {routes.map(({ path, component }) => (
                    <Route key={path} path={path} element={component} />
                  ))}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            <ScrollToTopWrapper />
          </PageLayout>
        </Router>
      </Page>
      <Footer />
    </Theme>
  );
}

export default App;
