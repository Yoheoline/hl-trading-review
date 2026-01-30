Set-Location C:/Users/yohei/projects/hyperliquid-bot/src/executor/node-executor
for ($i = 1; $i -le 10; $i++) {
    Write-Host "=== Run $i/10 ===" -ForegroundColor Cyan
    node backtest-explorer.js
    Write-Host ""
}
Write-Host "Done!" -ForegroundColor Green
