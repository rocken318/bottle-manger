import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { PageHelp } from './PageHelp';
import { StockView } from './StockView';

export default async function StockPage() {
  await requireStaff();
  const db = getDb();
  const [locations, drinks, levels] = await Promise.all([listLocations(db), listDrinks(db), getStockLevels(db)]);
  return (
    <div className="space-y-4">
      <PageHelp>
        <ul>
          <li>ボトルごとの今の在庫が見られます。</li>
          <li>「表示する拠点」が「全拠点」のときは、全部の拠点を1つの表で見られます。いちばん右は合計です。</li>
          <li>拠点を1つ選ぶと、その拠点の在庫だけを一覧で見られます。</li>
          <li>「検索」にボトル名の一部を入れると、そのボトルだけにしぼれます。</li>
          <li>「在庫があるものだけ表示」にチェックを入れると、在庫が0本のボトルを隠します。この設定は端末ごとに覚えています。</li>
          <li>数は「2ケース＋3本（計51本）」のように、ケースと本で表示します。</li>
          <li>赤い数字（計−◯本）はマイナスです。記録が足りていない可能性があるので、入力もれがないか確認してください。</li>
          <li>ボトル名を押すと、そのボトルの「入力」画面が開きます。横の「履歴」を押すと、そのボトルの記録が見られます。</li>
        </ul>
      </PageHelp>
      <StockView locations={locations} drinks={drinks} levels={levels} />
    </div>
  );
}
