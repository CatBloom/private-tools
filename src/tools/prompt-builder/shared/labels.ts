// タグ・履歴ターゲットの「表示ラベル」を整形する（表示専用。保存値・ID・並び順は元の小文字のまま）。
// 今は先頭1文字だけ大文字にする。全部大文字にしたくなったら、この関数の実装だけ差し替える
// （例: `label.toUpperCase()`）。呼び出し側（各セレクトの option・グループ見出し）は変えなくてよい。
export const formatLabel = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1)
