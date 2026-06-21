import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "BuildProof — AI Project Credibility Auditor",
  description:
    "Check whether technical claims in a project's pitch are supported by implementation evidence in its GitHub repository.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased font-[var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
