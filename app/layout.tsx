import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BEFORE_PAINT } from "@/lib/ui/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Research Marshal", template: "%s · Research Marshal" },
  description: "Answers one research question with a cited Markdown report.",
};

// The colour of the sidebar, which is what meets the browser frame in each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#050608" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The script below sets the theme class before React hydrates.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, no user input
          dangerouslySetInnerHTML={{ __html: BEFORE_PAINT }}
        />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
