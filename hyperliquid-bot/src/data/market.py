"""
Market Data Module - Real data from Hyperliquid API
"""
import asyncio
from typing import Dict, Any, List
from datetime import datetime
from .hyperliquid_client import HyperliquidClient

class MarketData:
    def __init__(self, coin: str = "BTC"):
        self.coin = coin
        self.client = HyperliquidClient()
        self.last_price = None
        self.candles_cache = []
        
    async def get_latest(self) -> Dict[str, Any]:
        # Run sync calls in executor
        loop = asyncio.get_event_loop()
        
        price = await loop.run_in_executor(None, self._get_price_sync)
        candles = await loop.run_in_executor(None, self._get_candles_sync)
        funding = await loop.run_in_executor(None, self._get_funding_sync)
        
        self.last_price = price
        
        return {
            "timestamp": datetime.now().isoformat(),
            "price": price,
            "candles": candles,
            "funding_rate": funding,
            "sentiment": {"score": 0.0}  # TODO: implement
        }
    
    def _get_price_sync(self) -> float:
        try:
            return self.client.get_btc_price()
        except Exception as e:
            print(f"Price error: {e}")
            return self.last_price or 0.0
    
    def _get_candles_sync(self, limit: int = 100) -> List[Dict]:
        try:
            candles = self.client.get_candles(self.coin, "1m", limit)
            self.candles_cache = candles
            return candles
        except Exception as e:
            print(f"Candles error: {e}")
            return self.candles_cache
    
    def _get_funding_sync(self) -> float:
        try:
            data = self.client.get_funding_rate(self.coin)
            return float(data.get("funding_rate", 0))
        except Exception as e:
            print(f"Funding error: {e}")
            return 0.0
    
    def get_price_sync(self) -> float:
        return self._get_price_sync()
    
    def get_candles_sync(self, limit: int = 100) -> List[Dict]:
        return self._get_candles_sync(limit)
