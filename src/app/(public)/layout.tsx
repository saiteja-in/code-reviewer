import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import "./landing.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-landing-display",
  weight: ["500", "700"],
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-landing-body",
  weight: ["400", "500"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-landing-mono",
  weight: ["400"],
});

export default function LayoutPublic({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "min-h-full bg-background text-foreground",
        display.variable,
        body.variable,
        mono.variable,
      )}
    >
      <Navbar />
      <main>{children}</main>
    </div>
  );
}
