import type { ReactNode } from "react";
import type { Site } from "@/schema/site";
import { themeToCss } from "@/lib/theme-css";
import { organizationLd, websiteLd } from "@/lib/seo";
import { AnnouncementBar, Footer, Header } from "./SiteChrome";
import { JsonLd } from "./JsonLd";
import { SourceTracker } from "./SourceTracker";
import { PreviewLinks } from "./PreviewLinks";

/** Everything around a page: theme variables, header, footer, site-wide structured data. */
export function SiteShell({ site, children, previewBase }: { site: Site; children: ReactNode; previewBase?: string }) {
  return (
    <div className="site-root" data-buttons={site.theme.buttonStyle}>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      <a className="skip-link" href="#main">Skip to content</a>
      {previewBase && <div className="preview-flag">Preview of unpublished changes · forms are not sent</div>}
      <AnnouncementBar site={site} />
      <Header site={site} />
      <main id="main">{children}</main>
      <Footer site={site} />
      {previewBase ? <PreviewLinks base={previewBase} /> : <SourceTracker />}
      <JsonLd data={organizationLd(site)} />
      <JsonLd data={websiteLd(site)} />
    </div>
  );
}
