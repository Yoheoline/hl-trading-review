# System Health Log

## 現在のステータス: ✅ 正常
- 最終チェック: 2026-01-30 17:10 JST
- 運用体制: 2アカウント（swing + scalp）

## 既知の問題
- **check-orders.js**: ESM import問題で動作不能（`hyperliquid-client.js` module not found）。修正待ち。

## エラー履歴
- **2026-01-30 14:00** — `check-signals.js` JSONパースエラー → **修正済み**（response.text() + try/catch追加）
- **2026-01-30 13:00** — Hyperliquid API non-JSON response → 一時的。上記修正で対応済み

## 自動修正履歴
- **2026-01-30 17:10** — position-monitor.js: `sdk.info.getOpenOrders` → `sdk.info.getUserOpenOrders` に修正（SDK API変更対応）
- **2026-01-30 14:00** — check-signals.js のJSONパース処理を改善（fetchCandles）

---
*組織リセット: 2026-01-30 14:57。pre-org期間のデータ不整合を解消。*
