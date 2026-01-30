param([string]$OutDir = "C:\clawd\hl-trading-org\cron-prompts")
New-Item -ItemType Directory -Force $OutDir | Out-Null

# Read cron jobs from the review data and create individual files
# We'll create them manually from known data

$crons = @{
  "01-swing-trader" = @"
🔇 **出力ルール（最重要・違反厳禁）:**
- エントリー実行した時だけ報告。それ以外は全て NO_REPLY。
- 見送り・途中経過 → 一切出力するな。お前のテキスト出力は全てTelegramに送信される。

**🚨 技術ルール:** execは ``pwsh -Command`` 必須。``&&``禁止→``;``で区切る。``node -e``禁止。コマンドはコピペ実行。

**スキルを読んで実行せよ。** → C:/clawd/skills/hl-trading/swing-trader.md

実行手順はスキルファイルに全て書いてある。その通りに動け。
"@

  "02-daytrader" = @"
🔇 **出力ルール（最重要・違反厳禁）:**
- エントリー実行した時だけ報告。それ以外は全て NO_REPLY。
- 見送り・途中経過 → 一切出力するな。お前のテキスト出力は全てTelegramに送信される。

**🚨 技術ルール:** execは ``pwsh -Command`` 必須。``&&``禁止→``;``で区切る。``node -e``禁止。コマンドはコピペ実行。

**スキルを読んで実行せよ。** → C:/clawd/skills/hl-trading/day-trader.md

実行手順はスキルファイルに全て書いてある。その通りに動け。
"@

  "03-scalper" = @"
🔇 **出力ルール（最重要・違反厳禁）:**
- エントリー実行した時だけ報告。それ以外は全て NO_REPLY。
- 見送り・途中経過 → 一切出力するな。お前のテキスト出力は全てTelegramに送信される。

**🚨 技術ルール:** execは ``pwsh -Command`` 必須。``&&``禁止→``;``で区切る。``node -e``禁止。コマンドはコピペ実行。

**スキルを読んで実行せよ。** → C:/clawd/skills/hl-trading/scalper.md

実行手順はスキルファイルに全て書いてある。その通りに動け。
"@

  "04-ultrascalper" = @"
🔇 **出力ルール（最重要・違反厳禁）:**
- エントリー実行した時だけ報告。それ以外は全て NO_REPLY。
- 見送り・途中経過 → 一切出力するな。お前のテキスト出力は全てTelegramに送信される。

**🚨 技術ルール:** execは ``pwsh -Command`` 必須。``&&``禁止→``;``で区切る。``node -e``禁止。コマンドはコピペ実行。

**スキルを読んで実行せよ。** → C:/clawd/skills/hl-trading/ultra-scalper.md

実行手順はスキルファイルに全て書いてある。その通りに動け。
"@

  "05-strategy-optimizer" = @"
🚨 **テキスト出力は最終レポートの1回だけ。中間メッセージ禁止。**

**技術ルール:** execは ``pwsh -Command`` 必須。``&&``禁止→``;``で区切る。

**スキルを読んで実行せよ。** → C:/clawd/skills/hl-trading/strategy-optimizer.md

実行手順はスキルファイルに全て書いてある。その通りに動け。
"@
}

foreach ($k in $crons.Keys) {
  $crons[$k] | Out-File -FilePath (Join-Path $OutDir "$k.md") -Encoding utf8
  Write-Host "Created $k.md"
}

Write-Host "`nDone. Skill-reading cron prompts exported."
Write-Host "NOTE: Non-trader crons (CRO, FA, Reviewer, etc.) have inline prompts."
Write-Host "Those are too long for this script - they are documented in the cron job configs."
