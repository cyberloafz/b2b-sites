import { requireSite } from "@/lib/auth/session";
import { getSiteRow } from "@/lib/repo/sites";
import { themeJsonSchema } from "@/lib/admin/schemas";
import { EditForm } from "@/components/admin/EditForm";
import { STYLE_PACKS, contrastRatio } from "@/schema/theme";
import { ApplyStylePack } from "@/components/admin/ApplyStylePack";
import { saveThemeAction } from "../actions";

export const metadata = { title: "Theme" };

export default async function ThemePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  await requireSite(siteId, "owner");
  const theme = (await getSiteRow(siteId))!.theme;
  const pairs: [string, string, string][] = [
    ["Body text on page", theme.color.text, theme.color.surface],
    ["Text on brand colour", theme.color.primaryInk, theme.color.primary],
    ["Button text on button", theme.color.accentInk, theme.color.accent],
    ["Secondary text", theme.color.muted, theme.color.surface],
  ];
  return (
    <main className="a-page">
      <h1>Theme</h1>
      <p className="sub">Colours, fonts and shapes for the whole site. Saving checks that text stays readable (WCAG AA, 4.5:1).</p>
      <div className="cards" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <section className="card">
          <EditForm schema={themeJsonSchema()} value={theme} action={saveThemeAction.bind(null, siteId)} />
        </section>
        <div>
          <section className="card">
            <h2>Readability</h2>
            <table className="list">
              <tbody>
                {pairs.map(([label, fg, bg]) => {
                  const r = contrastRatio(fg, bg);
                  return (
                    <tr key={label}>
                      <td><span style={{ background: bg, color: fg, padding: "2px 8px", borderRadius: 4, border: "1px solid #ddd" }}>Aa</span> {label}</td>
                      <td className="num"><span className={`pill ${r >= 4.5 ? "good" : "bad"}`}>{r.toFixed(1)}:1</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2>Start from a style pack</h2>
            <p className="muted">Replaces all colours, fonts and shapes. You can fine-tune afterwards; nothing is published until you publish.</p>
            <ApplyStylePack siteId={siteId} packs={Object.entries(STYLE_PACKS).map(([k, v]) => ({ key: k, theme: { stylePack: k, ...v } }))} />
          </section>
        </div>
      </div>
    </main>
  );
}
