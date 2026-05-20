import type { Metadata, Viewport } from "next";
import { DM_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

const dmMono = DM_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  title: "angry birds - Gestión por roles",
  description: "Aplicación con roles: Super Admin, Jefe, Admin y Trabajador",
  manifest: "/manifest.json",
  icons: {
    icon: "/angry-birds-icon.png",
    apple: "/angry-birds-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "angry birds",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#1e140f",
};

/** Script que aplica el tema guardado antes del primer pintado para evitar parpadeo */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('krediapp-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className={dmMono.variable}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
