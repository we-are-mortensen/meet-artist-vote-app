import { type Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Votació de l'Artista",
  description: "Complement de Google Meet per votar qui és l'artista d'avui",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ca">
      <body className="font-body bg-paper text-text-primary">{children}</body>
    </html>
  );
}
