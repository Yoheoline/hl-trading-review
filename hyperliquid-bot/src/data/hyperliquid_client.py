"""
Hyperliquid API Client - Direct HTTP implementation
No SDK dependency, avoids ckzg compilation issues
"""
import os
import json
import requests
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

class HyperliquidClient:
    """Direct HTTP client for Hyperliquid API"""
    
    BASE_URL = "https://api.hyperliquid.xyz"
    
    def __init__(self):
        self.wallet = os.getenv("HYPERLIQUID_WALLET_ADDRESS")
        self.secret = os.getenv("HYPERLIQUID_API_SECRET")
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _post_info(self, payload: dict) -> dict:
        """POST to info endpoint"""
        resp = self.session.post(f"{self.BASE_URL}/info", json=payload)
        resp.raise_for_status()
        return resp.json()
    
    # ========== Read Operations ==========
    
    def get_all_mids(self) -> Dict[str, str]:
        """Get mid prices for all assets"""
        return self._post_info({"type": "allMids"})
    
    def get_btc_price(self) -> float:
        """Get current BTC mid price"""
        mids = self.get_all_mids()
        return float(mids.get("BTC", 0))
    
    def get_candles(self, coin: str = "BTC", interval: str = "1m", 
                    limit: int = 100) -> List[Dict]:
        """Get OHLCV candles"""
        end_time = int(datetime.now().timestamp() * 1000)
        start_time = end_time - (limit * 60 * 1000)  # Approximate
        
        payload = {
            "type": "candleSnapshot",
            "req": {
                "coin": coin,
                "interval": interval,
                "startTime": start_time,
                "endTime": end_time
            }
        }
        return self._post_info(payload)
    
    def get_l2_book(self, coin: str = "BTC", levels: int = 5) -> Dict:
        """Get order book"""
        return self._post_info({"type": "l2Book", "coin": coin})
    
    def get_user_state(self) -> Dict:
        """Get user's account state (positions, margin, etc)"""
        if not self.wallet:
            raise ValueError("Wallet address not configured")
        return self._post_info({"type": "clearinghouseState", "user": self.wallet})
    
    def get_open_orders(self) -> List[Dict]:
        """Get user's open orders"""
        if not self.wallet:
            raise ValueError("Wallet address not configured")
        return self._post_info({"type": "openOrders", "user": self.wallet})
    
    def get_user_fills(self, limit: int = 100) -> List[Dict]:
        """Get user's recent fills"""
        if not self.wallet:
            raise ValueError("Wallet address not configured")
        return self._post_info({"type": "userFills", "user": self.wallet})
    
    def get_funding_rate(self, coin: str = "BTC") -> Dict:
        """Get current funding rate"""
        meta = self._post_info({"type": "meta"})
        for asset in meta.get("universe", []):
            if asset.get("name") == coin:
                return {
                    "coin": coin,
                    "funding_rate": asset.get("funding", "0")
                }
        return {"coin": coin, "funding_rate": "0"}


# Quick test
if __name__ == "__main__":
    client = HyperliquidClient()
    
    print("Testing Hyperliquid API connection...\n")
    
    # Test 1: Get BTC price
    try:
        price = client.get_btc_price()
        print(f"✅ BTC Price: ${price:,.2f}")
    except Exception as e:
        print(f"❌ Price fetch failed: {e}")
    
    # Test 2: Get candles
    try:
        candles = client.get_candles("BTC", "1m", 5)
        print(f"✅ Got {len(candles)} candles")
        if candles:
            latest = candles[-1]
            print(f"   Latest: O={latest.get('o')} H={latest.get('h')} L={latest.get('l')} C={latest.get('c')}")
    except Exception as e:
        print(f"❌ Candles fetch failed: {e}")
    
    # Test 3: Get user state
    try:
        state = client.get_user_state()
        margin = state.get("marginSummary", {})
        print(f"✅ Account Balance: ${float(margin.get('accountValue', 0)):,.2f}")
    except Exception as e:
        print(f"❌ User state failed: {e}")
