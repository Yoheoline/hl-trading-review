"""
Hyperliquid Trading Bot - Autonomous execution with logging for Claude review
"""
import sys
import json
import asyncio
import logging
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from data.market import MarketData
from strategy.engine import StrategyEngine, SignalType
from executor.hyperliquid import HyperliquidExecutor
from risk.manager import RiskManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("bot")

# Use environment variable for user profile path
USER_HOME = os.environ.get("USERPROFILE", "C:\\Users\\Default")
CLAUDE_TRADES = Path(USER_HOME) / "clawd/memory/hyperliquid/trades.md"
CLAUDE_STRATEGY = Path(USER_HOME) / "clawd/memory/hyperliquid/strategy.md"

def load_config():
    config_path = Path(__file__).parent.parent / "config" / "strategy.json"
    with open(config_path, encoding="utf-8-sig") as f:
        return json.load(f)

def get_mode_from_strategy():
    try:
        content = CLAUDE_STRATEGY.read_text(encoding="utf-8")
        if "Current Mode" in content:
            mode_section = content.split("Current Mode")[1].split("\n")[1].strip()
            if "LIVE" in mode_section:
                return "live"
        return "paper"
    except Exception as e:
        log.error(f"Failed to read strategy: {e}")
        return "paper"

def log_trade_for_claude(trade_data):
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"| {timestamp} | {trade_data['side']} | {trade_data['size']} | ${trade_data['entry']:.2f} | - | - | {trade_data['reason']} | pending |\n"
        with open(CLAUDE_TRADES, "a", encoding="utf-8") as f:
            f.write(entry)
        log.info(f"Trade logged for Claude review")
    except Exception as e:
        log.error(f"Failed to log trade: {e}")

async def run_bot():
    config = load_config()
    market = MarketData()
    strategy = StrategyEngine(config)
    risk = RiskManager(config["risk"])
    
    mode = get_mode_from_strategy()
    executor = HyperliquidExecutor(mode=mode)
    
    log.info(f"Bot started in {mode.upper()} mode")
    log.info(f"Balance: ${executor.get_balance().get('accountValue', 0):.2f}")
    
    last_price = None
    trade_count = 0
    
    try:
        while True:
            current_mode = get_mode_from_strategy()
            if current_mode != mode:
                mode = current_mode
                executor = HyperliquidExecutor(mode=mode)
                log.info(f"Mode changed to {mode.upper()}")
            
            data = await market.get_latest()
            price = data["price"]
            
            if last_price and abs(price - last_price) / last_price > 0.005:
                log.info(f"BTC ${price:,.2f} ({'+' if price > last_price else ''}{((price-last_price)/last_price)*100:.2f}%)")
            last_price = price
            
            if not risk.can_trade():
                log.warning("Risk limit reached")
                await asyncio.sleep(60)
                continue
            
            signal = strategy.analyze(data)
            
            if signal and signal.type != SignalType.NONE:
                size = risk.calculate_position_size(signal)
                
                log.info(f"SIGNAL: {signal.type.value.upper()} @ ${price:,.2f}")
                log.info(f"  Reason: {signal.reason}")
                log.info(f"  Size: {size:.6f} BTC")
                
                result = await executor.execute(signal, size)
                
                if result:
                    trade_count += 1
                    risk.record_trade(result)
                    log_trade_for_claude({
                        "side": signal.type.value,
                        "size": size,
                        "entry": result["price"],
                        "reason": signal.reason
                    })
                    log.info(f"Trade #{trade_count} executed @ ${result['price']:,.2f}")
            
            await asyncio.sleep(5)
            
    except KeyboardInterrupt:
        log.info(f"Bot stopped. Total trades: {trade_count}")

if __name__ == "__main__":
    asyncio.run(run_bot())