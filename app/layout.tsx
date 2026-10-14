import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Bare document. Customer sites (app/s) and the admin (app/admin) each bring their own styles. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
