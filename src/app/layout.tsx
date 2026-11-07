import type { Metadata } from "next";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/geist-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siggo | Competition index",
  description: "Active ML and data science competitions, hackathons, and research challenges.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
