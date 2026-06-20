import os
import time
import json
import asyncio
from datetime import datetime, timezone
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Smart CRM Python Backend")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Credentials
SUPABASE_URL = "https://zuklkmppdencjzegamfm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1a2xrbXBwZGVuY2p6ZWdhbWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MzQ2NjAsImV4cCI6MjA5NzUxMDY2MH0.i18GcUTO8v9ilBYMlQMwvnz7RLkrR1q5fJB91do3ypk"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# Helper to proxy requests to Supabase REST API
def supabase_req(method, path, json_data=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    
    # Copy default headers
    req_headers = headers.copy()
    if "on_conflict" in path or (params and "on_conflict" in params):
        req_headers["Prefer"] = "resolution=merge-duplicates"
        
    try:
        response = requests.request(method, url, headers=req_headers, json=json_data, params=params)
        response.raise_for_status()
        if response.text:
            return response.json()
        return {}
    except Exception as e:
        print(f"Supabase request error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- CRM / CUSTOMERS ENDPOINTS ---
@app.get("/api/customers")
def get_customers():
    return supabase_req("GET", "customers?select=*")

@app.post("/api/customers")
def save_customer(customer: dict):
    return supabase_req("POST", "customers?on_conflict=id", json_data=customer)

@app.delete("/api/customers/{id}")
def delete_customer(id: str):
    return supabase_req("DELETE", f"customers?id=eq.{id}")

# --- INVENTORY ENDPOINTS ---
@app.get("/api/inventory")
def get_inventory():
    return supabase_req("GET", "inventory?select=*")

@app.post("/api/inventory")
def save_product(product: dict):
    return supabase_req("POST", "inventory?on_conflict=id", json_data=product)

@app.delete("/api/inventory/{id}")
def delete_product(id: str):
    return supabase_req("DELETE", f"inventory?id=eq.{id}")

# --- EMPLOYEES ENDPOINTS ---
@app.get("/api/employees")
def get_employees():
    return supabase_req("GET", "employees?select=*")

@app.post("/api/employees")
def save_employee(employee: dict):
    return supabase_req("POST", "employees?on_conflict=id", json_data=employee)

@app.delete("/api/employees/{id}")
def delete_employee(id: str):
    return supabase_req("DELETE", f"employees?id=eq.{id}")

# --- TRANSACTIONS ENDPOINTS ---
@app.get("/api/transactions")
def get_transactions():
    return supabase_req("GET", "transactions?select=*")

@app.post("/api/transactions")
def save_transaction(tx: dict):
    return supabase_req("POST", "transactions?on_conflict=id", json_data=tx)

@app.delete("/api/transactions/{id}")
def delete_transaction(id: str):
    return supabase_req("DELETE", f"transactions?id=eq.{id}")

# --- CALLS HISTORY ENDPOINTS ---
@app.get("/api/calls")
def get_calls(status: str = None, duration: int = None):
    params = {}
    select_query = "calls?select=*"
    
    # We build the query parameters dynamically for calls poller
    if status and duration is not None:
        select_query = f"calls?select=*&status=in.({status})&duration=eq.{duration}"
    return supabase_req("GET", select_query)

@app.post("/api/calls")
def save_call(call: dict):
    return supabase_req("POST", "calls?on_conflict=id", json_data=call)


# --- TELEPHONY EVENT HANDLER ENDPOINT (MicroSIP Bridge) ---
class CallEvent(BaseModel):
    event: str
    phone: str

@app.post("/api/calls/event")
def handle_call_event(payload: CallEvent):
    event = payload.event
    phone = payload.phone
    
    print(f"Received call event: {event} for phone: {phone}")
    
    # Clean phone format
    clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
    if not clean_phone:
        raise HTTPException(status_code=400, detail="Phone number is empty")
    
    cust_url = "customers"
    call_url = "calls"
    
    # 1. Search for customer
    customer_id = None
    if event in ["incoming", "outgoing"]:
        try:
            customers = supabase_req("GET", "customers?select=id,phone")
            digits_only_phone = "".join(c for c in clean_phone if c.isdigit())
            
            for c in customers:
                c_phone = "".join(c_char for c_char in c.get("phone", "") if c_char.isdigit())
                if c_phone and digits_only_phone:
                    # Match last 9 digits
                    match_len = min(9, len(digits_only_phone))
                    sub_digits = digits_only_phone[-match_len:]
                    if c_phone.endswith(sub_digits):
                        customer_id = c["id"]
                        print(f"Matched existing customer: {c.get('phone')} with ID: {customer_id}")
                        break
        except Exception as e:
            print(f"Customer search failed: {e}")
            
        # 2. Auto-create Lead for new incoming calls
        if event == "incoming" and customer_id is None:
            try:
                cust_unix_ts = int(time.time() * 1000)
                customer_id = f"c_{cust_unix_ts}"
                
                # Format phone cleanly
                formatted_phone = clean_phone
                if len(clean_phone) == 12 and clean_phone.startswith("998"):
                    formatted_phone = f"+998 {clean_phone[3:5]} {clean_phone[5:8]} {clean_phone[8:10]} {clean_phone[10:12]}"
                
                new_customer = {
                    "id": customer_id,
                    "name": f"Yangi Lead ({formatted_phone})",
                    "phone": formatted_phone,
                    "source": "telephony",
                    "status": "lead",
                    "value": 0
                }
                supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
                print(f"Auto-created new lead: {customer_id} ({formatted_phone})")
            except Exception as e:
                print(f"Auto-lead creation failed: {e}")
                customer_id = None

    # 3. Handle Call Events
    if event in ["incoming", "outgoing"]:
        direction = "incoming" if event == "incoming" else "outgoing"
        unix_ts = int(time.time() * 1000)
        call_id = f"call_{clean_phone}_{unix_ts}"
        
        call_payload = {
            "id": call_id,
            "customer_id": customer_id,
            "phone": clean_phone,
            "direction": direction,
            "duration": 0,
            "status": "ringing"
        }
        supabase_req("POST", "calls?on_conflict=id", json_data=call_payload)
        return {"status": "success", "message": f"Created call {call_id}"}
        
    elif event == "start":
        # Find active ringing call
        active_calls = supabase_req("GET", f"calls?select=*&phone=eq.{clean_phone}&status=eq.ringing&order=id.desc&limit=1")
        if active_calls:
            call = active_calls[0]
            supabase_req("PATCH", f"calls?id=eq.{call['id']}", json_data={"status": "answered"})
            return {"status": "success", "message": f"Call answered: {call['id']}"}
        return {"status": "error", "message": f"No active ringing call found for {clean_phone}"}
        
    elif event == "end":
        # Find active call (ringing or answered)
        active_calls = supabase_req("GET", f"calls?select=*&phone=eq.{clean_phone}&status=in.(ringing,answered)&order=id.desc&limit=1")
        if active_calls:
            call = active_calls[0]
            
            # Calculate duration timezone-safe
            created_at_str = call.get("created_at")
            duration = 0
            
            # Parse datetime with timezone offset (e.g. 2026-06-20T10:41:09.123+00:00)
            try:
                # Remove timezone colon for old python compatibility if necessary, but fromisoformat handles +00:00 since python 3.7
                created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                duration = int((now - created_at).total_seconds())
            except Exception as e:
                print(f"Error parsing created_at timestamp: {e}")
                
            duration = max(0, duration)
            
            # Determine final status
            final_status = "answered"
            if call["status"] == "ringing":
                final_status = "missed" if call["direction"] == "incoming" else "failed"
                duration = 0
            else:
                # If answered, make sure duration is at least 1 second
                duration = max(1, duration)
                
            supabase_req("PATCH", f"calls?id=eq.{call['id']}", json_data={"duration": duration, "status": final_status})
            return {"status": "success", "message": f"Call ended: {call['id']}, status: {final_status}, duration: {duration}s"}
        return {"status": "error", "message": f"No active call found for {clean_phone}"}

    return {"status": "error", "message": "Unknown event"}


# --- SIPUNI TELEPHONY WEBHOOK INTEGRATION ---
@app.post("/api/integration/sipuni/webhook")
async def sipuni_webhook(request: Request):
    body = await request.body()
    body_str = body.decode("utf-8", errors="ignore").strip()
    data = {}
    
    if body_str:
        if body_str.startswith("{") and body_str.endswith("}"):
            try:
                data = json.loads(body_str)
            except Exception:
                pass
        if not data:
            try:
                import urllib.parse
                parsed = urllib.parse.parse_qsl(body_str)
                data = dict(parsed)
            except Exception:
                pass
                
    if not data:
        data = dict(request.query_params)
        
    print(f"Sipuni webhook payload received: {data}")
    
    event = data.get("event")
    call_id = data.get("call_id")
    src_num = data.get("src_num")
    dst_num = data.get("dst_num")
    src_type = data.get("src_type")
    dst_type = data.get("dst_type")
    status = data.get("status")
    
    recording_url = data.get("call_record_link") or data.get("recording_url") or data.get("record_url") or ""
    
    timestamp = data.get("timestamp")
    call_start_timestamp = data.get("call_start_timestamp")
    call_answer_timestamp = data.get("call_answer_timestamp")
    
    if not event or not call_id:
        return {"success": True, "message": "Missing event or call_id"}
        
    event = str(event)
    
    is_incoming = True
    if src_type is not None:
        is_incoming = str(src_type) == "1"
    else:
        if src_num and len(str(src_num).replace("+", "")) <= 4:
            is_incoming = False
            
    direction = "incoming" if is_incoming else "outgoing"
    
    client_phone = src_num if is_incoming else dst_num
    if not client_phone:
        client_phone = src_num or dst_num or "unknown"
        
    clean_phone = "".join(c for c in str(client_phone) if c.isdigit() or c == "+")
    
    customer_id = None
    if is_incoming and clean_phone and clean_phone != "unknown":
        try:
            customers = supabase_req("GET", "customers?select=id,phone")
            digits_only_phone = "".join(c for c in clean_phone if c.isdigit())
            
            for c in customers:
                c_phone = "".join(c_char for c_char in c.get("phone", "") if c_char.isdigit())
                if c_phone and digits_only_phone:
                    match_len = min(9, len(digits_only_phone))
                    sub_digits = digits_only_phone[-match_len:]
                    if c_phone.endswith(sub_digits):
                        customer_id = c["id"]
                        print(f"Sipuni Webhook matched customer: {c.get('phone')} -> {customer_id}")
                        break
        except Exception as e:
            print(f"Sipuni Webhook customer search failed: {e}")
            
        if customer_id is None:
            try:
                cust_unix_ts = int(time.time() * 1000)
                customer_id = f"c_{cust_unix_ts}"
                
                formatted_phone = clean_phone
                if len(clean_phone) == 12 and clean_phone.startswith("998"):
                    formatted_phone = f"+998 {clean_phone[3:5]} {clean_phone[5:8]} {clean_phone[8:10]} {clean_phone[10:12]}"
                
                new_customer = {
                    "id": customer_id,
                    "name": f"Yangi Lead ({formatted_phone})",
                    "phone": formatted_phone,
                    "source": "telephony",
                    "status": "lead",
                    "value": 0
                }
                supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
                print(f"Sipuni Webhook created new lead: {customer_id} ({formatted_phone})")
            except Exception as e:
                print(f"Sipuni Webhook auto-lead creation failed: {e}")
                customer_id = None
                
    if event == "1":
        call_payload = {
            "id": call_id,
            "customer_id": customer_id,
            "phone": clean_phone,
            "direction": direction,
            "duration": 0,
            "status": "ringing"
        }
        try:
            supabase_req("POST", "calls?on_conflict=id", json_data=call_payload)
        except Exception as e:
            print(f"Sipuni Webhook failed to save call: {e}")
            
    elif event == "2":
        duration = 0
        try:
            ts = float(timestamp) if timestamp else time.time()
            ans_ts = float(call_answer_timestamp) if call_answer_timestamp else 0
            if ans_ts > 0:
                duration = max(0, int(ts - ans_ts))
        except Exception as e:
            print(f"Error calculating Sipuni duration: {e}")
            
        crm_status = "answered"
        if status:
            status_upper = str(status).upper()
            if status_upper == "ANSWER":
                crm_status = "answered"
            elif status_upper in ["NOANSWER", "BUSY", "CANCEL"]:
                crm_status = "missed" if is_incoming else "failed"
            else:
                crm_status = "failed"
        else:
            if call_answer_timestamp and str(call_answer_timestamp) != "0":
                crm_status = "answered"
            else:
                crm_status = "missed" if is_incoming else "failed"
                
        if crm_status == "answered" and duration <= 0:
            duration = 1
            
        call_payload = {
            "id": call_id,
            "customer_id": customer_id,
            "phone": clean_phone,
            "direction": direction,
            "duration": duration,
            "status": crm_status
        }
        if recording_url:
            call_payload["recording_url"] = recording_url
            
        try:
            supabase_req("POST", "calls?on_conflict=id", json_data=call_payload)
        except Exception as e:
            if "recording_url" in call_payload:
                print("Failed to save call with recording_url, retrying without it...")
                call_payload.pop("recording_url", None)
                try:
                    supabase_req("POST", "calls?on_conflict=id", json_data=call_payload)
                except Exception as retry_err:
                    print(f"Retry saving call failed: {retry_err}")
            else:
                print(f"Sipuni Webhook failed to save call: {e}")
                
    return {"success": True}


# --- SETTINGS, CHATS AND MESSAGES INTEGRATION ---

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                data = json.load(f)
                if "ai_provider" not in data:
                    data["ai_provider"] = "local"
                if "telephony_provider" not in data:
                    data["telephony_provider"] = "sarkor"
                if "gemini_api_key" not in data:
                    data["gemini_api_key"] = ""
                if "openai_api_key" not in data:
                    data["openai_api_key"] = ""
                if "groq_api_key" not in data:
                    data["groq_api_key"] = ""
                if "ai_auto_reply" not in data:
                    data["ai_auto_reply"] = False
                if "regos_endpoint" not in data:
                    data["regos_endpoint"] = ""
                if "regos_token" not in data:
                    data["regos_token"] = ""
                return data
        except Exception:
            pass
    return {"telegram_token": "", "instagram_token": "", "ai_provider": "local", "telephony_provider": "sarkor", "gemini_api_key": "", "openai_api_key": "", "groq_api_key": "", "ai_auto_reply": False, "regos_endpoint": "", "regos_token": ""}

def save_settings(settings):
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=4)
    except Exception as e:
        print(f"Failed to save settings: {e}")

# Global settings state
settings_state = load_settings()
tg_polling_task = None

def send_telegram_message(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Failed to send Telegram message to {chat_id}: {e}")
        return None

def send_instagram_message(token, recipient_id, text):
    url = f"https://graph.facebook.com/v19.0/me/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text}
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Failed to send Instagram message to {recipient_id}: {e}")
        return None

async def process_telegram_update(update):
    message = update.get("message")
    if not message:
        return
        
    chat = message.get("chat")
    if not chat:
        return
        
    chat_id = chat.get("id")
    text = message.get("text")
    if not text:
        return
        
    first_name = chat.get("first_name", "")
    last_name = chat.get("last_name", "")
    username = chat.get("username", "")
    
    customer_id = f"c_tg_{chat_id}"
    
    try:
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(
            None,
            lambda: supabase_req("GET", f"customers?id=eq.{customer_id}")
        )
        
        if not res:
            name = f"{first_name} {last_name}".strip() or username or f"Telegram User {chat_id}"
            new_customer = {
                "id": customer_id,
                "name": name,
                "phone": f"tg://user?id={chat_id}",
                "source": "telegram",
                "status": "lead",
                "value": 0
            }
            await loop.run_in_executor(
                None,
                lambda: supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
            )
            print(f"Auto-created Telegram customer: {customer_id} ({name})")
            
        new_msg = {
            "customer_id": customer_id,
            "sender": "customer",
            "platform": "telegram",
            "text": text
        }
        await loop.run_in_executor(
            None,
            lambda: supabase_req("POST", "messages", json_data=new_msg)
        )
        print(f"Stored Telegram message from {customer_id}: {text}")
        
        # Trigger AI auto reply if enabled
        if settings_state.get("ai_auto_reply"):
            cust_name = ""
            try:
                cust_res = await loop.run_in_executor(None, lambda: supabase_req("GET", f"customers?id=eq.{customer_id}"))
                if cust_res:
                    cust_name = cust_res[0].get("name", "")
            except Exception:
                pass
            if not cust_name:
                cust_name = f"{first_name} {last_name}".strip() or username or f"Telegram User {chat_id}"
                
            await loop.run_in_executor(
                None,
                lambda: trigger_ai_auto_reply(customer_id, "telegram", cust_name, text)
            )
        
    except Exception as e:
        print(f"Failed to process Telegram message: {e}")

async def telegram_polling_loop():
    print("Telegram polling task started.")
    last_update_id = 0
    
    while True:
        token = settings_state.get("telegram_token", "")
        if not token:
            await asyncio.sleep(5)
            continue
            
        url = f"https://api.telegram.org/bot{token}/getUpdates"
        params = {"offset": last_update_id + 1, "timeout": 30}
        
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                lambda: requests.get(url, params=params, timeout=35)
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    updates = data.get("result", [])
                    for update in updates:
                        last_update_id = max(last_update_id, update.get("update_id", 0))
                        await process_telegram_update(update)
            elif response.status_code == 401:
                print("Telegram Bot Token is invalid or expired. Disabling polling.")
                await asyncio.sleep(10)
            else:
                print(f"Telegram polling returned status code: {response.status_code}")
                await asyncio.sleep(5)
        except requests.exceptions.RequestException:
            await asyncio.sleep(2)
        except Exception as e:
            print(f"Error in telegram polling: {e}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    global tg_polling_task
    tg_polling_task = asyncio.create_task(telegram_polling_loop())
    print("Telegram Polling task spawned in startup.")

@app.get("/api/settings")
def get_settings():
    return settings_state

@app.post("/api/settings")
def update_settings(settings: dict):
    global settings_state
    settings_state["telegram_token"] = settings.get("telegram_token", "")
    settings_state["instagram_token"] = settings.get("instagram_token", "")
    settings_state["ai_provider"] = settings.get("ai_provider", "local")
    settings_state["telephony_provider"] = settings.get("telephony_provider", "sarkor")
    settings_state["gemini_api_key"] = settings.get("gemini_api_key", "")
    settings_state["openai_api_key"] = settings.get("openai_api_key", "")
    settings_state["groq_api_key"] = settings.get("groq_api_key", "")
    settings_state["ai_auto_reply"] = settings.get("ai_auto_reply", False)
    settings_state["regos_endpoint"] = settings.get("regos_endpoint", "")
    settings_state["regos_token"] = settings.get("regos_token", "")
    save_settings(settings_state)
    print("Settings updated and saved.")
    return {"status": "success", "settings": settings_state}

def call_gemini(prompt: str, system_instruction: str = None) -> str:
    api_key = settings_state.get("gemini_api_key", "")
    if not api_key:
        return "Tizim sozlamalarida Gemini API Key kiritilmagan! Iltimos, Sozlamalar sahifasida kalitni saqlang."
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    full_prompt = prompt
    if system_instruction:
        full_prompt = f"{system_instruction}\n\nFoydalanuvchi so'rovi: {prompt}"
        
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": full_prompt
                    }
                ]
            }
        ]
    }
    
    try:
        response = requests.post(url, json=payload, timeout=25)
        response.raise_for_status()
        resp_data = response.json()
        
        candidates = resp_data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "")
        return "Kechirasiz, Gemini API dan bo'sh javob qaytdi."
    except Exception as e:
        print(f"Gemini API Exception: {e}")
        return f"Gemini API bilan bog'lanishda xatolik yuz berdi: {e}"

def generate_analyze_fallback(prompt: str, customers: list, inventory: list, total_income: float, total_expense: float, net_balance: float) -> str:
    prompt_lower = prompt.lower()
    if any(k in prompt_lower for k in ["moliya", "pul", "balans", "kirim", "chiqim", "daromad", "foyda", "expense", "income", "balance"]):
        return f"""💰 **Moliyaviy Tahlil (Lokal Dvigatel):**

- 💵 **Jami Kirim:** {total_income:,} so'm
- 💸 **Jami Chiqim:** {total_expense:,} so'm
- 📊 **Sof Balans:** {net_balance:,} so'm

*Eslatma: Ma'lumotlar to'g'ridan-to'g'ri ma'lumotlar bazasidan hisoblab ko'rsatildi.*"""

    if any(k in prompt_lower for k in ["ombor", "mahsulot", "qoldiq", "tovar", "stock", "inventory", "nechta", "bor"]):
        total_products = len(inventory)
        in_stock = sum(1 for p in inventory if p.get("stock", 0) > 0)
        out_of_stock = total_products - in_stock
        
        products_list = []
        for p in inventory[:10]:
            status = f"{p.get('stock')} dona" if p.get('stock', 0) > 0 else "Tugagan ❌"
            products_list.append(f"- **{p.get('name')}**: Narxi: {p.get('price'):,} so'm | Qoldiq: {status}")
            
        products_str = "\n".join(products_list)
        if total_products > 10:
            products_str += f"\n- ... va yana {total_products - 10} ta mahsulot."
            
        return f"""📦 **Omborxona Tahlili (Lokal Dvigatel):**

Jami mahsulot turlari: **{total_products}** ta.
- Sotuvda bor: **{in_stock}** ta
- Tugagan: **{out_of_stock}** ta

**Mahsulotlar ro'yxati (top 10):**
{products_str}

*Eslatma: Jonli ma'lumotlar bazadan olindi.*"""

    if any(k in prompt_lower for k in ["mijoz", "lead", "voronka", "status", "customer", "kontakt"]):
        leads_count = len([c for c in customers if c.get("status") == "lead"])
        contacted_count = len([c for c in customers if c.get("status") == "contacted"])
        proposal_count = len([c for c in customers if c.get("status") == "proposal"])
        won_count = len([c for c in customers if c.get("status") == "won"])
        lost_count = len([c for c in customers if c.get("status") == "lost"])
        
        return f"""👥 **Mijozlar Voronkasi (Lokal Dvigatel):**

- 🆕 **Yangi Leadlar:** {leads_count} ta
- 💬 **Muzokarada:** {contacted_count} ta
- 📄 **Taklif yuborilgan:** {proposal_count} ta
- 🎉 **Yutib olingan (Mijoz):** {won_count} ta
- ❌ **Yo'qotilgan:** {lost_count} ta

Jami ro'yxatdan o'tgan mijozlar: **{len(customers)}** ta.

*Eslatma: Jonli ma'lumotlar bazadan olindi.*"""

    total_products = len(inventory)
    total_customers = len(customers)
    won_count = len([c for c in customers if c.get("status") == "won"])
    leads_count = len([c for c in customers if c.get("status") == "lead"])
    
    return f"""🤖 **Tizimning Umumiy Holati (Lokal Dvigatel):**

Tizimning jonli hisoboti:

- 💰 **Moliya:** Net Balans **{net_balance:,}** so'm (Kirim: {total_income:,} / Chiqim: {total_expense:,})
- 📦 **Omborxona:** **{total_products}** turdagi mahsulotlar mavjud.
- 👥 **CRM:** **{total_customers}** ta mijoz (shundan **{won_count}** ta yutib olingan, **{leads_count}** ta yangi lead).

*Qo'shimcha ma'lumot olish uchun savolni aniqroq bering (masalan: 'moliya' yoki 'ombor' deb yozing).*"""

def generate_chat_fallback(customer_name: str, message_text: str, inventory: list) -> str:
    msg_lower = message_text.lower().strip() if message_text else ""
    
    # 1. Product matching
    matched_product = None
    for p in inventory:
        p_name = p.get("name", "").lower()
        p_sku = p.get("sku", "").lower() if p.get("sku") else ""
        
        # Split product name into words and extract meaningful keywords (length >= 3)
        words = [w.strip("(),\"'.-") for w in p_name.split()]
        meaningful_words = [w for w in words if len(w) >= 3 and w not in ["dona", "kabel", "stuli", "stoli"]]
        
        sku_match = p_sku and p_sku in msg_lower
        word_match = any(w in msg_lower for w in meaningful_words)
        
        if sku_match or word_match:
            matched_product = p
            break
            
    if matched_product:
        p_name_real = matched_product.get("name")
        p_price = matched_product.get("price", 0)
        p_stock = matched_product.get("stock", 0)
        if p_stock > 0:
            return f"Ha, bizda {p_name_real} bor. Narxi {p_price:,} so'm. Hozirda omborda mavjud. Buyurtma berishni istaysizmi?"
        else:
            return f"Kechirasiz, {p_name_real} hozircha omborimizda tugagan. Yaqin kunlarda kelishi kutilmoqda."
            
    # 2. Price query generally
    if any(k in msg_lower for k in ["narx", "narxi", "necha pul", "qancha turadi", "narxlari"]):
        available_products = [p for p in inventory if p.get("stock", 0) > 0]
        if available_products:
            sample_list = []
            for p in available_products[:3]:
                sample_list.append(f"{p.get('name')} ({p.get('price'):,} so'm)")
            sample_str = ", ".join(sample_list)
            return f"Bizda quyidagi mahsulotlar bor: {sample_str}. Sizga qaysi biri qiziq?"
        else:
            return "Hozirda barcha mahsulotlarimiz narxi va turi bilan crm tizimi orqali tanishishingiz mumkin. Aynan qaysi mahsulot kerak?"
            
    # 3. Greetings
    greetings = ["salom", "assalom", "hello", "hi", "salam", "qalesiz", "yaxshimisiz", "charchamayapsizmi"]
    if any(g in msg_lower for g in greetings):
        return f"Assalomu alaykum, {customer_name}! Sizga qanday yordam bera olaman?"
        
    # 4. Operator handover
    if any(k in msg_lower for k in ["operator", "odam", "admin", "mutaxassis", "bog'lanish", "aloqa", "telefon"]):
        return "Tushunarli. Hozirda operatorimizga xabar berdim, tez orada siz bilan bog'lanib, yordam beradi."
        
    return "Xabaringiz qabul qilindi. Tez orada operatorimiz siz bilan bog'lanadi va sizga yordam beradi."

def call_openai(prompt: str, system_instruction: str = None) -> str:
    api_key = settings_state.get("openai_api_key", "")
    if not api_key:
        return "ERROR: OpenAI API Key kiritilmagan!"
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.3
    }
    response = requests.post(url, headers=headers, json=payload, timeout=20)
    response.raise_for_status()
    resp_data = response.json()
    choices = resp_data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "")
    return "ERROR: OpenAI dan bo'sh javob qaytdi."

def call_groq(prompt: str, system_instruction: str = None) -> str:
    api_key = settings_state.get("groq_api_key", "")
    if not api_key:
        return "ERROR: Groq API Key kiritilmagan!"
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": "llama3-8b-8192",
        "messages": messages,
        "temperature": 0.3
    }
    response = requests.post(url, headers=headers, json=payload, timeout=20)
    response.raise_for_status()
    resp_data = response.json()
    choices = resp_data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "")
    return "ERROR: Groq dan bo'sh javob qaytdi."

def call_ai_engine(prompt: str, system_instruction: str = None) -> str:
    provider = settings_state.get("ai_provider", "local")
    if provider == "gemini":
        try:
            res = call_gemini(prompt, system_instruction)
            if "Gemini API bilan bog'lanishda xatolik" in res or "API Key kiritilmagan" in res or "bo'sh javob qaytdi" in res:
                return "FALLBACK"
            return res
        except Exception:
            return "FALLBACK"
    elif provider == "openai":
        try:
            res = call_openai(prompt, system_instruction)
            if res.startswith("ERROR:"):
                return "FALLBACK"
            return res
        except Exception:
            return "FALLBACK"
    elif provider == "groq":
        try:
            res = call_groq(prompt, system_instruction)
            if res.startswith("ERROR:"):
                return "FALLBACK"
            return res
        except Exception:
            return "FALLBACK"
    return "FALLBACK"

def trigger_ai_auto_reply(customer_id: str, platform: str, customer_name: str, message_text: str):
    if not settings_state.get("ai_auto_reply"):
        return
        
    try:
        # 1. Fetch inventory context
        inventory = supabase_req("GET", "inventory?select=*")
        inv_list = []
        for p in inventory:
            status = "Sotuvda bor" if p.get("stock", 0) > 0 else "Tugagan (tez orada keladi)"
            inv_list.append(f"- {p.get('name')}: Narxi {p.get('price')} so'm, Holati: {status}")
        inv_context = "\n".join(inv_list)
        
        # 2. Fetch recent messages
        messages = supabase_req("GET", f"messages?customer_id=eq.{customer_id}&order=created_at.asc")
        chat_history = []
        for m in messages[-8:]:
            sender_label = "Mijoz" if m.get("sender") == "customer" else "Siz (AI)"
            chat_history.append(f"{sender_label}: {m.get('text')}")
        chat_context = "\n".join(chat_history)

        system_instruction = f"""Siz kompaniyaning avtomatik AI sotuv yordamchisisiz.
Mijozning ismi: {customer_name}.
Mijozning oxirgi xabari: "{message_text}"

Kompaniyadagi mahsulotlar va narxlar (Ombor):
{inv_context if inv_context else "- Omborda mahsulotlar yo'q."}

Oxirgi suhbat tarixi:
{chat_context}

Qoidalar:
1. Mijozning savollariga juda xushmuomala, professional va do'stona javob bering.
2. Agar mijoz omborda bor mahsulot haqida so'rasa, uning narxini va borligini tasdiqlang.
3. Agar mahsulot yo'q bo'lsa yoki boshqa ma'lumot so'ralsa, operator tez orada ulanishini bildiring.
4. Javobni faqat O'zbek tilida yozing.
5. Javobingiz juda qisqa bo'lsin: 1 ta yoki maksimum 2 ta gap.
6. Avtomatik javoblar faqat mijozga yuboriladigan javob matnini o'zidan iborat bo'lsin, izohlar qo'shmang."""

        reply_text = call_ai_engine(message_text, system_instruction)
        if reply_text == "FALLBACK":
            reply_text = generate_chat_fallback(customer_name, message_text, inventory)
            
        reply_text = reply_text.strip().replace('"', '').replace('\'', '')
        
        # 3. Store AI reply in Database
        new_msg = {
            "customer_id": customer_id,
            "sender": "agent",
            "platform": platform,
            "text": reply_text
        }
        supabase_req("POST", "messages", json_data=new_msg)
        print(f"[Auto-Pilot] Stored AI auto-reply to {customer_id}: {reply_text}")
        
        # 4. Send the message via Telegram / Instagram API
        if platform == "telegram":
            chat_id = customer_id.replace("c_tg_", "")
            token = settings_state.get("telegram_token")
            if token:
                send_telegram_message(token, chat_id, reply_text)
        elif platform == "instagram":
            recipient_id = customer_id.replace("c_ig_", "")
            token = settings_state.get("instagram_token")
            if token:
                send_instagram_message(token, recipient_id, reply_text)
    except Exception as e:
        print(f"Error in trigger_ai_auto_reply: {e}")

class AIAnalyzePayload(BaseModel):
    prompt: str

@app.post("/api/ai/analyze")
def ai_analyze(payload: AIAnalyzePayload):
    try:
        # Fetch CRM context
        customers = supabase_req("GET", "customers?select=*")
        inventory = supabase_req("GET", "inventory?select=*")
        transactions = supabase_req("GET", "transactions?select=*")
        
        # Calculate financials
        total_income = sum(t.get("amount", 0) for t in transactions if t.get("type") == "income")
        total_expense = sum(t.get("amount", 0) for t in transactions if t.get("type") == "expense")
        net_balance = total_income - total_expense
        
        # Calculate lead counts
        leads_count = len([c for c in customers if c.get("status") == "lead"])
        contacted_count = len([c for c in customers if c.get("status") == "contacted"])
        proposal_count = len([c for c in customers if c.get("status") == "proposal"])
        won_count = len([c for c in customers if c.get("status") == "won"])
        lost_count = len([c for c in customers if c.get("status") == "lost"])
        
        # Format inventory context
        inv_list = []
        for p in inventory:
            status = "Tugagan" if p.get("stock", 0) <= 0 else (f"{p.get('stock')} dona" if p.get("stock", 0) > 3 else f"Kam qoldi ({p.get('stock')} dona)")
            inv_list.append(f"- {p.get('name')} (SKU: {p.get('sku')}), Narxi: {p.get('price')} so'm, Qoldiq: {status}, Kategoriya: {p.get('category')}")
        inv_context = "\n".join(inv_list)
        
        system_instruction = f"""Siz SmartCore CRM & ERP tizimining aqlli tahlilchisi va yordamchisisiz.
Sizda quyidagi real-vaqtdagi kompaniya ma'lumotlari mavjud:

Moliyaviy Holat:
- Jami Kirim: {total_income:,} so'm
- Jami Chiqim: {total_expense:,} so'm
- Net Balans: {net_balance:,} so'm

Mijozlar Voronkasi (CRM):
- Yangi (Leads): {leads_count} ta
- Muzokarada (Contacted): {contacted_count} ta
- Taklif yuborilgan (Proposal): {proposal_count} ta
- Yutib olingan (Won): {won_count} ta
- Yo'tqotilgan (Lost): {lost_count} ta
Jami mijozlar soni: {len(customers)} ta.

Omborxona (ERP) Mahsulotlar Qoldig'i:
{inv_context if inv_context else "- Omborda mahsulotlar yo'q."}

Qoidalar:
1. Foydalanuvchining savoliga faqatgina yuqoridagi ma'lumotlarga tayangan holda professional va aniq javob bering.
2. Savolga o'zbek tilida javob bering.
3. Javobingizni chiroyli Markdown formatida yozing (masalan, muhim ma'lumotlarni qalin harflar bilan yoki ro'yxat ko'rinishida bering).
4. Qisqa va lo'nda bo'ling. Keraksiz ortiqcha gaplar qo'shmang."""

        ai_reply = call_ai_engine(payload.prompt, system_instruction)
        if ai_reply == "FALLBACK":
            ai_reply = generate_analyze_fallback(payload.prompt, customers, inventory, total_income, total_expense, net_balance)
            
        return {"response": ai_reply}
    except Exception as e:
        print(f"AI Analyze failed: {e}")
        try:
            customers = supabase_req("GET", "customers?select=*")
            inventory = supabase_req("GET", "inventory?select=*")
            transactions = supabase_req("GET", "transactions?select=*")
            total_income = sum(t.get("amount", 0) for t in transactions if t.get("type") == "income")
            total_expense = sum(t.get("amount", 0) for t in transactions if t.get("type") == "expense")
            net_balance = total_income - total_expense
            ai_reply = generate_analyze_fallback(payload.prompt, customers, inventory, total_income, total_expense, net_balance)
            return {"response": ai_reply}
        except Exception:
            return {"response": "Kechirasiz, tahlil qilishda xatolik yuz berdi."}

class AISuggestPayload(BaseModel):
    customer_id: str

@app.post("/api/ai/suggest")
def ai_suggest(payload: AISuggestPayload):
    try:
        # Fetch customer and messages
        messages = supabase_req("GET", f"messages?customer_id=eq.{payload.customer_id}&order=created_at.asc")
        customer_res = supabase_req("GET", f"customers?id=eq.{payload.customer_id}")
        
        customer_name = "Noma'lum"
        if customer_res:
            customer_name = customer_res[0].get("name", "Noma'lum")
            
        # Fetch inventory for product suggestions
        inventory = supabase_req("GET", "inventory?select=*")
        inv_list = []
        for p in inventory:
            status = "Sotuvda mavjud" if p.get("stock", 0) > 0 else "Tugagan (yaqin orada keladi)"
            inv_list.append(f"- {p.get('name')}: Narxi {p.get('price')} so'm, Holati: {status}")
        inv_context = "\n".join(inv_list)
        
        # Format chat history
        chat_history = []
        for m in messages[-15:]:
            sender_label = "Mijoz" if m.get("sender") == "customer" else "Siz"
            chat_history.append(f"{sender_label}: {m.get('text')}")
        chat_context = "\n".join(chat_history)
        
        system_instruction = f"""Siz kompaniyangizning aqlli sotuv menejerisiz. Mijozning ismi: {customer_name}.
Siz mijozning oxirgi xabariga/yozishmalariga javob loyihasini (suggested reply) tayyorlashingiz kerak.

Kompaniyadagi mahsulotlar va narxlar (Ombor):
{inv_context if inv_context else "- Hozircha omborda mahsulot yo'q."}

Muloqot tarixi:
{chat_context if chat_context else "- Hali yozishmalar boshlanmagan."}

Qoidalar:
1. Mijozning oxirgi savollariga mos, juda professional, xushmuomala va yordam berishga tayyor ruhda javob yozing.
2. Agar mijoz biror narsa so'ragan bo'lsa va u omborda bo'lsa, narxini ayting, bo'lmasa muloyimlik bilan yo'qligini bildiring.
3. Javobni faqat O'zbek tilida yozing.
4. Javobingiz juda qisqa bo'lsin: 1 ta yoki maksimum 2 ta gapdan iborat bo'lsin.
5. Faqat operator mijozga yuborishi mumkin bo'lgan javob matnini o'zini qaytaring. Ortiqcha "Mana javob:" yoki qo'shtirnoqlar kabi matnlarni qo'shmang."""

        prompt = "Mijozga mos javob matnini tayyorlang."
        suggestion = call_ai_engine(prompt, system_instruction)
        
        if suggestion == "FALLBACK":
            last_message_text = ""
            if messages:
                cust_msgs = [m for m in messages if m.get("sender") == "customer"]
                if cust_msgs:
                    last_message_text = cust_msgs[-1].get("text", "")
            suggestion = generate_chat_fallback(customer_name, last_message_text, inventory)
            
        suggestion = suggestion.strip().replace('"', '').replace('\'', '')
        return {"suggestion": suggestion}
    except Exception as e:
        print(f"AI suggestion failed: {e}")
        try:
            inventory = supabase_req("GET", "inventory?select=*")
            last_message_text = ""
            if messages:
                cust_msgs = [m for m in messages if m.get("sender") == "customer"]
                if cust_msgs:
                    last_message_text = cust_msgs[-1].get("text", "")
            suggestion = generate_chat_fallback(customer_name, last_message_text, inventory)
            return {"suggestion": suggestion.strip().replace('"', '').replace('\'', '')}
        except Exception:
            return {"suggestion": "Kechirasiz, sun'iy intellektdan javob taklifi olishda xatolik yuz berdi."}

@app.get("/api/chats")
def get_chats():
    try:
        messages = supabase_req("GET", "messages?select=*&order=created_at.desc")
    except Exception as e:
        print(f"Failed to fetch messages for chats list: {e}")
        return []
        
    last_messages = {}
    for msg in messages:
        c_id = msg.get("customer_id")
        if c_id not in last_messages:
            last_messages[c_id] = msg
            
    try:
        customers = supabase_req("GET", "customers?select=*")
        customers_dict = {c["id"]: c for c in customers}
    except Exception as e:
        print(f"Failed to fetch customers for chats list: {e}")
        customers_dict = {}
        
    chats_list = []
    for c_id, last_msg in last_messages.items():
        cust = customers_dict.get(c_id, {
            "id": c_id,
            "name": f"Noma'lum Mijoz ({c_id})",
            "phone": "",
            "company": last_msg.get("platform", "Telegram").capitalize()
        })
        chats_list.append({
            "customer_id": c_id,
            "customer_name": cust.get("name"),
            "platform": last_msg.get("platform"),
            "last_message_text": last_msg.get("text"),
            "last_message_time": last_msg.get("created_at"),
            "last_message_sender": last_msg.get("sender")
        })
        
    chats_list.sort(key=lambda x: x["last_message_time"] or "", reverse=True)
    return chats_list

@app.get("/api/messages/{customer_id}")
def get_messages(customer_id: str):
    return supabase_req("GET", f"messages?customer_id=eq.{customer_id}&order=created_at.asc")

class MessagePayload(BaseModel):
    customer_id: str
    sender: str
    platform: str
    text: str

@app.post("/api/messages")
def send_and_save_message(payload: MessagePayload):
    new_msg = {
        "customer_id": payload.customer_id,
        "sender": payload.sender,
        "platform": payload.platform,
        "text": payload.text
    }
    
    saved_msg = supabase_req("POST", "messages", json_data=new_msg)
    
    if payload.sender == "agent":
        if payload.platform == "telegram":
            chat_id = payload.customer_id.replace("c_tg_", "")
            token = settings_state.get("telegram_token")
            if token:
                send_telegram_message(token, chat_id, payload.text)
        elif payload.platform == "instagram":
            recipient_id = payload.customer_id.replace("c_ig_", "")
            token = settings_state.get("instagram_token")
            if token:
                send_instagram_message(token, recipient_id, payload.text)
                
    return {"status": "success", "message": saved_msg}

@app.get("/api/integration/instagram/webhook")
def verify_instagram_webhook(request: Request):
    params = request.query_params
    hub_mode = params.get("hub.mode")
    hub_challenge = params.get("hub.challenge")
    hub_verify_token = params.get("hub.verify_token")
    
    VERIFY_TOKEN = "smart_crm_verify_token"
    
    if hub_mode == "subscribe" and hub_challenge:
        if hub_verify_token == VERIFY_TOKEN:
            from fastapi.responses import Response
            return Response(content=hub_challenge, media_type="text/plain")
        else:
            raise HTTPException(status_code=403, detail="Verification token mismatch")
            
    return {"message": "Instagram Webhook Verification Endpoint"}

@app.post("/api/integration/instagram/webhook")
def handle_instagram_webhook(body: dict):
    try:
        print("Received Instagram Webhook:", json.dumps(body))
        
        if body.get("object") == "instagram":
            for entry in body.get("entry", []):
                for messaging_event in entry.get("messaging", []):
                    sender = messaging_event.get("sender", {})
                    sender_id = sender.get("id")
                    message = messaging_event.get("message", {})
                    text = message.get("text")
                    
                    if sender_id and text:
                        customer_id = f"c_ig_{sender_id}"
                        
                        res = supabase_req("GET", f"customers?id=eq.{customer_id}")
                        if not res:
                            new_customer = {
                                "id": customer_id,
                                "name": f"Instagram User {sender_id}",
                                "phone": f"instagram://user?id={sender_id}",
                                "source": "instagram",
                                "status": "lead",
                                "value": 0
                            }
                            supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
                            print(f"Auto-created Instagram customer: {customer_id}")
                            
                        new_msg = {
                            "customer_id": customer_id,
                            "sender": "customer",
                            "platform": "instagram",
                            "text": text
                        }
                        supabase_req("POST", "messages", json_data=new_msg)
                        print(f"Stored Instagram message from {customer_id}: {text}")
                        
                        # Trigger AI auto reply if enabled
                        if settings_state.get("ai_auto_reply"):
                            cust_name = f"Instagram User {sender_id}"
                            try:
                                cust_res = supabase_req("GET", f"customers?id=eq.{customer_id}")
                                if cust_res:
                                    cust_name = cust_res[0].get("name", cust_name)
                            except Exception:
                                pass
                                
                            import threading
                            threading.Thread(target=trigger_ai_auto_reply, args=(customer_id, "instagram", cust_name, text)).start()
                        
        return {"status": "success"}
    except Exception as e:
        print(f"Error handling Instagram Webhook: {e}")
        return {"status": "error", "message": str(e)}

    return {"status": "error", "message": "Unknown event"}

# --- CHATS SIMULATOR TEST ENDPOINTS ---

@app.post("/api/test/simulate-telegram")
def simulate_telegram_message(payload: dict):
    chat_id = payload.get("chat_id")
    text = payload.get("text")
    name = payload.get("name", f"Telegram User {chat_id}")
    
    if not chat_id or not text:
        raise HTTPException(status_code=400, detail="chat_id and text are required")
        
    customer_id = f"c_tg_{chat_id}"
    try:
        res = supabase_req("GET", f"customers?id=eq.{customer_id}")
        if not res:
            new_customer = {
                "id": customer_id,
                "name": name,
                "phone": f"tg://user?id={chat_id}",
                "source": "telegram",
                "status": "lead",
                "value": 0
            }
            supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
            print(f"[Simulator] Auto-created Telegram customer: {customer_id} ({name})")
            
        new_msg = {
            "customer_id": customer_id,
            "sender": "customer",
            "platform": "telegram",
            "text": text
        }
        supabase_req("POST", "messages", json_data=new_msg)
        print(f"[Simulator] Stored Telegram message: {text}")
        return {"status": "success", "message": "Telegram message simulated successfully"}
    except Exception as e:
        print(f"Failed to simulate Telegram message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test/simulate-instagram")
def simulate_instagram_message(payload: dict):
    sender_id = payload.get("sender_id")
    text = payload.get("text")
    name = payload.get("name", f"Instagram User {sender_id}")
    
    if not sender_id or not text:
        raise HTTPException(status_code=400, detail="sender_id and text are required")
        
    customer_id = f"c_ig_{sender_id}"
    try:
        res = supabase_req("GET", f"customers?id=eq.{customer_id}")
        if not res:
            new_customer = {
                "id": customer_id,
                "name": name,
                "phone": f"instagram://user?id={sender_id}",
                "source": "instagram",
                "status": "lead",
                "value": 0
            }
            supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
            print(f"[Simulator] Auto-created Instagram customer: {customer_id} ({name})")
            
        new_msg = {
            "customer_id": customer_id,
            "sender": "customer",
            "platform": "instagram",
            "text": text
        }
        supabase_req("POST", "messages", json_data=new_msg)
        print(f"[Simulator] Stored Instagram message: {text}")
        return {"status": "success", "message": "Instagram message simulated successfully"}
    except Exception as e:
        print(f"Failed to simulate Instagram message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/integration/regos/sync")
def sync_regos_inventory():
    regos_endpoint = settings_state.get("regos_endpoint", "")
    regos_token = settings_state.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        raise HTTPException(status_code=400, detail="REGOS API sozlanmagan. Iltimos, sozlamalar sahifasida Endpoint va Access Tokenni kiritib saqlang.")
        
    endpoint = regos_endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "https://" + endpoint
        
    if "/v1" not in endpoint:
        url = f"{endpoint}/v1/item/getext"
    else:
        url = f"{endpoint}/item/getext"
        
    headers = {
        "Authorization": f"Bearer {regos_token}",
        "Content-Type": "application/json"
    }
    
    all_items = []
    limit = 100
    offset = 0
    
    try:
        while True:
            payload = {"limit": limit, "offset": offset, "price_type_id": 1}
            print(f"Fetching from REGOS URL: {url} with offset {offset}...")
            response = requests.post(url, headers=headers, json=payload, timeout=20)
            response.raise_for_status()
            data = response.json()
            
            items_list = []
            if isinstance(data, list):
                items_list = data
            elif isinstance(data, dict):
                for key in ["items", "result", "data", "list"]:
                    if key in data and isinstance(data[key], list):
                        items_list = data[key]
                        break
                else:
                    # If dict itself doesn't contain a list under common keys, maybe it contains list values
                    for val in data.values():
                        if isinstance(val, list):
                            items_list = val
                            break
            
            if not items_list:
                break
                
            all_items.extend(items_list)
            if len(items_list) < limit:
                break
            offset += limit
            
            if offset >= 30000:  # Safety ceiling
                break
    except Exception as e:
        print(f"REGOS API connection error: {e}")
        raise HTTPException(status_code=500, detail=f"REGOS API bilan bog'lanishda xatolik yuz berdi: {str(e)}")
        
    sync_count = 0
    for item_ext in all_items:
        if not isinstance(item_ext, dict):
            continue
        item = item_ext.get("item")
        if not item or not isinstance(item, dict):
            continue
            
        regos_id = item.get("id")
        if not regos_id:
            continue
            
        product_id = f"i_regos_{regos_id}"
        name = item.get("name", "Noma'lum REGOS mahsuloti")
        
        sku = item.get("code") or item.get("articul") or ""
        sku = str(sku).strip().upper()
        if not sku:
            sku = f"RE-{regos_id}"
            
        price = item_ext.get("price") or item_ext.get("last_purchase_cost") or 0
        try:
            price = float(price)
        except (ValueError, TypeError):
            price = 0.0
            
        quantity_obj = item_ext.get("quantity")
        stock = 0
        if isinstance(quantity_obj, dict):
            stock = quantity_obj.get("common") or quantity_obj.get("allowed") or 0
        elif isinstance(quantity_obj, (int, float)):
            stock = quantity_obj
        try:
            stock = int(float(stock))
        except (ValueError, TypeError):
            stock = 0
            
        group = item.get("group")
        category = "Barchasi"
        if isinstance(group, dict):
            category = group.get("name") or "Barchasi"
        elif isinstance(group, (str, int)):
            category = str(group)
        elif item.get("group_name"):
            category = item.get("group_name")
            
        product_payload = {
            "id": product_id,
            "name": name,
            "sku": sku,
            "price": price,
            "stock": stock,
            "category": category
        }
        
        try:
            supabase_req("POST", "inventory?on_conflict=id", json_data=product_payload)
            sync_count += 1
        except Exception as ex:
            print(f"First upsert attempt failed for {product_id}: {ex}. Retrying with unique SKU...")
            product_payload["sku"] = f"{sku}-{regos_id}"
            try:
                supabase_req("POST", "inventory?on_conflict=id", json_data=product_payload)
                sync_count += 1
            except Exception as retry_ex:
                print(f"Retry failed for {product_id}: {retry_ex}")
                
    return {"status": "success", "count": sync_count}

@app.post("/api/integration/regos/webhook")
async def regos_webhook(request: Request):
    try:
        data = await request.json()
        print(f"REGOS Webhook received: {data}")
    except Exception as e:
        print(f"Error reading REGOS webhook JSON: {e}")
        data = {}
        
    # Trigger sync in background thread
    import threading
    threading.Thread(target=sync_regos_inventory).start()
    
    return {"status": "success", "message": "Sync triggered in background"}

# Mount frontend files (HTML, CSS, JS) to run at root url (must be mounted last)
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    print(f"Warning: Static files directory {STATIC_DIR} not found!")
