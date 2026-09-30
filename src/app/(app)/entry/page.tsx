import { requireStaff } from '@/lib/auth/current';
import { getDb } from '@/lib/db/client';
import { listCategories } from '@/lib/repo/categories';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { getStockLevels } from '@/lib/repo/stock';
import { idSchema } from '@/lib/validation';
import { PageHelp } from '../PageHelp';
import { EntryForm } from './EntryForm';

const param = (v: string | string[] | undefined) => {
  const parsed = idSchema.safeParse(Array.isArray(v) ? v[0] : v);
  return parsed.success ? parsed.data : null;
};

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const drinkParam = param(params.drink);
  const locationParam = param(params.location);
  const db = getDb();
  const [drinks, locations, levels, categories] = await Promise.all([
    listDrinks(db),
    listLocations(db),
    getStockLevels(db),
    listCategories(db),
  ]);
  if (locations.length === 0) return <p>有効な拠点がありません。管理者に連絡してください。</p>;
  if (drinks.length === 0) return <p>ボトルが登録されていません。「ボトル」タブから登録してください。</p>;
  const defaultLocationId =
    locations.find((l) => l.id === locationParam)?.id ??
    locations.find((l) => l.id === staff.homeLocationId)?.id ??
    locations[0].id;
  const initialQuery = drinks.find((d) => d.id === drinkParam)?.name ?? '';
  return (
    <div className="space-y-4">
      <PageHelp>
        <p className="font-bold">入力のしかた</p>
        <ul>
          <li>上のボタンで種類を選びます（入荷・販売・移動・棚卸・破損・廃棄）。</li>
          <li>拠点を選びます。「移動」のときは移動元と移動先の両方を選びます。</li>
          <li>ボトルごとに「ケース」と「本」を入れます。どちらか片方だけでもOKです。</li>
          <li>いくつものボトルを一度に入力できます。数を入れた行は青くなります。</li>
          <li>
            ボトルが多いときは、左のプルダウンで種類を選んだり、「ボトル名で絞り込み」を使ったりすると探しやすくなります。かっこの数字はその種類のボトル数です。
          </li>
          <li>
            絞り込みの右のボタンを押すと、選んでいる拠点の在庫が多い順に並べ替わります。もう一度押すと元の並びに戻ります。
          </li>
          <li>最後に下の「登録する」を押します。</li>
        </ul>
        <p className="font-bold">種類ごとの意味</p>
        <ul>
          <li>入荷：仕入れたボトルが届いたとき。在庫が増えます。</li>
          <li>販売：お客様に出したとき。在庫が減ります。</li>
          <li>移動：拠点から拠点へボトルを運んだとき。移動元が減り、移動先が増えます。</li>
          <li>
            棚卸：実際に数えた数を入れます。記録との差は「棚卸差異」として残り、入れた数がその後の在庫になります。
          </li>
          <li>
            破損・廃棄：割れた・試飲やサービスで出した・期限切れなどで使えなくなったとき。在庫が減ります。
            理由（破損／試飲・サービス／期限切れ／その他）を必ず選んでください。
          </li>
        </ul>
        <p className="font-bold">困ったとき</p>
        <ul>
          <li>在庫がマイナスになるときは確認が出ます。数を見直して、正しければ「マイナスでも登録する」を押します。</li>
          <li>まちがえて登録したときは、「履歴」でその記録を「取り消し」してから、もう一度入力し直してください。</li>
        </ul>
      </PageHelp>
      <EntryForm
        // Remount when opened from another link (e.g. a different drink on the stock page)
        // so the initial search/location are applied again.
        key={`${drinkParam ?? ''}:${locationParam ?? ''}`}
        drinks={drinks}
        categories={categories}
        locations={locations}
        levels={levels}
        defaultLocationId={defaultLocationId}
        initialQuery={initialQuery}
      />
    </div>
  );
}
