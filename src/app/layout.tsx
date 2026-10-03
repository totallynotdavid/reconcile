import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

export const metadata: Metadata = {
  title: "Reconcile",
  description: "Odoo, for people who ship it. Odoo 16 to 20.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${code.variable}`}>
      <body>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 pb-32 pt-6">{children}</main>
      </body>
    </html>
  );
}
