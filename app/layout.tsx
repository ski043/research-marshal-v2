import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app/app-shell";
import { Sidebar } from "@/components/app/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      <body className="h-full overflow-hidden">
        <a
          href="#main"
          className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform duration-150 focus:translate-y-0"
        >
          Skip to the content
        </a>
        <TooltipProvider delay={300}>
          <AppShell sidebar={<Sidebar />}>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
