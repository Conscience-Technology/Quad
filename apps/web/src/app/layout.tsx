import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CommandPalette } from "~/components/command-palette";
import { env } from "~/lib/env";
import { TRPCProvider } from "~/lib/trpc/react";
import "./globals.css";

const DESCRIPTION =
  "The bug reporter that ships its reporter's context straight to your AI coding agent. Self-hosted, MIT.";

export const metadata: Metadata = {
  metadataBase: new URL(env().API_URL),
  title: { default: "Quad", template: "%s — Quad" },
  description: DESCRIPTION,
  applicationName: "Quad",
  openGraph: {
    type: "website",
    siteName: "Quad",
    title: "Quad — bug reports straight to your AI coding agent",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Quad — bug reports straight to your AI coding agent",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <TRPCProvider>
          {children}
          <CommandPalette />
        </TRPCProvider>
      </body>
    </html>
  );
}
