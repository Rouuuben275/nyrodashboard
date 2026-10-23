import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import "./design-system.css";
import "./components.css";
import {ThemeProvider} from "@/components/theme-provider";
import {themeBootstrap} from "@/lib/theme";
import "./theme.css";
export const metadata: Metadata = { title: "Nyro Dashboard — Votre entreprise, sous contrôle.", description: "L’espace de gestion des entreprises et communautés Roleplay. Équipes, commerce et finances, sans installation FiveM.", applicationName:"Nyro Dashboard",manifest:"/manifest.webmanifest",icons: { icon: "/branding/nyro-icon-32.png", apple: "/branding/nyro-icon-180.png" } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
