/**
 * 夫婦共用の設定であることを示すバッジ。
 *
 * 分類ルールが利用者ごとに分かれたので、どの設定が相手にも波及するのかを
 * 画面上で見分けられる必要がある。割り勘ルール・CSVフォーマット・除外カテゴリは
 * いずれも世帯単位の設定なので共用のまま。
 */
export function SharedBadge() {
  return (
    <span
      title="夫婦で共用。変更は相手の画面にも反映されます。"
      className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-700"
    >
      夫婦共用
    </span>
  );
}
