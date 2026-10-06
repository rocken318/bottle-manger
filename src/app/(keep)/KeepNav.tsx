'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/keep', label: '一覧' },
  { href: '/keep/new', label: '登録' },
];

export function KeepNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="キープ" className="fixed inset-x-0 bottom-0 border-t bg-white">
      <ul className="mx-auto flex max-w-4xl">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
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
