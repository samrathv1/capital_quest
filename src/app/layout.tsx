import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Capital Quest — Centralized Business Simulation Platform',
  description: 'A round-based business simulation platform for competitive entrepreneurship tournaments.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 font-sans antialiased text-slate-100">
        {children}
      </body>
    </html>
  );
}
