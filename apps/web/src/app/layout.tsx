import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/locale-provider";
import { ru } from "@/messages/ru";
import "./globals.css";

export const metadata: Metadata = {
  title: `${ru.common.appName} · ${ru.common.workspace}`,
  description: ru.run.title,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
