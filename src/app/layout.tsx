import type { Metadata, Viewport } from 'next';
import './globals.css';

const TITLE = '遊栄ボトルマネージャー';
const DESCRIPTION = '事務所・各店舗のボトル在庫を管理します';

// Explicit Open Graph tags so that link previews (LINE etc.) show this instead of scraping page text.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: TITLE, type: 'website', locale: 'ja_JP' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
