import sys
import argparse
import requests
from datetime import datetime

# Local log configuration
LOG_PATH = r"C:\Users\user\.gemini\antigravity\scratch\erp-crm-app\call_handler_log.txt"

def log_message(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}\n"
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception as e:
        print(f"Log write failed: {e}")

def main():
    parser = argparse.ArgumentParser(description="MicroSIP Call Handler")
    parser.add_argument("--event", required=True, help="Call event type (incoming/outgoing/start/end)")
    parser.add_argument("--phone", required=True, help="Remote phone number")
    
    args = parser.parse_args()
    event = args.event
    phone = args.phone
    
    log_message(f"Python Trigger - Event: {event}, Phone: {phone}")
    
    url = "http://localhost:8000/api/calls/event"
    payload = {
        "event": event,
        "phone": phone
    }
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 200:
            res_data = response.json()
            log_message(f"API Success ({event}) - Response: {res_data.get('message')}")
        else:
            log_message(f"API Error ({event}) - Status Code: {response.status_code}, Body: {response.text}")
    except Exception as e:
        log_message(f"API Connection Error ({event}) - Exception: {e}")

if __name__ == "__main__":
    main()
