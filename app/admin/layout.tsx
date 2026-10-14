import type { ReactNode } from "react";
import "@/styles/admin.css";

export const metadata = { title: { default: "Site admin", template: "%s · Site admin" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: ReactNode }) {
  return children;
}
