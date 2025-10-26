import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/providers/SessionProvider";
import "./globals.css";

// Temporarily commented due to Google Fonts network timeout
// Uncomment when network is stable
// const notoSansJP = Noto_Sans_JP({
//   variable: "--font-noto-sans-jp",
//   subsets: ["latin"],
//   weight: ["400", "500", "600", "700", "800"],
// });

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "KAPIN - Product Metrics Instrumentation",
  description: "Easy product metrics instrumentation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
