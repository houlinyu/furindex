import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petfolio — pet health records",
  description:
    "One place for your pet's vaccinations, medications, weight and vet visits.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
