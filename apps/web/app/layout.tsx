import type { Metadata } from "next";
import { Karla, Instrument_Serif, Noto_Serif_SC } from "next/font/google";
import PinyinTip from "@/components/PinyinTip";
import "./globals.css";

const karla = Karla({ subsets: ["latin"], variable: "--font-karla", weight: ["400", "500", "600", "700", "800"] });
const instrument = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument", weight: "400", style: ["normal", "italic"] });
const serifSC = Noto_Serif_SC({ subsets: ["latin"], variable: "--font-serif-sc", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "语伴 yuban",
  description: "A Mandarin tutor that texts like a friend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${karla.variable} ${instrument.variable} ${serifSC.variable}`}>
      <body>
        {children}
        <PinyinTip />
      </body>
    </html>
  );
}
