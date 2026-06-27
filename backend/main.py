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

def get_company_id(request: Request = None, company_id: str = None):
    if company_id:
        return company_id
    if request:
        # Check headers or query params
        cid = request.headers.get("x-company-id") or request.query_params.get("company_id")
        if cid:
            return cid
        # Check if json body has it (if it is a post request)
        # Note: we don't read body here to avoid blocking body consumption, we do it in route handlers or parameters
    return None

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

def supabase_get_all(path, params=None):
    all_data = []
    limit = 1000
    offset = 0
    
    # Extract base path and query parameters
    base_path = path
    query_params = ""
    if "?" in path:
        base_path, query_params = path.split("?", 1)
        
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{base_path}"
        
        req_headers = headers.copy()
        req_headers["Range"] = f"{offset}-{offset + limit - 1}"
        
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
    return supabase_get_all(f"customers?select=*&company_id=eq.{company_id}")

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

# --- INVENTORY ENDPOINTS ---
@app.get("/api/inventory")
def get_inventory(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    return supabase_get_all(f"inventory?select=*&company_id=eq.{company_id}")

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
@app.post("/api/integration/regos/sync-employees")
def sync_regos_employees(request: Request):
    company_id = get_company_id(request)
    settings = get_company_settings(company_id) if company_id else settings_state
    regos_endpoint = settings.get("regos_endpoint", "")
    regos_token = settings.get("regos_token", "")
    
    if not regos_endpoint or not regos_token:
        raise HTTPException(status_code=400, detail="REGOS API sozlanmagan. Sozlamalardan Endpoint va Access Tokenni kiritib saqlang.")
        
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
            existing_employees = supabase_get_all(path)
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
                    supabase_req("DELETE", del_path)
                except Exception as e_del:
                    print(f"Failed to delete orphaned employee {old_id}: {e_del}")
            
        if synced_employees:
            supabase_req("POST", "employees?on_conflict=id", json_data=synced_employees)
            
        return {
            "status": "success", 
            "message": f"REGOS'dan {len(synced_employees)} ta xodim muvaffaqiyatli yuklandi.",
            "synced_count": len(synced_employees)
        }
    except Exception as e:
        print(f"Failed to sync employees from REGOS: {e}")
        raise HTTPException(status_code=500, detail=f"REGOS'dan xodimlarni yuklashda xatolik: {str(e)}")

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
    from datetime import timezone, timedelta
    
    company_id = get_company_id(request)
    settings = get_company_settings(company_id) if company_id else settings_state
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

@app.get("/api/employees")
def get_employees(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        return []
    try:
        sync_regos_employees(company_id=company_id)
    except Exception as e:
        print(f"Soft sync employees failed on GET: {e}")
    return supabase_get_all(f"employees?select=*&company_id=eq.{company_id}")

@app.post("/api/employees")
def save_employee(employee: dict, request: Request):
    company_id = get_company_id(request)
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

_settings_cache = {}

def get_company_settings(company_id: str):
    if not company_id:
        return {
            "telegram_token": "", "instagram_token": "", "ai_provider": "local",
            "telephony_provider": "sarkor", "gemini_api_key": "", "openai_api_key": "",
            "groq_api_key": "", "ai_auto_reply": False, "regos_endpoint": "", "regos_token": "",
            "amocrm_subdomain": "", "amocrm_token": "",
            "max_employees": 100,
            "enable_crm": True,
            "enable_warehouse": True,
            "enable_kassa": True,
            "amocrm_operators_map": {}
        }
    if company_id in _settings_cache:
        return _settings_cache[company_id]
        
    default_keys = {
        "telegram_token": "", "instagram_token": "", "ai_provider": "local",
        "telephony_provider": "sarkor", "gemini_api_key": "", "openai_api_key": "",
        "groq_api_key": "", "ai_auto_reply": False, "regos_endpoint": "", "regos_token": "",
        "amocrm_subdomain": "", "amocrm_token": "",
        "max_employees": 100,
        "enable_crm": True,
        "enable_warehouse": True,
        "enable_kassa": True,
        "amocrm_operators_map": {}
    }
    
    # 1. Try loading from Supabase database
    try:
        res = supabase_req("GET", f"receipts?id=eq.settings_{company_id}&select=items")
        if res and isinstance(res, list) and len(res) > 0:
            db_settings = res[0].get("items")
            if db_settings and isinstance(db_settings, dict):
                for k, v in default_keys.items():
                    if k not in db_settings:
                        db_settings[k] = v
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
        
    # 2. Save to Supabase
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
        supabase_req("POST", "receipts?on_conflict=id", json_data=payload)
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
    supabase_req("POST", f"companies?id=eq.{company_id}", json_data=update_payload)
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
    
    save_company_settings(company_id, company_settings)
    return {"status": "success", "settings": company_settings}

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
    if "roles" in settings:
        company_settings["roles"] = settings.get("roles")
    if "amocrm_operators_map" in settings:
        company_settings["amocrm_operators_map"] = settings.get("amocrm_operators_map", {})
    
    save_company_settings(company_id, company_settings)
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
def sync_regos_inventory(request: Request):
    company_id = get_company_id(request)
    if not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi aniqlanmadi.")
    return sync_regos_inventory_helper(company_id)

def sync_regos_inventory_helper(company_id: str = None):
    settings = get_company_settings(company_id) if company_id else settings_state
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
    settings = get_company_settings(company_id) if company_id else settings_state
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
                settings = get_company_settings(company_id) if company_id else settings_state
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
        if isinstance(card, dict):
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
            "seller_name": seller_name,
            "products": items_list
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
        
        supabase_req("POST", "receipts?on_conflict=id", json_data=receipt_payload)
        print(f"Successfully saved receipt {c_code} (UUID: {c_uuid}) to database.")
    except Exception as ex:
        print(f"Error parsing/saving receipt data: {ex}")

# Global state for tracking REGOS synchronization progress
sync_progress = {"running": False, "processed": 0, "total": 0, "message": ""}

def run_sync_in_background(days: int, company_id: str = None):
    global sync_progress
    if sync_progress["running"]:
        print("Sync is already running. Skipping.")
        return
        
    sync_progress["running"] = True
    sync_progress["processed"] = 0
    sync_progress["total"] = 0
    sync_progress["message"] = "REGOS API-dan cheklar ro'yxati olinmoqda..."
    
    try:
        settings = get_company_settings(company_id) if company_id else settings_state
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
        
        # 1. Fetch closed receipts from the cloud in sequential chunks
        now_ts = int(time.time())
        chunk_days = 30
        chunks_count = (days + chunk_days - 1) // chunk_days
        cheques_list = []
        
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
        start_range_ts = now_ts - (days * 24 * 3600)
        start_iso = datetime.fromtimestamp(start_range_ts, tz=timezone.utc).isoformat().replace("+", "%2B")
        end_iso = datetime.fromtimestamp(now_ts, tz=timezone.utc).isoformat().replace("+", "%2B")
        
        existing_receipts = {}  # id -> is_new_format (bool)
        limit = 1000
        offset = 0
        while True:
            path = f"receipts?select=id,items&created_at=gte.{start_iso}&created_at=lte.{end_iso}"
            if company_id:
                path += f"&company_id=eq.{company_id}"
            url = f"{SUPABASE_URL}/rest/v1/{path}"
            req_headers = headers.copy()
            req_headers["Range"] = f"{offset}-{offset + limit - 1}"
            try:
                res = requests.get(url, headers=req_headers, timeout=15)
                res.raise_for_status()
                chunk = res.json() if res.text else []
                if not chunk:
                    break
                for r in chunk:
                    if isinstance(r, dict) and "id" in r:
                        items_val = r.get("items")
                        is_new = False
                        if isinstance(items_val, dict) and "products" in items_val and "seller_name" in items_val:
                            is_new = True
                        existing_receipts[r["id"]] = is_new
                if len(chunk) < limit:
                    break
                offset += limit
            except Exception as e:
                print(f"Background Sync: Error fetching existing IDs: {e}")
                break
                
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
            
        saved_count = 0
        processed_receipts = []
        for idx, cheque in enumerate(cheques_list):
            if not isinstance(cheque, dict):
                continue
            
            c_uuid = cheque.get("uuid") or cheque.get("id")
            if not c_uuid:
                continue
                
            if c_uuid in existing_receipts and existing_receipts[c_uuid]:
                continue
                
            if idx % 50 == 0 or idx == len(cheques_list) - 1:
                sync_progress["processed"] = idx
                sync_progress["message"] = f"Cheklar qayta ishlanmoqda: {idx}/{len(cheques_list)}..."
                
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
                            if isinstance(pos_json, dict) and not pos_json.get("ok") and pos_json.get("result", {}).get("error") == 5054:
                                pos_online = False
                            else:
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
                    except Exception as pos_ex:
                        print(f"POS details query failed for {c_uuid}: {pos_ex}")
                        pos_online = False
                        
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
                        ops_resp = requests.post(ops_url, headers=regos_headers, json=ops_payload, timeout=5)
                        if ops_resp.status_code == 200:
                            ops_data = ops_resp.json()
                            ops_list = ops_data.get("result")
                            if isinstance(ops_list, list):
                                rows = ops_list
                    except Exception as e_ops:
                        print(f"Background Sync: failed to fetch operations/items for receipt {c_uuid}: {e_ops}")
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
                if isinstance(card, dict):
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
                    "seller_name": seller_name,
                    "products": items_list
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
                processed_receipts.append(receipt_payload)
                
                # Flush to database in batches of 100 to provide real-time updates and prevent memory exhaustion
                if len(processed_receipts) >= 100:
                    sync_progress["message"] = f"Cheklar saqlanmoqda: {idx}/{len(cheques_list)}..."
                    try:
                        supabase_req("POST", "receipts?on_conflict=id", json_data=processed_receipts)
                        saved_count += len(processed_receipts)
                    except Exception as ex:
                        print(f"Background Sync: batch upsert failed, doing single inserts... Error: {ex}")
                        for payload in processed_receipts:
                            try:
                                supabase_req("POST", "receipts?on_conflict=id", json_data=payload)
                                saved_count += 1
                            except Exception as single_ex:
                                print(f"Background Sync: Fallback insert failed for {payload['id']}: {single_ex}")
                    processed_receipts = []
            except Exception as e_row:
                print(f"Background Sync: error parsing receipt {c_uuid}: {e_row}")
                
        # 4. Flush remaining processed receipts
        if processed_receipts:
            sync_progress["message"] = f"Cheklar saqlanmoqda: so'nggi qism..."
            try:
                supabase_req("POST", "receipts?on_conflict=id", json_data=processed_receipts)
                saved_count += len(processed_receipts)
            except Exception as ex:
                print(f"Background Sync: final batch upsert failed, doing single inserts... Error: {ex}")
                for payload in processed_receipts:
                    try:
                        supabase_req("POST", "receipts?on_conflict=id", json_data=payload)
                        saved_count += 1
                    except Exception as single_ex:
                        print(f"Background Sync: Fallback insert failed for {payload['id']}: {single_ex}")
            processed_receipts = []
            
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
            path = f"receipts?select=*&company_id=eq.{company_id}&id=not.like.settings_*&or=(code.ilike.{term_lat},cashier_name.ilike.{term_lat},code.ilike.{term_cyr},cashier_name.ilike.{term_cyr})&order=created_at.desc&limit=1000"
            return supabase_req("GET", path)
        else:
            return supabase_req("GET", f"receipts?select=*&company_id=eq.{company_id}&id=not.like.settings_*&order=created_at.desc&limit=1000")
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
def sync_regos_receipts(background_tasks: BackgroundTasks, request: Request, days: int = 360):
    global sync_progress
    if sync_progress["running"]:
        raise HTTPException(status_code=400, detail="Sinxronizatsiya jarayoni allaqachon bajarilmoqda.")
        
    company_id = get_company_id(request)
    background_tasks.add_task(run_sync_in_background, days, company_id)
    return {
        "status": "processing",
        "message": f"Sinxronizatsiya orqa fonda boshlandi ({days} kunlik). Cheklar asta-sekin paydo bo'ladi."
    }

@app.get("/api/integration/regos/sync-status")
def get_sync_status():
    return sync_progress

@app.post("/api/test/simulate-receipt")
def simulate_receipt(payload: dict):
    try:
        save_parsed_receipt(payload)
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

@app.post("/api/auth/login")
def auth_login(payload: dict):
    login = payload.get("login")
    password = payload.get("password")
    company_id = payload.get("company_id")
    is_superadmin_portal = payload.get("is_superadmin_portal", False)
    
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
                "company_id": "admin"
            }
        }
        
    if is_superadmin_portal:
        raise HTTPException(status_code=403, detail="Faqat Super Admin ushbu portaldan kira oladi.")
        
    if not login or not password or not company_id:
        raise HTTPException(status_code=400, detail="Kompaniya kodi, login va parol kiritilishi shart.")
        
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
            return {
                "status": "success",
                "user": {
                    "id": found.get("id"),
                    "name": found.get("name"),
                    "role": found.get("role"),
                    "company_id": company_id
                }
            }
        else:
            raise HTTPException(status_code=401, detail="Noto'g'ri login yoki parol.")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

def get_amocrm_contacts_map(subdomain, token):
    headers = get_amocrm_headers(token)
    contact_map = {}
    url = f"https://{subdomain}.amocrm.ru/api/v4/contacts"
    params = {"limit": 250}
    
    for _ in range(12): # Fetch up to 3000 contacts (12 pages)
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
                        "phone": phone
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
    print("amoCRM Background Sync: started.")
    user_map = get_amocrm_users(subdomain, token)
    status_map = get_amocrm_status_map(subdomain, token)
    contact_map = get_amocrm_contacts_map(subdomain, token)
    
    headers = get_amocrm_headers(token)
    url = f"https://{subdomain}.amocrm.ru/api/v4/leads"
    params = {"limit": 250, "with": "contacts"}
    synced_customers = []
    
    for _ in range(12): # Fetch up to 3000 leads (12 pages)
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
                    
                    # Don't skip lost leads so we can match their operators and show stats
                    # if status == "lost":
                    #     continue
                        
                    contacts_list = l.get("_embedded", {}).get("contacts", [])
                    cust_name = lead_name
                    phone = ""
                    
                    if contacts_list:
                        c_id = contacts_list[0].get("id")
                        if c_id in contact_map:
                            phone = contact_map[c_id]["phone"]
                            cust_name = contact_map[c_id]["name"]
                    
                    clean_phone = "".join(c for c in phone if c.isdigit() or c == "+") if phone else ""
                    customer = {
                        "id": f"amocrm_{lead_id}",
                        "name": cust_name,
                        "phone": clean_phone,
                        "operator": operator_name,
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
            
    try:
        if synced_customers:
            chunk_size = 100
            for i in range(0, len(synced_customers), chunk_size):
                chunk = synced_customers[i:i + chunk_size]
                supabase_req("POST", "customers?on_conflict=id", json_data=chunk)
            print(f"amoCRM Background Sync: successfully synced {len(synced_customers)} active customers to database.")
        else:
            print("amoCRM Background Sync: no active customers found.")
    except Exception as e:
        print(f"amoCRM Background Sync failed saving to Supabase: {e}")

@app.post("/api/integration/amocrm/sync")
def sync_amocrm_leads(background_tasks: BackgroundTasks, request: Request):
    company_id = get_company_id(request)
    settings = get_company_settings(company_id) if company_id else settings_state
    subdomain = settings.get("amocrm_subdomain", "")
    token = settings.get("amocrm_token", "")
    if not subdomain or not token:
        raise HTTPException(status_code=400, detail="amoCRM sozlanmagan. Iltimos, sozlamalar sahifasida Subdomain va Tokenni saqlang.")
        
    background_tasks.add_task(run_amocrm_sync_background, subdomain, token, company_id)
    return {"status": "success", "message": "Sinxronizatsiya orqa fonda boshlandi."}

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
                    
                    price = float(lead.get("price") or 0)
                    status_id = lead.get("status_id")
                    resp_user_id = lead.get("responsible_user_id")
                    operator_name = user_map.get(resp_user_id, "")
                    status = status_map.get(status_id, "lead")
                    
                    contacts_list = lead.get("_embedded", {}).get("contacts", [])
                    cust_name = lead.get("name")
                    phone = ""
                    
                    if contacts_list:
                        c_id = contacts_list[0].get("id")
                        contact = fetch_amocrm_contact_details(subdomain, token, c_id)
                        if contact:
                            cust_name = contact.get("name")
                            phone = extract_phone_from_contact(contact)
                            
                    if phone:
                        clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
                        customer = {
                            "id": f"amocrm_{lead_id}",
                            "name": cust_name,
                            "phone": clean_phone,
                            "operator": operator_name,
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
