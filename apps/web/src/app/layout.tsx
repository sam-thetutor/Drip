import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/wallet-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "sonner";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Drip - Every dollar on autopilot",
  description: "Plan your money, split it into buckets for bills, people and savings goals, and let Drip stream the right amount to each one automatically.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={spaceGrotesk.className}>
        <WalletProvider>
          <Navbar />
          <main className="flex-1 pb-16 md:pb-0">
            {children}
          </main>
          <Toaster position="top-right" />
        </WalletProvider>
      </body>
    </html>
  );
}
