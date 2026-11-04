import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import Script from "next/script"
import "./globals.css"

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Margin",
  description: "Park stray thoughts during a study sitting. Reveal them when you stop.",
  applicationName: "Margin",
  appleWebApp: {
    capable: true,
    title: "Margin",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#272727",
}

const themeScript = `try{if(location.search.indexOf("desktop=1")!==-1)document.documentElement.classList.add("desktop");if(localStorage.getItem("margin.theme")==="paper")document.documentElement.classList.remove("dark")}catch(e){}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${sans.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Script id="margin-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  )
}
