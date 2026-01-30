# トレーダー共通ガイド

※ 各トレーダー（Swing/DayTrader/Scalper/UltraScalper）のスキルファイルから参照。

---

## 必読ファイル（トレード判断前に必ず確認）

```
C:/clawd/memory/hyperliquid/trade-lessons.md      — 教訓集（禁止ルール）★最優先
C:/clawd/memory/hyperliquid/strategy-analysis.json — 戦略ランキング
```

**禁止ルールに該当するエントリーは、いかなる場合も実行しない。**

---

## トレード判断プロセス

### Step 1: 教訓確認
trade-lessons.mdを読む。「本日STOP」や禁止ルールに該当しないか確認。

### Step 2: ポジション確認
既存ポジションがあれば新規エントリーしない。

### Step 3: シグナルチェック
check-signals.jsで自分の時間軸をチェック。MTFスコアも確認。

### Step 4: 確信度計算
- 1戦略一致: 40%
- 2戦略一致: 65%
- 3戦略一致: 85%
- MTF順方向: +10%
- MTF逆方向: -15%（check-signals.jsのMTFスコアで自動評価）

### Step 5: 実行または見送り
自分の確信度閾値以上なら実行。未満なら見送り。**見送りも立派な判断。**

---

## 絶対ルール

1. **当日累計損失5%超で翌日までタイムロック**（CROが発動）
2. **TP/SLは必ずエントリー直後に設定**（add-tpsl-v2.js）
3. **ポジション中は追加エントリーしない**
4. **教訓の禁止ルールは絶対遵守**
5. **リスクゲート（risk-gate.json）が禁止なら即終了**
6. **深夜(23:00-07:00)は見送り推奨**

---

## TP/SL設定

strategy-analysis.json の該当手法のSL%に従う。TP/SLは `add-tpsl-v2.js` が自動設定。

---

## サイズ計算（リスクベース）

```
executor.js market_open BTC risk_pct <リスク%> <SL%> <isLong> --account <N>
```

各トレーダーのリスク%は個別スキルファイルで定義。

---

## 記録

**全トレードを必ず記録:**
- `jarvis-trades.md` — 人間が読む履歴
- `trade-history.json` — 分析用の構造化データ

```markdown
### HH:MM [Account X] [LONG/SHORT] BTC
- Entry: $XX,XXX
- Size: X.XXXX
- TP/SL: $XX,XXX / $XX,XXX
- 戦略: 〇〇 + 〇〇（confluence）
- 確信度: XX%
- 結果: （決済後に追記）
```

---

## 戦略ランキング

```
C:/clawd/memory/hyperliquid/strategy-analysis.json
→ strategies.{手法}.{時間軸}.best を比較
→ pnl上位3手法でシグナルチェック
```
