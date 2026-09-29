// 読み取り専用。在庫取り込み前に、いま DB がどうなっているかを確認するためだけのスクリプト。
import { createPostgresDb } from '../src/lib/db/postgres';
import { toUserMessage } from '../src/lib/errors';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local を確認してください)');
  process.exit(1);
}
const db = createPostgresDb(url);

try {
  const [{ count: drinks }] = await db.query<{ count: string }>(
    'select count(*)::text as count from drinks',
  );
  const [{ count: movements }] = await db.query<{ count: string }>(
    'select count(*)::text as count from stock_movements',
  );
  console.log(`drinks: ${drinks} 件`);
  console.log(`stock_movements: ${movements} 行`);

  const byType = await db.query<{ type: string; n: string }>(
    'select type, count(*)::text as n from stock_movements group by type order by type',
  );
  if (byType.length) {
    console.log('  種類別:');
    for (const r of byType) console.log(`    ${r.type}: ${r.n}`);
  }

  const levels = await db.query<{ location: string; drinks: string; bottles: string }>(
    `select l.name as location, count(*)::text as drinks, sum(s.quantity)::text as bottles
       from stock_levels s join locations l on l.id = s.location_id
      where s.quantity <> 0
      group by l.name order by l.name`,
  );
  console.log('\n現在の在庫（stock_levels、0 本は除く）:');
  if (levels.length === 0) console.log('  なし（在庫データは空）');
  for (const r of levels) console.log(`  ${r.location}: ${r.drinks} 銘柄 / ${r.bottles} 本`);

  const staff = await db.query<{ id: string; name: string; role: string; active: boolean }>(
    'select id, name, role, is_active as active from staff order by role, name',
  );
  console.log('\nスタッフ:');
  for (const s of staff) console.log(`  ${s.name} [${s.role}]${s.active ? '' : ' (無効)'}  ${s.id}`);

  const locs = await db.query<{ id: string; name: string; active: boolean }>(
    'select id, name, is_active as active from locations order by sort_order',
  );
  console.log('\n拠点:');
  for (const l of locs) console.log(`  ${l.name}${l.active ? '' : ' (無効)'}  ${l.id}`);

  process.exit(0);
} catch (e) {
  console.error(toUserMessage(e));
  process.exit(1);
}
