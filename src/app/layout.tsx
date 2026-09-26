import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'ドリンク在庫' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
