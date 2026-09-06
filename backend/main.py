import os
import time
import uuid
import json
import asyncio
from datetime import datetime, timezone, timedelta
from contextvars import ContextVar
import requests
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Smart CRM Python Backend")

# Register the PRO-TECH ERP new modules router
from backend.new_modules import router as new_modules_router
app.include_router(new_modules_router)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_company_id: ContextVar[str] = ContextVar("active_company_id", default=None)

_company_status_cache = {}

@app.middleware("http")
async def company_id_middleware(request: Request, call_next):
    company_id = request.cookies.get("company_id") or request.headers.get("x-company-id") or request.query_params.get("company_id")
    if not company_id:
        referer = request.headers.get("referer", "")
        if "company_id=" in referer:
            try:
                company_id = referer.split("company_id=")[1].split("&")[0]
            except Exception:
                pass
    if company_id:
        company_id = str(company_id).split(",")[0].strip()
                
    if company_id and company_id != "admin":
        path = request.url.path
        if path.startswith("/api/") and not path.startswith("/api/companies") and not path.startswith("/api/debug"):
            status = _company_status_cache.get(company_id)
            if not status:
                try:
                    res = supabase_req("GET", f"companies?id=eq.{company_id}&select=status", use_central=True)
                    if res and isinstance(res, list) and len(res) > 0:
                        status = res[0].get("status", "active")
                    else:
                        status = "active"
                except Exception:
                    status = "active"
                _company_status_cache[company_id] = status
            
            if status == "disabled":
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Kompaniya faoliyati to'xtatilgan. Iltimos, ma'murga murojaat qiling."}
                )

    token = active_company_id.set(company_id)
    try:
        response = await call_next(request)
        # Prevent browser caching of API responses to avoid mixed company data on account switches
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response
    finally:
        active_company_id.reset(token)

# Supabase Credentials
SUPABASE_URL = "https://zuklkmppdencjzegamfm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1a2xrbXBwZGVuY2p6ZWdhbWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MzQ2NjAsImV4cCI6MjA5NzUxMDY2MH0.i18GcUTO8v9ilBYMlQMwvnz7RLkrR1q5fJB91do3ypk"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def get_company_id(request: Request = None, company_id: str = None):
    if company_id:
        return str(company_id).split(",")[0].strip()
    if request:
        cid = request.cookies.get("company_id") or request.headers.get("x-company-id") or request.query_params.get("company_id")
        if cid:
            return str(cid).split(",")[0].strip()
        referer = request.headers.get("referer", "")
        if "company_id=" in referer:
            try:
                cid = referer.split("company_id=")[1].split("&")[0]
                if cid:
                    return str(cid).split(",")[0].strip()
            except Exception:
                pass
    cid = active_company_id.get()
    if cid:
        return str(cid).split(",")[0].strip()
    # Fallback to local settings file ONLY if running locally
    if request:
        try:
            host = request.base_url.hostname or ""
            is_local = False
            if host in ["localhost", "127.0.0.1", "::1"]:
                is_local = True
            elif host.startswith(("192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.3")):
                is_local = True
                
            if is_local:
                backend_dir = os.path.dirname(__file__)
                for f in os.listdir(backend_dir):
                    if f.startswith("settings_") and f.endswith(".json"):
                        local_cid = f.replace("settings_", "").replace(".json", "")
                        if local_cid:
                            return local_cid
        except Exception:
            pass
    return None

# Helper to proxy requests to Supabase REST API
def supabase_req(method, path, json_data=None, params=None, company_id=None, use_central=False):
    target_url = SUPABASE_URL
    target_key = SUPABASE_KEY
    
    if company_id is None:
        company_id = active_company_id.get()
        
    if company_id and not use_central:
        settings = get_company_settings(company_id, use_central=True)
        custom_url = settings.get("supabase_url") or settings.get("supabaseUrl")
        custom_key = settings.get("supabase_key") or settings.get("supabaseKey")
        if custom_url and custom_key:
            target_url = custom_url.strip().rstrip("/")
            target_key = custom_key.strip()
            
    url = f"{target_url}/rest/v1/{path}"
    
    req_headers = {
        "apikey": target_key,
        "Authorization": f"Bearer {target_key}",
        "Content-Type": "application/json"
    }
    if method == "POST" and ("on_conflict" in path or (params and "on_conflict" in params)):
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

def supabase_get_all(path, params=None, company_id=None, use_central=False):
    all_data = []
    limit = 1000
    offset = 0
    
    # Extract base path and query parameters
    base_path = path
    query_params = ""
    if "?" in path:
        base_path, query_params = path.split("?", 1)
        
    target_url = SUPABASE_URL
    target_key = SUPABASE_KEY
    
    if company_id is None:
        company_id = active_company_id.get()
        
    if company_id and not use_central:
        settings = get_company_settings(company_id, use_central=True)
        custom_url = settings.get("supabase_url") or settings.get("supabaseUrl")
        custom_key = settings.get("supabase_key") or settings.get("supabaseKey")
        if custom_url and custom_key:
            target_url = custom_url.strip().rstrip("/")
            target_key = custom_key.strip()
            
    while True:
        url = f"{target_url}/rest/v1/{base_path}"
        
        req_headers = {
            "apikey": target_key,
            "Authorization": f"Bearer {target_key}",
            "Content-Type": "application/json",
            "Range": f"{offset}-{offset + limit - 1}"
        }
        
        req_params = params.copy() if params else {}
        # Parse query params
        if query_params:
            for pair in query_params.split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    req_params[k] = v
                    
        try:
            response = requests.request("GET", url, headers=req_headers, params=req_params)
            response.raise_for_status()
            chunk = response.json() if response.text else []
            if not chunk:
                break
            all_data.extend(chunk)
            if len(chunk) < limit:
                break
            offset += limit
        except Exception as e:
            print(f"Supabase paginated GET error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
            
    return all_data

# --- CRM / CUSTOMERS ENDPOINTS ---
@app.get("/api/customers")
def get_customers(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    return supabase_get_all(f"customers?select=*&company_id=eq.{company_id}&or=(source.neq.client_directory,source.is.null)")

@app.post("/api/customers")
def save_customer(customer: dict, request: Request):
    company_id = get_company_id(request)
    if company_id:
        customer["company_id"] = company_id
    return supabase_req("POST", "customers?on_conflict=id", json_data=customer)

@app.delete("/api/customers/{id}")
def delete_customer(id: str, request: Request):
    company_id = get_company_id(request)
    path = f"customers?id=eq.{id}"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("DELETE", path)

# --- DEDICATED CLIENT REGISTRY (MIJOZLAR BAZASI) ENDPOINTS ---
@app.get("/api/clients")
def get_clients(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    res = supabase_get_all(f"customers?select=*&company_id=eq.{company_id}&source=eq.client_directory&order=created_at.desc")
    for c in res:
        c["address"] = c.get("email") or ""
        op = c.get("operator") or ""
        c["barcode"] = c.get("phone2") or ""
        c["bonus"] = float(c.get("value") or 0)
        c["notes"] = ""
        c["operator"] = ""
        
        c["category"] = "ustalar"
        if op.startswith("{") and op.endswith("}"):
            try:
                meta = json.loads(op)
                c["operator"] = meta.get("op") or ""
                c["barcode"] = meta.get("barcode") or c.get("phone2") or ""
                c["bonus"] = float(meta.get("bonus") or c.get("value") or 0)
                c["debt"] = float(meta.get("debt") or 0)
                c["notes"] = meta.get("notes") or ""
                c["category"] = meta.get("category") or ("qurilish" if c.get("company") and c.get("company").strip() else "ustalar")
                c["bonus_history"] = meta.get("bonus_history") or []
            except Exception:
                c["notes"] = op
                c["category"] = "qurilish" if c.get("company") and c.get("company").strip() else "ustalar"
                c["bonus_history"] = []
        elif "__NOTE_SEP__" in op:
            parts = op.split("__NOTE_SEP__", 1)
            c["operator"] = parts[0]
            c["notes"] = parts[1]
            c["category"] = "qurilish" if c.get("company") and c.get("company").strip() else "ustalar"
            c["bonus_history"] = []
        elif " | " in op:
            parts = op.split(" | ", 1)
            c["operator"] = parts[0]
            c["notes"] = parts[1]
            c["category"] = "qurilish" if c.get("company") and c.get("company").strip() else "ustalar"
            c["bonus_history"] = []
        else:
            c["operator"] = op
            c["notes"] = ""
            c["category"] = "qurilish" if c.get("company") and c.get("company").strip() else "ustalar"
            c["bonus_history"] = []
    return res or []

@app.post("/api/clients")
def save_client(client_data: dict, request: Request):
    import time
    company_id = get_company_id(request)
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID talab qilinadi")
    
    address = client_data.get("address") or client_data.get("email") or ""
    notes = (client_data.get("notes") or "").strip()
    operator = (client_data.get("operator") or "").strip()
    barcode = (client_data.get("barcode") or client_data.get("phone2") or "").strip()
    bonus = float(client_data.get("bonus") or client_data.get("value") or 0)
    debt = float(client_data.get("debt") or 0)
    category = (client_data.get("category") or "").strip().lower()
    if category not in ["ustalar", "qurilish"]:
        category = "qurilish" if (client_data.get("company") or "").strip() else "ustalar"
    
    bonus_history = client_data.get("bonus_history")
    if not isinstance(bonus_history, list):
        bonus_history = []
    
    meta = {
        "op": operator,
        "barcode": barcode,
        "bonus": bonus,
        "debt": debt,
        "notes": notes,
        "category": category,
        "bonus_history": bonus_history
    }
    op_val = json.dumps(meta, ensure_ascii=False)

    payload = {
        "id": client_data.get("id") or f"client_{int(time.time() * 1000)}",
        "name": (client_data.get("name") or "").strip(),
        "company": (client_data.get("company") or "").strip(),
        "phone": (client_data.get("phone") or "").strip(),
        "phone2": barcode or (client_data.get("phone2") or "").strip(),
        "email": address,
        "operator": op_val,
        "status": "client",
        "source": "client_directory",
        "value": bonus,
        "company_id": company_id
    }
    if client_data.get("created_at"):
        payload["created_at"] = client_data["created_at"]
    return supabase_req("POST", "customers?on_conflict=id", json_data=payload, company_id=company_id)

@app.delete("/api/clients/{id}")
def delete_client(id: str, request: Request):
    company_id = get_company_id(request)
    path = f"customers?id=eq.{id}"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("DELETE", path, company_id=company_id)

# --- REGOS CARD BONUS SYNCHRONIZATION HELPERS ---
def sync_regos_card_bonus_helper(client_id: str = None, barcode: str = None, phone: str = None, company_id: str = None) -> float:
    try:
        customer_record = None
        if client_id:
            c_res = supabase_req("GET", f"customers?id=eq.{client_id}&select=*", company_id=company_id)
            if c_res and isinstance(c_res, list) and len(c_res) > 0:
                customer_record = c_res[0]
                if not company_id:
                    company_id = customer_record.get("company_id")
                if not barcode:
                    barcode = customer_record.get("phone2")
                if not phone:
                    phone = customer_record.get("phone")
                op_raw = customer_record.get("operator") or ""
                if not barcode and op_raw.startswith("{"):
                    try:
                        m = json.loads(op_raw)
                        barcode = m.get("barcode")
                    except Exception:
                        pass

        settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
        regos_endpoint = settings.get("regos_endpoint", "")
        regos_token = settings.get("regos_token", "")

        if not regos_endpoint or not regos_token:
            return None

        endpoint = regos_endpoint.strip().rstrip("/")
        if not endpoint.startswith(("http://", "https://")):
            endpoint = "https://" + endpoint
        if "/v1" not in endpoint:
            url = f"{endpoint}/v1/retailcard/get"
        else:
            url = f"{endpoint}/retailcard/get"

        regos_headers = {
            "Authorization": f"Bearer {regos_token}",
            "Content-Type": "application/json"
        }

        cards = []
        clean_bc = str(barcode or "").strip()
        if clean_bc:
            try:
                r = requests.post(url, headers=regos_headers, json={"barcode_value": clean_bc, "limit": 1}, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    if isinstance(data, dict) and data.get("ok"):
                        cards = data.get("result", [])
            except Exception as e_bc:
                print(f"Error querying REGOS with barcode {clean_bc}: {e_bc}")

        if not cards and phone:
            digits_phone = "".join(ch for ch in str(phone) if ch.isdigit())
            if len(digits_phone) >= 7:
                p_search = digits_phone[-9:]
                try:
                    r = requests.post(url, headers=regos_headers, json={"search": p_search, "limit": 5}, timeout=5)
                    if r.status_code == 200:
                        data = r.json()
                        if isinstance(data, dict) and data.get("ok"):
                            cards = data.get("result", [])
                except Exception as e_ph:
                    print(f"Error querying REGOS with phone {p_search}: {e_ph}")

        if not cards:
            return None

        matched_card = cards[0]
        bonus_amount = float(matched_card.get("bonus_amount") or 0.0)
        card_id = matched_card.get("id")

        target_client_id = client_id
        if not target_client_id and card_id:
            target_client_id = f"regos_card_{card_id}"

        if not customer_record and target_client_id:
            c_res = supabase_req("GET", f"customers?id=eq.{target_client_id}&select=*", company_id=company_id)
            if c_res and isinstance(c_res, list) and len(c_res) > 0:
                customer_record = c_res[0]

        if not customer_record and clean_bc:
            c_res = supabase_req("GET", f"customers?phone2=eq.{clean_bc}&select=*", company_id=company_id)
            if c_res and isinstance(c_res, list) and len(c_res) > 0:
                customer_record = c_res[0]
                target_client_id = customer_record.get("id")

        if target_client_id and customer_record:
            patch_payload = {
                "value": bonus_amount
            }
            op_data = {}
            op_raw = customer_record.get("operator") or ""
            if op_raw.startswith("{"):
                try:
                    op_data = json.loads(op_raw)
                except Exception:
                    op_data = {}
            op_data["bonus"] = bonus_amount
            cust_info = matched_card.get("customer") or {}
            if "debt" in cust_info:
                op_data["debt"] = float(cust_info.get("debt") or 0.0)
            patch_payload["operator"] = json.dumps(op_data, ensure_ascii=False)

            supabase_req("PATCH", f"customers?id=eq.{target_client_id}", json_data=patch_payload, company_id=company_id)
            print(f"Synced bonus for client {target_client_id}: {bonus_amount} so'm")

        return bonus_amount
    except Exception as e:
        print(f"Error in sync_regos_card_bonus_helper: {e}")
        return None

def sync_all_regos_cards_bonuses_helper(company_id: str = None):
    try:
        path = "customers?select=id,phone,phone2,operator&source=eq.client_directory"
        if company_id:
            path += f"&company_id=eq.{company_id}"
        clients = supabase_get_all(path, company_id=company_id)
        if not clients:
            return
        
        from concurrent.futures import ThreadPoolExecutor
        def sync_one(c):
            try:
                c_id = c.get("id")
                bc = c.get("phone2")
                op_raw = c.get("operator") or ""
                if not bc and op_raw.startswith("{"):
                    try:
                        bc = json.loads(op_raw).get("barcode")
                    except Exception:
                        pass
                sync_regos_card_bonus_helper(client_id=c_id, barcode=bc, phone=c.get("phone"), company_id=company_id)
            except Exception as e_c:
                print(f"Error syncing bonus for client {c.get('id')}: {e_c}")

        with ThreadPoolExecutor(max_workers=5) as executor:
            list(executor.map(sync_one, clients))
        print(f"Successfully synced bonuses for {len(clients)} clients for company {company_id}")
    except Exception as e:
        print(f"Error in sync_all_regos_cards_bonuses_helper: {e}")

# --- CLIENT RECEIPTS ENDPOINT ---
@app.get("/api/clients/{client_id}/receipts")
def get_client_receipts(
    client_id: str, 
    request: Request, 
    phone: str = None, 
    phone2: str = None, 
    barcode: str = None, 
    card_id: str = None
):
    import re
    
    # If phone or barcode not passed, try loading from customers table
    if not phone and not barcode and client_id:
        try:
            c_data = supabase_req("GET", f"customers?id=eq.{client_id}")
            if c_data and isinstance(c_data, list) and len(c_data) > 0:
                c_item = c_data[0]
                if not phone:
                    phone = c_item.get("phone")
                if not phone2:
                    phone2 = c_item.get("phone2")
                op_str = c_item.get("operator") or ""
                if op_str.startswith("{"):
                    try:
                        m = json.loads(op_str)
                        if not barcode:
                            barcode = m.get("barcode")
                    except Exception:
                        pass
        except Exception as e_c:
            print(f"Could not load customer record for receipts lookup: {e_c}")

    clean_p1 = re.sub(r'\D', '', str(phone or ''))
    p1_9 = clean_p1[-9:] if len(clean_p1) >= 9 else clean_p1
    
    clean_p2 = re.sub(r'\D', '', str(phone2 or ''))
    p2_9 = clean_p2[-9:] if len(clean_p2) >= 9 else clean_p2
    
    bc = str(barcode or '').strip()
    
    c_id = card_id
    if not c_id and client_id and client_id.startswith('regos_card_'):
        c_id = client_id.replace('regos_card_', '')

    collected = {}
    queries = []
    
    if p1_9:
        queries.append(f"receipts?select=*&items->>customer_phone=ilike.*{p1_9}*&order=created_at.desc&limit=500")
    if p2_9 and p2_9 != p1_9:
        queries.append(f"receipts?select=*&items->>customer_phone=ilike.*{p2_9}*&order=created_at.desc&limit=500")
    if bc:
        queries.append(f"receipts?select=*&items->>card_barcode=eq.{bc}&order=created_at.desc&limit=500")
        if len(bc) >= 9:
            bc_clean = re.sub(r'\D', '', bc)
            if bc_clean[-9:] != p1_9 and bc_clean[-9:] != p2_9:
                queries.append(f"receipts?select=*&items->>customer_phone=ilike.*{bc_clean[-9:]}*&order=created_at.desc&limit=500")
    if c_id:
        queries.append(f"receipts?select=*&items->>card_id=eq.{c_id}&order=created_at.desc&limit=500")
    if client_id:
        queries.append(f"receipts?select=*&items->>customer_id=eq.{client_id}&order=created_at.desc&limit=500")

    for q in queries:
        try:
            res = supabase_req("GET", q)
            if isinstance(res, list):
                for r in res:
                    if isinstance(r, dict) and "id" in r:
                        collected[r["id"]] = r
        except Exception as e:
            print(f"Error querying client receipts with {q}: {e}")

    receipts_list = list(collected.values())
    receipts_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Automatically synchronize live bonus from REGOS
    company_id = get_company_id(request)
    live_bonus = None
    try:
        live_bonus = sync_regos_card_bonus_helper(client_id=client_id, barcode=bc, phone=phone or phone2, company_id=company_id)
    except Exception as e_b:
        print(f"Bonus auto-sync error in get_client_receipts for {client_id}: {e_b}")

    return {"ok": True, "count": len(receipts_list), "receipts": receipts_list, "bonus": live_bonus}

@app.post("/api/clients/{client_id}/sync-bonus")
def sync_client_bonus(client_id: str, request: Request):
    company_id = get_company_id(request)
    live_bonus = sync_regos_card_bonus_helper(client_id=client_id, company_id=company_id)
    if live_bonus is not None:
        return {"ok": True, "bonus": live_bonus}
    return {"ok": False, "detail": "Bonusni yangilab bo'lmadi yoki REGOS API ulanmadi"}

@app.post("/api/integration/regos/sync-all-bonuses")
def sync_all_bonuses(request: Request, background_tasks: BackgroundTasks):
    company_id = get_company_id(request)
    background_tasks.add_task(sync_all_regos_cards_bonuses_helper, company_id)
    return {"ok": True, "message": "Bonuslarni sinxronlashtirish boshlandi"}

# --- REGOS RETAIL CARD SEARCH ENDPOINT ---
@app.get("/api/integration/regos/search-cards")
def search_regos_cards(query: str, request: Request):
    if not query or not query.strip():
        return {"ok": True, "count": 0, "result": []}
    
    clean_q = query.strip()
    company_id = get_company_id(request)
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        raise HTTPException(status_code=400, detail="REGOS API sozlanmagan. Iltimos, sozlamalar sahifasida Endpoint va Access Tokenni kiritib saqlang.")
        
    endpoint = regos_endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "https://" + endpoint
        
    if "/v1" not in endpoint:
        url = f"{endpoint}/v1/retailcard/get"
    else:
        url = f"{endpoint}/retailcard/get"
        
    headers = {
        "Authorization": f"Bearer {regos_token}",
        "Content-Type": "application/json"
    }
    
    cards = []
    # 1. Agar raqamlar bo'lsa, avval aniq barcode_value bo'yicha qidiramiz
    digits_only = "".join(ch for ch in clean_q if ch.isdigit())
    if len(digits_only) >= 5:
        try:
            r1 = requests.post(url, headers=headers, json={"barcode_value": digits_only, "limit": 20}, timeout=8)
            if r1.status_code == 200:
                data1 = r1.json()
                if isinstance(data1, dict) and data1.get("ok"):
                    cards = data1.get("result", [])
        except Exception as e1:
            print(f"Error querying REGOS barcode_value: {e1}")
            
    # 2. Agar topilmasa yoki matn bo'lsa, search parametri orqali qidiramiz
    if not cards:
        try:
            r2 = requests.post(url, headers=headers, json={"search": clean_q, "limit": 20}, timeout=8)
            if r2.status_code == 200:
                data2 = r2.json()
                if isinstance(data2, dict) and data2.get("ok"):
                    cards = data2.get("result", [])
        except Exception as e2:
            print(f"Error querying REGOS search parameter: {e2}")
            
    # 3. Mahalliy bazadagi mijozlar bilan solishtirib, allaqachon qo'shilganini aniqlash
    existing_barcodes = set()
    existing_ids = set()
    try:
        path = f"customers?select=id,phone,phone2,operator&company_id=eq.{company_id}&source=eq.client_directory"
        existing = supabase_get_all(path, company_id=company_id)
        for ex in existing:
            existing_ids.add(ex.get("id"))
            if ex.get("phone2"):
                existing_barcodes.add(str(ex.get("phone2")).strip())
            op_str = ex.get("operator") or ""
            if op_str.startswith("{"):
                try:
                    m = json.loads(op_str)
                    if m.get("barcode"):
                        existing_barcodes.add(str(m.get("barcode")).strip())
                except Exception:
                    pass
    except Exception as e_ex:
        print(f"Failed to fetch local clients for existence check: {e_ex}")
        
    formatted_results = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        card_id = card.get("id")
        barcode_val = str(card.get("barcode_value") or "").strip()
        cust = card.get("customer") or {}
        full_name = str(cust.get("full_name") or f"Mijoz #{card_id}").strip()
        main_phone = str(cust.get("main_phone") or "").strip()
        
        formatted_phone = main_phone
        if len(main_phone) == 12 and main_phone.startswith("998"):
            formatted_phone = f"+998 {main_phone[3:5]} {main_phone[5:8]} {main_phone[8:10]} {main_phone[10:12]}"
        elif len(main_phone) == 9:
            formatted_phone = f"+998 {main_phone[:2]} {main_phone[2:5]} {main_phone[5:7]} {main_phone[7:9]}"
        elif not formatted_phone and barcode_val:
            formatted_phone = barcode_val
            
        group_info = card.get("group") or {}
        group_name = group_info.get("name") if isinstance(group_info, dict) else ""
        
        is_added = (f"regos_card_{card_id}" in existing_ids) or (barcode_val and barcode_val in existing_barcodes)
        
        formatted_results.append({
            "id": f"regos_card_{card_id}",
            "regos_card_id": card_id,
            "barcode": barcode_val,
            "name": full_name,
            "phone": formatted_phone,
            "raw_phone": main_phone,
            "bonus": float(card.get("bonus_amount") or 0),
            "debt": float(cust.get("debt") or 0),
            "group": group_name,
            "address": cust.get("address") or "",
            "is_already_added": is_added
        })
        
    return {"ok": True, "count": len(formatted_results), "result": formatted_results}

# --- INVENTORY ENDPOINTS ---
@app.get("/api/inventory")
def get_inventory(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    return supabase_get_all(f"inventory?select=*&company_id=eq.{company_id}")

@app.get("/api/inventory/manual")
def get_manual_inventory(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    return supabase_get_all(f"inventory?select=*&company_id=eq.{company_id}&id=not.like.i_regos_*")

@app.get("/api/inventory/search")
def search_inventory(query: str, request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    if len(query) < 2:
        return []
    import urllib.parse
    encoded = urllib.parse.quote(query)
    return supabase_get_all(f"inventory?select=*&company_id=eq.{company_id}&id=like.i_regos_*&or=(name.ilike.*{encoded}*,sku.ilike.*{encoded}*)&limit=50")

@app.post("/api/inventory")
def save_product(product: dict, request: Request):
    company_id = get_company_id(request)
    if company_id:
        product["company_id"] = company_id
    return supabase_req("POST", "inventory?on_conflict=id", json_data=product)

@app.delete("/api/inventory/{id}")
def delete_product(id: str, request: Request):
    company_id = get_company_id(request)
    path = f"inventory?id=eq.{id}"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("DELETE", path)

# --- EMPLOYEES ENDPOINTS ---
def sync_regos_employees_helper(company_id: str = None):
    settings = get_company_settings(company_id) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        return {"status": "error", "message": "REGOS API sozlanmagan."}
        
    endpoint = regos_endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "https://" + endpoint
        
    url = f"{endpoint}/v1/user/get" if "/v1" not in endpoint else f"{endpoint}/user/get"
    headers = {
        "Authorization": f"Bearer {regos_token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, headers=headers, json={}, timeout=10)
        response.raise_for_status()
        resp_data = response.json()
        users_list = resp_data.get("result", [])
        
        if not isinstance(users_list, list):
            return {"status": "success", "message": "Foydalanuvchilar topilmadi", "synced_count": 0}
            
        # Fetch existing employees to preserve custom data (salary, kpi, role plan)
        try:
            path = "employees?select=*"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            existing_employees = supabase_get_all(path, company_id=company_id)
            existing_map = {e["id"]: e for e in existing_employees}
        except Exception as e_get:
            print(f"Failed to fetch existing employees: {e_get}")
            existing_map = {}
 
        synced_employees = []
        synced_ids = set()
        for u in users_list:
            if not isinstance(u, dict):
                continue
            
            group_name = u.get("user_group", {}).get("name") if isinstance(u.get("user_group"), dict) else ""
            if not group_name:
                continue
                
            group_lower = group_name.lower()
            if "sotuv" not in group_lower and "сотув" not in group_lower:
                continue
            
            u_id = f"regos_{u.get('id')}"
            synced_ids.add(u_id)
            full_name = u.get("full_name") or u.get("first_name") or u.get("login") or f"Xodim #{u.get('id')}"
            full_name = full_name.strip()
            
            role = group_name
            status = "active" if u.get("active") else "inactive"
            
            # Default values
            salary = 0
            kpi = 100
            
            # If already exists in DB, preserve customized fields
            if u_id in existing_map:
                existing = existing_map[u_id]
                salary = existing.get("salary", 0)
                kpi = existing.get("kpi", 100)
                role = existing.get("role", role)
            
            employee = {
                "id": u_id,
                "name": full_name,
                "role": role,
                "salary": salary,
                "kpi": kpi,
                "status": status,
                "login": u.get("login")
            }
            if company_id:
                employee["company_id"] = company_id
            synced_employees.append(employee)
            
        # Clean up only the orphaned REGOS employees (not all of them)
        for old_id in list(existing_map.keys()):
            if old_id.startswith("regos_") and old_id not in synced_ids:
                try:
                    del_path = f"employees?id=eq.{old_id}"
                    if company_id:
                        del_path += f"&company_id=eq.{company_id}"
                    supabase_req("DELETE", del_path, company_id=company_id)
                except Exception as e_del:
                    print(f"Failed to delete orphaned employee {old_id}: {e_del}")
            
        if synced_employees:
            supabase_req("POST", "employees?on_conflict=id", json_data=synced_employees, company_id=company_id)
            
        return {
            "status": "success", 
            "message": f"REGOS'dan {len(synced_employees)} ta xodim muvaffaqiyatli yuklandi.",
            "synced_count": len(synced_employees)
        }
    except Exception as e:
        print(f"Failed to sync employees from REGOS: {e}")
        return {"status": "error", "message": f"REGOS'dan xodimlarni yuklashda xatolik: {str(e)}"}

@app.post("/api/integration/regos/sync-employees")
def sync_regos_employees(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi topilmadi.")
    
    settings = get_company_settings(company_id)
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    if not regos_endpoint or not regos_token:
        raise HTTPException(status_code=400, detail="REGOS API sozlanmagan. Sozlamalardan Endpoint va Access Tokenni kiritib saqlang.")
        
    res = sync_regos_employees_helper(company_id)
    if res["status"] == "error":
        raise HTTPException(status_code=500, detail=res["message"])
    return res

CACHE_FILE = "sales_report_cache.json"

def load_sales_report_cache():
    import os
    import json
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                raw_cache = json.load(f)
                cache = {}
                for k, v in raw_cache.items():
                    try:
                        parts = k.split(",")
                        tuple_key = (int(parts[0]), int(parts[1]))
                        cache[tuple_key] = v
                    except Exception:
                        pass
                return cache
        except Exception as e:
            print(f"Failed to load sales report cache: {e}")
    return {}

def save_sales_report_cache(cache):
    import json
    try:
        serializable = {f"{k[0]},{k[1]}": v for k, v in cache.items()}
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Failed to save sales report cache: {e}")

sales_report_cache = load_sales_report_cache()

@app.get("/api/integration/regos/sales-report")
def get_regos_sales_report(request: Request, start_date: int = None, end_date: int = None):
    import base64
    import gzip
    
    company_id = get_company_id(request)
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        raise HTTPException(status_code=400, detail="REGOS API sozlanmagan. Iltimos, sozlamalar sahifasida Endpoint va Access Tokenni kiritib saqlang.")
        
    endpoint = regos_endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "https://" + endpoint
        
    local_tz = timezone(timedelta(hours=5))
    now_local = datetime.now(local_tz)
    
    if start_date is None or end_date is None:
        start_of_day = datetime(now_local.year, now_local.month, now_local.day, 0, 0, 0, tzinfo=local_tz)
        end_of_day = datetime(now_local.year, now_local.month, now_local.day, 23, 59, 59, tzinfo=local_tz)
        start_date = int(start_of_day.timestamp())
        end_date = int(end_of_day.timestamp())
        
    # Check cache
    cache_key = (start_date, end_date)
    now_time = time.time()
    if cache_key in sales_report_cache:
        cached_entry = sales_report_cache[cache_key]
        if now_time - cached_entry["timestamp"] < 300: # 5 minutes cache
            print(f"Returning cached sales report for key {cache_key}")
            return cached_entry["data"]

    headers = {
        "Authorization": f"Bearer {regos_token}",
        "Content-Type": "application/json"
    }
    
    req_payload = {
        "start_date": start_date,
        "end_date": end_date,
        "firm_id": 1,
        "currency_id": 1,
        "report_type": 1, # RetailSale
        "grouping": 1, # ByEmployees
        "cost_type": 1 # AVG
    }
    
    req_url = f"{endpoint}/v1/reportrequest/report0021" if "/v1" not in endpoint else f"{endpoint}/reportrequest/report0021"
    
    try:
        res = requests.post(req_url, headers=headers, json=req_payload, timeout=15)
        res.raise_for_status()
        res_data = res.json()
        if not res_data.get("ok"):
            error_desc = res_data.get("result", {}).get("description", "Noma'lum xatolik")
            raise Exception(f"REGOS hisoboti navbatga qo'shilmadi: {error_desc}")
            
        uuid = res_data.get("result", {}).get("new_uuid")
        if not uuid:
            raise Exception("Qaytgan javobda UUID topilmadi.")
            
        status_url = f"{endpoint}/v1/report/getrequest" if "/v1" not in endpoint else f"{endpoint}/report/getrequest"
        prep_url = f"{endpoint}/v1/report/getprepared" if "/v1" not in endpoint else f"{endpoint}/report/getprepared"
        
        ready = False
        for attempt in range(12):
            time.sleep(1)
            status_res = requests.post(status_url, headers=headers, json={}, timeout=10)
            if status_res.status_code == 200:
                results = status_res.json().get("result", [])
                matched = None
                for r in results:
                    if r.get("uuid") == uuid:
                        matched = r
                        break
                
                if not matched:
                    prep_list_res = requests.post(prep_url, headers=headers, json={}, timeout=10)
                    if prep_list_res.status_code == 200:
                        prep_results = prep_list_res.json().get("result", [])
                        for pr in prep_results:
                            if pr.get("request_uuid") == uuid:
                                ready = True
                                break
                    if ready:
                        break
                else:
                    status = matched.get("status")
                    if status == 1:
                        ready = True
                        break
                    elif status == 2:
                        warnings = matched.get("warnings", "Hisobot xatolik bilan yakunlandi.")
                        raise Exception(f"Hisobot xatosi: {warnings}")
            else:
                print(f"Status check failed on attempt {attempt+1}: {status_res.text}")
                
        if not ready:
            raise Exception("Hisobot tayyor bo'lishi kutilgan vaqtdan oshib ketdi.")
            
        prep_payload = {
            "request_uuid": uuid,
            "include_data": True
        }
        prep_res = requests.post(prep_url, headers=headers, json=prep_payload, timeout=15)
        prep_res.raise_for_status()
        prep_data = prep_res.json()
        
        results = prep_data.get("result", [])
        if not results:
            raise Exception("Hisobot natijasi bo'sh.")
            
        first_res = results[0]
        data_b64 = first_res.get("data")
        if not data_b64:
            raise Exception("Hisobot ma'lumotlari mavjud emas.")
            
        decoded_bytes = base64.b64decode(data_b64)
        if decoded_bytes.startswith(b'\x1f\x8b'):
            decompressed = gzip.decompress(decoded_bytes)
            report_items = json.loads(decompressed.decode("utf-8"))
        else:
            report_items = json.loads(decoded_bytes.decode("utf-8"))
            
        total_sales = 0
        total_profit = 0
        employee_sales = {}
        
        firm_items = [i for i in report_items if str(i.get("id")).startswith("f_")]
        firm_ids = set(f.get("id") for f in firm_items)
        if not firm_ids:
            firm_ids = {"f_1"}
            
        for item in report_items:
            p_id = item.get("parent_id")
            if p_id in firm_ids or (p_id and str(p_id).startswith("f_")):
                login = item.get("name")
                total_info = item.get("total", {})
                
                emp_sales = float(total_info.get("price_amount", 0))
                emp_profit = float(total_info.get("gross_profit", 0))
                
                employee_sales[login] = {
                    "login": login,
                    "name": login,
                    "sales": emp_sales,
                    "profit": emp_profit
                }
                
        try:
            users_url = f"{endpoint}/v1/user/get" if "/v1" not in endpoint else f"{endpoint}/user/get"
            users_res = requests.post(users_url, headers=headers, json={}, timeout=5)
            if users_res.status_code == 200:
                users_list = users_res.json().get("result", [])
                for u in users_list:
                    u_login = u.get("login")
                    if u_login in employee_sales:
                        full_name = u.get("full_name") or u.get("first_name") or u_login
                        employee_sales[u_login]["name"] = full_name
        except Exception as ue:
            print(f"Failed to enrich user names: {ue}")
            
        for f_item in firm_items:
            f_total = f_item.get("total", {})
            total_sales += float(f_total.get("price_amount", 0))
            total_profit += float(f_total.get("gross_profit", 0))
            
        if total_sales == 0:
            total_sales = sum(emp["sales"] for emp in employee_sales.values())
            total_profit = sum(emp["profit"] for emp in employee_sales.values())
            
        result_data = {
            "status": "success",
            "total_sales": total_sales,
            "total_profit": total_profit,
            "employee_sales": employee_sales
        }
        
        # Save to cache
        sales_report_cache[cache_key] = {
            "timestamp": now_time,
            "data": result_data
        }
        save_sales_report_cache(sales_report_cache)
        return result_data
        
    except Exception as e:
        print(f"Sales report generation error: {e}")
        # Fallback to expired cache if available
        if cache_key in sales_report_cache:
            print(f"Failed to fetch report, returning expired cache fallback for key {cache_key}")
            return sales_report_cache[cache_key]["data"]
        raise HTTPException(status_code=500, detail=f"REGOS hisobotini olishda xatolik: {str(e)}")

@app.get("/api/integration/regos/warehouses")
def get_regos_warehouses(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    settings = get_company_settings(company_id, bypass_cache=True)
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    # Try calling REGOS API
    if regos_endpoint and regos_token:
        try:
            endpoint = regos_endpoint.strip().rstrip("/")
            if not endpoint.startswith(("http://", "https://")):
                endpoint = "https://" + endpoint
            
            headers = {
                "Authorization": f"Bearer {regos_token}",
                "Content-Type": "application/json"
            }
            
            # 1. Try Stock/Get (Warehouse/Sklad list)
            try:
                url_stock = f"{endpoint}/v1/Stock/Get" if "/v1" not in endpoint else f"{endpoint}/Stock/Get"
                res = requests.post(url_stock, headers=headers, json={}, timeout=5)
                if res.status_code == 200:
                    data = res.json()
                    stocks = []
                    if isinstance(data, list):
                        stocks = data
                    elif isinstance(data, dict):
                        stocks = data.get("result") or data.get("data") or data.get("items") or []
                    if stocks and isinstance(stocks, list):
                        return [{"id": s.get("id") or s.get("code"), "name": s.get("name") or s.get("title")} for s in stocks if isinstance(s, dict)]
            except Exception as e_stock:
                print(f"Failed to fetch from Stock/Get: {e_stock}")

            # 2. Fallback to /shop/get
            url = f"{endpoint}/v1/shop/get" if "/v1" not in endpoint else f"{endpoint}/shop/get"
            res = requests.post(url, headers=headers, json={}, timeout=5)
            if res.status_code == 200:
                data = res.json()
                shops = []
                if isinstance(data, list):
                    shops = data
                elif isinstance(data, dict):
                    for k in ["shops", "result", "data", "list", "shops_list"]:
                        if k in data and isinstance(data[k], list):
                            shops = data[k]
                            break
                    else:
                        if "result" in data and isinstance(data["result"], list):
                            shops = data["result"]
                if shops:
                    return [{"id": s.get("id") or s.get("code"), "name": s.get("name") or s.get("title")} for s in shops if isinstance(s, dict)]
        except Exception as e:
            print(f"Failed to fetch warehouses/shops from REGOS API: {e}")
            
    # Mock/fallback data
    return [
        {"id": "regos_1", "name": "Asosiy ombor (Chilonzor)"},
        {"id": "regos_2", "name": "Yunusobod filiali"},
        {"id": "regos_3", "name": "Sergeli ombori"},
        {"id": "regos_4", "name": "Qo'yliq filiali"}
    ]

@app.get("/api/employees")
def get_employees(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    try:
        sync_regos_employees_helper(company_id=company_id)
    except Exception as e:
        print(f"Soft sync employees failed on GET: {e}")
    return supabase_get_all(f"employees?select=*&company_id=eq.{company_id}")

@app.post("/api/employees")
def save_employee(employee: dict, request: Request):
    company_id = get_company_id(request)
    
    # Check for unique login across employees table
    login = employee.get("login")
    if login:
        login_val = login.strip()
        if login_val:
            query = f"employees?login=eq.{login_val}"
            emp_id = employee.get("id")
            if emp_id:
                query += f"&id=neq.{emp_id}"
            try:
                # Query central database directly to check unique login globally
                existing_login = supabase_req("GET", query, use_central=True)
                if existing_login and isinstance(existing_login, list) and len(existing_login) > 0:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Tizimda '{login_val}' logini allaqachon band. Iltimos, boshqa kirish logini tanlang!"
                    )
            except HTTPException as he:
                raise he
            except Exception:
                pass

    if company_id:
        settings = get_company_settings(company_id)
        max_employees = int(settings.get("max_employees", 100))
        
        emp_id = employee.get("id")
        is_update = False
        if emp_id:
            try:
                existing = supabase_req("GET", f"employees?id=eq.{emp_id}&company_id=eq.{company_id}")
                if existing and isinstance(existing, list) and len(existing) > 0:
                    is_update = True
            except Exception:
                pass
                
        if not is_update:
            try:
                existing_count_res = supabase_req("GET", f"employees?company_id=eq.{company_id}&select=id")
                existing_count = len(existing_count_res) if isinstance(existing_count_res, list) else 0
                if existing_count >= max_employees:
                    raise HTTPException(status_code=400, detail=f"Kompaniyangiz uchun xodimlar limiti ({max_employees} ta) to'lgan. Limitni oshirish uchun platforma administratoriga murojaat qiling.")
            except HTTPException as he:
                raise he
            except Exception:
                pass
                
        employee["company_id"] = company_id
    return supabase_req("POST", "employees?on_conflict=id", json_data=employee)

@app.delete("/api/employees/{id}")
def delete_employee(id: str, request: Request):
    company_id = get_company_id(request)
    path = f"employees?id=eq.{id}"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("DELETE", path)

# --- TRANSACTIONS ENDPOINTS ---
@app.get("/api/transactions")
def get_transactions(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    return supabase_get_all(f"transactions?select=*&company_id=eq.{company_id}")

@app.post("/api/transactions")
def save_transaction(tx: dict, request: Request):
    company_id = get_company_id(request)
    if company_id:
        tx["company_id"] = company_id
    return supabase_req("POST", "transactions?on_conflict=id", json_data=tx)

@app.delete("/api/transactions/{id}")
def delete_transaction(id: str, request: Request):
    company_id = get_company_id(request)
    path = f"transactions?id=eq.{id}"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("DELETE", path)

# --- CALLS HISTORY ENDPOINTS ---
@app.get("/api/calls")
def get_calls(request: Request, status: str = None, duration: int = None):
    company_id = get_company_id(request)
    if not company_id:
        return []
    select_query = f"calls?select=*&company_id=eq.{company_id}"
    if status and duration is not None:
        select_query = f"calls?select=*&company_id=eq.{company_id}&status=in.({status})&duration=eq.{duration}"
    return supabase_get_all(select_query)

@app.post("/api/calls")
def save_call(call: dict, request: Request):
    company_id = get_company_id(request)
    if company_id:
        call["company_id"] = company_id
    return supabase_req("POST", "calls?on_conflict=id", json_data=call)


# --- TELEPHONY EVENT HANDLER ENDPOINT (MicroSIP Bridge) ---
class CallEvent(BaseModel):
    event: str
    phone: str

@app.post("/api/calls/event")
def handle_call_event(payload: CallEvent, request: Request):
    event = payload.event
    phone = payload.phone
    company_id = get_company_id(request)
    
    print(f"Received call event: {event} for phone: {phone} (Company: {company_id})")
    
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
            path = "customers?select=id,phone"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            customers = supabase_req("GET", path)
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
                if company_id:
                    new_customer["company_id"] = company_id
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
        if company_id:
            call_payload["company_id"] = company_id
        supabase_req("POST", "calls?on_conflict=id", json_data=call_payload)
        return {"status": "success", "message": f"Created call {call_id}"}
        
    elif event == "start":
        # Find active ringing call
        path = f"calls?select=*&phone=eq.{clean_phone}&status=eq.ringing"
        if company_id:
            path += f"&company_id=eq.{company_id}"
        path += "&order=id.desc&limit=1"
        active_calls = supabase_req("GET", path)
        if active_calls:
            call = active_calls[0]
            patch_path = f"calls?id=eq.{call['id']}"
            if company_id:
                patch_path += f"&company_id=eq.{company_id}"
            supabase_req("PATCH", patch_path, json_data={"status": "answered"})
            return {"status": "success", "message": f"Call answered: {call['id']}"}
        return {"status": "error", "message": f"No active ringing call found for {clean_phone}"}
        
    elif event == "end":
        # Find active call (ringing or answered)
        path = f"calls?select=*&phone=eq.{clean_phone}&status=in.(ringing,answered)"
        if company_id:
            path += f"&company_id=eq.{company_id}"
        path += "&order=id.desc&limit=1"
        active_calls = supabase_req("GET", path)
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
                
            patch_path = f"calls?id=eq.{call['id']}"
            if company_id:
                patch_path += f"&company_id=eq.{company_id}"
            supabase_req("PATCH", patch_path, json_data={"duration": duration, "status": final_status})
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
    
    company_id = get_company_id(request)
    customer_id = None
    if is_incoming and clean_phone and clean_phone != "unknown":
        try:
            path = "customers?select=id,phone"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            customers = supabase_req("GET", path)
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
                if company_id:
                    new_customer["company_id"] = company_id
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
        if company_id:
            call_payload["company_id"] = company_id
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
        if company_id:
            call_payload["company_id"] = company_id
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

_settings_cache = {}

def get_company_settings(company_id: str, use_central: bool = False, bypass_cache: bool = False):
    if not company_id:
        return {
            "company_name": "", "currency": "UZS",
            "sip_server": "", "sip_user": "", "sip_password": "", "sip_wss": "",
            "telegram_token": "", "instagram_token": "", "ai_provider": "local",
            "telephony_provider": "sarkor", "gemini_api_key": "", "openai_api_key": "",
            "groq_api_key": "", "ai_auto_reply": False, "regos_endpoint": "", "regos_token": "",
            "amocrm_subdomain": "", "amocrm_token": "",
            "supabase_url": "", "supabase_key": "",
            "max_employees": 100,
            "enable_crm": True,
            "enable_warehouse": True,
            "enable_kassa": True,
            "amocrm_operators_map": {},
            "roles": ["POS Kassa", "Menejer", "Kassir", "Kuryer", "Operator", "Sotuvchi"]
        }
    if company_id in _settings_cache and not use_central and not bypass_cache:
        return _settings_cache[company_id]
        
    default_keys = {
        "company_name": "", "currency": "UZS",
        "sip_server": "", "sip_user": "", "sip_password": "", "sip_wss": "",
        "telegram_token": "", "instagram_token": "", "ai_provider": "local",
        "telephony_provider": "sarkor", "gemini_api_key": "", "openai_api_key": "",
        "groq_api_key": "", "ai_auto_reply": False, "regos_endpoint": "", "regos_token": "",
        "amocrm_subdomain": "", "amocrm_token": "",
        "supabase_url": "", "supabase_key": "",
        "max_employees": 100,
        "enable_crm": True,
        "enable_warehouse": True,
        "enable_kassa": True,
        "amocrm_operators_map": {},
        "roles": ["POS Kassa", "Menejer", "Kassir", "Kuryer", "Operator", "Sotuvchi"],
        "taplink_desc": "", "taplink_web": "", "taplink_telegram": "",
        "taplink_instagram": "", "taplink_youtube": "", "taplink_whatsapp": "",
        "taplink_phone": "", "taplink_slogan": "", "taplink_logo": "/assets/logo.png"
    }
    
    # 1. Try loading from Supabase database
    try:
        res = supabase_req("GET", f"receipts?id=eq.settings_{company_id}&select=items", use_central=True)
        if res and isinstance(res, list) and len(res) > 0:
            db_settings = res[0].get("items")
            if db_settings and isinstance(db_settings, dict):
                for k, v in default_keys.items():
                    if k not in db_settings:
                        db_settings[k] = v
                if not use_central:
                    _settings_cache[company_id] = db_settings
                return db_settings
    except Exception as e:
        print(f"Failed to load settings for {company_id} from Supabase: {e}")
        
    # 2. Local fallback
    local_file = os.path.join(os.path.dirname(__file__), f"settings_{company_id}.json")
    if os.path.exists(local_file):
        try:
            with open(local_file, "r") as f:
                data = json.load(f)
                for k, v in default_keys.items():
                    if k not in data:
                        data[k] = v
                if not use_central:
                    _settings_cache[company_id] = data
                return data
        except Exception:
            pass
            
    # Try global fallback just in case
    global_file = os.path.join(os.path.dirname(__file__), "settings.json")
    if os.path.exists(global_file):
        try:
            with open(global_file, "r") as f:
                data = json.load(f)
                for k, v in default_keys.items():
                    if k not in data:
                        data[k] = v
                if not use_central:
                    _settings_cache[company_id] = data
                return data
        except Exception:
            pass
            
    return default_keys

def save_company_settings(company_id: str, settings: dict):
    if not company_id:
        return
    _settings_cache[company_id] = settings
    
    # 1. Save locally
    local_file = os.path.join(os.path.dirname(__file__), f"settings_{company_id}.json")
    try:
        with open(local_file, "w") as f:
            json.dump(settings, f, indent=4)
    except Exception as e:
        print(f"Failed to save settings for {company_id} locally: {e}")
        
    # 2. Save to Supabase (Always central to preserve credentials mapping!)
    try:
        payload = {
            "id": f"settings_{company_id}",
            "company_id": company_id,
            "items": settings,
            "total_amount": 0,
            "discount": 0,
            "cashier_name": "System",
            "code": "SETTINGS"
        }
        supabase_req("POST", "receipts?on_conflict=id", json_data=payload, use_central=True)
    except Exception as e:
        print(f"Failed to save settings for {company_id} to Supabase: {e}")

# Global settings state (fallback)
settings_state = get_company_settings("")
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

def get_all_companies_settings():
    try:
        res = supabase_req("GET", "receipts?select=id,items&id=like.settings_*")
        if res and isinstance(res, list):
            return {r["id"].replace("settings_", ""): r["items"] for r in res if r.get("items") and isinstance(r.get("items"), dict)}
    except Exception as e:
        print(f"Failed to load all company settings for polling: {e}")
    return {}

async def process_telegram_update(update, company_id=None):
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
            if company_id:
                new_customer["company_id"] = company_id
            await loop.run_in_executor(
                None,
                lambda: supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
            )
            print(f"Auto-created Telegram customer for company {company_id}: {customer_id} ({name})")
            
        new_msg = {
            "customer_id": customer_id,
            "sender": "customer",
            "platform": "telegram",
            "text": text
        }
        if company_id:
            new_msg["company_id"] = company_id
        await loop.run_in_executor(
            None,
            lambda: supabase_req("POST", "messages", json_data=new_msg)
        )
        print(f"Stored Telegram message for company {company_id} from {customer_id}: {text}")
        
        # Trigger AI auto reply if enabled
        settings = get_company_settings(company_id) if company_id else settings_state
        if settings.get("ai_auto_reply"):
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
                lambda: trigger_ai_auto_reply(customer_id, "telegram", cust_name, text, company_id=company_id)
            )
        
    except Exception as e:
        print(f"Failed to process Telegram message: {e}")

async def telegram_polling_loop():
    print("Telegram multi-tenant polling task started.")
    last_update_ids = {}
    
    while True:
        try:
            comp_settings = get_all_companies_settings()
            active_tokens = {}
            for cid, settings in comp_settings.items():
                token = settings.get("telegram_token", "")
                if token:
                    active_tokens[cid] = token
            
            if not active_tokens:
                await asyncio.sleep(5)
                continue
                
            for cid, token in active_tokens.items():
                last_update_id = last_update_ids.get(token, 0)
                url = f"https://api.telegram.org/bot{token}/getUpdates"
                params = {"offset": last_update_id + 1, "timeout": 2}
                
                try:
                    loop = asyncio.get_event_loop()
                    response = await loop.run_in_executor(
                        None, 
                        lambda: requests.get(url, params=params, timeout=5)
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get("ok"):
                            updates = data.get("result", [])
                            for update in updates:
                                last_update_id = max(last_update_id, update.get("update_id", 0))
                                last_update_ids[token] = last_update_id
                                await process_telegram_update(update, company_id=cid)
                    elif response.status_code == 401:
                        pass
                except Exception:
                    pass
            
            await asyncio.sleep(1)
        except Exception as loop_err:
            print(f"Error in telegram multi-polling loop: {loop_err}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    global tg_polling_task
    tg_polling_task = asyncio.create_task(telegram_polling_loop())
    print("Telegram Polling task spawned in startup.")

@app.get("/api/companies")
def get_companies():
    try:
        # Load all companies from Supabase
        return supabase_req("GET", "companies?select=*&order=created_at.desc")
    except Exception as e:
        print(f"Failed to fetch companies: {e}")
        return []

@app.post("/api/companies/register")
def register_company(payload: dict):
    company_id = payload.get("company_id")
    company_name = payload.get("company_name")
    admin_name = payload.get("admin_name")
    admin_login = payload.get("admin_login")
    admin_password = payload.get("admin_password")
    
    if not all([company_id, company_name, admin_name, admin_login, admin_password]):
        raise HTTPException(status_code=400, detail="Barcha maydonlarni to'ldirish majburiy.")
    
    # Clean company_id (alphanumeric only)
    company_id = "".join(c for c in company_id if c.isalnum()).lower()
    if not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi yaroqsiz.")
        
    try:
        # Check if company already exists
        exists = supabase_req("GET", f"companies?id=eq.{company_id}")
        if exists:
            raise HTTPException(status_code=400, detail="Ushbu kompaniya kodi allaqachon ro'yxatdan o'tgan.")
    except HTTPException as he:
        if he.status_code == 400:
            raise he
        pass
        
    # 1. Save company
    company_payload = {
        "id": company_id,
        "name": company_name,
        "status": "active"
    }
    supabase_req("POST", "companies", json_data=company_payload)
    
    # 2. Save Admin Employee
    employee_payload = {
        "id": f"emp_{company_id}_admin",
        "company_id": company_id,
        "name": f"{admin_name} (Admin)",
        "role": "admin",
        "login": admin_login,
        "password": admin_password,
        "status": "active"
    }
    supabase_req("POST", "employees", json_data=employee_payload)
    
    # 3. Create default settings
    default_settings = {
        "telegram_token": "", "instagram_token": "", "ai_provider": "local",
        "telephony_provider": "sarkor", "gemini_api_key": "", "openai_api_key": "",
        "groq_api_key": "", "ai_auto_reply": False, "regos_endpoint": "", "regos_token": "",
        "amocrm_subdomain": "", "amocrm_token": ""
    }
    save_company_settings(company_id, default_settings)
    
    return {"status": "success", "message": "Kompaniya muvaffaqiyatli ro'yxatdan o'tkazildi."}

@app.post("/api/companies/toggle")
def toggle_company(payload: dict):
    company_id = payload.get("company_id")
    status = payload.get("status")
    if not company_id or status not in ["active", "disabled"]:
        raise HTTPException(status_code=400, detail="Noto'g'ri so'rov parametrlari.")
        
    update_payload = {"status": status}
    supabase_req("PATCH", f"companies?id=eq.{company_id}", json_data=update_payload, use_central=True)
    
    # Update status in local cache immediately
    _company_status_cache[company_id] = status
    
    return {"status": "success", "message": f"Kompaniya holati {status} ga o'zgartirildi."}

@app.get("/api/companies/{company_id}/details")
def get_company_details(company_id: str):
    company_id = "".join(c for c in company_id if c.isalnum()).lower()
    try:
        # 1. Fetch company info
        comp_list = supabase_req("GET", f"companies?id=eq.{company_id}")
        if not comp_list:
            raise HTTPException(status_code=404, detail="Kompaniya topilmadi.")
        company = comp_list[0]
        
        # 2. Fetch admin employee info
        emps = supabase_req("GET", f"employees?company_id=eq.{company_id}&role=eq.admin")
        admin = emps[0] if emps else None
        
        # 3. Fetch settings
        settings = get_company_settings(company_id)
        
        # 4. Fetch counts
        def get_count(table):
            try:
                res = supabase_req("GET", f"{table}?company_id=eq.{company_id}&select=id")
                return len(res) if isinstance(res, list) else 0
            except Exception:
                return 0
                
        cust_count = get_count("customers")
        prod_count = get_count("inventory")
        emp_count = get_count("employees")
        trans_count = get_count("transactions")
        call_count = get_count("calls")
        msg_count = get_count("messages")
        
        # For receipts, filter out settings
        receipts = []
        try:
            res = supabase_req("GET", f"receipts?company_id=eq.{company_id}&id=not.like.settings_*&select=total_amount")
            if isinstance(res, list):
                receipts = res
        except Exception:
            pass
            
        receipt_count = len(receipts)
        total_sales = sum(float(r.get("total_amount") or 0) for r in receipts)
        
        return {
            "company": company,
            "admin": {
                "name": admin.get("name") if admin else "Noma'lum",
                "login": admin.get("login") if admin else "Noma'lum",
                "password": admin.get("password") if admin else "Noma'lum"
            } if admin else None,
            "stats": {
                "customers": cust_count,
                "products": prod_count,
                "employees": emp_count,
                "transactions": trans_count,
                "calls": call_count,
                "messages": msg_count,
                "receipts": receipt_count,
                "total_sales": total_sales
            },
            "settings": settings
        }
    except Exception as e:
        print(f"Error fetching company details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/companies/{company_id}/settings")
def update_company_admin_settings(company_id: str, payload: dict):
    company_id = "".join(c for c in company_id if c.isalnum()).lower()
    if not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi xato.")
        
    company_settings = get_company_settings(company_id)
    company_settings["max_employees"] = int(payload.get("max_employees", 100))
    company_settings["enable_crm"] = bool(payload.get("enable_crm", True))
    company_settings["enable_warehouse"] = bool(payload.get("enable_warehouse", True))
    company_settings["enable_kassa"] = bool(payload.get("enable_kassa", True))
    company_settings["supabase_url"] = payload.get("supabase_url", "")
    company_settings["supabase_key"] = payload.get("supabase_key", "")
    
    save_company_settings(company_id, company_settings)
    return {"status": "success", "settings": company_settings}

@app.get("/api/public/taplink/{company_id}")
def get_public_taplink_settings(company_id: str):
    settings = get_company_settings(company_id)
    return {
        "company_name": settings.get("company_name", ""),
        "taplink_desc": settings.get("taplink_desc", ""),
        "taplink_web": settings.get("taplink_web", ""),
        "taplink_telegram": settings.get("taplink_telegram", ""),
        "taplink_instagram": settings.get("taplink_instagram", ""),
        "taplink_youtube": settings.get("taplink_youtube", ""),
        "taplink_whatsapp": settings.get("taplink_whatsapp", ""),
        "taplink_phone": settings.get("taplink_phone", ""),
        "taplink_slogan": settings.get("taplink_slogan", ""),
        "taplink_logo": settings.get("taplink_logo", "/assets/logo.png")
    }



@app.get("/api/settings")
def get_settings(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return {}
    return get_company_settings(company_id)

@app.post("/api/settings")
def update_settings(settings: dict, request: Request):
    company_id = get_company_id(request)
    if not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya ID topilmadi")
    
    company_settings = get_company_settings(company_id)
    company_settings["company_name"] = settings.get("company_name", "")
    company_settings["currency"] = settings.get("currency", "UZS")
    company_settings["sip_server"] = settings.get("sip_server", "")
    company_settings["sip_user"] = settings.get("sip_user", "")
    company_settings["sip_password"] = settings.get("sip_password", "")
    company_settings["sip_wss"] = settings.get("sip_wss", "")
    
    company_settings["telegram_token"] = settings.get("telegram_token", "")
    company_settings["instagram_token"] = settings.get("instagram_token", "")
    company_settings["ai_provider"] = settings.get("ai_provider", "local")
    company_settings["telephony_provider"] = settings.get("telephony_provider", "sarkor")
    company_settings["gemini_api_key"] = settings.get("gemini_api_key", "")
    company_settings["openai_api_key"] = settings.get("openai_api_key", "")
    company_settings["groq_api_key"] = settings.get("groq_api_key", "")
    company_settings["ai_auto_reply"] = settings.get("ai_auto_reply", False)
    company_settings["regos_endpoint"] = settings.get("regos_endpoint", "")
    company_settings["regos_token"] = settings.get("regos_token", "")
    company_settings["amocrm_subdomain"] = settings.get("amocrm_subdomain", "")
    company_settings["amocrm_token"] = settings.get("amocrm_token", "")
    company_settings["amocrm_lead_creation"] = settings.get("amocrm_lead_creation", False)
    company_settings["supabase_url"] = settings.get("supabase_url", "")
    company_settings["supabase_key"] = settings.get("supabase_key", "")
    company_settings["meta_access_token"] = settings.get("meta_access_token", "")
    company_settings["meta_ad_account_id"] = settings.get("meta_ad_account_id", "")
    if "roles" in settings:
        company_settings["roles"] = settings.get("roles")
    if "amocrm_operators_map" in settings:
        company_settings["amocrm_operators_map"] = settings.get("amocrm_operators_map", {})
        
    company_settings["taplink_desc"] = settings.get("taplink_desc", "")
    company_settings["taplink_web"] = settings.get("taplink_web", "")
    company_settings["taplink_telegram"] = settings.get("taplink_telegram", "")
    company_settings["taplink_instagram"] = settings.get("taplink_instagram", "")
    company_settings["taplink_youtube"] = settings.get("taplink_youtube", "")
    company_settings["taplink_whatsapp"] = settings.get("taplink_whatsapp", "")
    company_settings["taplink_phone"] = settings.get("taplink_phone", "")
    company_settings["taplink_slogan"] = settings.get("taplink_slogan", "")
    company_settings["taplink_logo"] = settings.get("taplink_logo", "/assets/logo.png")
    if "payout_telegram_chat_id" in settings:
        company_settings["payout_telegram_chat_id"] = str(settings.get("payout_telegram_chat_id", "")).strip()
    if "payout_telegram_bot_token" in settings:
        company_settings["payout_telegram_bot_token"] = str(settings.get("payout_telegram_bot_token", "")).strip()
        
    save_company_settings(company_id, company_settings)
    
    # Auto-register webhook for Telegram bot if token exists
    tg_token = company_settings.get("payout_telegram_bot_token") or company_settings.get("telegram_token")
    if tg_token:
        try:
            requests.post(
                f"https://api.telegram.org/bot{tg_token}/setWebhook",
                json={"url": "https://protech.up.railway.app/api/telegram/webhook"},
                timeout=5
            )
        except Exception:
            pass

    print(f"Settings for company {company_id} updated.")
    return {"status": "success", "settings": company_settings}

def call_gemini(prompt: str, system_instruction: str = None, settings: dict = None) -> str:
    active_settings = settings if settings is not None else settings_state
    api_key = active_settings.get("gemini_api_key", "")
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

# Bi-directional Uzbek transliteration maps for Latin <-> Cyrillic searches
CYRILLIC_TO_LATIN = {
    'А': 'A', 'а': 'a', 'Б': 'B', 'б': 'b', 'В': 'V', 'в': 'v',
    'Г': 'G', 'г': 'g', 'Д': 'D', 'д': 'd', 'Е': 'E', 'е': 'e',
    'Ё': 'Yo', 'ё': 'yo', 'Ж': 'J', 'ж': 'j', 'З': 'Z', 'з': 'z',
    'И': 'I', 'и': 'i', 'Й': 'Y', 'й': 'y', 'К': 'K', 'к': 'k',
    'Л': 'L', 'л': 'l', 'М': 'M', 'м': 'm', 'Н': 'N', 'н': 'n',
    'О': 'O', 'о': 'o', 'П': 'P', 'п': 'p', 'Р': 'R', 'р': 'r',
    'С': 'S', 'с': 's', 'Т': 'T', 'т': 't', 'У': 'U', 'у': 'u',
    'Ф': 'F', 'ф': 'f', 'Х': 'X', 'х': 'x', 'Ц': 'Ts', 'ц': 'ts',
    'Ч': 'Ch', 'ч': 'ch', 'Ш': 'Sh', 'ш': 'sh', 'Ъ': '', 'ъ': '',
    'Ы': 'I', 'ы': 'i', 'Э': 'E', 'э': 'e', 'Ю': 'Yu', 'ю': 'yu',
    'Я': 'Ya', 'я': 'ya', 'Ў': 'O', 'ў': 'o', 'Қ': 'Q', 'қ': 'q',
    'Ғ': 'G', 'ғ': 'g', 'Ҳ': 'H', 'ҳ': 'h'
}

LATIN_TO_CYRILLIC = {
    'sh': 'ш', 'ch': 'ч', 'yo': 'ё', 'yu': 'ю', 'ya': 'я', 'ts': 'ц',
    'o\'': 'ў', 'o`': 'ў', 'o’': 'ў', 'o‘': 'ў', 'g\'': 'ғ', 'g`': 'ғ', 'g’': 'ғ', 'g‘': 'ғ',
    'Sh': 'Ш', 'Ch': 'Ч', 'Yo': 'Ё', 'Yu': 'Ю', 'Ya': 'Я', 'Ts': 'Ц',
    'O\'': 'Ў', 'O`': 'Ў', 'O’': 'Ў', 'O‘': 'Ў', 'G\'': 'Ғ', 'G`': 'Ғ', 'G’': 'Ғ', 'G‘': 'Ғ',
    'A': 'А', 'a': 'а', 'B': 'Б', 'b': 'б', 'V': 'В', 'v': 'в',
    'G': 'Г', 'g': 'г', 'D': 'Д', 'd': 'д', 'E': 'Е', 'e': 'е',
    'J': 'Ж', 'j': 'ж', 'Z': 'З', 'z': 'з', 'I': 'И', 'i': 'и',
    'Y': 'Й', 'y': 'й', 'K': 'К', 'k': 'к', 'L': 'Л', 'l': 'л',
    'M': 'М', 'm': 'м', 'N': 'Н', 'n': 'н', 'O': 'О', 'o': 'о',
    'P': 'П', 'p': 'п', 'R': 'Р', 'r': 'р', 'S': 'С', 's': 'с',
    'T': 'Т', 't': 'т', 'U': 'У', 'u': 'у', 'F': 'Ф', 'f': 'ф',
    'X': 'Х', 'x': 'х', 'Q': 'Қ', 'q': 'қ', 'H': 'Ҳ', 'h': 'ҳ'
}

def to_latin(text: str) -> str:
    if not text:
        return ""
    res = []
    for char in text:
        res.append(CYRILLIC_TO_LATIN.get(char, char))
    return "".join(res)

def to_cyrillic(text: str) -> str:
    if not text:
        return ""
    temp = text
    for apo in ['’', '‘', '`', '´', '′']:
        temp = temp.replace(apo, "'")
    for lat, cyr in LATIN_TO_CYRILLIC.items():
        temp = temp.replace(lat, cyr)
    return temp

def normalize_uzbek(text: str) -> str:
    if not text:
        return ""
    text = text.lower().strip()
    
    # 1. Transliterate Cyrillic to Latin
    res = []
    for char in text:
        res.append(CYRILLIC_TO_LATIN.get(char, char))
    text = "".join(res)
    
    # 2. Normalize apostrophes and typical Uzbek characters
    for apo in ['’', '‘', '`', '´', '′', "'"]:
        text = text.replace(apo, "")
        
    return text

def generate_analyze_fallback(prompt: str, customers: list, inventory: list, total_income: float, total_expense: float, net_balance: float) -> str:
    prompt_lower = prompt.lower().strip()
    prompt_norm = normalize_uzbek(prompt)
    
    # Clean words in prompt for word-by-word matching
    prompt_words = [w.strip("?,.:!\"'()-") for w in prompt_norm.split()]
    
    # Excluded common words that should not trigger specific product matches
    exclusions = {
        "bor", "bormi", "yoq", "yo'q", "narx", "narxi", "narxlari", "qancha", "necha", "pul", "som", "so'm", 
        "ombor", "mahsulot", "tovar", "qoldiq", "stock", "inventory", "nechta", "tahlil", "yordamchi", "tizim",
        "moliya", "balans", "kirim", "chiqim", "daromad", "foyda", "xodim", "sotuv", "dona", "kabel", "yangi",
        "lead", "voronka", "status", "customer", "kontakt"
    }

    # 1. Search for specific product matches in inventory
    matched_products = []
    for p in inventory:
        p_name = p.get("name", "")
        p_name_norm = normalize_uzbek(p_name)
        p_sku = p.get("sku", "")
        p_sku_norm = normalize_uzbek(p_sku)
        
        # Check SKU match
        sku_match = p_sku_norm and p_sku_norm in prompt_norm
        
        # Check if the entire product name is in the prompt
        full_match = (len(p_name_norm) >= 3 and p_name_norm in prompt_norm)
        
        # Check word-by-word match with suffix-awareness (prefix/substring matching)
        word_match = False
        p_words = [w.strip("(),\"'.-") for w in p_name_norm.split()]
        for pw in p_words:
            if len(pw) >= 3 and pw not in exclusions:
                for prw in prompt_words:
                    if len(prw) >= 3 and prw not in exclusions:
                        if prw in pw or pw in prw:
                            word_match = True
                            break
                if word_match:
                    break
                    
        if sku_match or full_match or word_match:
            matched_products.append(p)
            
    # 2. Check if a category was queried
    matched_categories = set()
    for p in inventory:
        cat = p.get("category", "")
        if cat and len(cat) >= 3 and normalize_uzbek(cat) in prompt_norm:
            matched_categories.add(cat)
            
    # 3. Handle specific product results
    if matched_products:
        res_list = []
        for p in matched_products[:5]:
            stock = p.get("stock", 0)
            status = f"✅ Omborda bor ({stock} dona)" if stock > 0 else "❌ Omborda tugagan"
            price = p.get("price", 0)
            res_list.append(
                f"### 📦 **{p.get('name')}**\n"
                f"- 🏷️ **SKU:** `{p.get('sku')}`\n"
                f"- 💰 **Sotish narxi:** {price:,} so'm\n"
                f"- 📊 **Kategoriya:** {p.get('category')}\n"
                f"- 📈 **Holati:** {status}"
            )
        matched_str = "\n\n".join(res_list)
        if len(matched_products) > 5:
            matched_str += f"\n\n*Yana {len(matched_products) - 5} ta mos keladigan mahsulot topildi. Savolingizni aniqroq bering.*"
        return f"""🔍 **Qidirilgan Mahsulotlar (Lokal Dvigatel):**

{matched_str}

*Eslatma: Jonli ma'lumotlar ombordan qidirib ko'rsatildi.*"""

    # 4. Handle category results
    if matched_categories:
        cat_products = [p for p in inventory if p.get("category") in matched_categories]
        if cat_products:
            res_list = []
            for p in cat_products[:10]:
                stock = p.get("stock", 0)
                status = f"{stock} dona" if stock > 0 else "Tugagan ❌"
                res_list.append(f"- **{p.get('name')}** (SKU: `{p.get('sku')}`): Narxi: {p.get('price'):,} so'm | Qoldiq: {status}")
            cat_str = "\n".join(res_list)
            if len(cat_products) > 10:
                cat_str += f"\n- ... va yana {len(cat_products) - 10} ta mahsulot."
            return f"""📁 **Kategoriyadagi mahsulotlar ({', '.join(matched_categories)}) (Lokal Dvigatel):**

{cat_str}

*Eslatma: Ushbu toifadagi ma'lumotlar ombordan olindi.*"""

    # 5. Fallback to general financial, stock or customer reports
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
    msg_norm = normalize_uzbek(message_text)
    
    # Clean words in prompt for word-by-word matching
    msg_words = [w.strip("?,.:!\"'()-") for w in msg_norm.split()]
    
    exclusions = {
        "bor", "bormi", "yoq", "yo'q", "narx", "narxi", "narxlari", "qancha", "necha", "pul", "som", "so'm"
    }

    # 1. Specific product matching
    matched_product = None
    for p in inventory:
        p_name = p.get("name", "")
        p_name_norm = normalize_uzbek(p_name)
        p_sku = p.get("sku", "")
        p_sku_norm = normalize_uzbek(p_sku)
        
        # Check SKU match
        sku_match = p_sku_norm and p_sku_norm in msg_norm
        
        # Check if the entire product name is in the prompt
        full_match = (len(p_name_norm) >= 3 and p_name_norm in msg_norm)
        
        # Check word-by-word match with suffix-awareness (prefix/substring matching)
        word_match = False
        p_words = [w.strip("(),\"'.-") for w in p_name_norm.split()]
        for pw in p_words:
            if len(pw) >= 3 and pw not in exclusions:
                for mw in msg_words:
                    if len(mw) >= 3 and mw not in exclusions:
                        if mw in pw or pw in mw:
                            word_match = True
                            break
                if word_match:
                    break
                    
        if sku_match or full_match or word_match:
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

def call_ai_engine(prompt: str, system_instruction: str = None, company_id: str = None) -> str:
    settings = get_company_settings(company_id) if company_id else settings_state
    provider = settings.get("ai_provider", "local")
    if provider == "gemini":
        try:
            res = call_gemini(prompt, system_instruction, settings=settings)
            if "Gemini API bilan bog'lanishda xatolik" in res or "API Key kiritilmagan" in res or "bo'sh javob qaytdi" in res:
                return "FALLBACK"
            return res
        except Exception:
            return "FALLBACK"
    elif provider == "openai":
        try:
            res = call_openai(prompt, system_instruction, settings=settings)
            if res.startswith("ERROR:"):
                return "FALLBACK"
            return res
        except Exception:
            return "FALLBACK"
    elif provider == "groq":
        try:
            res = call_groq(prompt, system_instruction, settings=settings)
            if res.startswith("ERROR:"):
                return "FALLBACK"
            return res
        except Exception:
            return "FALLBACK"
    return "FALLBACK"

def trigger_ai_auto_reply(customer_id: str, platform: str, customer_name: str, message_text: str, company_id: str = None):
    settings = get_company_settings(company_id) if company_id else settings_state
    if not settings.get("ai_auto_reply"):
        return
        
    try:
        # 1. Fetch inventory context
        inv_path = "inventory?select=*"
        if company_id:
            inv_path += f"&company_id=eq.{company_id}"
        inventory = supabase_req("GET", inv_path)
        inv_list = []
        for p in inventory:
            status = "Sotuvda bor" if p.get("stock", 0) > 0 else "Tugagan (tez orada keladi)"
            inv_list.append(f"- {p.get('name')}: Narxi {p.get('price')} so'm, Holati: {status}")
        inv_context = "\n".join(inv_list)
        
        # 2. Fetch recent messages
        msg_path = f"messages?customer_id=eq.{customer_id}&order=created_at.asc"
        if company_id:
            msg_path += f"&company_id=eq.{company_id}"
        messages = supabase_req("GET", msg_path)
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

        reply_text = call_ai_engine(message_text, system_instruction, company_id=company_id)
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
        if company_id:
            new_msg["company_id"] = company_id
        supabase_req("POST", "messages", json_data=new_msg)
        print(f"[Auto-Pilot] Stored AI auto-reply for company {company_id} to {customer_id}: {reply_text}")
        
        # 4. Send the message via Telegram / Instagram API
        if platform == "telegram":
            chat_id = customer_id.replace("c_tg_", "")
            token = settings.get("telegram_token")
            if token:
                send_telegram_message(token, chat_id, reply_text)
        elif platform == "instagram":
            recipient_id = customer_id.replace("c_ig_", "")
            token = settings.get("instagram_token")
            if token:
                send_instagram_message(token, recipient_id, reply_text)
    except Exception as e:
        print(f"Error in trigger_ai_auto_reply: {e}")

class AIAnalyzePayload(BaseModel):
    prompt: str

@app.post("/api/ai/analyze")
def ai_analyze(payload: AIAnalyzePayload, request: Request):
    company_id = get_company_id(request)
    try:
        # Fetch CRM context
        cust_path = "customers?select=*"
        inv_path = "inventory?select=*"
        tx_path = "transactions?select=*"
        if company_id:
            cust_path += f"&company_id=eq.{company_id}"
            inv_path += f"&company_id=eq.{company_id}"
            tx_path += f"&company_id=eq.{company_id}"
            
        customers = supabase_req("GET", cust_path)
        inventory = supabase_req("GET", inv_path)
        transactions = supabase_req("GET", tx_path)
        
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

        ai_reply = call_ai_engine(payload.prompt, system_instruction, company_id=company_id)
        if ai_reply == "FALLBACK":
            ai_reply = generate_analyze_fallback(payload.prompt, customers, inventory, total_income, total_expense, net_balance)
            
        return {"response": ai_reply}
    except Exception as e:
        print(f"AI Analyze failed: {e}")
        try:
            cust_path = "customers?select=*"
            inv_path = "inventory?select=*"
            tx_path = "transactions?select=*"
            if company_id:
                cust_path += f"&company_id=eq.{company_id}"
                inv_path += f"&company_id=eq.{company_id}"
                tx_path += f"&company_id=eq.{company_id}"
            customers = supabase_req("GET", cust_path)
            inventory = supabase_req("GET", inv_path)
            transactions = supabase_req("GET", tx_path)
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
def ai_suggest(payload: AISuggestPayload, request: Request):
    company_id = get_company_id(request)
    try:
        # Fetch customer and messages
        msg_path = f"messages?customer_id=eq.{payload.customer_id}&order=created_at.asc"
        cust_path = f"customers?id=eq.{payload.customer_id}"
        inv_path = "inventory?select=*"
        if company_id:
            msg_path += f"&company_id=eq.{company_id}"
            cust_path += f"&company_id=eq.{company_id}"
            inv_path += f"&company_id=eq.{company_id}"
            
        messages = supabase_req("GET", msg_path)
        customer_res = supabase_req("GET", cust_path)
        
        customer_name = "Noma'lum"
        if customer_res:
            customer_name = customer_res[0].get("name", "Noma'lum")
            
        # Fetch inventory for product suggestions
        inventory = supabase_req("GET", inv_path)
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
        suggestion = call_ai_engine(prompt, system_instruction, company_id=company_id)
        
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
            inv_path = "inventory?select=*"
            if company_id:
                inv_path += f"&company_id=eq.{company_id}"
            inventory = supabase_req("GET", inv_path)
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
def get_chats(request: Request):
    company_id = get_company_id(request)
    try:
        msg_path = "messages?select=*&order=created_at.desc"
        if company_id:
            msg_path += f"&company_id=eq.{company_id}"
        messages = supabase_req("GET", msg_path)
    except Exception as e:
        print(f"Failed to fetch messages for chats list: {e}")
        return []
        
    last_messages = {}
    for msg in messages:
        c_id = msg.get("customer_id")
        if c_id not in last_messages:
            last_messages[c_id] = msg
            
    try:
        cust_path = "customers?select=*"
        if company_id:
            cust_path += f"&company_id=eq.{company_id}"
        customers = supabase_req("GET", cust_path)
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
def get_messages(customer_id: str, request: Request):
    company_id = get_company_id(request)
    path = f"messages?customer_id=eq.{customer_id}&order=created_at.asc"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("GET", path)

class MessagePayload(BaseModel):
    customer_id: str
    sender: str
    platform: str
    text: str

@app.post("/api/messages")
def send_and_save_message(payload: MessagePayload, request: Request):
    company_id = get_company_id(request)
    new_msg = {
        "customer_id": payload.customer_id,
        "sender": payload.sender,
        "platform": payload.platform,
        "text": payload.text
    }
    if company_id:
        new_msg["company_id"] = company_id
    
    saved_msg = supabase_req("POST", "messages", json_data=new_msg)
    
    if payload.sender == "agent":
        settings = get_company_settings(company_id) if company_id else settings_state
        if payload.platform == "telegram":
            chat_id = payload.customer_id.replace("c_tg_", "")
            token = settings.get("telegram_token")
            if token:
                send_telegram_message(token, chat_id, payload.text)
        elif payload.platform == "instagram":
            recipient_id = payload.customer_id.replace("c_ig_", "")
            token = settings.get("instagram_token")
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
def handle_instagram_webhook(body: dict, request: Request):
    try:
        company_id = get_company_id(request)
        print(f"Received Instagram Webhook: {json.dumps(body)} (Company: {company_id})")
        
        if body.get("object") == "instagram":
            for entry in body.get("entry", []):
                for messaging_event in entry.get("messaging", []):
                    sender = messaging_event.get("sender", {})
                    sender_id = sender.get("id")
                    message = messaging_event.get("message", {})
                    text = message.get("text")
                    
                    if sender_id and text:
                        customer_id = f"c_ig_{sender_id}"
                        
                        path = f"customers?id=eq.{customer_id}"
                        if company_id:
                            path += f"&company_id=eq.{company_id}"
                        res = supabase_req("GET", path)
                        if not res:
                            new_customer = {
                                "id": customer_id,
                                "name": f"Instagram User {sender_id}",
                                "phone": f"instagram://user?id={sender_id}",
                                "source": "instagram",
                                "status": "lead",
                                "value": 0
                            }
                            if company_id:
                                new_customer["company_id"] = company_id
                            supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
                            print(f"Auto-created Instagram customer: {customer_id}")
                            
                        new_msg = {
                            "customer_id": customer_id,
                            "sender": "customer",
                            "platform": "instagram",
                            "text": text
                        }
                        if company_id:
                            new_msg["company_id"] = company_id
                        supabase_req("POST", "messages", json_data=new_msg)
                        print(f"Stored Instagram message from {customer_id}: {text}")
                        
                        # Trigger AI auto reply if enabled
                        settings = get_company_settings(company_id) if company_id else settings_state
                        if settings.get("ai_auto_reply"):
                            cust_name = f"Instagram User {sender_id}"
                            try:
                                path_cust = f"customers?id=eq.{customer_id}"
                                if company_id:
                                    path_cust += f"&company_id=eq.{company_id}"
                                cust_res = supabase_req("GET", path_cust)
                                if cust_res:
                                    cust_name = cust_res[0].get("name", cust_name)
                            except Exception:
                                pass
                                
                            import threading
                            threading.Thread(target=trigger_ai_auto_reply, args=(customer_id, "instagram", cust_name, text, company_id)).start()
                        
        return {"status": "success"}
    except Exception as e:
        print(f"Error handling Instagram Webhook: {e}")
        return {"status": "error", "message": str(e)}

    return {"status": "error", "message": "Unknown event"}

# --- CHATS SIMULATOR TEST ENDPOINTS ---

@app.post("/api/test/simulate-telegram")
def simulate_telegram_message(payload: dict, request: Request):
    chat_id = payload.get("chat_id")
    text = payload.get("text")
    name = payload.get("name", f"Telegram User {chat_id}")
    company_id = get_company_id(request)
    
    if not chat_id or not text:
        raise HTTPException(status_code=400, detail="chat_id and text are required")
        
    customer_id = f"c_tg_{chat_id}"
    try:
        path = f"customers?id=eq.{customer_id}"
        if company_id:
            path += f"&company_id=eq.{company_id}"
        res = supabase_req("GET", path)
        if not res:
            new_customer = {
                "id": customer_id,
                "name": name,
                "phone": f"tg://user?id={chat_id}",
                "source": "telegram",
                "status": "lead",
                "value": 0
            }
            if company_id:
                new_customer["company_id"] = company_id
            supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
            print(f"[Simulator] Auto-created Telegram customer: {customer_id} ({name})")
            
        new_msg = {
            "customer_id": customer_id,
            "sender": "customer",
            "platform": "telegram",
            "text": text
        }
        if company_id:
            new_msg["company_id"] = company_id
        supabase_req("POST", "messages", json_data=new_msg)
        print(f"[Simulator] Stored Telegram message: {text}")
        return {"status": "success", "message": "Telegram message simulated successfully"}
    except Exception as e:
        print(f"Failed to simulate Telegram message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test/simulate-instagram")
def simulate_instagram_message(payload: dict, request: Request):
    sender_id = payload.get("sender_id")
    text = payload.get("text")
    name = payload.get("name", f"Instagram User {sender_id}")
    company_id = get_company_id(request)
    
    if not sender_id or not text:
        raise HTTPException(status_code=400, detail="sender_id and text are required")
        
    customer_id = f"c_ig_{sender_id}"
    try:
        path = f"customers?id=eq.{customer_id}"
        if company_id:
            path += f"&company_id=eq.{company_id}"
        res = supabase_req("GET", path)
        if not res:
            new_customer = {
                "id": customer_id,
                "name": name,
                "phone": f"instagram://user?id={sender_id}",
                "source": "instagram",
                "status": "lead",
                "value": 0
            }
            if company_id:
                new_customer["company_id"] = company_id
            supabase_req("POST", "customers?on_conflict=id", json_data=new_customer)
            print(f"[Simulator] Auto-created Instagram customer: {customer_id} ({name})")
            
        new_msg = {
            "customer_id": customer_id,
            "sender": "customer",
            "platform": "instagram",
            "text": text
        }
        if company_id:
            new_msg["company_id"] = company_id
        supabase_req("POST", "messages", json_data=new_msg)
        print(f"[Simulator] Stored Instagram message: {text}")
        return {"status": "success", "message": "Instagram message simulated successfully"}
    except Exception as e:
        print(f"Failed to simulate Instagram message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/integration/regos/sync")
def sync_regos_inventory(request: Request):
    company_id = get_company_id(request)
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi aniqlanmadi.")
    return sync_regos_inventory_helper(company_id)

def sync_regos_inventory_helper(company_id: str = None):
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
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
    limit = 1000
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
        
    # 1. Fetch existing products from Supabase to check for SKU conflicts
    existing_products = []
    try:
        path = "inventory?select=id,sku"
        if company_id:
            path += f"&company_id=eq.{company_id}"
        existing_products = supabase_req("GET", path)
    except Exception as e:
        print(f"Failed to fetch existing products for SKU checks: {e}")
        
    sku_to_id = {}
    for p in existing_products:
        p_sku = p.get("sku")
        p_id = p.get("id")
        if p_sku:
            sku_to_id[p_sku.upper()] = p_id

    # 2. Iterate through all_items and build processed_products list
    processed_products = []
    seen_skus_in_payload = set()

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
            
        # Resolve SKU conflicts locally
        final_sku = sku
        sku_upper = final_sku.upper()
        if (sku_upper in sku_to_id and sku_to_id[sku_upper] != product_id) or (sku_upper in seen_skus_in_payload):
            final_sku = f"{sku}-{regos_id}"
            sku_upper = final_sku.upper()
            if (sku_upper in sku_to_id and sku_to_id[sku_upper] != product_id) or (sku_upper in seen_skus_in_payload):
                final_sku = f"{sku}-dup-{regos_id}"
                sku_upper = final_sku.upper()
                
        seen_skus_in_payload.add(sku_upper)
        sku_to_id[sku_upper] = product_id
        
        product_payload = {
            "id": product_id,
            "name": name,
            "sku": final_sku,
            "price": price,
            "stock": stock,
            "category": category
        }
        if company_id:
            product_payload["company_id"] = company_id
        processed_products.append(product_payload)
        
    # 3. Bulk upsert in chunks of 500
    sync_count = 0
    chunk_size = 500
    for i in range(0, len(processed_products), chunk_size):
        chunk = processed_products[i:i + chunk_size]
        try:
            supabase_req("POST", "inventory?on_conflict=id", json_data=chunk)
            sync_count += len(chunk)
            print(f"Successfully synced chunk {i // chunk_size + 1} ({len(chunk)} items)")
        except Exception as ex:
            print(f"Bulk upsert failed for chunk starting at index {i}: {ex}. Falling back to single inserts...")
            for product_payload in chunk:
                try:
                    supabase_req("POST", "inventory?on_conflict=id", json_data=product_payload)
                    sync_count += 1
                except Exception as single_ex:
                    print(f"Fallback insert failed for {product_payload['id']}: {single_ex}")
                
    return {"status": "success", "count": sync_count}

def fetch_and_save_regos_receipt(cheque_uuid: str, company_id: str = None):
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        print("REGOS API is not configured. Cannot fetch receipt details.")
        return
        
    endpoint = regos_endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "https://" + endpoint
        
    if "/v1" not in endpoint:
        pos_url = f"{endpoint}/v1/pos/doccheque/get"
        cloud_url = f"{endpoint}/v1/doccheque/get"
    else:
        pos_url = f"{endpoint}/pos/doccheque/get"
        cloud_url = f"{endpoint}/doccheque/get"
        
    headers = {
        "Authorization": f"Bearer {regos_token}",
        "Content-Type": "application/json"
    }
    
    cheque = None
    # 1. Try POS url first (has full rows and payments if cashier session is occupied)
    try:
        payload = {"uuid": cheque_uuid}
        print(f"Fetching receipt {cheque_uuid} from REGOS POS API: {pos_url}...")
        response = requests.post(pos_url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            resp_data = response.json()
            if isinstance(resp_data, dict) and not resp_data.get("ok") and resp_data.get("result", {}).get("error") == 5054:
                print("POS cash register is offline/not occupied (error 5054). Will fallback to Cloud API.")
            else:
                if isinstance(resp_data, list) and len(resp_data) > 0:
                    cheque = resp_data[0]
                elif isinstance(resp_data, dict):
                    if "result" in resp_data and isinstance(resp_data["result"], list) and len(resp_data["result"]) > 0:
                        cheque = resp_data["result"][0]
                    elif "cheque" in resp_data:
                        cheque = resp_data["cheque"]
                    elif "doccheque" in resp_data:
                        cheque = resp_data["doccheque"]
                    else:
                        cheque = resp_data
    except Exception as e:
        print(f"Failed to fetch REGOS receipt {cheque_uuid} from POS API: {e}")
 
    # 2. If POS failed or register is logged out, fall back to Cloud url
    if not cheque:
        try:
            now_ts = int(time.time())
            start_ts = now_ts - (30 * 24 * 3600) # 30 days range
            payload = {
                "uuid": cheque_uuid,
                "start_date": start_ts,
                "end_date": now_ts
            }
            print(f"Fetching receipt {cheque_uuid} from REGOS Cloud API: {cloud_url}...")
            response = requests.post(cloud_url, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                resp_data = response.json()
                if isinstance(resp_data, list) and len(resp_data) > 0:
                    cheque = resp_data[0]
                elif isinstance(resp_data, dict):
                    if "result" in resp_data and isinstance(resp_data["result"], list) and len(resp_data["result"]) > 0:
                        cheque = resp_data["result"][0]
                    elif "cheque" in resp_data:
                        cheque = resp_data["cheque"]
                    elif "doccheque" in resp_data:
                        cheque = resp_data["doccheque"]
                    else:
                        cheque = resp_data
        except Exception as e:
            print(f"Failed to fetch REGOS receipt {cheque_uuid} from Cloud API fallback: {e}")
 
    if cheque and isinstance(cheque, dict):
        save_parsed_receipt(cheque, company_id)
    else:
        print(f"Could not retrieve receipt data for {cheque_uuid} from either POS or Cloud APIs.")

def save_parsed_receipt(cheque: dict, company_id: str = None):
    try:
        c_uuid = cheque.get("uuid") or cheque.get("id")
        if not c_uuid:
            c_uuid = f"rec_{int(time.time() * 1000)}"
            
        c_code = cheque.get("code") or cheque.get("number") or cheque.get("receipt_no") or f"CH-{c_uuid[:8]}"
        c_date = cheque.get("date") or cheque.get("created_at")
        
        c_time_str = None
        if c_date:
            try:
                ts = float(c_date)
                if ts > 1e11: # ms
                    ts = ts / 1000.0
                c_time_str = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            except Exception:
                c_time_str = str(c_date)
        if not c_time_str:
            c_time_str = datetime.now(timezone.utc).isoformat()
            
        cashier = cheque.get("cashier")
        cashier_name = ""
        if isinstance(cashier, dict):
            cashier_name = cashier.get("name") or cashier.get("username") or ""
        else:
            cashier_name = cheque.get("cashier_name") or cheque.get("seller_name") or str(cashier or "")
        if not cashier_name:
            cashier_name = "Noma'lum kassa xodimi"
            
        total_amount = cheque.get("sum") or cheque.get("total_amount") or cheque.get("total") or 0.0
        discount = cheque.get("discount") or cheque.get("discount_sum") or 0.0
        
        payments = cheque.get("payments") or cheque.get("payment_type") or cheque.get("pay_type") or "cash"
        payment_type = "Naqd"
        if isinstance(payments, list):
            types = []
            for p in payments:
                if isinstance(p, dict):
                    t = p.get("type") or p.get("name") or p.get("payment_type") or "cash"
                    types.append(str(t))
                else:
                    types.append(str(p))
            payment_type = ", ".join(types) if types else "Naqd"
        elif isinstance(payments, dict):
            payment_type = payments.get("type") or payments.get("name") or "Naqd"
        else:
            payment_type = str(payments)
            
        pay_lower = payment_type.lower()
        if "cash" in pay_lower or "naqd" in pay_lower:
            payment_type = "Naqd"
        elif "card" in pay_lower or "karta" in pay_lower or "terminal" in pay_lower:
            payment_type = "Karta"
        elif "click" in pay_lower or "payme" in pay_lower or "apelsin" in pay_lower or "uzum" in pay_lower:
            payment_type = "Elektron"
            
        rows = cheque.get("rows") or cheque.get("items") or cheque.get("goods") or []
        if not rows and c_uuid:
            try:
                settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
                regos_endpoint = settings.get("regos_endpoint", "")
                regos_token = settings.get("regos_token", "")
                if regos_endpoint and regos_token:
                    endpoint = regos_endpoint.strip().rstrip("/")
                    if not endpoint.startswith(("http://", "https://")):
                        endpoint = "https://" + endpoint
                    if "/v1" not in endpoint:
                        ops_url = f"{endpoint}/v1/docchequeoperation/get"
                    else:
                        ops_url = f"{endpoint}/docchequeoperation/get"
                    
                    regos_headers = {
                        "Authorization": f"Bearer {regos_token}",
                        "Content-Type": "application/json"
                    }
                    ops_payload = {"doc_sale_uuid": c_uuid}
                    ops_resp = requests.post(ops_url, headers=regos_headers, json=ops_payload, timeout=5)
                    if ops_resp.status_code == 200:
                        ops_data = ops_resp.json()
                        ops_list = ops_data.get("result")
                        if isinstance(ops_list, list):
                            rows = ops_list
            except Exception as e_ops:
                print(f"Failed to fetch operations/items for receipt {c_uuid} in save_parsed_receipt: {e_ops}")
        items_list = []
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict):
                    row_item = row.get("item")
                    row_name = ""
                    row_sku = ""
                    if isinstance(row_item, dict):
                        row_name = row_item.get("name") or ""
                        row_sku = row_item.get("code") or row_item.get("articul") or ""
                    else:
                        row_name = row.get("name") or row.get("item_name") or ""
                        row_sku = row.get("sku") or row.get("code") or row.get("articul") or ""
                        
                    row_qty = row.get("quantity") or row.get("qty") or 1
                    row_price = row.get("price") or 0
                    row_total = row.get("sum") or row.get("total") or (row_qty * row_price)
                    
                    items_list.append({
                        "name": row_name,
                        "sku": row_sku,
                        "quantity": int(row_qty),
                        "price": float(row_price),
                        "total": float(row_total)
                    })
                    
        card = cheque.get("card")
        cust_name = ""
        cust_phone = ""
        card_barcode = ""
        card_id = None
        if isinstance(card, dict):
            card_id = card.get("id")
            card_barcode = str(card.get("barcode_value") or card.get("barcode") or "").strip()
            customer = card.get("customer")
            if isinstance(customer, dict):
                cust_name = (customer.get("full_name") or "").strip()
                cust_phone = (customer.get("main_phone") or "").strip()

        seller = cheque.get("seller")
        seller_name = ""
        if isinstance(seller, dict):
            seller_name = seller.get("full_name") or seller.get("name") or seller.get("username") or ""
        elif isinstance(seller, str):
            seller_name = seller
        if not seller_name:
            seller_name = cheque.get("seller_name") or ""

        items_payload = {
            "customer_name": cust_name,
            "customer_phone": cust_phone,
            "card_barcode": card_barcode,
            "card_id": card_id,
            "seller_name": seller_name,
            "products": items_list,
            "status": cheque.get("status") or "Closed"
        }

        # Check if the receipt already exists to preserve local custom attributes like delivery
        existing_items = None
        try:
            path = f"receipts?select=items&id=eq.{c_uuid}"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            res = supabase_req("GET", path)
            if res and isinstance(res, list) and len(res) > 0:
                existing_items = res[0].get("items")
        except Exception as e_exist:
            print(f"Failed to check existing receipt {c_uuid} to preserve local attributes: {e_exist}")

        if existing_items:
            import json
            if isinstance(existing_items, str):
                try:
                    existing_items = json.loads(existing_items)
                except Exception:
                    existing_items = {}
            if isinstance(existing_items, dict):
                # Preserve local custom keys (like delivery)
                for key, val in existing_items.items():
                    if key not in ["customer_name", "customer_phone", "seller_name", "products", "status", "card_barcode", "card_id"]:
                        items_payload[key] = val

        receipt_payload = {
            "id": c_uuid,
            "code": c_code,
            "cashier_name": cashier_name,
            "total_amount": float(total_amount),
            "discount": float(discount),
            "payment_type": payment_type,
            "items": items_payload,
            "created_at": c_time_str
        }
        if company_id:
            receipt_payload["company_id"] = company_id
        
        supabase_req("POST", "receipts?on_conflict=id", json_data=receipt_payload)
        print(f"Successfully saved receipt {c_code} (UUID: {c_uuid}) to database (preserved local attributes).")

        # Automatically update REGOS retail card bonus in customer directory
        if card_barcode or card_id or cust_phone:
            import threading
            target_cid = f"regos_card_{card_id}" if card_id else None
            threading.Thread(
                target=sync_regos_card_bonus_helper,
                args=(target_cid, card_barcode, cust_phone, company_id)
            ).start()
    except Exception as ex:
        print(f"Error parsing/saving receipt data: {ex}")

# Global state for tracking REGOS synchronization progress
sync_progress = {"running": False, "processed": 0, "total": 0, "message": ""}

def run_sync_in_background(days: int = None, sync_date: str = None, company_id: str = None):
    global sync_progress
    if sync_progress["running"]:
        print("Sync is already running. Skipping.")
        return
        
    sync_progress["running"] = True
    sync_progress["processed"] = 0
    sync_progress["total"] = 0
    sync_progress["message"] = "REGOS API-dan cheklar ro'yxati olinmoqda..."
    
    try:
        settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
        regos_endpoint = settings.get("regos_endpoint", "")
        regos_token = settings.get("regos_token", "")
        
        if not regos_endpoint or not regos_token:
            sync_progress["running"] = False
            sync_progress["message"] = "Xatolik: REGOS API sozlanmagan."
            return
            
        endpoint = regos_endpoint.strip().rstrip("/")
        if not endpoint.startswith(("http://", "https://")):
            endpoint = "https://" + endpoint
            
        if "/v1" not in endpoint:
            cloud_url = f"{endpoint}/v1/doccheque/get"
            pos_url = f"{endpoint}/v1/pos/doccheque/get"
        else:
            cloud_url = f"{endpoint}/doccheque/get"
            pos_url = f"{endpoint}/pos/doccheque/get"
            
        regos_headers = {
            "Authorization": f"Bearer {regos_token}",
            "Content-Type": "application/json"
        }
        
        now_ts = int(time.time())
        cheques_list = []
        
        if sync_date:
            local_tz = timezone(timedelta(hours=5))
            dt = datetime.strptime(sync_date, "%Y-%m-%d")
            start_of_day = datetime(dt.year, dt.month, dt.day, 0, 0, 0, tzinfo=local_tz)
            end_of_day = datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=local_tz)
            start_ts = int(start_of_day.timestamp())
            end_ts = int(end_of_day.timestamp())
            
            payload = {
                "start_date": start_ts,
                "end_date": end_ts,
                "statuses": ["Closed"]
            }
            
            sync_progress["message"] = f"Cheklar ro'yxati olinmoqda: {sync_date} kuni uchun..."
            print(f"Background Sync: fetching specific date {sync_date}")
            try:
                response = requests.post(cloud_url, headers=regos_headers, json=payload, timeout=30)
                if response.status_code == 200:
                    resp_data = response.json()
                    if isinstance(resp_data, dict) and not resp_data.get("ok"):
                        print(f"REGOS Cloud API returned error: {resp_data.get('result')}")
                    else:
                        chunk_cheques = []
                        if isinstance(resp_data, list):
                            chunk_cheques = resp_data
                        elif isinstance(resp_data, dict):
                            for key in ["result", "cheques", "data", "list"]:
                                if key in resp_data and isinstance(resp_data[key], list):
                                    chunk_cheques = resp_data[key]
                                    break
                            else:
                                for val in resp_data.values():
                                    if isinstance(val, list):
                                        chunk_cheques = val
                                        break
                        cheques_list.extend(chunk_cheques)
                else:
                    print(f"Failed to fetch {sync_date} from cloud API (status: {response.status_code})")
            except Exception as e_specific:
                print(f"Exception during fetching specific date: {e_specific}")
        else:
            # 1. Fetch closed receipts from the cloud in sequential chunks
            chunk_days = 30
            chunks_count = (days + chunk_days - 1) // chunk_days
            
            days_remaining = days
            i = 0
            while days_remaining > 0:
                current_chunk_days = min(chunk_days, days_remaining)
                start_ts = now_ts - ((i * chunk_days + current_chunk_days) * 24 * 3600)
                end_ts = now_ts - (i * chunk_days * 24 * 3600)
                
                payload = {
                    "start_date": start_ts,
                    "end_date": end_ts,
                    "statuses": ["Closed"]
                }
                
                start_date_str = datetime.fromtimestamp(start_ts).strftime('%Y-%m-%d')
                end_date_str = datetime.fromtimestamp(end_ts).strftime('%Y-%m-%d')
                sync_progress["message"] = f"Cheklar ro'yxati olinmoqda: {start_date_str} dan {end_date_str} gacha ({i+1}/{chunks_count} qism)..."
                print(f"Background Sync: fetching chunk {i+1}/{chunks_count} ({start_date_str} to {end_date_str})")
                
                try:
                    response = requests.post(cloud_url, headers=regos_headers, json=payload, timeout=30)
                    if response.status_code == 200:
                        resp_data = response.json()
                        if isinstance(resp_data, dict) and not resp_data.get("ok"):
                            print(f"REGOS Cloud API returned error for chunk {i+1}: {resp_data.get('result')}")
                            days_remaining -= current_chunk_days
                            i += 1
                            continue
                            
                        chunk_cheques = []
                        if isinstance(resp_data, list):
                            chunk_cheques = resp_data
                        elif isinstance(resp_data, dict):
                            for key in ["result", "cheques", "data", "list"]:
                                if key in resp_data and isinstance(resp_data[key], list):
                                    chunk_cheques = resp_data[key]
                                    break
                            else:
                                for val in resp_data.values():
                                    if isinstance(val, list):
                                        chunk_cheques = val
                                        break
                        
                        cheques_list.extend(chunk_cheques)
                        print(f"Background Sync: chunk {i+1} returned {len(chunk_cheques)} cheques. Total list size: {len(cheques_list)}")
                    else:
                        print(f"Failed to fetch chunk {i+1} from cloud API (status: {response.status_code})")
                except Exception as e_chunk:
                    print(f"Exception during fetching chunk {i+1}: {e_chunk}")
                    
                days_remaining -= current_chunk_days
                i += 1
                    
        if not cheques_list:
            sync_progress["running"] = False
            sync_progress["message"] = "Yangi cheklar topilmadi."
            return
            
        sync_progress["total"] = len(cheques_list)
        sync_progress["message"] = f"Jami {len(cheques_list)} ta chek topildi. Mavjud cheklar tekshirilmoqda..."
        
        # 2. Query Supabase for existing IDs in the entire time range to avoid duplicates
        print("Background Sync: Fetching existing receipt IDs in synced range...")
        if sync_date:
            start_range_ts = start_ts
            end_range_ts = end_ts
        else:
            start_range_ts = now_ts - (days * 24 * 3600)
            end_range_ts = now_ts
            
        start_iso = datetime.fromtimestamp(start_range_ts, tz=timezone.utc).isoformat().replace("+", "%2B")
        end_iso = datetime.fromtimestamp(end_range_ts, tz=timezone.utc).isoformat().replace("+", "%2B")
        
        existing_receipts = {}  # id -> is_new_format (bool)
        try:
            path = f"receipts?select=id,items&created_at=gte.{start_iso}&created_at=lte.{end_iso}"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            chunk = supabase_get_all(path, company_id=company_id)
            for r in chunk:
                if isinstance(r, dict) and "id" in r:
                    items_val = r.get("items")
                    is_new = False
                    if isinstance(items_val, dict) and "products" in items_val and "seller_name" in items_val:
                        is_new = True
                    existing_receipts[r["id"]] = is_new
        except Exception as e:
            print(f"Background Sync: Error fetching existing IDs: {e}")
                
        print(f"Background Sync: Found {len(existing_receipts)} existing receipts in DB for the range. Filtering duplicates...")
        
        # 3. Check if POS terminal is online
        pos_online = True
        try:
            test_payload = {"uuid": "test-pos-online-connection"}
            test_resp = requests.post(pos_url, headers=regos_headers, json=test_payload, timeout=2.5)
            if test_resp.status_code == 200:
                test_json = test_resp.json()
                if isinstance(test_json, dict) and not test_json.get("ok"):
                    err_code = test_json.get("result", {}).get("error")
                    if err_code == 5054:
                        print("POS cash register is offline (error 5054). Skipping POS detail queries.")
                        pos_online = False
        except Exception as e_pos_check:
            print(f"POS connection check failed: {e_pos_check}")
            pos_online = False
            
        def fetch_cheque_details(cheque):
            c_uuid = cheque.get("uuid") or cheque.get("id")
            if not c_uuid:
                return None
            try:
                cheque_details = None
                if pos_online:
                    try:
                        pos_payload = {
                            "uuid": c_uuid,
                            "start_date": now_ts - (days * 24 * 3600),
                            "end_date": now_ts
                        }
                        pos_resp = requests.post(pos_url, headers=regos_headers, json=pos_payload, timeout=3)
                        if pos_resp.status_code == 200:
                            pos_json = pos_resp.json()
                            if isinstance(pos_json, list) and len(pos_json) > 0:
                                cheque_details = pos_json[0]
                            elif isinstance(pos_json, dict):
                                if "result" in pos_json and isinstance(pos_json["result"], list) and len(pos_json["result"]) > 0:
                                    cheque_details = pos_json["result"][0]
                                elif "cheque" in pos_json:
                                    cheque_details = pos_json["cheque"]
                                elif "doccheque" in pos_json:
                                    cheque_details = pos_json["doccheque"]
                                elif pos_json.get("ok"):
                                    res = pos_json.get("result")
                                    if isinstance(res, list) and len(res) > 0:
                                        cheque_details = res[0]
                                    elif isinstance(res, dict):
                                        cheque_details = res
                                else:
                                    cheque_details = pos_json
                    except Exception:
                        pass
                        
                target_cheque = cheque_details if (cheque_details and isinstance(cheque_details, dict) and ("rows" in cheque_details or "payments" in cheque_details)) else cheque
                
                c_code = target_cheque.get("code") or target_cheque.get("number") or target_cheque.get("receipt_no") or f"CH-{c_uuid[:8]}"
                c_date = target_cheque.get("date") or target_cheque.get("created_at")
                
                c_time_str = None
                if c_date:
                    try:
                        ts = float(c_date)
                        if ts > 1e11:
                            ts = ts / 1000.0
                        c_time_str = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                    except Exception:
                        c_time_str = str(c_date)
                if not c_time_str:
                    c_time_str = datetime.now(timezone.utc).isoformat()
                    
                cashier = target_cheque.get("cashier")
                cashier_name = ""
                if isinstance(cashier, dict):
                    cashier_name = cashier.get("full_name") or cashier.get("name") or cashier.get("username") or ""
                else:
                    cashier_name = target_cheque.get("cashier_name") or target_cheque.get("seller_name") or str(cashier or "")
                if not cashier_name:
                    cashier_name = "Noma'lum kassa xodimi"
                    
                total_amount = target_cheque.get("sum") or target_cheque.get("amount") or target_cheque.get("total_amount") or target_cheque.get("total") or 0.0
                discount = target_cheque.get("discount") or target_cheque.get("discount_sum") or 0.0
                
                payments = target_cheque.get("payments") or target_cheque.get("payment_type") or target_cheque.get("pay_type") or "cash"
                payment_type = "Naqd"
                if isinstance(payments, list):
                    types = []
                    for p in payments:
                        if isinstance(p, dict):
                            t = p.get("type") or p.get("name") or p.get("payment_type") or "cash"
                            types.append(str(t))
                        else:
                            types.append(str(p))
                    payment_type = ", ".join(types) if types else "Naqd"
                elif isinstance(payments, dict):
                    payment_type = payments.get("type") or payments.get("name") or "Naqd"
                else:
                    payment_type = str(payments)
                    
                pay_lower = payment_type.lower()
                if "cash" in pay_lower or "naqd" in pay_lower:
                    payment_type = "Naqd"
                elif "card" in pay_lower or "karta" in pay_lower or "terminal" in pay_lower:
                    payment_type = "Karta"
                elif "click" in pay_lower or "payme" in pay_lower or "apelsin" in pay_lower or "uzum" in pay_lower:
                    payment_type = "Elektron"
                    
                rows = target_cheque.get("rows") or target_cheque.get("items") or target_cheque.get("goods") or []
                if not rows:
                    try:
                        if "/v1" not in endpoint:
                            ops_url = f"{endpoint}/v1/docchequeoperation/get"
                        else:
                            ops_url = f"{endpoint}/docchequeoperation/get"
                        ops_payload = {"doc_sale_uuid": c_uuid}
                        ops_resp = requests.post(ops_url, headers=regos_headers, json=ops_payload, timeout=4)
                        if ops_resp.status_code == 200:
                            ops_data = ops_resp.json()
                            ops_list = ops_data.get("result")
                            if isinstance(ops_list, list):
                                rows = ops_list
                    except Exception:
                        pass
                        
                items_list = []
                if isinstance(rows, list):
                    for row in rows:
                        if isinstance(row, dict):
                            row_item = row.get("item")
                            row_name = ""
                            row_sku = ""
                            if isinstance(row_item, dict):
                                row_name = row_item.get("name") or ""
                                row_sku = row_item.get("code") or row_item.get("articul") or ""
                            else:
                                row_name = row.get("name") or row.get("item_name") or ""
                                row_sku = row.get("sku") or row.get("code") or row.get("articul") or ""
                                
                            row_qty = row.get("quantity") or row.get("qty") or 1
                            row_price = row.get("price") or 0
                            row_total = row.get("sum") or row.get("total") or (row_qty * row_price)
                            
                            items_list.append({
                                "name": row_name,
                                "sku": row_sku,
                                "quantity": int(row_qty),
                                "price": float(row_price),
                                "total": float(row_total)
                            })
                            
                card = target_cheque.get("card")
                cust_name = ""
                cust_phone = ""
                card_barcode = ""
                card_id = None
                if isinstance(card, dict):
                    card_id = card.get("id")
                    card_barcode = str(card.get("barcode_value") or card.get("barcode") or "").strip()
                    customer = card.get("customer")
                    if isinstance(customer, dict):
                        cust_name = (customer.get("full_name") or "").strip()
                        cust_phone = (customer.get("main_phone") or "").strip()
                        
                seller = target_cheque.get("seller")
                seller_name = ""
                if isinstance(seller, dict):
                    seller_name = seller.get("full_name") or seller.get("name") or seller.get("username") or ""
                elif isinstance(seller, str):
                    seller_name = seller
                if not seller_name:
                    seller_name = target_cheque.get("seller_name") or ""
                    
                items_payload = {
                    "customer_name": cust_name,
                    "customer_phone": cust_phone,
                    "card_barcode": card_barcode,
                    "card_id": card_id,
                    "seller_name": seller_name,
                    "products": items_list,
                    "status": target_cheque.get("status") or "Closed"
                }
                
                receipt_payload = {
                    "id": c_uuid,
                    "code": c_code,
                    "cashier_name": cashier_name,
                    "total_amount": float(total_amount),
                    "discount": float(discount),
                    "payment_type": payment_type,
                    "items": items_payload,
                    "created_at": c_time_str
                }
                if company_id:
                    receipt_payload["company_id"] = company_id
                return receipt_payload
            except Exception as ex:
                print(f"Failed to process cheque {c_uuid}: {ex}")
                return None

        # Filter new cheques beforehand
        new_cheques = []
        for cheque in cheques_list:
            if not isinstance(cheque, dict):
                continue
            c_uuid = cheque.get("uuid") or cheque.get("id")
            if not c_uuid:
                continue
            if c_uuid in existing_receipts and existing_receipts[c_uuid]:
                continue
            new_cheques.append(cheque)

        saved_count = 0
        processed_receipts = []
        newly_saved_receipts = []
        
        if new_cheques:
            from concurrent.futures import ThreadPoolExecutor, as_completed
            
            sync_progress["total"] = len(new_cheques)
            sync_progress["processed"] = 0
            sync_progress["message"] = f"Jami {len(new_cheques)} ta yangi cheklar yuklanmoqda..."
            
            with ThreadPoolExecutor(max_workers=12) as executor:
                future_to_cheque = {executor.submit(fetch_cheque_details, c): c for c in new_cheques}
                
                for idx, future in enumerate(as_completed(future_to_cheque)):
                    try:
                        res_payload = future.result()
                        if res_payload:
                            processed_receipts.append(res_payload)
                    except Exception as exc:
                        print(f"Cheque generated an exception: {exc}")
                        
                    if idx % 20 == 0 or idx == len(new_cheques) - 1:
                        sync_progress["processed"] = idx + 1
                        sync_progress["message"] = f"Cheklar yuklanmoqda: {idx + 1}/{len(new_cheques)}..."
                        
                    # Flush to database in batches of 100
                    if len(processed_receipts) >= 100:
                        sync_progress["message"] = f"Cheklar saqlanmoqda: {idx + 1}/{len(new_cheques)}..."
                        try:
                            supabase_req("POST", "receipts?on_conflict=id", json_data=processed_receipts)
                            saved_count += len(processed_receipts)
                            newly_saved_receipts.extend(processed_receipts)
                        except Exception as ex:
                            print(f"Background Sync: batch upsert failed, doing single inserts... Error: {ex}")
                            for payload in processed_receipts:
                                try:
                                    supabase_req("POST", "receipts?on_conflict=id", json_data=payload)
                                    saved_count += 1
                                    newly_saved_receipts.append(payload)
                                except Exception as single_ex:
                                    print(f"Background Sync: Fallback insert failed for {payload['id']}: {single_ex}")
                        processed_receipts = []
                
        # 4. Flush remaining processed receipts
        if processed_receipts:
            sync_progress["message"] = f"Cheklar saqlanmoqda: so'nggi qism..."
            try:
                supabase_req("POST", "receipts?on_conflict=id", json_data=processed_receipts)
                saved_count += len(processed_receipts)
                newly_saved_receipts.extend(processed_receipts)
            except Exception as ex:
                print(f"Background Sync: final batch upsert failed, doing single inserts... Error: {ex}")
                for payload in processed_receipts:
                    try:
                        supabase_req("POST", "receipts?on_conflict=id", json_data=payload)
                        saved_count += 1
                        newly_saved_receipts.append(payload)
                    except Exception as single_ex:
                        print(f"Background Sync: Fallback insert failed for {payload['id']}: {single_ex}")
            processed_receipts = []
            
        # Trigger amoCRM deal creation for newly saved receipts if enabled
        if newly_saved_receipts:
            try:
                create_amocrm_deals_for_receipts(newly_saved_receipts, company_id)
            except Exception as e_deals:
                print(f"Background Sync: error triggering amocrm deal creation: {e_deals}")
            
        # Trigger REGOS retail card bonus sync for all clients in background
        try:
            threading.Thread(target=sync_all_regos_cards_bonuses_helper, args=(company_id,)).start()
        except Exception as e_b:
            print(f"Background Sync: error triggering card bonuses sync: {e_b}")

        sync_progress["running"] = False
        # Force restart trigger comment
        sync_progress["processed"] = len(cheques_list)
        sync_progress["message"] = f"Muvaffaqiyatli yakunlandi. {saved_count} ta yangi chek saqlandi."
        print(f"Background Sync: completed successfully. Saved {saved_count} receipts.")
    except Exception as e_sync:
        sync_progress["running"] = False
        sync_progress["message"] = f"Xatolik yuz berdi: {str(e_sync)}"
        print(f"Background Sync: failed with error: {e_sync}")

@app.get("/api/receipts")
def get_receipts(request: Request, search: str = None):
    company_id = get_company_id(request)
    if not company_id:
        return []
    try:
        if search:
            search_lat = to_latin(search)
            search_cyr = to_cyrillic(search)
            term_lat = f"%{search_lat}%"
            term_cyr = f"%{search_cyr}%"
            path = f"receipts?select=*&company_id=eq.{company_id}&id=not.like.settings_*&total_amount=gt.0&or=(code.ilike.{term_lat},cashier_name.ilike.{term_lat},code.ilike.{term_cyr},cashier_name.ilike.{term_cyr})&order=created_at.desc&limit=1000"
            return supabase_req("GET", path)
        else:
            return supabase_req("GET", f"receipts?select=*&company_id=eq.{company_id}&id=not.like.settings_*&total_amount=gt.0&order=created_at.desc&limit=1000")
    except Exception as e:
        print(f"Failed to fetch receipts: {e}")
        return []

@app.post("/api/receipts")
def save_receipt(receipt: dict, request: Request):
    company_id = get_company_id(request)
    if company_id:
        receipt["company_id"] = company_id
    return supabase_req("POST", "receipts?on_conflict=id", json_data=receipt)

@app.delete("/api/receipts/{id}")
def delete_receipt(id: str, request: Request):
    company_id = get_company_id(request)
    path = f"receipts?id=eq.{id}"
    if company_id:
        path += f"&company_id=eq.{company_id}"
    return supabase_req("DELETE", path)

from fastapi import BackgroundTasks

@app.post("/api/integration/regos/sync-receipts")
def sync_regos_receipts(background_tasks: BackgroundTasks, request: Request, days: int = None, sync_date: str = None):
    global sync_progress
    if sync_progress["running"]:
        return {
            "status": "already_running",
            "message": "Sinxronizatsiya orqa fonda allaqachon bajarilmoqda.",
            "progress": sync_progress
        }
        
    company_id = get_company_id(request)
    
    if not days and not sync_date:
        days = 360
        
    background_tasks.add_task(run_sync_in_background, days, sync_date, company_id)
    
    if sync_date:
        msg = f"Sinxronizatsiya orqa fonda boshlandi ({sync_date} kuni uchun). Cheklar asta-sekin paydo bo'ladi."
    else:
        msg = f"Sinxronizatsiya orqa fonda boshlandi ({days} kunlik). Cheklar asta-sekin paydo bo'ladi."
        
    return {
        "status": "processing",
        "message": msg
    }

@app.get("/api/integration/regos/sync-status")
def get_sync_status():
    return sync_progress

@app.post("/api/integration/regos/create-order")
def create_regos_order(order_data: dict, request: Request):
    company_id = get_company_id(request)
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        raise HTTPException(status_code=400, detail="REGOS API sozlanmagan. Iltimos, sozlamalar sahifasida Endpoint va Access Tokenni kiriting.")
        
    endpoint = regos_endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "https://" + endpoint
        
    if "/v1" not in endpoint:
        order_url = f"{endpoint}/v1/docorderdelivery/addfull"
    else:
        order_url = f"{endpoint}/docorderdelivery/addfull"
        
    # Parse stock_id
    raw_stock_id = order_data.get("stock_id", "regos_1")
    stock_id = 1
    if "regos_" in str(raw_stock_id):
        try:
            stock_id = int(str(raw_stock_id).replace("regos_", ""))
        except ValueError:
            stock_id = 1
    else:
        try:
            stock_id = int(raw_stock_id)
        except ValueError:
            stock_id = 1

    # Format delivery_date to timestamp
    delivery_date_str = order_data.get("delivery_date")
    now_ts = int(time.time())
    delivery_ts = now_ts + 24 * 3600
    if delivery_date_str:
        try:
            dt = datetime.strptime(delivery_date_str, "%Y-%m-%d")
            delivery_ts = int(dt.timestamp())
        except Exception:
            pass

    # Build operations list
    operations = []
    items = order_data.get("items", [])
    for item in items:
        raw_product_id = item.get("product_id", "")
        item_id = 1
        if "regos_" in str(raw_product_id):
            try:
                clean_id = str(raw_product_id).replace("i_regos_", "").replace("regos_", "")
                item_id = int(clean_id)
            except ValueError:
                continue
        else:
            try:
                item_id = int(raw_product_id)
            except ValueError:
                continue
                
        operations.append({
            "document_id": 0,
            "item_id": item_id,
            "quantity": float(item.get("quantity", 1)),
            "price": float(item.get("price", 0))
        })
        
    if not operations:
        raise HTTPException(status_code=400, detail="Buyurtmada hech qanday mahsulot mavjud emas yoki mahsulotlar REGOS tizimiga mos kelmaydi.")

    # Build customer description
    description = f"PRO-TECH ERP orqali yaratildi. Mijoz: {order_data.get('customer_name', '')}"
    if order_data.get("description"):
        description += f" | Izoh: {order_data.get('description')}"

    # Build document object
    document = {
        "date": now_ts,
        "delivery_date": delivery_ts,
        "address": order_data.get("delivery_address", "Toshkent"),
        "description": description,
        "phone": order_data.get("customer_phone", ""),
        "from_id": 1,
        "stock_id": stock_id,
        "price_type_id": 1,
        "delivery_type_id": 1,
        "payment_type_id": 1
    }
    
    payload = {
        "document": document,
        "operations": operations
    }
    
    regos_headers = {
        "Authorization": f"Bearer {regos_token}",
        "Content-Type": "application/json;charset=utf-8"
    }
    
    try:
        res = requests.post(order_url, headers=regos_headers, json=payload, timeout=15)
        if res.status_code == 200:
            res_json = res.json()
            if res_json.get("ok"):
                new_id = res_json.get("result", {}).get("new_id")
                
                # Immediately set status to 'Approved' so it shows up in REGOS POS
                if "/v1" not in endpoint:
                    status_url = f"{endpoint}/v1/docorderdelivery/setstatus"
                else:
                    status_url = f"{endpoint}/docorderdelivery/setstatus"
                    
                status_payload = {
                    "id": new_id,
                    "status": "Approved"
                }
                
                try:
                    status_res = requests.post(status_url, headers=regos_headers, json=status_payload, timeout=10)
                    if status_res.status_code == 200:
                        status_json = status_res.json()
                        if not status_json.get("ok"):
                            print(f"Failed to auto-approve order {new_id}: {status_json.get('result')}")
                    else:
                        print(f"Failed to auto-approve order {new_id} (status code {status_res.status_code}): {status_res.text}")
                except Exception as status_err:
                    print(f"Exception during auto-approve order {new_id}: {status_err}")
                
                try:
                    # Save order details in local database so it shows up in the list
                    # Order ID MUST be a valid UUID
                    local_order_id = order_data.get("order_id")
                    local_supplier_id = None
                    total_amount = sum(float(item.get("quantity", 1)) * float(item.get("price", 0)) for item in items)
                    cust_name = f"Mijoz: {order_data.get('customer_name', '')} (REGOS #{new_id})"
                    
                    if local_order_id:
                        # Find existing order to get its supplier_id
                        existing_po = supabase_req("GET", f"purchase_orders?id=eq.{local_order_id}", company_id=company_id)
                        if existing_po and len(existing_po) > 0:
                            local_supplier_id = existing_po[0].get("supplier_id")
                    
                    if local_supplier_id:
                        # Update existing virtual supplier
                        local_supplier_data = {
                            "name": cust_name,
                            "phone": order_data.get("customer_phone") or "",
                            "address": order_data.get("delivery_address") or "",
                            "rating": 5.0
                        }
                        supabase_req("PATCH", f"suppliers?id=eq.{local_supplier_id}", json_data=local_supplier_data, company_id=company_id)
                    else:
                        # Create virtual supplier for customer details
                        local_supplier_id = str(uuid.uuid4())
                        local_supplier_data = {
                            "id": local_supplier_id,
                            "company_id": company_id,
                            "name": cust_name,
                            "phone": order_data.get("customer_phone") or "",
                            "address": order_data.get("delivery_address") or "",
                            "rating": 5.0
                        }
                        supabase_req("POST", "suppliers", json_data=local_supplier_data, company_id=company_id)
                    
                    if not local_order_id:
                        local_order_id = str(uuid.uuid4())
                        is_new_order = True
                    else:
                        is_new_order = False
                        # Clean existing items
                        supabase_req("DELETE", f"purchase_order_items?purchase_order_id=eq.{local_order_id}", company_id=company_id)
                    
                    local_order_data = {
                        "company_id": company_id,
                        "supplier_id": local_supplier_id,
                        "expected_delivery_date": order_data.get("delivery_date"),
                        "status": "approved",
                        "total_amount": total_amount
                    }
                    
                    if is_new_order:
                        local_order_data["id"] = local_order_id
                        supabase_req("POST", "purchase_orders", json_data=local_order_data, company_id=company_id)
                    else:
                        supabase_req("PATCH", f"purchase_orders?id=eq.{local_order_id}", json_data=local_order_data, company_id=company_id)
                    
                    # Insert items
                    for item in items:
                        local_item_data = {
                            "id": str(uuid.uuid4()),
                            "purchase_order_id": local_order_id,
                            "product_id": item.get("product_id"),
                            "quantity": float(item.get("quantity", 1)),
                            "unit_cost": float(item.get("price", 0))
                        }
                        supabase_req("POST", "purchase_order_items", json_data=local_item_data, company_id=company_id)
                except Exception as db_err:
                    print(f"Failed to save REGOS order locally in DB: {db_err}")
                
                return {
                    "status": "success",
                    "message": "Buyurtma muvaffaqiyatli REGOS POS-ga yuborildi va tasdiqlandi!",
                    "regos_order_id": new_id
                }
            else:
                error_msg = res_json.get("result", "Noma'lum xatolik")
                raise HTTPException(status_code=400, detail=f"REGOS API xatoligi: {error_msg}")
        else:
            raise HTTPException(status_code=500, detail=f"REGOS API javob xatoligi (Status {res.status_code}): {res.text}")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"REGOS API bilan bog'lanishda xatolik: {str(e)}")

@app.post("/api/test/simulate-receipt")
def simulate_receipt(payload: dict, request: Request):
    company_id = get_company_id(request)
    try:
        save_parsed_receipt(payload, company_id)
        return {"status": "success", "message": "Receipt simulated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/integration/regos/webhook")
async def regos_webhook(request: Request):
    try:
        data = await request.json()
        print(f"REGOS Webhook received: {data}")
    except Exception as e:
        print(f"Error reading REGOS webhook JSON: {e}")
        data = {}
        
    company_id = get_company_id(request)
    
    action = data.get("action")
    webhook_data = data.get("data") or {}
    
    if action == "HandleWebhook" and isinstance(webhook_data, dict):
        action = webhook_data.get("action")
        webhook_data = webhook_data.get("data") or {}
        
    import threading
    
    if action == "DocChequeClosed" and isinstance(webhook_data, dict) and "uuid" in webhook_data:
        cheque_uuid = webhook_data.get("uuid")
        print(f"Webhook identified DocChequeClosed for UUID: {cheque_uuid}")
        threading.Thread(target=fetch_and_save_regos_receipt, args=(cheque_uuid, company_id)).start()
    elif isinstance(data, dict) and ("items" in data or "rows" in data or "total_amount" in data):
        print("Webhook identified direct full receipt payload")
        threading.Thread(target=save_parsed_receipt, args=(data, company_id)).start()
        
    threading.Thread(target=sync_regos_inventory_helper, args=(company_id,)).start()
    
    return {"status": "success", "message": "Webhook processed successfully"}

def resolve_mobile_permissions(role_str, roles_list):
    clean_role = (role_str or "").split(";")[0].strip().lower()
    all_mob = ["m_crm", "m_regos_cards", "m_receipts", "m_bonus", "m_erp", "m_scanner", "m_kassa", "m_telephony", "m_chats", "m_finance"]
        
    found = None
    if isinstance(roles_list, list):
        for r in roles_list:
            if isinstance(r, dict) and r.get("name", "").strip().lower() == clean_role:
                found = r
                break
                
    if found and "mobile_permissions" in found and isinstance(found["mobile_permissions"], list):
        return found["mobile_permissions"]
        
    if clean_role in ["admin", "superadmin", "direktor"]:
        return all_mob
        
    perms = (found.get("permissions") if found else []) or []
    m_perms = []
    if "crm" in perms:
        m_perms.extend(["m_crm", "m_regos_cards", "m_receipts", "m_scanner"])
    if "erp" in perms:
        m_perms.extend(["m_erp", "m_scanner"])
    if "receipts" in perms or "kassa" in perms:
        m_perms.extend(["m_receipts", "m_kassa", "m_scanner"])
    if "telephony" in perms:
        m_perms.append("m_telephony")
    if "chats" in perms:
        m_perms.append("m_chats")
    if "finance" in perms:
        m_perms.append("m_finance")
    if not m_perms:
        m_perms = ["m_crm", "m_scanner"]
    return list(dict.fromkeys(m_perms))
# --- USTA (MASTER) AUTHENTICATION HELPER ---
def authenticate_usta_helper(barcode: str, phone: str, company_id: str = None):
    import re
    if not barcode or not phone:
        raise HTTPException(status_code=400, detail="Shtrix-kod va telefon raqami kiritilishi shart.")

    barcode_clean = str(barcode).strip()
    phone_digits = re.sub(r'\D', '', str(phone).strip())
    if not phone_digits:
        raise HTTPException(status_code=400, detail="Yaroqli telefon raqamini kiriting.")

    target_company = company_id or "giperbrendstroy"
    query = f"customers?select=*&company_id=eq.{target_company}&source=eq.client_directory"
    customers = supabase_get_all(query)
    if not customers:
        customers = supabase_get_all(f"customers?select=*&source=eq.client_directory")

    matched_customer = None
    barcode_matched_but_phone_diff = False

    for c in customers:
        c_barcode = (c.get("phone2") or "").strip()
        c_op = c.get("operator") or ""
        if not c_barcode and c_op.startswith("{"):
            try:
                m = json.loads(c_op)
                c_barcode = (m.get("barcode") or "").strip()
            except Exception:
                pass
        
        c_id = str(c.get("id") or "")
        is_bc_match = (
            c_barcode == barcode_clean or 
            c_id == barcode_clean or 
            c_id == f"regos_card_{barcode_clean}" or
            (barcode_clean and barcode_clean in c_barcode)
        )

        if is_bc_match:
            c_phone = c.get("phone") or ""
            c_phone_digits = re.sub(r'\D', '', str(c_phone))
            
            phone_match = False
            if phone_digits == c_phone_digits:
                phone_match = True
            elif len(phone_digits) >= 9 and len(c_phone_digits) >= 9 and phone_digits[-9:] == c_phone_digits[-9:]:
                phone_match = True
            elif phone_digits in c_phone_digits or c_phone_digits in phone_digits:
                phone_match = True
                
            if phone_match:
                matched_customer = c
                break
            else:
                barcode_matched_but_phone_diff = True

    if not matched_customer:
        if barcode_matched_but_phone_diff:
            raise HTTPException(status_code=401, detail="Telefon raqami (parol) noto'g'ri kiritildi.")
        else:
            raise HTTPException(status_code=404, detail="Ushbu shtrix-kodga ega usta topilmadi.")

    # Try syncing live bonus from REGOS
    cid = matched_customer.get("id")
    c_bc = matched_customer.get("phone2") or barcode_clean
    live_bonus = None
    try:
        live_bonus = sync_regos_card_bonus_helper(
            client_id=cid, 
            barcode=c_bc, 
            phone=matched_customer.get("phone"), 
            company_id=matched_customer.get("company_id") or target_company
        )
    except Exception as e_b:
        print(f"Bonus sync during usta login error: {e_b}")

    bonus_val = float(live_bonus if live_bonus is not None else (matched_customer.get("value") or 0))

    return {
        "status": "success",
        "user_type": "usta",
        "user": {
            "id": matched_customer.get("id"),
            "name": matched_customer.get("name") or "Usta",
            "phone": matched_customer.get("phone") or "",
            "barcode": c_bc,
            "bonus": bonus_val,
            "role": "usta",
            "category": "ustalar",
            "company_id": matched_customer.get("company_id") or target_company,
            "mobile_permissions": ["m_usta_cabinet", "m_receipts"]
        }
    }

@app.post("/api/auth/usta-login")
def auth_usta_login(payload: dict):
    barcode = payload.get("barcode") or payload.get("login")
    phone = payload.get("phone") or payload.get("password")
    company_id = payload.get("company_id")
    return authenticate_usta_helper(barcode, phone, company_id)

@app.post("/api/auth/login")
def auth_login(payload: dict):
    login = payload.get("login")
    password = payload.get("password")
    company_id = payload.get("company_id")
    is_superadmin_portal = payload.get("is_superadmin_portal", False)
    user_type = payload.get("user_type") or payload.get("login_type")
    
    # 0. If explicit usta login
    if user_type == "usta":
        return authenticate_usta_helper(barcode=login, phone=password, company_id=company_id)

    # 1. Super Admin check
    if login == "admin" and password == "admin":
        if not is_superadmin_portal:
            raise HTTPException(status_code=403, detail="Super Admin tizimga bu yerdan kira olmaydi. Maxsus URL orqali kiring.")
        return {
            "status": "success",
            "user": {
                "id": "admin",
                "name": "Super Admin",
                "role": "superadmin",
                "company_id": "admin",
                "mobile_permissions": ["m_crm", "m_regos_cards", "m_receipts", "m_bonus", "m_erp", "m_scanner", "m_kassa", "m_telephony", "m_chats", "m_finance"]
            }
        }
        
    if is_superadmin_portal:
        raise HTTPException(status_code=403, detail="Faqat Super Admin ushbu portaldan kira oladi.")
        
    if not login or not password:
        raise HTTPException(status_code=400, detail="Login va parol kiritilishi shart.")
        
    if not company_id:
        company_id = "giperbrendstroy"
        
    company_id = "".join(c for c in company_id if c.isalnum()).lower()
    
    try:
        # 2. Check company status
        comp = supabase_req("GET", f"companies?id=eq.{company_id}")
        if not comp:
            raise HTTPException(status_code=404, detail="Kompaniya topilmadi.")
        if comp[0].get("status") != "active":
            raise HTTPException(status_code=403, detail="Kompaniya faoliyati to'xtatilgan.")
            
        # 3. Verify employee credentials
        emps = supabase_req("GET", f"employees?company_id=eq.{company_id}")
        if not isinstance(emps, list):
            emps = []
            
        found = None
        for e in emps:
            if e.get("login") == login and e.get("password") == password:
                found = e
                break
                
        if found:
            c_settings = get_company_settings(company_id, bypass_cache=True)
            roles_list = c_settings.get("roles", [])
            emp_custom_map = c_settings.get("employee_mobile_permissions", {})
            emp_id = found.get("id")
            
            if emp_id and emp_id in emp_custom_map:
                mobile_perms = emp_custom_map[emp_id]
            elif found.get("mobile_permissions") is not None and isinstance(found.get("mobile_permissions"), list):
                mobile_perms = found.get("mobile_permissions")
            else:
                mobile_perms = resolve_mobile_permissions(found.get("role"), roles_list)
            
            return {
                "status": "success",
                "user": {
                    "id": found.get("id"),
                    "name": found.get("name"),
                    "role": found.get("role"),
                    "company_id": company_id,
                    "mobile_permissions": mobile_perms
                }
            }
        else:
            # Fallback: Check if credentials belong to an Usta (login=barcode, password=phone)
            try:
                usta_res = authenticate_usta_helper(barcode=login, phone=password, company_id=company_id)
                if usta_res and usta_res.get("status") == "success":
                    return usta_res
            except Exception:
                pass
            raise HTTPException(status_code=401, detail="Noto'g'ri login yoki parol.")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- MOBILE APP ENDPOINTS ---

MOBILE_ALL_MODULES = [
    {"key": "m_crm", "label": "Mijozlar bazasi (CRM)", "icon": "fa-users", "desc": "Mijozlar ro'yxati, toifalar va qidiruv"},
    {"key": "m_regos_cards", "label": "REGOS Kartalari", "icon": "fa-id-card", "desc": "Shtrix-kod orqali xaridor kartasini qidirish va biriktirish"},
    {"key": "m_receipts", "label": "Xarid Cheklari", "icon": "fa-receipt", "desc": "Mijozning xarid cheklari va mahsulotlar tafsiloti"},
    {"key": "m_bonus", "label": "Bonusni O'zgartirish (+/-)", "icon": "fa-coins", "desc": "Mijoz bonus balansiga qo'shish, ayirish yoki belgilash ruxsati"},
    {"key": "m_erp", "label": "Omborxona (ERP)", "icon": "fa-boxes", "desc": "Mahsulotlar qoldig'i, narxlari va SKU bo'yicha qidiruv"},
    {"key": "m_scanner", "label": "Kamera Skaneri", "icon": "fa-qrcode", "desc": "Telefon kamerasi orqali karta yoki tovar shtrix-kodini o'qish"},
    {"key": "m_kassa", "label": "Kassa & Tezkor Savdo", "icon": "fa-cash-register", "desc": "Mobil ilovadan savdo qilish va chek chiqarish"},
    {"key": "m_telephony", "label": "Telefoniya", "icon": "fa-phone-alt", "desc": "Mijozlarga bir bosishda qo'ng'iroq qilish"},
    {"key": "m_chats", "label": "Muloqotlar", "icon": "fa-comments", "desc": "Telegram va Instagram chatlari"},
    {"key": "m_finance", "label": "Moliya", "icon": "fa-wallet", "desc": "Kunlik kassa va tushumlar xulosasi"}
]

@app.get("/api/mobile/permissions")
def get_mobile_permissions(request: Request, role: str = None, employee_id: str = None):
    company_id = get_company_id(request)
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    roles_list = settings.get("roles", [])
    emp_custom_map = settings.get("employee_mobile_permissions", {})
    
    target_role = role
    my_perms = []
    if employee_id:
        if employee_id in emp_custom_map:
            my_perms = emp_custom_map[employee_id]
        else:
            try:
                emps = supabase_req("GET", f"employees?id=eq.{employee_id}")
                if emps and isinstance(emps, list) and len(emps) > 0:
                    emp = emps[0]
                    target_role = emp.get("role")
                    if emp.get("mobile_permissions") is not None and isinstance(emp.get("mobile_permissions"), list):
                        my_perms = emp.get("mobile_permissions")
                    else:
                        my_perms = resolve_mobile_permissions(target_role, roles_list)
            except Exception as e_emp:
                print("Error loading employee permissions:", e_emp)
    elif target_role:
        my_perms = resolve_mobile_permissions(target_role, roles_list)
    
    # Also fetch active employees to display in management view
    employees_data = []
    if company_id:
        try:
            raw_emps = supabase_req("GET", f"employees?company_id=eq.{company_id}&order=created_at.asc")
            if isinstance(raw_emps, list):
                for e in raw_emps:
                    emp_id = e.get("id")
                    e_role = e.get("role")
                    r_perms = resolve_mobile_permissions(e_role, roles_list)
                    has_custom = (emp_id in emp_custom_map) or (e.get("mobile_permissions") is not None and isinstance(e.get("mobile_permissions"), list))
                    custom_perms = emp_custom_map.get(emp_id) if (emp_id in emp_custom_map) else e.get("mobile_permissions")
                    employees_data.append({
                        "id": emp_id,
                        "name": e.get("name"),
                        "role": e_role,
                        "login": e.get("login"),
                        "status": e.get("status", "active"),
                        "has_custom": has_custom,
                        "mobile_permissions": custom_perms if has_custom else r_perms
                    })
        except Exception as emp_err:
            print("Error fetching employees for mobile permissions:", emp_err)
            
    return {
        "ok": True,
        "all_modules": MOBILE_ALL_MODULES,
        "roles": roles_list,
        "employees": employees_data,
        "my_permissions": my_perms
    }

@app.post("/api/mobile/employee-permissions")
def save_mobile_employee_permissions(payload: dict, request: Request):
    company_id = get_company_id(request)
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID talab qilinadi")
    emp_id = (payload.get("employee_id") or "").strip()
    mobile_perms = payload.get("mobile_permissions")
    reset_to_role = payload.get("reset_to_role", False)
    if not emp_id:
        raise HTTPException(status_code=400, detail="Xodim ID kiritilishi shart")
    
    try:
        settings = get_company_settings(company_id, bypass_cache=True)
        if "employee_mobile_permissions" not in settings or not isinstance(settings["employee_mobile_permissions"], dict):
            settings["employee_mobile_permissions"] = {}
            
        if reset_to_role:
            settings["employee_mobile_permissions"].pop(emp_id, None)
        else:
            settings["employee_mobile_permissions"][emp_id] = mobile_perms
            
        save_company_settings(company_id, settings)

        try:
            val = None if reset_to_role else mobile_perms
            supabase_req("PATCH", f"employees?id=eq.{emp_id}&company_id=eq.{company_id}", json_data={"mobile_permissions": val})
        except Exception:
            pass

        return {"ok": True, "message": "Xodimning mobil ruxsatnomalari muvaffaqiyatli saqlandi"}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))

@app.post("/api/mobile/role-permissions")
def save_mobile_role_permissions(payload: dict, request: Request):
    company_id = get_company_id(request)
    if not company_id:
        raise HTTPException(status_code=400, detail="Company ID talab qilinadi")
        
    role_name = (payload.get("role_name") or "").strip()
    mobile_perms = payload.get("mobile_permissions") or []
    if not role_name:
        raise HTTPException(status_code=400, detail="Rol nomi kiritilishi shart")
        
    settings = get_company_settings(company_id, bypass_cache=True)
    roles_list = settings.get("roles", [])
    
    found = False
    for r in roles_list:
        if isinstance(r, dict) and r.get("name", "").strip().lower() == role_name.lower():
            r["mobile_permissions"] = mobile_perms
            found = True
            break
            
    if not found:
        roles_list.append({
            "name": role_name,
            "permissions": [],
            "mobile_permissions": mobile_perms
        })
        
    settings["roles"] = roles_list
    save_company_settings(company_id, settings)
    return {"ok": True, "message": f"{role_name} roli uchun mobil ruxsatnomalar saqlandi", "roles": roles_list}

@app.get("/api/mobile/dashboard")
def get_mobile_dashboard(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return {"ok": False, "detail": "Unauthorized"}
        
    try:
        clients = get_clients(request) or []
        ustalar_count = 0
        qurilish_count = 0
        for c in clients:
            cat = str(c.get("category") or ("qurilish" if c.get("company") else "ustalar")).lower()
            if "qurilish" in cat:
                qurilish_count += 1
            else:
                ustalar_count += 1

        return {
            "ok": True,
            "ustalar_count": ustalar_count,
            "qurilish_count": qurilish_count,
            "clients_count": len(clients),
            "company_id": company_id
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/mobile/barcode-lookup")
def mobile_barcode_lookup(barcode: str, request: Request):
    if not barcode or not barcode.strip():
        return {"ok": False, "message": "Shtrix-kod kiritilmadi"}
        
    company_id = get_company_id(request)
    clean_b = barcode.strip()
    
    # 1. Check local clients
    try:
        clients = supabase_req("GET", f"customers?company_id=eq.{company_id}&source=eq.client_directory&phone2=eq.{clean_b}")
        if clients and isinstance(clients, list) and len(clients) > 0:
            c = clients[0]
            op_str = c.get("operator") or ""
            cat = "ustalar"
            bonus = float(c.get("value") or 0)
            if op_str.startswith("{"):
                try:
                    m = json.loads(op_str)
                    cat = m.get("category") or "ustalar"
                    bonus = float(m.get("bonus") or bonus)
                except Exception:
                    pass
            c["category"] = cat
            c["bonus"] = bonus
            c["barcode"] = c.get("phone2")
            return {"ok": True, "found": True, "type": "client", "data": c}
    except Exception as e_cl:
        print(f"Mobile barcode lookup client error: {e_cl}")

    # 2. Check REGOS retailcard
    try:
        settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
        ep = settings.get("regos_endpoint", "").strip().rstrip("/")
        token = settings.get("regos_token", "")
        if ep and token:
            url = f"{ep}/v1/retailcard/get" if "/v1" not in ep else f"{ep}/retailcard/get"
            r = requests.post(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, json={"barcode_value": clean_b}, timeout=5)
            if r.status_code == 200:
                res = r.json()
                if res.get("ok") and res.get("result"):
                    card = res["result"][0]
                    cust = card.get("customer") or {}
                    grp = card.get("group") or {}
                    grp_name = grp.get("name") or ""
                    is_qurilish = any(w in grp_name.lower() or w in str(cust.get("full_name", "")).lower() for w in ["qurilish", "stroy", "mchj", "ooo", "obyekt"])
                    formatted_client = {
                        "id": f"regos_card_{card.get('id')}",
                        "name": cust.get("full_name") or f"Karta #{card.get('id')}",
                        "phone": cust.get("main_phone") or "",
                        "barcode": card.get("barcode_value") or clean_b,
                        "bonus": float(card.get("bonus_amount") or 0),
                        "category": "qurilish" if is_qurilish else "ustalar",
                        "group": grp_name,
                        "is_new_regos": True
                    }
                    return {"ok": True, "found": True, "type": "client", "data": formatted_client}
    except Exception as e_reg:
        print(f"Mobile barcode lookup regos error: {e_reg}")

    # 3. Check inventory
    try:
        inv = supabase_req("GET", f"inventory?company_id=eq.{company_id}&sku=eq.{clean_b}")
        if inv and isinstance(inv, list) and len(inv) > 0:
            return {"ok": True, "found": True, "type": "product", "data": inv[0]}
    except Exception as e_inv:
        print(f"Mobile barcode lookup inventory error: {e_inv}")

    return {"ok": True, "found": False, "message": "Ushbu shtrix-kod bo'yicha hech narsa topilmadi"}

@app.post("/api/courier/login")
def courier_login(payload: dict):
    login = payload.get("login")
    password = payload.get("password")
    company_id = payload.get("company_id")
    if not login or not password or not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi, login va parol kiritilishi shart.")
        
    company_id = "".join(c for c in company_id if c.isalnum()).lower()
    
    try:
        # Check company status
        comp = supabase_req("GET", f"companies?id=eq.{company_id}")
        if not comp:
            raise HTTPException(status_code=404, detail="Kompaniya topilmadi.")
        if comp[0].get("status") != "active":
            raise HTTPException(status_code=403, detail="Kompaniya faoliyati to'xtatilgan.")
            
        # Get employees of this company
        emps = supabase_req("GET", f"employees?company_id=eq.{company_id}")
        if not isinstance(emps, list):
            emps = []
            
        found = None
        for e in emps:
            if e.get("login") == login and e.get("password") == password:
                found = e
                break
                
        if found:
            return {
                "status": "success",
                "employee": {
                    "id": found.get("id"),
                    "name": found.get("name"),
                    "role": found.get("role"),
                    "phone": found.get("phone"),
                    "company_id": company_id
                }
            }
        else:
            raise HTTPException(status_code=401, detail="Noto'g'ri login yoki parol.")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/courier/receipts")
def get_courier_receipts(request: Request, courier_name: str):
    company_id = get_company_id(request)
    if not company_id:
        return []
    try:
        receipts = supabase_req("GET", f"receipts?company_id=eq.{company_id}&id=not.like.settings_*&order=created_at.desc&limit=500")
        if not isinstance(receipts, list):
            return []
        
        filtered = []
        for r in receipts:
            items = r.get("items")
            if isinstance(items, dict) and "delivery" in items:
                dev = items["delivery"]
                if dev.get("courier_name") == courier_name:
                    filtered.append(r)
        return filtered
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- AMOCRM INTEGRATION ENDPOINTS AND HELPERS ---

def get_amocrm_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def fetch_amocrm_lead_details(subdomain, token, lead_id):
    headers = get_amocrm_headers(token)
    url = f"https://{subdomain}.amocrm.ru/api/v4/leads/{lead_id}?with=contacts"
    try:
        res = requests.request("GET", url, headers=headers, timeout=10)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        print(f"Failed to fetch amoCRM lead {lead_id}: {e}")
    return None

def fetch_amocrm_contact_details(subdomain, token, contact_id):
    headers = get_amocrm_headers(token)
    url = f"https://{subdomain}.amocrm.ru/api/v4/contacts/{contact_id}"
    try:
        res = requests.request("GET", url, headers=headers, timeout=10)
        if res.status_code == 200:
            return res.json()
    except Exception as e:
        print(f"Failed to fetch amoCRM contact {contact_id}: {e}")
    return None

def extract_phone_from_contact(contact):
    if not contact:
        return ""
    cf_values = contact.get("custom_fields_values") or []
    for cf in cf_values:
        if cf.get("field_code") == "PHONE":
            vals = cf.get("values") or []
            if vals:
                return vals[0].get("value", "")
    return ""

def get_amocrm_users(subdomain, token):
    url = f"https://{subdomain}.amocrm.ru/api/v4/users"
    headers = get_amocrm_headers(token)
    user_map = {}
    try:
        res = requests.request("GET", url, headers=headers, timeout=10)
        if res.status_code == 200:
            users = res.json().get("_embedded", {}).get("users", [])
            for u in users:
                user_map[u.get("id")] = u.get("name")
    except Exception as e:
        print(f"Failed to fetch amoCRM users: {e}")
    return user_map

# Cache for pipelines to avoid querying on every webhook
amocrm_pipelines_cache = {}

def get_amocrm_status_map(subdomain, token):
    global amocrm_pipelines_cache
    cache_key = f"{subdomain}:{token}"
    if cache_key in amocrm_pipelines_cache:
        return amocrm_pipelines_cache[cache_key]
    
    status_map = {}
    url = f"https://{subdomain}.amocrm.ru/api/v4/leads/pipelines"
    headers = get_amocrm_headers(token)
    try:
        res = requests.request("GET", url, headers=headers, timeout=10)
        if res.status_code == 200:
            pipelines = res.json().get("_embedded", {}).get("pipelines", [])
            for p in pipelines:
                statuses = p.get("_embedded", {}).get("statuses", [])
                for s in statuses:
                    s_id = s.get("id")
                    s_name = s.get("name", "").lower()
                    s_type = s.get("type") # 3 is won, 4 is lost
                    
                    if s_type == 3 or "успеш" in s_name or "won" in s_name or "xarid qildi" in s_name or "sotuv" in s_name:
                        status_map[s_id] = "won"
                    elif s_type == 4 or "закрыт" in s_name or "lost" in s_name or "отказ" in s_name or "qilmadi" in s_name or "samarasiz" in s_name or "ahamiyatsiz" in s_name:
                        status_map[s_id] = "lost"
                    elif "доgovor" in s_name or "кп" in s_name or "proposal" in s_name or "предлож" in s_name or "keladigan" in s_name:
                        status_map[s_id] = "proposal"
                    elif "контакт" in s_name or "звон" in s_name or "обсуж" in s_name or "qayta" in s_name or "gaplash" in s_name:
                        status_map[s_id] = "contacted"
                    else:
                        status_map[s_id] = "lead"
            amocrm_pipelines_cache[cache_key] = status_map
    except Exception as e:
        print(f"Failed to fetch amoCRM pipelines: {e}")
    return status_map

# Global progress tracker for amoCRM sync
amocrm_sync_progress = {"running": False, "processed": 0, "total": 0, "message": ""}

def get_amocrm_contacts_map(subdomain, token):
    import time
    headers = get_amocrm_headers(token)
    contact_map = {}
    url = f"https://{subdomain}.amocrm.ru/api/v4/contacts"
    params = {"limit": 250}
    
    for page_idx in range(12): # Fetch up to 3000 contacts (12 pages)
        time.sleep(0.15) # Rate limit protection (7 RPS)
        global amocrm_sync_progress
        amocrm_sync_progress["message"] = f"amoCRM kontaktlari yuklanmoqda ({page_idx + 1}-sahifa)..."
        try:
            res = requests.request("GET", url, headers=headers, params=params, timeout=10)
            if res.status_code == 200:
                data = res.json()
                contacts = data.get("_embedded", {}).get("contacts", [])
                if not contacts:
                    break
                for c in contacts:
                    c_id = c.get("id")
                    c_name = c.get("name", "")
                    c_resp_id = c.get("responsible_user_id")
                    phone = ""
                    cf_values = c.get("custom_fields_values") or []
                    for cf in cf_values:
                        if cf.get("field_code") == "PHONE":
                            vals = cf.get("values") or []
                            if vals:
                                phone = vals[0].get("value", "")
                                break
                    contact_map[c_id] = {
                        "name": c_name,
                        "phone": phone,
                        "responsible_user_id": c_resp_id
                    }
                
                links = data.get("_links", {})
                next_url = links.get("next", {}).get("href")
                if next_url:
                    url = next_url
                    params = None
                else:
                    break
            else:
                break
        except Exception as e:
            print(f"Failed to fetch amoCRM contacts: {e}")
            break
            
    return contact_map

# Background task for full sync
def run_amocrm_sync_background(subdomain, token, company_id: str = None):
    import time
    global amocrm_sync_progress
    if amocrm_sync_progress["running"]:
        print("amoCRM Sync already running. Skipping.")
        return
        
    print("amoCRM Background Sync: started.")
    amocrm_sync_progress = {"running": True, "processed": 0, "total": 0, "message": "amoCRM operatorlari ro'yxati yuklanmoqda..."}
    
    try:
        user_map = get_amocrm_users(subdomain, token)
        
        amocrm_sync_progress["message"] = "Kelishuv bosqichlari (status map) yuklanmoqda..."
        status_map = get_amocrm_status_map(subdomain, token)
        
        amocrm_sync_progress["message"] = "amoCRM kontaktlari qidirilmoqda..."
        contact_map = get_amocrm_contacts_map(subdomain, token)
        
        headers = get_amocrm_headers(token)
        
        # Fetch employees to resolve mapped names
        employees_list = []
        try:
            path = "employees?select=id,name"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            employees_list = supabase_get_all(path, company_id=company_id)
        except Exception as e_emp:
            print(f"amoCRM Sync: failed to load employees: {e_emp}")
        emp_id_to_name = {e.get("id"): e.get("name") for e in employees_list if e.get("id")}

        url = f"https://{subdomain}.amocrm.ru/api/v4/leads"
        params = {"limit": 250, "with": "contacts"}
        synced_customers = []
        
        for page_idx in range(12): # Fetch up to 3000 leads (12 pages)
            time.sleep(0.15) # Rate limit protection
            amocrm_sync_progress["message"] = f"amoCRM kelishuvlari yuklanmoqda ({page_idx + 1}-sahifa)..."
            try:
                res = requests.request("GET", url, headers=headers, params=params, timeout=15)
                if res.status_code == 200:
                    data = res.json()
                    leads = data.get("_embedded", {}).get("leads", [])
                    if not leads:
                        break
                    for l in leads:
                        lead_id = l.get("id")
                        lead_name = l.get("name")
                        price = float(l.get("price") or 0)
                        status_id = l.get("status_id")
                        resp_user_id = l.get("responsible_user_id")
                        
                        operator_name = user_map.get(resp_user_id, "")
                        status = status_map.get(status_id, "lead")
                        
                        contacts_list = l.get("_embedded", {}).get("contacts", [])
                        if not contacts_list:
                            continue
                            
                        c_id = contacts_list[0].get("id")
                        cust_name = lead_name
                        phone = ""
                        if c_id in contact_map:
                            phone = contact_map[c_id]["phone"]
                            cust_name = contact_map[c_id]["name"]
                            c_resp_id = contact_map[c_id].get("responsible_user_id")
                            if c_resp_id:
                                operator_name = user_map.get(c_resp_id, operator_name)
                        
                        clean_phone = "".join(c for c in phone if c.isdigit() or c == "+") if phone else ""
                        if not clean_phone:
                            continue
                            
                        # Map operator name if configured in settings
                        operators_map = settings.get("amocrm_operators_map") or {}
                        mapped_operator_name = None
                        if operator_name:
                            mapped_emp_id = operators_map.get(operator_name)
                            # Fallback to case-insensitive match
                            if not mapped_emp_id:
                                op_upper = operator_name.upper()
                                for k, v in operators_map.items():
                                    if k.upper() == op_upper:
                                        mapped_emp_id = v
                                        break
                            if mapped_emp_id and mapped_emp_id in emp_id_to_name:
                                mapped_operator_name = emp_id_to_name[mapped_emp_id]
                                
                        customer = {
                            "id": f"amocrm_{c_id}",
                            "name": cust_name,
                            "phone": clean_phone,
                            "operator": mapped_operator_name or operator_name,
                            "status": status,
                            "value": price,
                            "source": "amocrm"
                        }
                        if company_id:
                            customer["company_id"] = company_id
                        synced_customers.append(customer)
                    
                    links = data.get("_links", {})
                    next_url = links.get("next", {}).get("href")
                    if next_url:
                        url = next_url
                        params = None
                    else:
                        break
                else:
                    break
            except Exception as e:
                print(f"Failed to fetch amoCRM leads page: {e}")
                break
                
        if synced_customers:
            amocrm_sync_progress["message"] = f"Yuklangan {len(synced_customers)} ta mijoz saralanmoqda..."
            unique_customers = {}
            for cust in synced_customers:
                c_id = cust["id"]
                if c_id not in unique_customers:
                    unique_customers[c_id] = cust
                else:
                    existing = unique_customers[c_id]
                    if existing["status"] in ["lost", "won"] and cust["status"] not in ["lost", "won"]:
                        unique_customers[c_id] = cust
                    elif cust["value"] > existing["value"]:
                        existing["value"] = cust["value"]
            synced_customers = list(unique_customers.values())
    
            amocrm_sync_progress["message"] = f"Bazada yangilanmoqda: {len(synced_customers)} ta mijoz..."
            chunk_size = 100
            for i in range(0, len(synced_customers), chunk_size):
                chunk = synced_customers[i:i + chunk_size]
                supabase_req("POST", "customers?on_conflict=id", json_data=chunk)
            
            amocrm_sync_progress["running"] = False
            amocrm_sync_progress["message"] = f"Muvaffaqiyatli yakunlandi. {len(synced_customers)} ta mijoz sinxronlandi."
            print(f"amoCRM Background Sync: successfully synced {len(synced_customers)} active customers to database.")
        else:
            amocrm_sync_progress["running"] = False
            amocrm_sync_progress["message"] = "Sinxronizatsiya yakunlandi: faol mijoz topilmadi."
            print("amoCRM Background Sync: no active customers found.")
            
    except Exception as e_outer:
        amocrm_sync_progress["running"] = False
        amocrm_sync_progress["message"] = f"Xatolik yuz berdi: {str(e_outer)}"
        print(f"amoCRM Background Sync failed: {e_outer}")

def create_amocrm_deals_for_receipts(receipts, company_id, force=False):
    if not receipts:
        return
        
    try:
        settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
        if not force and not settings.get("amocrm_lead_creation"):
            print("amoCRM Lead Creation: Disabled in settings. Skipping.")
            return
            
        subdomain = settings.get("amocrm_subdomain", "")
        token = settings.get("amocrm_token", "")
        if not subdomain or not token:
            print("amoCRM Lead Creation: Credentials missing. Skipping.")
            return
            
        print(f"amoCRM Lead Creation: processing {len(receipts)} receipts...")
        headers = get_amocrm_headers(token)
        
        # Load amoCRM users to map operator names
        user_map = get_amocrm_users(subdomain, token)
        user_name_to_id = {}
        for uid, name in user_map.items():
            user_name_to_id[name.strip().lower()] = uid
            
        # Get employees to map cashier name -> employee ID
        employees_list = []
        try:
            path = "employees?select=id,name"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            employees_list = supabase_get_all(path, company_id=company_id)
        except Exception as e_emp:
            print(f"amoCRM Lead Creation: failed to load employees: {e_emp}")
        emp_name_to_id = {e.get("name").strip().lower(): e.get("id") for e in employees_list if e.get("name")}

        # Get local customers to cross-reference phone numbers, contact IDs and operator names
        customers = []
        try:
            path = "customers?select=id,phone,operator,source"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            customers = supabase_get_all(path, company_id=company_id)
        except Exception as e_cust:
            print(f"amoCRM Lead Creation: failed to load local customers: {e_cust}")
            
        phone_to_operator = {}
        for c in customers:
            ph = c.get("phone") or ""
            op = c.get("operator") or ""
            if ph and op:
                clean_ph = "".join(char for char in ph if char.isdigit() or char == "+")
                phone_to_operator[clean_ph] = op
                
        # Discover invoices catalog ID, paid status enum ID, and operator field mapping once
        invoices_catalog_id = None
        paid_enum_id = None
        operator_field_id = None
        operator_enums = []
        
        # Resolve field IDs dynamically from custom fields list
        bill_price_field_id = None
        payer_field_id = None
        bill_comment_field_id = None
        items_field_id = None
        bill_status_field_id = None
        
        try:
            catalogs_res = requests.get(f"https://{subdomain}.amocrm.ru/api/v4/catalogs", headers=headers, timeout=10)
            if catalogs_res.status_code == 200:
                catalogs = catalogs_res.json().get("_embedded", {}).get("catalogs", [])
                for c in catalogs:
                    if c.get("type") == "invoices":
                        invoices_catalog_id = c.get("id")
                        break
                        
            if invoices_catalog_id:
                cf_res = requests.get(f"https://{subdomain}.amocrm.ru/api/v4/catalogs/{invoices_catalog_id}/custom_fields", headers=headers, timeout=10)
                if cf_res.status_code == 200:
                    fields = cf_res.json().get("_embedded", {}).get("custom_fields", [])
                    for f in fields:
                        code = f.get("code")
                        fid = f.get("id")
                        if code == "BILL_STATUS":
                            bill_status_field_id = fid
                            enums = f.get("enums") or []
                            for e in enums:
                                if e.get("code") == "paid" or e.get("value") in ["TO'LANDI", "Оплачено"]:
                                    paid_enum_id = e.get("id")
                                    break
                        elif code == "PAYER":
                            payer_field_id = fid
                        elif code == "ITEMS":
                            items_field_id = fid
                        elif code == "BILL_COMMENT":
                            bill_comment_field_id = fid
                        elif code == "BILL_PRICE":
                            bill_price_field_id = fid
                                    
                        if f.get("name") and f.get("name").strip().lower() == "sotuv operatori":
                            operator_field_id = fid
                            operator_enums = f.get("enums") or []
        except Exception as e_discovery:
            print(f"amoCRM Lead Creation: Error during catalog discovery: {e_discovery}")

        for r in receipts:
            items = r.get("items") or {}
            if isinstance(items, str):
                try:
                    import json
                    items = json.loads(items)
                except Exception:
                    items = {}
            
            cust_name = items.get("customer_name") or ""
            cust_phone = items.get("customer_phone") or ""
            if not cust_phone:
                continue
                
            clean_phone = "".join(char for char in cust_phone if char.isdigit() or char == "+")
            if not clean_phone:
                continue
                
            code = r.get("code") or r.get("id")
            
            # Check if lead already exists in amoCRM to prevent duplicates
            already_exists = False
            try:
                check_url = f"https://{subdomain}.amocrm.ru/api/v4/leads?query={code}"
                check_res = requests.get(check_url, headers=headers, timeout=10)
                if check_res.status_code == 200:
                    check_data = check_res.json()
                    existing_leads = check_data.get("_embedded", {}).get("leads", [])
                    for el in existing_leads:
                        if el.get("name") == f"Buyurtma (REGOS: {code})":
                            already_exists = True
                            print(f"amoCRM Lead Creation: Lead for receipt {code} already exists (ID: {el.get('id')}). Skipping.")
                            break
            except Exception as e_check:
                print(f"amoCRM Lead Creation: Error checking existing lead: {e_check}")
                
            if already_exists:
                continue
                
            # Search contact in local DB first, then live API fallback
            contact_id = None
            
            # 1. Search in pre-fetched local customers database (fast and formatting-insensitive)
            p2 = "".join(char for char in clean_phone if char.isdigit())
            for c in customers:
                ph = c.get("phone") or ""
                p1 = "".join(char for char in ph if char.isdigit())
                if p1 and p2:
                    is_match = False
                    if len(p1) >= 9 and len(p2) >= 9:
                        is_match = p1[-9:] == p2[-9:]
                    else:
                        is_match = p1 == p2
                    if is_match and c.get("source") == "amocrm" and c.get("id", "").startswith("amocrm_"):
                        contact_id = c.get("id").split("_")[1]
                        print(f"amoCRM Lead Creation: Resolved contact ID {contact_id} from local DB for phone {clean_phone}")
                        break
            
            # 2. Live amoCRM API query fallback
            if not contact_id:
                # Try query with the last 9 digits to minimize formatting mismatches
                last_9 = clean_phone[-9:] if len(clean_phone) >= 9 else clean_phone
                search_url = f"https://{subdomain}.amocrm.ru/api/v4/contacts?query={last_9}"
                try:
                    search_res = requests.get(search_url, headers=headers, timeout=10)
                    if search_res.status_code == 200:
                        search_data = search_res.json()
                        contacts_found = search_data.get("_embedded", {}).get("contacts", [])
                        for c in contacts_found:
                            c_details = fetch_amocrm_contact_details(subdomain, token, c.get("id"))
                            if c_details:
                                cf_values = c_details.get("custom_fields_values") or []
                                matched = False
                                for cf in cf_values:
                                    if cf.get("field_code") == "PHONE":
                                        vals = cf.get("values") or []
                                        for v in vals:
                                            val_phone = v.get("value") or ""
                                            p1 = "".join(char for char in val_phone if char.isdigit())
                                            p2 = "".join(char for char in clean_phone if char.isdigit())
                                            if p1 and p2:
                                                is_match = False
                                                if len(p1) >= 9 and len(p2) >= 9:
                                                    is_match = p1[-9:] == p2[-9:]
                                                else:
                                                    is_match = p1 == p2
                                                if is_match:
                                                    contact_id = c.get("id")
                                                    matched = True
                                                    print(f"amoCRM Lead Creation: Found existing matching contact ID {contact_id} with phone {val_phone} via API fallback")
                                                    break
                                        if matched:
                                            break
                            if contact_id:
                                break
                except Exception as e_contact:
                    print(f"amoCRM Lead Creation: Failed contact lookup fallback for {clean_phone}: {e_contact}")
                
            if not contact_id:
                print(f"amoCRM Lead Creation: Could not resolve contact ID for {clean_phone}. Skipping invoice creation.")
                continue
                
            # Map operator to responsible_user_id
            operators_map = settings.get("amocrm_operators_map") or {}
            cashier_name = r.get("cashier_name")
            amocrm_user_name = None
            
            if cashier_name:
                # Find employee ID for this cashier
                emp_id = emp_name_to_id.get(cashier_name.strip().lower())
                if emp_id:
                    # Find which amoCRM operator name maps to this employee ID
                    for amocrm_op, mapped_id in operators_map.items():
                        if mapped_id == emp_id:
                            amocrm_user_name = amocrm_op
                            break
            
            if not amocrm_user_name:
                amocrm_user_name = cashier_name
                
            if not amocrm_user_name:
                amocrm_user_name = phone_to_operator.get(clean_phone)
                
            responsible_user_id = None
            if amocrm_user_name:
                responsible_user_id = user_name_to_id.get(amocrm_user_name.strip().lower())
                # Try partial matches on user names if direct lookup fails
                if not responsible_user_id:
                    op_clean = amocrm_user_name.strip().lower()
                    for name, uid in user_name_to_id.items():
                        if name in op_clean or op_clean in name:
                            responsible_user_id = uid
                            break
                
            # Search for an active lead for this contact in amoCRM
            lead_id = None
            try:
                links_url = f"https://{subdomain}.amocrm.ru/api/v4/contacts/{contact_id}/links"
                links_res = requests.get(links_url, headers=headers, timeout=10)
                if links_res.status_code == 200:
                    links_data = links_res.json()
                    links_list = links_data.get("_embedded", {}).get("links", [])
                    linked_lead_ids = [str(lnk.get("to_entity_id")) for lnk in links_list if lnk.get("to_entity_type") == "leads"]
                    
                    if linked_lead_ids:
                        ids_str = ",".join(linked_lead_ids)
                        leads_url = f"https://{subdomain}.amocrm.ru/api/v4/leads?filter[id]={ids_str}"
                        leads_res = requests.get(leads_url, headers=headers, timeout=10)
                        if leads_res.status_code == 200:
                            leads_list = leads_res.json().get("_embedded", {}).get("leads", [])
                            # Find the first active lead (status_id not in [142, 143])
                            for l in leads_list:
                                if l.get("status_id") not in [142, 143]:
                                    lead_id = l.get("id")
                                    print(f"amoCRM Lead Creation: Found existing active lead ID {lead_id} for contact {contact_id}. Reusing.")
                                    break
            except Exception as e_active_search:
                print(f"amoCRM Lead Creation: Failed to search active lead: {e_active_search}")
 
            if not lead_id:
                print(f"amoCRM Lead Creation: No active lead/deal found for contact {contact_id} and phone {clean_phone}. Skipping invoice creation.")
                continue
                
            lead_created_or_found = True
            
            # Update Contact and Lead (Deal) responsible user in amoCRM to match the sales operator
            if responsible_user_id:
                # 1. Update Contact
                try:
                    update_contact_url = f"https://{subdomain}.amocrm.ru/api/v4/contacts/{contact_id}"
                    contact_update_payload = {
                        "responsible_user_id": int(responsible_user_id)
                    }
                    contact_update_res = requests.patch(update_contact_url, headers=headers, json=contact_update_payload, timeout=10)
                    if contact_update_res.status_code == 200:
                        print(f"amoCRM Contact Update: Successfully updated responsible user for contact {contact_id} to {responsible_user_id}")
                    else:
                        print(f"amoCRM Contact Update failed: {contact_update_res.text}")
                except Exception as e_contact_update:
                    print(f"amoCRM Contact Update exception: {e_contact_update}")
                    
                # 2. Update Lead (Deal)
                try:
                    update_lead_url = f"https://{subdomain}.amocrm.ru/api/v4/leads/{lead_id}"
                    lead_update_payload = {
                        "responsible_user_id": int(responsible_user_id)
                    }
                    lead_update_res = requests.patch(update_lead_url, headers=headers, json=lead_update_payload, timeout=10)
                    if lead_update_res.status_code == 200:
                        print(f"amoCRM Lead Update: Successfully updated responsible user for lead {lead_id} to {responsible_user_id}")
                    else:
                        print(f"amoCRM Lead Update failed: {lead_update_res.text}")
                except Exception as e_lead_update:
                    print(f"amoCRM Lead Update exception: {e_lead_update}")
                    
            if lead_created_or_found and lead_id:
                # Dynamic Invoices creation and linking
                try:
                    if invoices_catalog_id:
                        try:
                            total_amount = float(r.get("total_amount") or 0.0)
                        except (ValueError, TypeError):
                            total_amount = 0.0
                        
                        # Find matching operator enum ID from pre-fetched list
                        operator_enum_id = None
                        if operator_field_id and amocrm_user_name:
                            for e in operator_enums:
                                e_val = e.get("value", "").strip().lower()
                                op_val = amocrm_user_name.strip().lower()
                                if e_val == op_val or e_val in op_val or op_val in e_val:
                                    operator_enum_id = e.get("id")
                                    print(f"amoCRM Invoice Creation: Found matching operator custom field enum {e.get('value')} (ID: {operator_enum_id}) for operator {amocrm_user_name}")
                                    break
                                    
                        # 3. Construct products (ITEMS) list from receipt products
                        receipt_products = items.get("products") or []
                        invoice_items = []
                        for p in receipt_products:
                            try:
                                u_price = float(p.get("price") or 0)
                            except (ValueError, TypeError):
                                u_price = 0.0
                            try:
                                u_qty = float(p.get("quantity") or 1)
                            except (ValueError, TypeError):
                                u_qty = 1.0
                                
                            invoice_items.append({
                                "value": {
                                    "sku": str(p.get("sku") or ""),
                                    "product_id": None,
                                    "description": p.get("name") or "Mahsulot",
                                    "unit_price": u_price,
                                    "unit_type": p.get("unit") or "ta",
                                    "quantity": u_qty,
                                    "discount": {
                                        "type": "amount",
                                        "value": 0.0
                                    },
                                    "vat_rate_id": 0,
                                    "vat_rate_value": 0,
                                    "bonus_points_per_purchase": 0.0,
                                    "external_uid": "",
                                    "metadata": []
                                }
                            })
                            
                        if not invoice_items:
                            invoice_items.append({
                                "value": {
                                    "sku": "",
                                    "product_id": None,
                                    "description": f"Buyurtma (REGOS: {code})",
                                    "unit_price": total_amount,
                                    "unit_type": "ta",
                                    "quantity": 1.0,
                                    "discount": {
                                        "type": "amount",
                                        "value": 0.0
                                    },
                                    "vat_rate_id": 0,
                                    "vat_rate_value": 0,
                                    "bonus_points_per_purchase": 0.0,
                                    "external_uid": "",
                                    "metadata": []
                                }
                            })
                            
                        # 4. Create Invoice Element using dynamic Field IDs (crucial for API validation)
                        element_fields = []
                        if bill_price_field_id:
                            element_fields.append({
                                "field_id": bill_price_field_id,
                                "values": [{"value": int(total_amount)}]
                            })
                        if payer_field_id:
                            element_fields.append({
                                "field_id": payer_field_id,
                                "values": [{
                                    "value": {
                                        "entity_type": "contacts",
                                        "entity_id": int(contact_id),
                                        "phone": clean_phone
                                    }
                                }]
                            })
                        if bill_comment_field_id:
                            element_fields.append({
                                "field_id": bill_comment_field_id,
                                "values": [{"value": "REGOS orqali avtomatik yuborildi"}]
                            })
                        if items_field_id:
                            element_fields.append({
                                "field_id": items_field_id,
                                "values": invoice_items
                            })
                        if bill_status_field_id and paid_enum_id:
                            element_fields.append({
                                "field_id": bill_status_field_id,
                                "values": [{"enum_id": paid_enum_id}]
                            })
                        if operator_field_id and operator_enum_id:
                            element_fields.append({
                                "field_id": operator_field_id,
                                "values": [{"enum_id": operator_enum_id}]
                            })

                        # Check if invoice element already exists to prevent duplicate creation
                        invoice_exists = False
                        try:
                            search_res = requests.get(f"https://{subdomain}.amocrm.ru/api/v4/catalogs/{invoices_catalog_id}/elements", headers=headers, params={"query": f"REGOS: {code}"}, timeout=10)
                            if search_res.status_code == 200:
                                elements_found = search_res.json().get("_embedded", {}).get("elements", [])
                                for el in elements_found:
                                    if el.get("name") == f"REGOS: {code}":
                                        invoice_exists = True
                                        print(f"amoCRM Invoice: 'REGOS: {code}' already exists in catalog. Skipping creation.")
                                        break
                        except Exception as e_search:
                            print(f"amoCRM Invoice: duplicate check failed: {e_search}")

                        if invoice_exists:
                            continue

                        element_payload = [
                            {
                                "name": f"REGOS: {code}",
                                "custom_fields_values": element_fields
                            }
                        ]
                        if responsible_user_id:
                            element_payload[0]["responsible_user_id"] = int(responsible_user_id)
                                    
                        element_res = requests.post(f"https://{subdomain}.amocrm.ru/api/v4/catalogs/{invoices_catalog_id}/elements", headers=headers, json=element_payload, timeout=10)
                        if element_res.status_code in [200, 201]:
                            created_elements = element_res.json().get("_embedded", {}).get("elements", [])
                            if created_elements:
                                element_id = created_elements[0].get("id")
                                print(f"amoCRM Invoice Creation: Successfully created invoice element {element_id} for lead {lead_id}")
                                
                                # 5. Link Invoice to Lead
                                link_payload = [
                                    {
                                        "to_entity_id": element_id,
                                        "to_entity_type": "catalog_elements",
                                        "metadata": {
                                            "catalog_id": invoices_catalog_id
                                        }
                                    }
                                ]
                                link_res = requests.post(f"https://{subdomain}.amocrm.ru/api/v4/leads/{lead_id}/link", headers=headers, json=link_payload, timeout=10)
                                if link_res.status_code in [200, 201]:
                                    print(f"amoCRM Invoice Linking: Successfully linked invoice {element_id} to lead {lead_id}")
                                else:
                                    print(f"amoCRM Invoice Linking failed: {link_res.text}")
                        else:
                            print(f"amoCRM Invoice Creation failed: {element_res.text}")
                except Exception as e_invoice:
                    print(f"amoCRM Invoice processing exception: {e_invoice}")
                
    except Exception as e_outer:
        print(f"amoCRM Lead Creation: Outer exception: {e_outer}")

@app.post("/api/integration/amocrm/sync")
def sync_amocrm_leads(background_tasks: BackgroundTasks, request: Request):
    company_id = get_company_id(request)
    settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
    subdomain = settings.get("amocrm_subdomain", "")
    token = settings.get("amocrm_token", "")
    if not subdomain or not token:
        raise HTTPException(status_code=400, detail="amoCRM sozlanmagan. Iltimos, sozlamalar sahifasida Subdomain va Tokenni saqlang.")
        
    background_tasks.add_task(run_amocrm_sync_background, subdomain, token, company_id)
    return {"status": "success", "message": "Sinxronizatsiya orqa fonda boshlandi."}

@app.get("/api/integration/amocrm/sync-status")
def get_amocrm_sync_status():
    return amocrm_sync_progress

@app.post("/api/integration/amocrm/webhook")
async def amocrm_webhook(request: Request):
    try:
        data_company_id = get_company_id(request)
        form_data = await request.form()
        form_dict = dict(form_data)
        print(f"Received amoCRM webhook: {form_dict}")
        
        lead_id = None
        for k, v in form_dict.items():
            if k.startswith("leads[") and k.endswith("][id]"):
                lead_id = v
                break
                
        if lead_id:
            settings = get_company_settings(data_company_id) if data_company_id else settings_state
            subdomain = settings.get("amocrm_subdomain")
            token = settings.get("amocrm_token")
            if subdomain and token:
                lead = fetch_amocrm_lead_details(subdomain, token, lead_id)
                if lead:
                    user_map = get_amocrm_users(subdomain, token)
                    status_map = get_amocrm_status_map(subdomain, token)
                    
                    try:
                        price = float(lead.get("price") or 0)
                    except (ValueError, TypeError):
                        price = 0.0
                    status_id = lead.get("status_id")
                    resp_user_id = lead.get("responsible_user_id")
                    operator_name = user_map.get(resp_user_id, "")
                    status = status_map.get(status_id, "lead")
                    
                    contacts_list = lead.get("_embedded", {}).get("contacts", [])
                    cust_name = lead.get("name")
                    phone = ""
                    c_id = None
                    
                    if contacts_list:
                        c_id = contacts_list[0].get("id")
                        contact = fetch_amocrm_contact_details(subdomain, token, c_id)
                        if contact:
                            cust_name = contact.get("name")
                            phone = extract_phone_from_contact(contact)
                            c_resp_id = contact.get("responsible_user_id")
                            if c_resp_id:
                                operator_name = user_map.get(c_resp_id, operator_name)
                            
                    if phone and c_id:
                        clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
                        
                        # Load employees list to resolve mapped names
                        employees_list = []
                        try:
                            path = "employees?select=id,name"
                            if data_company_id:
                                path += f"&company_id=eq.{data_company_id}"
                            employees_list = supabase_get_all(path, company_id=data_company_id)
                        except Exception as e_emp:
                            print(f"amoCRM Webhook: failed to load employees: {e_emp}")
                        emp_id_to_name = {e.get("id"): e.get("name") for e in employees_list if e.get("id")}
                        
                        # Map operator name if configured in settings
                        operators_map = settings.get("amocrm_operators_map") or {}
                        mapped_operator_name = None
                        if operator_name:
                            mapped_emp_id = operators_map.get(operator_name)
                            # Fallback to case-insensitive match
                            if not mapped_emp_id:
                                op_upper = operator_name.upper()
                                for k, v in operators_map.items():
                                    if k.upper() == op_upper:
                                        mapped_emp_id = v
                                        break
                            if mapped_emp_id and mapped_emp_id in emp_id_to_name:
                                mapped_operator_name = emp_id_to_name[mapped_emp_id]

                        customer = {
                            "id": f"amocrm_{c_id}",
                            "name": cust_name,
                            "phone": clean_phone,
                            "operator": mapped_operator_name or operator_name,
                            "status": status,
                            "value": price,
                            "source": "amocrm"
                        }
                        if data_company_id:
                            customer["company_id"] = data_company_id
                        supabase_req("POST", "customers?on_conflict=id", json_data=customer)
                        print(f"Webhook successfully synced customer from amoCRM: {customer}")
    except Exception as e:
        print(f"Error processing amoCRM webhook: {e}")
        
    return {"status": "success"}

# Mount frontend files (HTML, CSS, JS) to run at root url (must be mounted last)
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

from fastapi.responses import FileResponse

@app.get("/admin123")
def read_admin():
    admin_path = os.path.join(STATIC_DIR, "admin123.html")
    if os.path.exists(admin_path):
        return FileResponse(
            admin_path,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate, public, max-age=0"}
        )
    raise HTTPException(status_code=404, detail="Admin index file not found")

@app.post("/api/integration/amocrm/push-receipts")
def push_receipts_to_amocrm_endpoint(payload: dict, background_tasks: BackgroundTasks, request: Request):
    company_id = get_company_id(request)
    receipt_ids = payload.get("receipt_ids") or []
    if not receipt_ids:
        raise HTTPException(status_code=400, detail="Chek ID-lari ko'rsatilmagan")
        
    try:
        receipts = []
        chunk_size = 50
        for i in range(0, len(receipt_ids), chunk_size):
            chunk = receipt_ids[i:i + chunk_size]
            ids_str = ",".join(chunk)
            path = f"receipts?id=in.({ids_str})"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            chunk_receipts = supabase_req("GET", path, company_id=company_id)
            if chunk_receipts and isinstance(chunk_receipts, list):
                receipts.extend(chunk_receipts)
                
        if not receipts:
            return {"status": "success", "message": "Yuborish uchun ma'lumotlar topilmadi."}
            
        background_tasks.add_task(create_amocrm_deals_for_receipts, receipts, company_id, True)
        return {"status": "success", "message": f"{len(receipts)} ta chekni yuborish orqa fonda boshlandi."}
    except Exception as e:
        print(f"Manual Push Receipts: Error: {e}")
        raise HTTPException(status_code=500, detail=f"Tizim xatoligi yuz berdi: {str(e)}")

@app.post("/api/integration/amocrm/push-deal")
async def push_deal_to_amocrm(payload: dict, request: Request):
    company_id = get_company_id(request)
    deal_name = payload.get("deal_name") or "Yangi buyurtma"
    phone = payload.get("phone") or ""
    product_name = payload.get("product_name") or ""
    product_price = payload.get("product_price") or 0.0
    product_sku = payload.get("product_sku") or ""
    product_desc = payload.get("product_desc") or ""
    product_image = payload.get("product_image") or ""
    
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon raqami kiritilishi shart")
        
    try:
        settings = get_company_settings(company_id, bypass_cache=True) if company_id else settings_state
        subdomain = settings.get("amocrm_subdomain", "")
        token = settings.get("amocrm_token", "")
        if not subdomain or not token:
            raise HTTPException(status_code=400, detail="amoCRM sozlamalari (token yoki subdomain) topilmadi")
            
        headers = get_amocrm_headers(token)
        
        # Clean phone
        clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
        
        # 1. Search for existing contact by last 9 digits
        contact_id = None
        last_9 = clean_phone[-9:] if len(clean_phone) >= 9 else clean_phone
        search_url = f"https://{subdomain}.amocrm.ru/api/v4/contacts?query={last_9}"
        
        search_res = requests.get(search_url, headers=headers, timeout=10)
        if search_res.status_code == 200:
            contacts_found = search_res.json().get("_embedded", {}).get("contacts", [])
            if contacts_found:
                contact_id = contacts_found[0].get("id")
                
        # 2. Create contact if not found
        if not contact_id:
            contact_payload = [{
                "name": f"Mijoz ({clean_phone})",
                "custom_fields_values": [
                    {
                        "field_code": "PHONE",
                        "values": [{"value": clean_phone, "enum_code": "MOB"}]
                    }
                ]
            }]
            contact_res = requests.post(f"https://{subdomain}.amocrm.ru/api/v4/contacts", headers=headers, json=contact_payload, timeout=10)
            if contact_res.status_code == 200 or contact_res.status_code == 201:
                contacts_created = contact_res.json().get("_embedded", {}).get("contacts", [])
                if contacts_created:
                    contact_id = contacts_created[0].get("id")
            else:
                raise HTTPException(status_code=500, detail=f"amoCRM kontakt yaratishda xatolik: {contact_res.text}")
                
        if not contact_id:
            raise HTTPException(status_code=500, detail="amoCRM kontaktni aniqlash yoki yaratish imkoni bo'lmadi")
            
        # 3. Search for active lead linked to this contact
        lead_id = None
        try:
            links_url = f"https://{subdomain}.amocrm.ru/api/v4/contacts/{contact_id}/links"
            links_res = requests.get(links_url, headers=headers, timeout=10)
            if links_res.status_code == 200:
                links_list = links_res.json().get("_embedded", {}).get("links", [])
                linked_lead_ids = [str(lnk.get("to_entity_id")) for lnk in links_list if lnk.get("to_entity_type") == "leads"]
                
                if linked_lead_ids:
                    ids_str = ",".join(linked_lead_ids)
                    leads_url = f"https://{subdomain}.amocrm.ru/api/v4/leads?filter[id]={ids_str}"
                    leads_res = requests.get(leads_url, headers=headers, timeout=10)
                    if leads_res.status_code == 200:
                        leads_list = leads_res.json().get("_embedded", {}).get("leads", [])
                        for l in leads_list:
                            # 142 = won, 143 = lost. Keep active leads only.
                            if l.get("status_id") not in [142, 143]:
                                lead_id = l.get("id")
                                break
        except Exception as e_lead_search:
            print(f"amoCRM Push Deal: failed to search active lead: {e_lead_search}")

        # Construct note text beautifully
        note_lines = [
            "Mijoz so'ragan mahsulot ma'lumotlari:\n",
            f"📦 Nomi: {product_name}",
            f"🆔 SKU: {product_sku}",
            f"💰 Narxi: {int(product_price):,} so'm"
        ]
        if product_desc:
            note_lines.append(f"📝 Tasnifi: {product_desc}")
        if product_image:
            note_lines.append(f"🖼️ Rasmi: {product_image}")
        note_lines.append(f"\n💬 Operator izohi: {deal_name}")
        note_text = "\n".join(note_lines)

        # 4. If active lead exists, add a note to it instead of creating a new lead
        if lead_id:
            notes_payload = [{
                "note_type": "common",
                "params": {
                    "text": note_text
                }
            }]
            notes_url = f"https://{subdomain}.amocrm.ru/api/v4/leads/{lead_id}/notes"
            notes_res = requests.post(notes_url, headers=headers, json=notes_payload, timeout=10)
            
            if notes_res.status_code in [200, 201]:
                return {
                    "status": "success",
                    "message": "Mahsulot ma'lumotlari mavjud bitimga xabar (eslatma) sifatida qo'shildi!",
                    "lead_id": lead_id,
                    "contact_id": contact_id,
                    "is_new_deal": False
                }
            else:
                print(f"amoCRM Note Creation failed: {notes_res.text}")
                # Fallback to creating a new lead if note creation fails
                
        # 5. Create a new lead if none exists or note fallback failed
        lead_title = f"{deal_name} | {product_name} (SKU: {product_sku})"
        lead_payload = [{
            "name": lead_title,
            "price": int(product_price),
            "_embedded": {
                "contacts": [{"id": contact_id}]
            }
        }]
        
        lead_res = requests.post(f"https://{subdomain}.amocrm.ru/api/v4/leads", headers=headers, json=lead_payload, timeout=10)
        if lead_res.status_code in [200, 201]:
            leads_created = lead_res.json().get("_embedded", {}).get("leads", [])
            created_lead_id = leads_created[0].get("id") if leads_created else None
            
            # Post note to the newly created lead too!
            if created_lead_id:
                notes_payload = [{
                    "note_type": "common",
                    "params": {
                        "text": note_text
                    }
                }]
                notes_url = f"https://{subdomain}.amocrm.ru/api/v4/leads/{created_lead_id}/notes"
                requests.post(notes_url, headers=headers, json=notes_payload, timeout=5)
                
            return {
                "status": "success",
                "message": "Yangi bitim (sdelka) va kontakt amoCRM-da muvaffaqiyatli yaratildi!",
                "lead_id": created_lead_id,
                "contact_id": contact_id,
                "is_new_deal": True
            }
        else:
            raise HTTPException(status_code=500, detail=f"amoCRM-da bitim (sdelka) yaratishda xatolik: {lead_res.text}")
            
    except Exception as e:
        print(f"amoCRM Push Deal Error: {e}")
        if isinstance(e, HTTPException):
            raise e
# ===================================================
# --- BONUS PAYOUT & TELEGRAM ACCOUNTANT ROUTING ---
# ===================================================

PAYOUT_FILE = os.path.join(os.path.dirname(__file__), "payout_requests.json")

def load_payout_requests():
    if not os.path.exists(PAYOUT_FILE):
        return []
    try:
        with open(PAYOUT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_payout_requests(requests_list):
    try:
        with open(PAYOUT_FILE, "w", encoding="utf-8") as f:
            json.dump(requests_list, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving payout requests: {e}")

def notify_accountant_payout(payout_item, company_id="giperbrendstroy"):
    settings = get_company_settings(company_id)
    token = settings.get("payout_telegram_bot_token") or settings.get("telegram_token")
    chat_id = settings.get("payout_telegram_chat_id")
    
    if not token or not chat_id:
        print("Notice: Telegram bot token or accountant chat_id not configured in settings.")
        return False
        
    p_id = payout_item["id"]
    amt = f"{int(payout_item['amount']):,} so'm"
    name = payout_item.get("client_name", "Noma'lum usta")
    phone = payout_item.get("client_phone", "-")
    bc = payout_item.get("client_barcode", "-")
    card = payout_item.get("card_number", "-")
    holder = payout_item.get("card_holder", "-")
    date_str = datetime.now().strftime("%d.%m.%Y %H:%M")
    
    text = (
        f"🔔 <b>YANGI BONUS YECHISH SO'ROVI!</b>\n\n"
        f"👷 <b>Usta:</b> {name}\n"
        f"📱 <b>Telefon:</b> {phone}\n"
        f"🏷 <b>Shtrix-kod:</b> <code>{bc}</code>\n"
        f"💰 <b>Yechiladigan summa:</b> <b>{amt}</b>\n"
        f"💳 <b>Karta:</b> <code>{card}</code>\n"
        f"👤 <b>Karta egasi:</b> {holder}\n"
        f"🕒 <b>Sana:</b> {date_str}\n\n"
        f"<i>Pulni usta kartasiga o'tkazganingizdan so'ng, tasdiqlash tugmasini bosing:</i>"
    )
    
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": [
                [
                    {"text": "✅ To'landi va Bonusdan Yechilsin", "callback_data": f"payout_approve:{p_id}"}
                ],
                [
                    {"text": "❌ Rad etish", "callback_data": f"payout_reject:{p_id}"}
                ]
            ]
        }
    }
    
    try:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json=payload, timeout=10)
        return r.ok
    except Exception as e:
        print(f"Failed to send Telegram payout alert: {e}")
        return False

def execute_payout_approval(payout_id, company_id="giperbrendstroy", approver_info="Buxgalter"):
    reqs = load_payout_requests()
    target = None
    for r in reqs:
        if r.get("id") == payout_id:
            target = r
            break
            
    if not target:
        raise HTTPException(status_code=404, detail="So'rov topilmadi")
        
    if target.get("status") == "completed":
        return {"ok": True, "message": "Allaqachon tasdiqlangan va to'langan", "request": target}
        
    client_id = target.get("client_id")
    deduct_amount = float(target.get("amount") or 0)
    
    # 1. Fetch current customer data from DB
    c_res = supabase_req("GET", f"customers?id=eq.{client_id}")
    if not c_res or not isinstance(c_res, list) or len(c_res) == 0:
        raise HTTPException(status_code=404, detail="Usta mijozlar bazasidan topilmadi")
        
    c = c_res[0]
    current_bonus = float(c.get("value") or 0)
    op = c.get("operator") or ""
    meta = {}
    if op.startswith("{") and op.endswith("}"):
        try:
            meta = json.loads(op)
        except Exception:
            pass
            
    new_bonus = max(0.0, current_bonus - deduct_amount)
    
    # 2. Update bonus history
    history = meta.get("bonus_history") or []
    history.append({
        "type": "subtract",
        "amount": deduct_amount,
        "note": f"Kartaga yechildi ({target.get('card_number')}) - {approver_info}",
        "date": datetime.now().isoformat()
    })
    meta["bonus"] = new_bonus
    meta["bonus_history"] = history
    new_op = json.dumps(meta, ensure_ascii=False)
    
    # 3. Patch customer in DB
    supabase_req("PATCH", f"customers?id=eq.{client_id}", {
        "value": new_bonus,
        "operator": new_op
    })
    
    # 4. Mark request completed
    target["status"] = "completed"
    target["completed_at"] = datetime.now().isoformat()
    target["completed_by"] = approver_info
    save_payout_requests(reqs)
    
    return {
        "ok": True, 
        "message": "Bonus muvaffaqiyatli yechildi", 
        "new_bonus": new_bonus,
        "request": target
    }

def execute_payout_rejection(payout_id, reason="Buxgalteriya tomonidan rad etildi"):
    reqs = load_payout_requests()
    target = None
    for r in reqs:
        if r.get("id") == payout_id:
            target = r
            break
    if not target:
        raise HTTPException(status_code=404, detail="So'rov topilmadi")
        
    target["status"] = "rejected"
    target["rejection_reason"] = reason
    target["completed_at"] = datetime.now().isoformat()
    save_payout_requests(reqs)
    return {"ok": True, "request": target}

@app.post("/api/payout/request")
def create_payout_request(payload: dict, request: Request):
    client_id = payload.get("client_id")
    amount = float(payload.get("amount") or 0)
    card_number = str(payload.get("card_number") or "").replace(" ", "").strip()
    card_holder = str(payload.get("card_holder") or "").strip()
    phone = payload.get("phone") or ""
    note = payload.get("note") or ""
    company_id = payload.get("company_id") or get_company_id(request) or "giperbrendstroy"

    if not client_id:
        raise HTTPException(status_code=400, detail="Mijoz ID si talab qilinadi")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Summa 0 dan katta bo'lishi kerak")
    if len(card_number) < 16:
        raise HTTPException(status_code=400, detail="Karta raqami kamida 16 xonali bo'lishi kerak")

    # Fetch customer
    c_res = supabase_req("GET", f"customers?id=eq.{client_id}")
    if not c_res:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")
    c = c_res[0]
    current_bonus = float(c.get("value") or 0)
    if amount > current_bonus:
        raise HTTPException(status_code=400, detail=f"Yechiladigan summa ({amount:,.0f} so'm) mavjud bonusdan ({current_bonus:,.0f} so'm) ko'p bo'lishi mumkin emas")

    p_id = f"payout_{int(time.time())}_{uuid.uuid4().hex[:4]}"
    req_item = {
        "id": p_id,
        "client_id": client_id,
        "client_name": c.get("name") or "Usta",
        "client_phone": phone or c.get("phone") or "",
        "client_barcode": c.get("phone2") or "",
        "amount": amount,
        "card_number": card_number,
        "card_holder": card_holder or c.get("name"),
        "note": note,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "company_id": company_id
    }

    reqs = load_payout_requests()
    reqs.insert(0, req_item)
    save_payout_requests(reqs)

    # Send telegram alert to accountant if configured
    tg_sent = notify_accountant_payout(req_item, company_id=company_id)

    # Prepare share text for usta to forward if needed
    share_text = f"Assalomu alaykum! Bonus yechish so'rovi:\nUsta: {req_item['client_name']}\nSumma: {int(amount):,} so'm\nKarta: {card_number} ({card_holder})"
    direct_tg_url = f"https://t.me/share/url?url=&text={requests.utils.quote(share_text)}"

    return {
        "ok": True,
        "request": req_item,
        "telegram_sent": tg_sent,
        "direct_tg_url": direct_tg_url
    }

@app.get("/api/payout/requests")
def get_payout_requests(request: Request, client_id: str = None):
    reqs = load_payout_requests()
    if client_id:
        reqs = [r for r in reqs if r.get("client_id") == client_id]
    return {"ok": True, "requests": reqs}

@app.post("/api/payout/approve")
def api_approve_payout(payload: dict, request: Request):
    p_id = payload.get("payout_id")
    company_id = payload.get("company_id") or get_company_id(request) or "giperbrendstroy"
    return execute_payout_approval(p_id, company_id=company_id, approver_info="Admin/Kassa")

@app.post("/api/payout/reject")
def api_reject_payout(payload: dict):
    p_id = payload.get("payout_id")
    reason = payload.get("reason", "Admin tomonidan rad etildi")
    return execute_payout_rejection(p_id, reason)

@app.post("/api/telegram/webhook")
async def telegram_webhook(request: Request):
    try:
        data = await request.json()
        cb = data.get("callback_query")
        if cb:
            cb_id = cb.get("id")
            cb_data = cb.get("data", "")
            msg = cb.get("message", {})
            chat_id = msg.get("chat", {}).get("id")
            msg_id = msg.get("message_id")
            user = cb.get("from", {})
            user_name = user.get("first_name", "Buxgalter")
            
            settings = get_company_settings("giperbrendstroy")
            token = settings.get("payout_telegram_bot_token") or settings.get("telegram_token")
            
            if cb_data.startswith("payout_approve:"):
                p_id = cb_data.split(":", 1)[1]
                try:
                    res = execute_payout_approval(p_id, approver_info=f"TG: {user_name}")
                    req_obj = res.get("request", {})
                    requests.post(f"https://api.telegram.org/bot{token}/answerCallbackQuery", json={
                        "callback_query_id": cb_id,
                        "text": "Muvaffaqiyatli! Bonus hisobdan yechildi.",
                        "show_alert": True
                    }, timeout=5)
                    edited_text = (
                        f"✅ <b>TO'LANDI VA BONUSDAN YECHILDI!</b>\n\n"
                        f"👷 <b>Usta:</b> {req_obj.get('client_name')}\n"
                        f"💰 <b>Summa:</b> {int(req_obj.get('amount', 0)):,} so'm\n"
                        f"💳 <b>Karta:</b> <code>{req_obj.get('card_number')}</code>\n"
                        f"👤 <b>Tasdiqladi:</b> {user_name}\n"
                        f"🕒 <b>Vaqt:</b> {datetime.now().strftime('%d.%m.%Y %H:%M')}"
                    )
                    requests.post(f"https://api.telegram.org/bot{token}/editMessageText", json={
                        "chat_id": chat_id,
                        "message_id": msg_id,
                        "text": edited_text,
                        "parse_mode": "HTML"
                    }, timeout=5)
                except Exception as e_app:
                    requests.post(f"https://api.telegram.org/bot{token}/answerCallbackQuery", json={
                        "callback_query_id": cb_id,
                        "text": f"Xatolik: {e_app}",
                        "show_alert": True
                    }, timeout=5)
                    
            elif cb_data.startswith("payout_reject:"):
                p_id = cb_data.split(":", 1)[1]
                try:
                    execute_payout_rejection(p_id)
                    requests.post(f"https://api.telegram.org/bot{token}/answerCallbackQuery", json={
                        "callback_query_id": cb_id,
                        "text": "So'rov rad etildi.",
                        "show_alert": True
                    }, timeout=5)
                    requests.post(f"https://api.telegram.org/bot{token}/editMessageText", json={
                        "chat_id": chat_id,
                        "message_id": msg_id,
                        "text": f"❌ <b>SO'ROV RAD ETILDI!</b>\nTasdiqladi: {user_name}",
                        "parse_mode": "HTML"
                    }, timeout=5)
                except Exception as e_rej:
                    pass
        msg_obj = data.get("message")
        if msg_obj:
            chat = msg_obj.get("chat", {})
            c_id = chat.get("id")
            from_u = msg_obj.get("from", {})
            u_name = from_u.get("first_name", "Foydalanuvchi")
            u_text = (msg_obj.get("text") or "").strip()
            
            settings = get_company_settings("giperbrendstroy")
            token = settings.get("payout_telegram_bot_token") or settings.get("telegram_token")
            
            if token and c_id:
                if u_text.startswith("/start") or u_text.startswith("/id"):
                    welcome_reply = (
                        f"👋 Assalomu alaykum, <b>{u_name}</b>!\n\n"
                        f"🔑 Sizning Telegram <b>Chat ID</b> raqamingiz: <code>{c_id}</code>\n\n"
                        f"Ustalar bonusi to'lov so'rovlarini qabul qilish uchun ushbu ID raqamni CRM tizimidagi "
                        f"<b>Sozlamalar -> Ustalar Bonusi & Buxgalter Telegram</b> bo'limiga kiriting va saqlang.\n\n"
                        f"💡 Yoki to'g'ridan-to'g'ri /set_accountant buyrug'ini yuboring."
                    )
                    try:
                        requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={
                            "chat_id": c_id,
                            "text": welcome_reply,
                            "parse_mode": "HTML"
                        }, timeout=5)
                    except Exception:
                        pass
                elif u_text.startswith("/set_accountant"):
                    settings["payout_telegram_chat_id"] = str(c_id)
                    save_company_settings("giperbrendstroy", settings)
                    try:
                        requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={
                            "chat_id": c_id,
                            "text": (
                                f"✅ <b>Tabriklaymiz!</b>\n"
                                f"Siz muvaffaqiyatli Buxgalter qilib biriktirildingiz.\n"
                                f"Chat ID: <code>{c_id}</code>\n\n"
                                f"Endi ustalar mobil ilovadan bonus yechish so'rovi yuborganda, bildirishnoma va tasdiqlash tugmalari shu yerga keladi."
                            ),
                            "parse_mode": "HTML"
                        }, timeout=5)
                    except Exception:
                        pass
    except Exception as e:
        print(f"Telegram webhook error: {e}")
    return {"ok": True}

@app.get("/api/settings/payout-telegram")
def get_payout_telegram_settings(request: Request):
    company_id = get_company_id(request) or "giperbrendstroy"
    s = get_company_settings(company_id)
    return {
        "bot_token": s.get("payout_telegram_bot_token") or "",
        "chat_id": s.get("payout_telegram_chat_id") or ""
    }

@app.post("/api/settings/payout-telegram")
def update_payout_telegram_settings(payload: dict, request: Request):
    company_id = get_company_id(request) or "giperbrendstroy"
    s = get_company_settings(company_id)
    bot_token = (payload.get("bot_token") or "").strip()
    chat_id = (payload.get("chat_id") or "").strip()
    s["payout_telegram_bot_token"] = bot_token
    s["payout_telegram_chat_id"] = chat_id
    save_company_settings(company_id, s)

    test_sent = False
    if payload.get("send_test") and bot_token and chat_id:
        try:
            r = requests.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json={
                "chat_id": chat_id,
                "text": "✅ <b>SmartCore ERP Test Xabari:</b>\nBonus yechish boti muvaffaqiyatli ulandi! Barcha so'rovlar shu yerga keladi.",
                "parse_mode": "HTML"
            }, timeout=5)
            test_sent = r.ok
        except Exception:
            pass

    return {"ok": True, "saved": True, "test_sent": test_sent}

@app.get("/tv")
def tv_redirect(company: str = "giperbrendstroy"):
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"/tv.html?company={company}")

@app.get("/tv/{alias}")
def tv_alias_redirect(alias: str):
    from fastapi.responses import RedirectResponse
    company_map = {
        "giper": "giperbrendstroy",
        "protech": "protechctiy"
    }
    company_id = company_map.get(alias.lower(), alias)
    return RedirectResponse(url=f"/tv.html?company={company_id}")

@app.get("/")
def read_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(
            index_path,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate, public, max-age=0"}
        )
    raise HTTPException(status_code=404, detail="Index file not found")

if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    print(f"Warning: Static files directory {STATIC_DIR} not found!")
