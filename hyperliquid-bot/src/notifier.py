"""
File-based notifier - Clawdbot picks up and sends
"""
import json
from pathlib import Path
from datetime import datetime

NOTIFY_FILE = Path(__file__).parent.parent / "notifications.jsonl"

def notify(message: str, level: str = "info"):
    """Write notification to file for Clawdbot to pick up"""
    try:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message
        }
        with open(NOTIFY_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception as e:
        print(f"Notify write failed: {e}")
        return False

def notify_signal(signal, price: float):
    emoji = "🟢" if signal.type.value == "long" else "🔴"
    msg = f"""{emoji} **{signal.type.value.upper()} Signal**
Price: ${price:,.2f}
Confidence: {signal.confidence:.1%}
Reason: {signal.reason}
SL: ${signal.stop_loss:,.2f} | TP: ${signal.take_profit:,.2f}"""
    return notify(msg, "signal")

def notify_trade(result: dict, mode: str):
    prefix = "📝 [PAPER]" if mode == "paper" else "✅"
    msg = f"""{prefix} **Trade Executed**
{result['side'].upper()} {result['size']} {result['coin']}
Price: ${result['price']:,.2f}"""
    return notify(msg, "trade")

def notify_error(error: str):
    return notify(f"⚠️ **Bot Error**\n{error}", "error")

def clear_notifications():
    """Clear notification file after processing"""
    try:
        NOTIFY_FILE.unlink(missing_ok=True)
    except:
        pass