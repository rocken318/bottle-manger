'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '在庫' },
  { href: '/entry', label: '入力' },
  { href: '/history', label: '履歴' },
  { href: '/drinks', label: 'ドリンク' },
];

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...ITEMS, { href: '/admin', label: '管理' }] : ITEMS;
  return (
    <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 border-t bg-white">
      <ul className="mx-auto flex max-w-4xl">
        {items.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block py-3 text-center text-sm ${active ? 'font-bold text-blue-600' : 'text-gray-600'}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
