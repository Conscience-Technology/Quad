import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CommandPalette } from "~/components/command-palette";
import { TRPCProvider } from "~/lib/trpc/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quad",
  description:
    "The bug reporter that ships its context straight to your AI coding agent.",
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
