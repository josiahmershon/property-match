import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropertyMatch Pro",
  description: "Agent-controlled property matching workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
