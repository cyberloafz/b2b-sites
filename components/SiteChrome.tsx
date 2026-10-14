import Link from "next/link";
import type { Site } from "@/schema/site";
import { Btn, Img } from "./blocks/shared";
import { Newsletter } from "./Newsletter";

const NETWORK_NAMES = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", x: "X" } as const;

type NavItem = { label: string; href: string; children?: NavItem[] };

export function AnnouncementBar({ site }: { site: Site }) {
  const a = site.globals.announcement;
  if (!a) return null;
  return (
    <div className="announcement">
      <div className="container announcement-row">
        {a.messages.map((m) => (
          <p key={m.text}>
            {m.text}
            {m.link && <> <Link href={m.link.href}>{m.link.label}</Link></>}
          </p>
        ))}
      </div>
    </div>
  );
}

function NavList({ items, mobile }: { items: NavItem[]; mobile?: boolean }) {
  return (
    <ul className={mobile ? "nav-mobile" : "nav"}>
      {items.map((i) => (
        <li key={i.label} className={i.children?.length ? "has-sub" : undefined}>
          <Link href={i.href}>{i.label}</Link>
          {i.children?.length ? (
            <ul className="sub">
              {i.children.map((c) => (
                <li key={c.label}><Link href={c.href}>{c.label}</Link></li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Header({ site }: { site: Site }) {
  const h = site.globals.header;
  const nav = h.nav as NavItem[];
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link href="/" className="brand" aria-label={`${site.company.brandName} home`}>
          <Img image={h.logo} eager />
          {h.logoText && <span className="brand-text">{h.logoText}</span>}
        </Link>
        <nav aria-label="Main" className="nav-desktop">
          <NavList items={nav} />
        </nav>
        <div className="header-cta">
          <Btn link={h.cta} />
        </div>
        {/* Mobile drawer: native <details>, works without JavaScript. */}
        <details className="drawer">
          <summary aria-label="Open menu">
            <span className="burger" aria-hidden="true" />
            Menu
          </summary>
          <nav aria-label="Mobile">
            <NavList items={nav} mobile />
            <Btn link={h.cta} />
          </nav>
        </details>
      </div>
    </header>
  );
}

export function Footer({ site }: { site: Site }) {
  const f = site.globals.footer;
  const co = site.company;
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-brand">{co.brandName}</p>
          <p className="small">{f.blurb}</p>
          <address className="small">
            {co.address.street}, {co.address.city}, {co.address.region} {co.address.postalCode}
            <br />
            <a href={`tel:${co.phone}`}>{co.phoneDisplay}</a> · <a href={`mailto:${co.email}`}>{co.email}</a>
          </address>
          {co.social.length > 0 && (
            <ul className="social">
              {co.social.map((s) => (
                <li key={s.url}><a href={s.url} rel="noopener">{NETWORK_NAMES[s.network]}</a></li>
              ))}
            </ul>
          )}
        </div>
        {f.columns.map((c) => (
          <div key={c.title}>
            <p className="footer-title">{c.title}</p>
            <ul className="footer-links">
              {c.links.map((l) => (
                <li key={l.href + l.label}><Link href={l.href}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
        {f.newsletter?.enabled && <Newsletter heading={f.newsletter.heading} consentText={f.newsletter.consentText} />}
      </div>
      <div className="container footer-legal small">
        <p>© {new Date().getFullYear()} {co.legalName}</p>
        <ul>
          {f.legalLinks.map((l) => (
            <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
