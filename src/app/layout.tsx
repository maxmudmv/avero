import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppStateProvider } from "@/components/app/app-state-provider";
import { TelegramWebAppProvider } from "@/components/app/telegram-webapp-provider";
import {
  DesignSystemProvider,
  GlassToastViewport,
} from "@/design-system";

export const metadata: Metadata = {
  title: "Avero — Matnli Ijtimoiy Tarmoq",
  description:
    "Web va Telegram Mini App uchun faqat matnga asoslangan zamonaviy ijtimoiy tarmoq.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <DesignSystemProvider>
          <TelegramWebAppProvider>
            <AppStateProvider>
              {children}
              <GlassToastViewport />
            </AppStateProvider>
          </TelegramWebAppProvider>
        </DesignSystemProvider>
      </body>
    </html>
  );
}
