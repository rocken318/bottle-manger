// 同じお酒が表記違いで 2 件登録されているのを 1 件にまとめる。
// 消すほうの記録（stock_movements・drink_prices）を残すほうに付け替えてから、
// 消すほうを廃止する。削除はしないので、廃止を取り消せば元の名前は戻せる
// （ただし記録の付け替えは戻らない）。
import { readFile } from 'node:fs/promises';
import { createPostgresDb } from '../src/lib/db/postgres';
import { writeAudit } from '../src/lib/repo/audit';
import { toUserMessage } from '../src/lib/errors';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const staffName = args.find((a) => a.startsWith('--staff='))?.slice('--staff='.length) ?? '';
const file = args.find((a) => !a.startsWith('--'));

if (!file || !staffName) {
  console.error('usage: npm run db:merge-drinks -- <CSVパス> --staff=<スタッフ名> [--dry-run]');
  console.error('  CSV: 1行目が keep,drop のヘッダ。drop の記録を keep に移して drop を廃止します。');
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
const keepIdx = header.indexOf('keep');
const dropIdx = header.indexOf('drop');
if (keepIdx === -1 || dropIdx === -1) {
  console.error('CSV に keep と drop の列が必要です');
  process.exit(1);
}

const norm = (s: string) => s.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
const pairs: { keep: string; drop: string }[] = [];
for (const [i, r] of rows.slice(1).entries()) {
  const keep = norm(r[keepIdx] ?? '');
  const drop = norm(r[dropIdx] ?? '');
  if (!keep || !drop) continue;
  if (keep === drop) {
    console.error(`${i + 2} 行目: keep と drop が同じです "${keep}"`);
    process.exit(1);
  }
  pairs.push({ keep, drop });
}
// 消すほうが別の行で残すほうになっていると、順番しだいで結果が変わる。先に弾く。
const drops = new Set(pairs.map((p) => p.drop));
const conflict = pairs.filter((p) => drops.has(p.keep));
if (conflict.length) {
  console.error('残すほうが別の行で消される対象になっています: ' + conflict.map((c) => c.keep).join(', '));
  process.exit(1);
}
const dupDrop = [...drops].filter((d) => pairs.filter((p) => p.drop === d).length > 1);
if (dupDrop.length) {
  console.error('同じ drop が複数行に出ています: ' + dupDrop.join(', '));
  process.exit(1);
}

console.log(`CSV: ${file}`);
console.log(`まとめる組: ${pairs.length} 件`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}
const db = createPostgresDb(url);

try {
  const staffRows = await db.query<{ id: string; name: string; role: string }>(
    'select id, name, role from staff where name = $1 and is_active',
    [staffName],
  );
  if (staffRows.length !== 1) {
    console.error(`スタッフ "${staffName}" が見つからない（または複数）: ${staffRows.length} 件`);
    process.exit(1);
  }
  const staff = staffRows[0];

  const drinks = await db.query<{ id: string; name: string; isActive: boolean }>(
    'select id, name, is_active as "isActive" from drinks',
  );
  const byName = new Map(drinks.map((d) => [d.name, d]));
  const missing = pairs.flatMap((p) => [p.keep, p.drop]).filter((n) => !byName.has(n));
  if (missing.length) {
    console.error(`DB に無いボトル: ${missing.join(', ')}`);
    process.exit(1);
  }

  const locations = await db.query<{ id: string; name: string }>('select id, name from locations');
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const levels = await db.query<{ locationId: string; drinkId: string; quantity: number }>(
    'select location_id as "locationId", drink_id as "drinkId", quantity from stock_levels',
  );
  const perDrink = new Map<string, Map<string, number>>();
  for (const l of levels) {
    if (!perDrink.has(l.drinkId)) perDrink.set(l.drinkId, new Map());
    perDrink.get(l.drinkId)!.set(l.locationId, l.quantity);
  }
  const show = (id: string) => {
    const m = perDrink.get(id);
    if (!m) return '在庫なし';
    const parts = [...m].filter(([, q]) => q !== 0).map(([loc, q]) => `${locName.get(loc)} ${q}`);
    return parts.length ? parts.join(' / ') : '在庫なし';
  };

  console.log(`記録者: ${staff.name} [${staff.role}]\n`);
  for (const [i, p] of pairs.entries()) {
    const keep = byName.get(p.keep)!;
    const drop = byName.get(p.drop)!;
    const merged = new Map(perDrink.get(keep.id) ?? []);
    for (const [loc, q] of perDrink.get(drop.id) ?? []) merged.set(loc, (merged.get(loc) ?? 0) + q);
    const after = [...merged].filter(([, q]) => q !== 0).map(([loc, q]) => `${locName.get(loc)} ${q}`).join(' / ');
    console.log(`${String(i + 1).padStart(2)}. 残す: ${p.keep}  (${show(keep.id)})`);
    console.log(`    消す: ${p.drop}  (${show(drop.id)})`);
    console.log(`    → まとめた後: ${after || '在庫なし'}`);
  }

  if (dryRun) {
    console.log('\n--- --dry-run のため書き込みません ---');
    process.exit(0);
  }

  // 全部まとめて 1 トランザクション。途中で失敗したら何も起きない。
  await db.transaction(async (tx) => {
    for (const p of pairs) {
      const keep = byName.get(p.keep)!;
      const drop = byName.get(p.drop)!;

      // 単価は (drink_id, effective_from) が一意。残すほうに同じ日の単価が既にあるなら
      // 残すほうを優先し、消すほうの行は捨てる。
      await tx.query(
        `delete from drink_prices dp
          where dp.drink_id = $1
            and exists (select 1 from drink_prices k
                         where k.drink_id = $2 and k.effective_from = dp.effective_from)`,
        [drop.id, keep.id],
      );
      await tx.query('update drink_prices set drink_id = $2 where drink_id = $1', [drop.id, keep.id]);
      await tx.query('update stock_movements set drink_id = $2 where drink_id = $1', [drop.id, keep.id]);
      await tx.query('update drinks set is_active = false where id = $1', [drop.id]);

      await writeAudit(tx, {
        staffId: staff.id,
        action: 'drink.merge',
        targetType: 'drink',
        targetId: keep.id,
        details: { source: file, keep: p.keep, keepId: keep.id, drop: p.drop, dropId: drop.id },
      });
    }
  });
  console.log(`\nまとめました: ${pairs.length} 組`);

  const [{ count }] = await db.query<{ count: string }>(
    'select count(*)::text as count from drinks where is_active',
  );
  console.log(`有効なボトル: ${count} 件`);
  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
