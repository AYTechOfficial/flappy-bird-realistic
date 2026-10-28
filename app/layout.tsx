import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aero: Adaptive Flight",
  description: "A premium-looking, one-touch flying game distinguished by a defined 3D visual treatment and adaptive difficulty, positioned for testing rather than assumed to have proven demand.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
