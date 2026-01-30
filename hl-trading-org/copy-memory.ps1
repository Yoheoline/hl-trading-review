$files = @('risk-gate.json','graduation-criteria.md','market-brief.md','trade-lessons.md','jarvis-trades.md','system-health.md','improvement-backlog.md','trading-plan.md','trade-history.json','strategies-learned.md')
foreach ($f in $files) {
  $src = "C:\clawd\memory\hyperliquid\$f"
  if (Test-Path $src) {
    Copy-Item $src C:\clawd\hl-trading-org\memory\
    Write-Host "Copied $f"
  }
}
Get-ChildItem C:\clawd\hl-trading-org\memory\ -Name
