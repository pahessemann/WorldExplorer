import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const ogImage = `${protocol}://${host}/og-cartoon.png`;
  const description = "La carte d’exploration urbaine qui révèle le monde à chacun de vos pas.";
  return {
    title: { default: "WorldExplorer", template: "%s · WorldExplorer" },
    description,
    applicationName: "WorldExplorer",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "WorldExplorer" },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      title: "WorldExplorer — Chaque rue compte",
      description,
      images: [{ url: ogImage, width: 1536, height: 1024, alt: "WorldExplorer, chaque rue compte" }],
    },
    twitter: { card: "summary_large_image", title: "WorldExplorer", description, images: [ogImage] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#8bd7ff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIINfQ3ynhZwqJMYsv8nmqDQ1TkKpFM8K00="
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
