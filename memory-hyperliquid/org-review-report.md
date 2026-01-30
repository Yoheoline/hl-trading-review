# 🔍 Cronジョブ全職種プロンプト見直しレポート
**作成日:** 2026-01-30
**目的:** COO体制（JARVISは監視・判断・対処のみ。作業はしない）への整合性確認

---

## 📊 全体サマリー

### 重大な問題
1. **SKILL.md（共通スキルファイル）がJARVIS司令塔時代のまま** — 最大の問題
2. **market-brief.md のテクニカルセクション更新者が不在** — JARVISがやめた後、誰も書いていない
3. **ORG.md にHL Trading Division の組織構造が未反映**

### 良い点
- 各トレーダーのCronプロンプトは既に**自立型**（自分でシグナル取得→判断→実行を完結）
- market-briefの「ブリーフを読んで判断」という依存は**Cronプロンプトには存在しない**
- 各トレーダーは `check-signals.js` で独自にシグナル取得している

---

## 1. SKILL.md（共通スキルファイル）

### 現状
- JARVISを「司令塔」「マーケットブリーフ作成」「全体指揮」「システム監視」と定義
- チーム構成表にJARVISが「30分毎」「マーケットブリーフ作成、全体指揮、システム監視」と記載
- 「Step 1: ブリーフ確認 → market-brief.mdを読む。STOPなら何もしない」の記述
- 「関連ファイル」に `market-brief.md — マーケットブリーフ（Heartbeat更新）` と記載
- DayTrader、Strategy Researcherがチーム表に**含まれていない**

### 問題点
- **JARVISの役割記述が旧体制** — 「マーケットブリーフ作成」「全体指揮」は現在の「COO（監視・判断・対処。作業はしない）」と矛盾
- **Step 1の「ブリーフ確認」** — JARVISがブリーフを更新しない以上、テクニカル部分は古くなる一方
- **チーム構成表が不完全** — DayTrader (15m), UltraScalper (1m)がない（UltraScalperは後から追加されたため）
- **market-brief.md の末尾に「*次回更新: Heartbeat実行時*」** — JARVISはもう書かない

### 修正案
```
JARVISの記述:
旧: 🎖️ JARVIS（司令塔） | 30分毎 | マーケットブリーフ作成、全体指揮、システム監視
新: 🎖️ JARVIS（COO） | Heartbeat | 監視・判断・対処（作業はしない。各部署が自立運営）

チーム構成表にDayTrader, UltraScalperを追加

Step 1の「ブリーフ確認」:
→ 「trade-lessons.md の禁止ルール確認」に変更
→ テクニカル判断は各自がcheck-signals.jsで取得

market-brief.md の位置付け:
→ 「ファンダメンタル情報のみ（Fundamental Analyst更新）」に変更
→ テクニカルセクションは廃止 or 別職が担当
```

---

## 2. 🧘 Swing Trader (1h) - Account 1

### 現状（Cronプロンプト）
- 自立型。check-signals.js 1hで自分でシグナル取得
- MTFスコア + confluence判断
- market-briefへの明示的依存なし（教訓確認のみ）

### 問題点
- ✅ **問題なし** — 既にCOO体制に整合

### スキルファイルとの乖離
- スキルファイルにはリスク許容額「$5」、Cronプロンプトでは「risk_pct 4.0」— 方式が違うが矛盾ではない（リスク%ベースに統一済み）
- スキルファイルにTP/SL固定値（TP 1.5-2%, SL 0.5-0.75%）記載だが、実際はstrategy-analysis.jsonのSL%を使用 → スキルファイルが古い

### 修正案
- スキルファイルのTP/SL記述を「strategy-analysis.jsonに従う」に更新

---

## 3. 📊 DayTrader (15m) - Account 2

### 現状（Cronプロンプト）
- 自立型。check-signals.js 15mで自分でシグナル取得
- risk_pct 2.5

### 問題点
- ✅ **問題なし** — 既にCOO体制に整合

### スキルファイルとの乖離
- スキルファイルのTP/SL固定値 vs 実際のstrategy-analysis.json依存（Swing同様）

### 修正案
- スキルファイルのTP/SL記述を更新

---

## 4. ⚡ Scalper (5m) - Account 3

### 現状（Cronプロンプト）
- 自立型。check-signals.js 5mで自分でシグナル取得
- risk_pct 2.0

### 問題点
- ✅ **問題なし** — 既にCOO体制に整合

### スキルファイルとの乖離
- スキルファイルのTP/SL固定値 vs 実際のstrategy-analysis.json依存

### 修正案
- スキルファイルのTP/SL記述を更新

---

## 5. 🔥 UltraScalper (1m) - Account 4

### 現状（Cronプロンプト）
- 自立型。check-signals.js 1mで自分でシグナル取得
- risk_pct 1.5

### 問題点
- ✅ **問題なし** — 既にCOO体制に整合

### スキルファイルとの乖離
- スキルファイルではTP 1%/SL 1%記載 vs 実際のstrategy-analysis.json依存

### 修正案
- スキルファイルのTP/SL記述を更新

---

## 6. 👁 Position Monitor

### 現状（Cronプロンプト）
- position-monitor.js + check-all-positions.js
- SL管理、累計損失チェック、過集中警告
- 初期資金$197.66と比較して10%損失でSTOP発動

### 問題点
- ✅ **概ね問題なし** — 自立型で動作
- ⚠️ スキルファイルでは「Account 1, 3」のみ監視と記載 → 実際は全アカウント（1-4）を監視すべき

### 修正案
- スキルファイルの「監視対象: Account 1, 3」→「Account 1, 2, 3, 4」に修正

---

## 7. 📰 Fundamental Analyst（朝・夜）

### 現状（Cronプロンプト）
- 朝8:00 / 夜20:00
- web_searchでニュース・指標を収集
- market-brief.md の「📰 ファンダメンタル」セクションを更新

### 問題点
- ✅ **概ね問題なし** — 自立型で動作、ファンダセクションの更新責任は明確
- ⚠️ market-brief.md の**テクニカルセクション**の更新はFundamental Analystの範囲外 → 誰も更新しない問題

### 修正案
- 問題なし（ファンダ部分は正常機能）
- テクニカル部分は後述の「market-brief.md問題」で対応

---

## 8. 🔍 Backtest Explorer

### 現状（Cronプロンプト）
- 30分毎にbacktest-explorer.js実行
- strategy-analysis.json更新

### 問題点
- ✅ **問題なし** — 自立型、JARVISへの依存なし

---

## 9. 📚 Strategy Researcher（JARVIS 戦略学習）

### 現状（Cronプロンプト）
- Cronジョブ名が「JARVIS 戦略学習」→ JARVISの名前が残っている
- 日曜10:00実行

### 問題点
- ⚠️ **名前が旧体制** — 「JARVIS 戦略学習」→「📚 Strategy Researcher」に変更すべき

### 修正案
- Cronジョブ名を「📚 Strategy Researcher（週次戦略学習）」に変更

---

## 10. 📝 Trade Reviewer（日次振り返り）

### 現状（Cronプロンプト）
- 22:00実行
- trade-review.js + トレード分析 + 教訓更新
- システム健全性チェック + 改善提案

### 問題点
- ✅ **問題なし** — 自立型、COO体制に整合

---

## 11. 🔄 System Architect（週次進化レビュー）

### 現状（Cronプロンプト）
- 日曜11:00実行
- システム全体の俯瞰レビュー + 改善アクション

### 問題点
- ✅ **問題なし** — 自立型

---

## 12. 🎯 Chief of Staff（月次組織レビュー）

### 現状（Cronプロンプト）
- 月初10:00実行
- 組織構造評価 + パフォーマンス評価

### 問題点
- ⚠️ **組織構成の記述に「JARVIS = COO」が反映されていない** — 「サポート」としてフラットに並べている
- プロンプト内の組織構成がフラットリスト → 新組織構造（前線/防衛/情報/研究/参謀/別働の部門分け）が反映されていない

### 修正案
- プロンプトの組織構成を新構造に更新

---

## 13. 🌅 デイトレアナリスト（朝ブリーフィング）

### 現状（Cronプロンプト）
- 平日7:30実行
- 日本株デイトレ候補選定

### 問題点
- ✅ **問題なし** — HL Trading本体とは独立した別働隊

---

## 🔑 重大問題: market-brief.md のテクニカルセクション

### 現状の問題
market-brief.md には以下のセクションがある：
1. **市場状況**（BTC価格、トレンド方向、レジーム）
2. **シグナルサマリー**（各時間軸のシグナル概要）
3. **環境メモ**
4. **リスク状態**
5. **禁止事項**
6. **📰 ファンダメンタル**（← Fundamental Analystが更新）

セクション1-5（テクニカル部分）は**JARVISが30分毎のHeartbeatで更新していた**。
COO体制ではJARVISは作業をしないので、**誰も更新しなくなる**。

### 重要な問い: テクニカルセクションの更新者は必要か？

**案A: テクニカルセクションを廃止（推奨）**
- 各トレーダーは既にcheck-signals.jsで自分のシグナルを取得している
- market-briefのテクニカル情報に依存していない（Cronプロンプトに依存記述なし）
- → ファンダセクションのみ残し、テクニカル部分は削除
- → market-brief.md → fundamental-brief.md にリネーム

**案B: Technical Analyst（新職）を新設**
- 30分毎に市場状況・テクニカルサマリーを更新する専任を新設
- メリット: Position Monitorや他の参照元が恩恵を受ける
- デメリット: トークンコスト増、各トレーダーは既に自立しているので二重作業

**案C: Position Monitorにテクニカル更新を兼任**
- Position Monitorは10分毎に全アカウントを確認している
- ついでに市場状況（BTC価格、トレンド方向）を更新
- メリット: 新職不要、Position Monitorの延長
- デメリット: 責任範囲の肥大化

### 推奨: 案A（テクニカルセクション廃止）
理由:
- 各トレーダーのCronプロンプトはmarket-briefを参照していない
- テクニカル判断は各自がcheck-signals.jsで完結
- ファンダ情報のみFundamental Analystが更新 → シンプルで明確
- リスク状態はPosition Monitorが別途管理（trade-lessons.mdのSTOP発動）

---

## 📋 修正タスク一覧（優先度順）

### P0（即座に修正すべき）
1. **SKILL.md** — JARVIS役割記述をCOO体制に更新、チーム構成表にDayTrader/UltraScalper追加
2. **market-brief.md** — テクニカルセクションの扱いを決定（廃止 or 担当者設置）
3. **Cronジョブ名「JARVIS 戦略学習」** → 「📚 Strategy Researcher」に変更

### P1（今週中に修正）
4. **各トレーダーのスキルファイル** — TP/SL記述を「strategy-analysis.jsonに従う」に統一
5. **Position Monitorスキルファイル** — 監視対象を「Account 1, 3」→「Account 1-4」に修正
6. **Chief of Staff Cronプロンプト** — 組織構成を新構造に更新
7. **System Architect Cronプロンプト** — 組織構成の記述を新構造に合わせる

### P2（余裕があれば）
8. **ORG.md** — HL Trading Divisionの組織構造を追記
9. **SKILL.md** — 「Step 1: ブリーフ確認」→「Step 1: 教訓確認」に変更
10. **market-brief.md 末尾** — 「*次回更新: Heartbeat実行時*」を削除/変更

---

## 🤔 新任が必要かどうか

### 結論: **新任は不要**

理由:
- 各トレーダーは既に自立型で稼働中
- テクニカルブリーフは各自がcheck-signals.jsで代替
- ファンダはFundamental Analystが担当
- リスクはPosition Monitorが担当
- 組織に穴はない

### ただし要検討:
- market-briefのテクニカルセクションを残す場合のみ、Technical Analyst新設 or Position Monitor兼任が必要
- 推奨は「テクニカルセクション廃止」→ 新任不要

---

*このレポートは見直し結果のみ。修正はよーさんの承認後に実行。*
