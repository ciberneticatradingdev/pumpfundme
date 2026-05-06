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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "PumpFundMe — Memecoins for Good",
    description:
      "Launch memecoins on pump.fun and automatically donate 100% of fees to charity. Zero commission. Fully transparent.",
    type: "website",
    url: "https://pumpfundme.org",
    siteName: "PumpFundMe",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "PumpFundMe — Memecoins for Good",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PumpFundMe — Memecoins for Good",
    description:
      "Launch memecoins on pump.fun and donate 100% of fees to charity.",
    images: ["/og-image.jpg"],
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
