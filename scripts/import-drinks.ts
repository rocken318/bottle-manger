import { readFile } from 'node:fs/promises';
import { createPostgresDb } from '../src/lib/db/postgres';
import { writeAudit } from '../src/lib/repo/audit';
import { toUserMessage } from '../src/lib/errors';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('usage: npm run db:import-drinks -- <CSVパス> [--dry-run]');
  console.error('  CSV: 1行目が name,units_per_case のヘッダ。units_per_case 省略時は 1。');
  process.exit(1);
}

/** ダブルクォート対応の最小 CSV パーサ（"" は " のエスケープ）。 */
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

const text = await readFile(file, 'utf8');
const rows = parseCsv(text.replace(/^﻿/, ''));
if (rows.length === 0) {
  console.error('CSV が空です');
  process.exit(1);
}

const header = rows[0].map((h) => h.trim().toLowerCase());
const nameIdx = header.indexOf('name');
const unitsIdx = header.indexOf('units_per_case');
if (nameIdx === -1) {
  console.error('CSV に name 列がありません');
  process.exit(1);
}

const items: { name: string; unitsPerCase: number }[] = [];
const seen = new Set<string>();
const dupes: string[] = [];
for (const r of rows.slice(1)) {
  const name = (r[nameIdx] ?? '').replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) continue;
  if (seen.has(name)) { dupes.push(name); continue; }
  seen.add(name);
  const raw = unitsIdx === -1 ? '' : (r[unitsIdx] ?? '').trim();
  const units = raw === '' ? 1 : Number(raw);
  if (!Number.isInteger(units) || units < 1) {
    console.error(`units_per_case が不正です: "${name}" -> "${raw}"`);
    process.exit(1);
  }
  items.push({ name, unitsPerCase: units });
}

console.log(`CSV: ${file}`);
console.log(`読み込み: ${items.length} 件${dupes.length ? `（CSV内の重複 ${dupes.length} 件は除外: ${dupes.join(', ')}）` : ''}`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}
const db = createPostgresDb(url);

try {
  const existing = new Set(
    (await db.query<{ name: string }>('select name from drinks')).map((r) => r.name),
  );
  const toInsert = items.filter((d) => !existing.has(d.name));
  const skipped = items.length - toInsert.length;

  console.log(`DB 既存: ${existing.size} 件 / 新規: ${toInsert.length} 件 / 既にある: ${skipped} 件`);

  if (toInsert.length === 0) {
    console.log('追加するものはありません。');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n--- --dry-run のため書き込みません。追加予定: ---');
    toInsert.forEach((d, i) => console.log(`  ${String(i + 1).padStart(3)}. ${d.name} (入数 ${d.unitsPerCase})`));
    process.exit(0);
  }

  // 全件まとめて 1 トランザクション。監査ログは「システム」(staff_id = null) として 1 行残す。
  await db.transaction(async (tx) => {
    for (const d of toInsert) {
      await tx.query(
        'insert into drinks (name, units_per_case) values ($1, $2) on conflict (name) do nothing',
        [d.name, d.unitsPerCase],
      );
    }
    await writeAudit(tx, {
      staffId: null,
      action: 'drink.import',
      targetType: 'drink',
      targetId: null,
      details: { source: file, inserted: toInsert.length, skipped, names: toInsert.map((d) => d.name) },
    });
  });

  console.log(`追加しました: ${toInsert.length} 件`);
  const [{ count }] = await db.query<{ count: string }>('select count(*)::text as count from drinks');
  console.log(`drinks 合計: ${count} 件`);
  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
