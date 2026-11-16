import { brand, buildCssVariables, defaultThemeName, themes } from "@lvp/design-system";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DemoBanner } from "@/components/demo-banner";
import { AccountProvider } from "@/lib/account";
import { PersonalProvider } from "@/lib/personal";
import { PrimaryNav, PrimaryNavFallback } from "@/components/nav";
import { fontVariables } from "@/lib/fonts";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s — ${brand.name}` },
  description: brand.tagline,
};

export const viewport: Viewport = {
  themeColor: themes[defaultThemeName].bg,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={fontVariables} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: buildCssVariables(defaultThemeName) }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Suspense fallback={<PrimaryNavFallback />}>
          <PrimaryNav />
        </Suspense>
        <div className="shell">
          <DemoBanner />
          <AccountProvider>
            <PersonalProvider>{children}</PersonalProvider>
          </AccountProvider>
        </div>
      </body>
    </html>
  );
}
