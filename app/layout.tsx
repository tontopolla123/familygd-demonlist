
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family GD Demonio Lista",
  description: "Quien la tiene mas grande en GD",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
