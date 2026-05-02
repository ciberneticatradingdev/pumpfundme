import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SolanaWalletProvider } from "@/components/wallet-provider";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PumpFundMe — Memecoins for Good",
  description:
    "Launch memecoins on pump.fun and automatically donate 100% of fees to charity. Zero commission. Fully transparent.",
  openGraph: {
    title: "PumpFundMe — Memecoins for Good",
    description:
      "Launch memecoins on pump.fun and automatically donate 100% of fees to charity.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white">
        <SolanaWalletProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
