import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slate",
  description: "Tasks, calendar, habits, and countdowns.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Slate", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("slate-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;var raw=localStorage.getItem("slate-ui");if(raw){var s=JSON.parse(raw);if(s.scale)document.documentElement.style.setProperty("--ui-scale",String(s.scale));}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
