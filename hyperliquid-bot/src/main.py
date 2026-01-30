"""
Hyperliquid Trading Bot - Main Entry Point
"""
import os
import sys
import json
import asyncio
from dotenv import load_dotenv
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from data.market import MarketData
from strategy.engine import StrategyEngine
from executor.hyperliquid import HyperliquidExecutor
from risk.manager import RiskManager
from learning.reflector import Reflector

load_dotenv()

class TradingBot:
    def __init__(self, mode: str = "paper"):
        self.mode = mode
        self.config = self._load_config()
        
        # Initialize modules
        self.market = MarketData()
        self.strategy = StrategyEngine(self.config)
        self.executor = HyperliquidExecutor(mode=mode)
        self.risk = RiskManager(self.config["risk"])
        self.reflector = Reflector(self.config["learning"])
        
        self.trade_count = 0
        self.running = False
        
    def _load_config(self) -> dict:
        config_path = Path(__file__).parent.parent / "config" / "strategy.json"
        with open(config_path, "r") as f:
            return json.load(f)
    
    async def run(self):
        """Main trading loop"""
        print(f"🤖 Starting bot in {self.mode} mode...")
        self.running = True
        
        while self.running:
            try:
                # 1. Get market data
                data = await self.market.get_latest()
                
                # 2. Check risk limits
                if not self.risk.can_trade():
                    print("⚠️ Risk limit reached, pausing...")
                    await asyncio.sleep(60)
                    continue
                
                # 3. Generate signal
                signal = self.strategy.analyze(data)
                
                if signal:
                    # 4. Calculate position size
                    size = self.risk.calculate_position_size(signal)
                    
                    # 5. Execute trade
                    result = await self.executor.execute(signal, size)
                    
                    if result:
                        self.trade_count += 1
                        self.risk.record_trade(result)
                        
                        # 6. Check if reflection needed
                        if self.trade_count % self.config["learning"]["reflection_interval"] == 0:
                            await self.reflector.reflect()
                
                await asyncio.sleep(1)  # 1 second interval
                
            except Exception as e:
                print(f"❌ Error: {e}")
                await asyncio.sleep(5)
    
    def stop(self):
        self.running = False
        print("🛑 Bot stopped")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="paper", choices=["paper", "live"])
    args = parser.parse_args()
    
    bot = TradingBot(mode=args.mode)
    asyncio.run(bot.run())
