import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Sentiment de Marché",
  description:
    "Dashboard de sentiment de marché en temps réel · VIX · HY OAS · Fear & Greed",
  applicationName: "Sentiment de Marché",
  appleWebApp: {
    title: "Sentiment",
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" data-theme="light">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
