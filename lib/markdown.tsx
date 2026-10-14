import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders the small markdown subset allowed in rich_text fields:
 * paragraphs, ### subheadings, bullet lists, **bold**, *italic*, [links](/path).
 * Sub-headings are always one level below the block's own heading, so content
 * can never introduce a second H1 or skip a level.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("*")) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(
        href.startsWith("/") ? <Link key={k} href={href}>{label}</Link> : <a key={k} href={href} rel="noopener">{label}</a>
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, subLevel }: { source: string; subLevel: 2 | 3 | 4 }) {
  const blocks = source.trim().split(/\n{2,}/);
  const H = `h${subLevel}` as "h2" | "h3" | "h4";
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*-\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*-\s+/, ""), `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (/^#{1,6}\s/.test(lines[0])) {
          const rest = lines.slice(1).join(" ").trim();
          return (
            <div key={i}>
              <H>{lines[0].replace(/^#{1,6}\s+/, "")}</H>
              {rest && <p>{inline(rest, `${i}`)}</p>}
            </div>
          );
        }
        return <p key={i}>{inline(lines.join(" "), `${i}`)}</p>;
      })}
    </>
  );
}
