import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyword Management System",
  description:
    "Advanced Google Ads keyword management for agency and client collaboration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
