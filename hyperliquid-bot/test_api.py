import sys
sys.path.insert(0, "src/data")
from hyperliquid_client import HyperliquidClient

client = HyperliquidClient()
print("Testing Hyperliquid API...")
print()

# Price
try:
    price = client.get_btc_price()
    print(f"[OK] BTC Price: ${price:,.2f}")
except Exception as e:
    print(f"[FAIL] Price: {e}")

# User state
try:
    state = client.get_user_state()
    margin = state.get("marginSummary", {})
    print(f"[OK] Account Value: ${float(margin.get('accountValue', 0)):,.2f}")
    print(f"[OK] Withdrawable: ${float(margin.get('withdrawable', 0)):,.2f}")
    
    # Positions
    positions = state.get("assetPositions", [])
    if positions:
        print(f"[OK] Open Positions: {len(positions)}")
        for p in positions:
            pos = p.get("position", {})
            if float(pos.get("szi", 0)) != 0:
                print(f"     {pos.get('coin')}: {pos.get('szi')} @ {pos.get('entryPx')}")
    else:
        print("[OK] No open positions")
except Exception as e:
    print(f"[FAIL] User state: {e}")
