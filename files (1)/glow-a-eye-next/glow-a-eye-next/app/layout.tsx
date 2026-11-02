import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "Glow A-eye", description: "Voice-first skincare assistant for blind and low-vision people" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
