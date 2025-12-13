import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Age of Steam | 철도왕의 시대",
  description: "19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임. 트랙을 건설하고, 물품을 운송하며, 철도왕이 되어보세요.",
  keywords: ["Age of Steam", "보드게임", "철도", "전략", "Martin Wallace"],
  authors: [{ name: "Age of Steam Showcase" }],
  openGraph: {
    title: "Age of Steam | 철도왕의 시대",
    description: "19세기 철도 산업의 황금기를 배경으로 한 전략 보드게임",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased min-h-screen flex flex-col">
        <Navigation />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
