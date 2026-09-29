import { readFile } from 'node:fs/promises';
import { createPostgresDb } from '../src/lib/db/postgres';
import { writeAudit } from '../src/lib/repo/audit';
import { toUserMessage } from '../src/lib/errors';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
// 既にカテゴリが付いているボトルも CSV の値で上書きする。既定は未分類のものだけ埋める。
const overwrite = args.includes('--overwrite');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('usage: npm run db:assign-categories -- <CSVパス> [--dry-run] [--overwrite]');
  console.error('  CSV: 1行目が name,category のヘッダ。category が空なら「未分類」のまま何もしない。');
  console.error('  既定では未分類のボトルにだけ付ける。--overwrite で既存の分類も CSV に合わせる。');
  process.exit(1);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const rows = parseCsv((await readFile(file, 'utf8')).replace(/^﻿/, ''));
const header = rows[0].map((h) => h.trim().toLowerCase());
const nameIdx = header.indexOf('name');
const catIdx = header.indexOf('category');
if (nameIdx === -1 || catIdx === -1) {
  console.error('CSV に name と category の列が必要です');
  process.exit(1);
}

const wanted = new Map<string, string>(); // ボトル名 -> カテゴリ名
let blank = 0;
for (const r of rows.slice(1)) {
  const name = (r[nameIdx] ?? '').replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  const cat = (r[catIdx] ?? '').trim();
  if (!name) continue;
  if (!cat) { blank++; continue; }
  wanted.set(name, cat);
}
console.log(`CSV: ${file}`);
console.log(`分類あり ${wanted.size} 件 / 空欄（未分類のまま）${blank} 件`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}
const db = createPostgresDb(url);

try {
  const cats = await db.query<{ id: string; name: string }>('select id, name from categories where is_active');
  const catId = new Map(cats.map((c) => [c.name, c.id]));

  const missingCats = [...new Set(wanted.values())].filter((c) => !catId.has(c));
  if (missingCats.length) {
    console.error(`DB に無いカテゴリがあります: ${missingCats.join(', ')}`);
    console.error('管理画面「お酒の種類」で先に追加してください。');
    process.exit(1);
  }

  const drinks = await db.query<{ id: string; name: string; categoryId: string | null }>(
    'select id, name, category_id as "categoryId" from drinks',
  );
  const byName = new Map(drinks.map((d) => [d.name, d]));

  const plan: { id: string; name: string; from: string | null; to: string }[] = [];
  const notFound: string[] = [];
  let already = 0;
  let skippedSet = 0;

  for (const [name, cat] of wanted) {
    const d = byName.get(name);
    if (!d) { notFound.push(name); continue; }
    const target = catId.get(cat)!;
    if (d.categoryId === target) { already++; continue; }
    if (d.categoryId !== null && !overwrite) { skippedSet++; continue; }
    const fromName = cats.find((c) => c.id === d.categoryId)?.name ?? null;
    plan.push({ id: d.id, name, from: fromName, to: cat });
  }

  console.log(`DB のボトル: ${drinks.length} 件`);
  console.log(`  付け替える:      ${plan.length} 件`);
  console.log(`  既に同じ分類:    ${already} 件`);
  if (!overwrite) console.log(`  既に別の分類（--overwrite で上書き可）: ${skippedSet} 件`);
  if (notFound.length) console.log(`  DB に無い名前:   ${notFound.length} 件 → ${notFound.slice(0, 5).join(', ')}${notFound.length > 5 ? ' …' : ''}`);

  if (plan.length === 0) {
    console.log('変更はありません。');
    process.exit(0);
  }
  if (dryRun) {
    console.log('\n--- --dry-run のため書き込みません。付け替え予定: ---');
    for (const p of plan) console.log(`  ${p.name}: ${p.from ?? '未分類'} → ${p.to}`);
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const p of plan) {
      await tx.query('update drinks set category_id = $2 where id = $1', [p.id, catId.get(p.to)]);
    }
    await writeAudit(tx, {
      staffId: null,
      action: 'drink.category_import',
      targetType: 'drink',
      targetId: null,
      details: {
        source: file,
        updated: plan.length,
        overwrite,
        byCategory: plan.reduce<Record<string, number>>((a, p) => ({ ...a, [p.to]: (a[p.to] ?? 0) + 1 }), {}),
      },
    });
  });
  console.log(`付け替えました: ${plan.length} 件`);

  const summary = await db.query<{ name: string | null; n: string }>(
    `select c.name, count(*)::text as n from drinks d
       left join categories c on c.id = d.category_id
      group by c.name order by count(*) desc`,
  );
  console.log('\n--- 現在の内訳 ---');
  for (const s of summary) console.log(`  ${s.name ?? '(未分類)'}: ${s.n}`);
  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
