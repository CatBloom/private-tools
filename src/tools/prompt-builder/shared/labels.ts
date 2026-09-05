// 表示専用のラベル整形（保存値・ID・並び順は元の小文字のまま）。
export const formatLabel = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1)
