export const metadata = { title: "Not found", robots: { index: false } };

/** Shown only when a hostname is not connected to any site. */
export default function NotFound() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 560, margin: "15vh auto", padding: "0 24px", color: "#1e2529" }}>
      <h1 style={{ fontWeight: 600 }}>No site here yet</h1>
      <p>This address is not connected to a website on the platform. If you own it, add the domain in your site settings.</p>
    </main>
  );
}
