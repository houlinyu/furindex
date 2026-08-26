import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "FurIndex — pet health records",
  description:
    "One place for your pet's vaccinations, medications, weight and vet visits.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FurIndex",
    statusBarStyle: "default",
  },
  // Next emits the modern mobile-web-app-capable; older iOS also needs the
  // legacy apple- name to launch full-screen (no Safari chrome) from the home
  // screen. Harmless everywhere else.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#24806a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
