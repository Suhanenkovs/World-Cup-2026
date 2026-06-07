import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import PitchBackground from "@/components/PitchBackground";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "FIFA World Cup 2026 Predictions",
  description: "FIFA World Cup 2026 prediction pool for friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col text-gray-100 antialiased">
        <PitchBackground />
        <Nav />
        <main className="flex-1">{children}</main>
        <footer className="text-center text-xs text-gray-500 py-4">
          WC 2026 Predictions &mdash; {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
