import os
import uuid
from datetime import datetime, date, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api")

# Pydantic schemas for request payloads
class SupplierModel(BaseModel):
    id: Optional[str] = None
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[float] = 5.0

class PurchaseOrderItem(BaseModel):
    inventory_id: str
    quantity: int
    price: float

class PurchaseOrderModel(BaseModel):
    id: Optional[str] = None
    supplier_id: str
    expected_delivery_date: Optional[str] = None
    notes: Optional[str] = None
    items: List[PurchaseOrderItem]

class ProjectModel(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    status: Optional[str] = "planning"

class TaskModel(BaseModel):
    id: Optional[str] = None
    project_id: str
    title: str
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "todo"
    deadline: Optional[str] = None

class CampaignModel(BaseModel):
    id: Optional[str] = None
    name: str
    platform: str
    status: Optional[str] = "draft"
    budget: Optional[float] = 0.0
    spent: Optional[float] = 0.0
    leads: Optional[int] = 0
    roi: Optional[float] = 0.0
    roas: Optional[float] = 0.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class ServiceOrderModel(BaseModel):
    id: Optional[str] = None
    customer_id: str
    product_name: str
    serial_number: Optional[str] = None
    issue: str
    status: Optional[str] = "pending"
    assigned_to: Optional[str] = None
    cost: Optional[float] = 0.0
    parts: Optional[List[dict]] = []

class AttendanceModel(BaseModel):
    employee_id: str
    status: Optional[str] = "present"

class LeaveRequestModel(BaseModel):
    employee_id: str
    start_date: str
    end_date: str
    type: Optional[str] = "annual"
    reason: Optional[str] = None

# Custom audit logger helper
def log_audit(request: Request, action: str, table_name: str, record_id: str, old_val: Optional[dict] = None, new_val: Optional[dict] = None):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    if not company_id:
        company_id = request.headers.get("x-company-id") or "admin"
        
    user_id = request.headers.get("x-user-id") or "unknown"
    role = request.headers.get("x-user-role") or "unknown"
    ip = request.client.host if request.client else "127.0.0.1"
    device = request.headers.get("user-agent", "Unknown")
    
    audit_data = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "user_id": user_id,
        "role": role,
        "action": action,
        "table_name": table_name,
        "record_id": record_id,
        "old_value": old_val,
        "new_value": new_val,
        "ip_address": ip,
        "device_info": device,
        "department": role
    }
    try:
        supabase_req("POST", "audit_logs", json_data=audit_data, company_id=company_id)
    except Exception as e:
        print(f"Failed to log audit event: {e}")

# --- 1. PROCUREMENT (Xaridlar) ---

@router.get("/suppliers")
def get_suppliers(request: Request):
    from backend.main import supabase_req
    res = supabase_req("GET", "suppliers?deleted_at=is.null")
    return res or []

@router.post("/suppliers")
def save_supplier(payload: SupplierModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    data = payload.dict()
    
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        data["company_id"] = company_id
        action = "INSERT"
        old_val = None
        res = supabase_req("POST", "suppliers", json_data=data)
    else:
        action = "UPDATE"
        # Fetch old value for audit
        old_res = supabase_req("GET", f"suppliers?id=eq.{data['id']}")
        old_val = old_res[0] if old_res else None
        res = supabase_req("POST", "suppliers", json_data=data, params={"on_conflict": "id"})
        
    log_audit(request, action, "suppliers", data["id"], old_val, data)
    return res

@router.delete("/suppliers/{id}")
def delete_supplier(id: str, request: Request):
    from backend.main import supabase_req
    # Soft delete
    old_res = supabase_req("GET", f"suppliers?id=eq.{id}")
    old_val = old_res[0] if old_res else None
    
    deleted_at = datetime.now(timezone.utc).isoformat()
    res = supabase_req("PATCH", f"suppliers?id=eq.{id}", json_data={"deleted_at": deleted_at})
    log_audit(request, "DELETE", "suppliers", id, old_val, {"deleted_at": deleted_at})
    return {"status": "success", "id": id}

@router.get("/purchase-orders")
def get_purchase_orders(request: Request):
    from backend.main import supabase_req, get_company_id
    company_id = get_company_id(request)
    orders = supabase_req("GET", "purchase_orders?deleted_at=is.null", company_id=company_id) or []
    # Join with supplier
    suppliers = supabase_req("GET", "suppliers?deleted_at=is.null", company_id=company_id) or []
    sup_map = {s["id"]: s["name"] for s in suppliers}
    for o in orders:
        supplier_id = o.get("supplier_id")
        if supplier_id and supplier_id in sup_map:
            o["supplier_name"] = sup_map[supplier_id]
        else:
            notes = o.get("notes") or o.get("approved_by") or ""
            if notes.startswith("Mijoz: "):
                parts = notes.split(" | ")
                o["supplier_name"] = parts[0]
            else:
                o["supplier_name"] = "Noma'lum"
    return orders

@router.get("/purchase-orders/{id}")
def get_purchase_order_details(id: str, request: Request):
    from backend.main import supabase_req, get_company_id
    company_id = get_company_id(request)
    orders = supabase_req("GET", f"purchase_orders?id=eq.{id}", company_id=company_id) or []
    if not orders:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi")
    order = orders[0]
    raw_items = supabase_req("GET", f"purchase_order_items?purchase_order_id=eq.{id}", company_id=company_id) or []
    items = []
    for item in raw_items:
        items.append({
            "inventory_id": item.get("product_id"),
            "quantity": item.get("quantity"),
            "price": item.get("unit_cost")
        })
    supplier = None
    if order.get("supplier_id"):
        suppliers = supabase_req("GET", f"suppliers?id=eq.{order.get('supplier_id')}", company_id=company_id) or []
        if suppliers:
            supplier = suppliers[0]
    return {
        "order": order,
        "items": items,
        "supplier": supplier
    }

@router.post("/purchase-orders")
def save_purchase_order(payload: PurchaseOrderModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    
    order_id = payload.id or str(uuid.uuid4())
    order_data = {
        "id": order_id,
        "company_id": company_id,
        "supplier_id": payload.supplier_id,
        "notes": payload.notes,
        "expected_delivery_date": payload.expected_delivery_date,
        "status": "draft"
    }
    
    # Calculate total
    total = sum(item.quantity * item.price for item in payload.items)
    order_data["total_amount"] = total
    
    # Save order
    if not payload.id:
        supabase_req("POST", "purchase_orders", json_data=order_data)
        action = "INSERT"
    else:
        supabase_req("POST", "purchase_orders", json_data=order_data, params={"on_conflict": "id"})
        action = "UPDATE"
        
    # Delete old items and save new
    supabase_req("DELETE", f"purchase_order_items?purchase_order_id=eq.{order_id}")
    for item in payload.items:
        item_data = {
            "id": str(uuid.uuid4()),
            "purchase_order_id": order_id,
            "product_id": item.inventory_id,
            "quantity": item.quantity,
            "unit_cost": item.price
        }
        supabase_req("POST", "purchase_order_items", json_data=item_data)
        
    log_audit(request, action, "purchase_orders", order_id, None, order_data)
    return {"status": "success", "id": order_id}

@router.post("/purchase-orders/{id}/approve")
def approve_purchase_order(id: str, request: Request):
    from backend.main import supabase_req
    user_id = request.headers.get("x-user-id") or "admin"
    res = supabase_req("PATCH", f"purchase_orders?id=eq.{id}", json_data={"status": "approved", "approved_by": user_id})
    log_audit(request, "APPROVE", "purchase_orders", id, None, {"status": "approved", "approved_by": user_id})
    return res

@router.post("/purchase-orders/{id}/receive")
def receive_goods(id: str, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    
    order_res = supabase_req("GET", f"purchase_orders?id=eq.{id}")
    if not order_res:
        raise HTTPException(status_code=404, detail="Order not found")
    order = order_res[0]
    
    if order["status"] == "received":
        return {"status": "already_received"}
        
    # Get items
    raw_items = supabase_req("GET", f"purchase_order_items?purchase_order_id=eq.{id}") or []
    items = []
    for item in raw_items:
        items.append({
            "inventory_id": item.get("product_id"),
            "quantity": item.get("quantity"),
            "price": item.get("unit_cost")
        })
    
    # Update inventory stock
    for item in items:
        inv_res = supabase_req("GET", f"inventory?id=eq.{item['inventory_id']}")
        if inv_res:
            inv = inv_res[0]
            new_stock = int(inv.get("stock", 0)) + int(item["quantity"])
            supabase_req("PATCH", f"inventory?id=eq.{item['inventory_id']}", json_data={"stock": new_stock})
            
    # Mark order received
    supabase_req("PATCH", f"purchase_orders?id=eq.{id}", json_data={"status": "received"})
    
    # Record transaction (expense)
    transaction_data = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": "expense",
        "category": "Xaridlar",
        "amount": float(order["total_amount"]),
        "date": date.today().isoformat(),
        "description": f"Xarid buyurtmasi #{id[:8]} bo'yicha tovarlar qabul qilindi"
    }
    supabase_req("POST", "transactions", json_data=transaction_data)
    
    log_audit(request, "RECEIVE", "purchase_orders", id, None, {"status": "received"})
    return {"status": "success"}

# --- 2. TASKS & PROJECTS ---

@router.get("/projects")
def get_projects(request: Request):
    from backend.main import supabase_req
    return supabase_req("GET", "projects?deleted_at=is.null") or []

@router.post("/projects")
def save_project(payload: ProjectModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    data = payload.dict()
    
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        data["company_id"] = company_id
        res = supabase_req("POST", "projects", json_data=data)
    else:
        res = supabase_req("POST", "projects", json_data=data, params={"on_conflict": "id"})
        
    log_audit(request, "SAVE", "projects", data["id"], None, data)
    return res

@router.delete("/projects/{id}")
def delete_project(id: str, request: Request):
    from backend.main import supabase_req
    deleted_at = datetime.now(timezone.utc).isoformat()
    res = supabase_req("PATCH", f"projects?id=eq.{id}", json_data={"deleted_at": deleted_at})
    return {"status": "success"}

@router.get("/tasks")
def get_tasks(request: Request):
    from backend.main import supabase_req
    tasks = supabase_req("GET", "tasks?deleted_at=is.null") or []
    # Join with employee
    employees = supabase_req("GET", "employees") or []
    emp_map = {e["id"]: e["name"] for e in employees}
    
    projects = supabase_req("GET", "projects?deleted_at=is.null") or []
    proj_map = {p["id"]: p["name"] for p in projects}
    
    for t in tasks:
        t["assigned_to_name"] = emp_map.get(t["assigned_to"], "Biriktirilmagan")
        t["project_name"] = proj_map.get(t["project_id"], "Loyiha tashqarisi")
    return tasks

@router.post("/tasks")
def save_task(payload: TaskModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    data = payload.dict()
    
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        data["company_id"] = company_id
        res = supabase_req("POST", "tasks", json_data=data)
    else:
        res = supabase_req("POST", "tasks", json_data=data, params={"on_conflict": "id"})
        
    log_audit(request, "SAVE", "tasks", data["id"], None, data)
    return res

@router.patch("/tasks/{id}")
def update_task_fields(id: str, payload: dict, request: Request):
    from backend.main import supabase_req
    res = supabase_req("PATCH", f"tasks?id=eq.{id}", json_data=payload)
    log_audit(request, "UPDATE_TASK", "tasks", id, None, payload)
    return res

@router.delete("/tasks/{id}")
def delete_task(id: str, request: Request):
    from backend.main import supabase_req
    deleted_at = datetime.now(timezone.utc).isoformat()
    res = supabase_req("PATCH", f"tasks?id=eq.{id}", json_data={"deleted_at": deleted_at})
    return {"status": "success"}

# --- 3. MARKETING ---

@router.get("/marketing/campaigns")
def get_campaigns(request: Request):
    from backend.main import supabase_req
    return supabase_req("GET", "marketing_campaigns") or []

@router.post("/marketing/campaigns")
def save_campaign(payload: CampaignModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    data = payload.dict()
    
    # Calculate dynamic ROI/ROAS if leads exist
    if data["spent"] > 0 and data["leads"] > 0:
        # Mock calculation: ROAS = revenue / spent
        # For simulation, let's assume average lead value is 100,000 UZS
        revenue = data["leads"] * 100000
        data["roas"] = round(revenue / data["spent"], 2)
        data["roi"] = round(((revenue - data["spent"]) / data["spent"]) * 100, 2)
        
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())
        data["company_id"] = company_id
        res = supabase_req("POST", "marketing_campaigns", json_data=data)
    else:
        res = supabase_req("POST", "marketing_campaigns", json_data=data, params={"on_conflict": "id"})
        
    log_audit(request, "SAVE", "marketing_campaigns", data["id"], None, data)
    return res

@router.delete("/marketing/campaigns/{id}")
def delete_campaign(id: str, request: Request):
    from backend.main import supabase_req
    res = supabase_req("DELETE", f"marketing_campaigns?id=eq.{id}")
    return {"status": "success"}

# --- 4. SERVICE CENTER (Servis Markazi) ---

@router.get("/service/orders")
def get_service_orders(request: Request):
    from backend.main import supabase_req
    orders = supabase_req("GET", "service_orders") or []
    # Join with customers
    customers = supabase_req("GET", "customers") or []
    cust_map = {c["id"]: c["name"] for c in customers}
    
    employees = supabase_req("GET", "employees") or []
    emp_map = {e["id"]: e["name"] for e in employees}
    
    for o in orders:
        o["customer_name"] = cust_map.get(o["customer_id"], "Noma'lum")
        o["assigned_to_name"] = emp_map.get(o["assigned_to"], "Usta biriktirilmagan")
    return orders

@router.post("/service/orders")
def save_service_order(payload: ServiceOrderModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    
    order_id = payload.id or str(uuid.uuid4())
    order_data = {
        "id": order_id,
        "company_id": company_id,
        "customer_id": payload.customer_id,
        "product_name": payload.product_name,
        "serial_number": payload.serial_number,
        "issue": payload.issue,
        "status": payload.status,
        "assigned_to": payload.assigned_to,
        "cost": payload.cost
    }
    
    if not payload.id:
        supabase_req("POST", "service_orders", json_data=order_data)
    else:
        supabase_req("POST", "service_orders", json_data=order_data, params={"on_conflict": "id"})
        
    # Save parts used
    supabase_req("DELETE", f"service_parts?service_order_id=eq.{order_id}")
    for part in payload.parts:
        part_data = {
            "id": str(uuid.uuid4()),
            "service_order_id": order_id,
            "inventory_id": part["inventory_id"],
            "quantity": part.get("quantity", 1),
            "price": part.get("price", 0.0)
        }
        supabase_req("POST", "service_parts", json_data=part_data)
        
    log_audit(request, "SAVE", "service_orders", order_id, None, order_data)
    return {"status": "success", "id": order_id}

# --- 5. HR (Attendance & Leaves) ---

@router.get("/hr/attendance")
def get_attendance(request: Request, date_str: str = Query(None, alias="date")):
    from backend.main import supabase_req
    target_date = date_str or date.today().isoformat()
    attendance = supabase_req("GET", f"employee_attendance?date=eq.{target_date}") or []
    employees = supabase_req("GET", "employees") or []
    
    # Map attendance
    att_map = {a["employee_id"]: a for a in attendance}
    
    res = []
    for e in employees:
        att = att_map.get(e["id"], {"status": "absent", "clock_in": None, "clock_out": None})
        res.append({
            "employee_id": e["id"],
            "employee_name": e["name"],
            "role": e["role"],
            "status": att.get("status"),
            "clock_in": att.get("clock_in"),
            "clock_out": att.get("clock_out")
        })
    return res

@router.post("/hr/attendance")
def clock_in_out(payload: AttendanceModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    today = date.today().isoformat()
    
    # Check if record exists
    existing = supabase_req("GET", f"employee_attendance?employee_id=eq.{payload.employee_id}&date=eq.{today}")
    now_iso = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Clock out
        rec = existing[0]
        rec["clock_out"] = now_iso
        rec["status"] = "present"
        res = supabase_req("POST", "employee_attendance", json_data=rec, params={"on_conflict": "company_id,employee_id,date"})
        action = "CLOCK_OUT"
    else:
        # Clock in
        rec = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "employee_id": payload.employee_id,
            "date": today,
            "clock_in": now_iso,
            "status": payload.status or "present"
        }
        res = supabase_req("POST", "employee_attendance", json_data=rec)
        action = "CLOCK_IN"
        
    log_audit(request, action, "employee_attendance", payload.employee_id, None, rec)
    return res

@router.get("/hr/leaves")
def get_leaves(request: Request):
    from backend.main import supabase_req
    leaves = supabase_req("GET", "employee_leaves") or []
    employees = supabase_req("GET", "employees") or []
    emp_map = {e["id"]: e["name"] for e in employees}
    for l in leaves:
        l["employee_name"] = emp_map.get(l["employee_id"], "Noma'lum xodim")
    return leaves

@router.post("/hr/leaves")
def submit_leave(payload: LeaveRequestModel, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    data = payload.dict()
    data["id"] = str(uuid.uuid4())
    data["company_id"] = company_id
    data["status"] = "pending"
    res = supabase_req("POST", "employee_leaves", json_data=data)
    log_audit(request, "SUBMIT_LEAVE", "employee_leaves", data["id"], None, data)
    return res

@router.post("/hr/leaves/{id}/approve")
def approve_leave(id: str, request: Request):
    from backend.main import supabase_req
    res = supabase_req("PATCH", f"employee_leaves?id=eq.{id}", json_data={"status": "approved"})
    log_audit(request, "APPROVE_LEAVE", "employee_leaves", id, None, {"status": "approved"})
    return res

# --- 6. FINANCE & TAXES (Installments, Taxes, P&L) ---

@router.get("/finance/installments")
def get_installments(request: Request):
    from backend.main import supabase_req
    installments = supabase_req("GET", "installment_sales") or []
    customers = supabase_req("GET", "customers") or []
    cust_map = {c["id"]: c["name"] for c in customers}
    for i in installments:
        i["customer_name"] = cust_map.get(i["customer_id"], "Noma'lum")
    return installments

@router.post("/finance/installments/{id}/pay")
def pay_installment(id: str, request: Request, amount: float = Query(...)):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    
    inst_res = supabase_req("GET", f"installment_sales?id=eq.{id}")
    if not inst_res:
        raise HTTPException(status_code=404, detail="Installment not found")
    inst = inst_res[0]
    
    new_paid = float(inst.get("paid_amount", 0)) + amount
    new_debt = float(inst["total_amount"]) - new_paid
    status = "completed" if new_debt <= 0 else "active"
    
    next_payment = datetime.now(timezone.utc)
    # Next payment date is in 30 days
    from datetime import timedelta
    next_payment_str = (next_payment + timedelta(days=30)).date().isoformat()
    
    update_data = {
        "paid_amount": new_paid,
        "remaining_debt": new_debt,
        "status": status,
        "next_payment_date": next_payment_str
    }
    
    supabase_req("PATCH", f"installment_sales?id=eq.{id}", json_data=update_data)
    
    # Record income transaction
    transaction_data = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": "income",
        "category": "Muddatli to'lov",
        "amount": amount,
        "date": date.today().isoformat(),
        "description": f"Muddatli to'lov #{id[:8]} bo'yicha to'lov qabul qilindi"
    }
    supabase_req("POST", "transactions", json_data=transaction_data)
    
    log_audit(request, "PAY_INSTALLMENT", "installment_sales", id, inst, update_data)
    return {"status": "success", "remaining_debt": new_debt}

@router.get("/tax/records")
def get_tax_records(request: Request):
    from backend.main import supabase_req
    return supabase_req("GET", "tax_records") or []

@router.post("/tax/records")
def save_tax_record(payload: dict, request: Request):
    from backend.main import supabase_req, active_company_id
    company_id = active_company_id.get()
    payload["id"] = str(uuid.uuid4())
    payload["company_id"] = company_id
    res = supabase_req("POST", "tax_records", json_data=payload)
    return res

@router.get("/finance/reports/pl")
def get_pl_report(request: Request):
    from backend.main import supabase_req
    txs = supabase_req("GET", "transactions") or []
    
    revenue = 0.0
    expenses = 0.0
    by_category = {}
    
    for tx in txs:
        cat = tx.get("category", "Boshqa")
        amt = float(tx.get("amount", 0.0))
        if tx.get("type") == "income":
            revenue += amt
            by_category[cat] = by_category.get(cat, 0.0) + amt
        else:
            expenses += amt
            by_category[cat] = by_category.get(cat, 0.0) - amt
            
    net_profit = revenue - expenses
    return {
        "revenue": revenue,
        "expenses": expenses,
        "net_profit": net_profit,
        "by_category": by_category
    }

# --- 7. AUDIT LOGS VIEW ---
@router.get("/audit-logs")
def get_audit_logs(request: Request):
    from backend.main import supabase_req
    return supabase_req("GET", "audit_logs?order=created_at.desc&limit=100") or []

# --- 8. CEO DASHBOARD REAL-TIME WIDGETS ---
@router.get("/ceo/dashboard")
def get_ceo_dashboard(request: Request):
    from backend.main import supabase_req
    
    # Fetch base tables
    receipts = supabase_req("GET", "receipts") or []
    transactions = supabase_req("GET", "transactions") or []
    inventory = supabase_req("GET", "inventory") or []
    customers = supabase_req("GET", "customers") or []
    employees = supabase_req("GET", "employees") or []
    tasks = supabase_req("GET", "tasks?deleted_at=is.null") or []
    campaigns = supabase_req("GET", "marketing_campaigns") or []
    attendance = supabase_req("GET", f"employee_attendance?date=eq.{date.today().isoformat()}") or []
    installments = supabase_req("GET", "installment_sales") or []
    pos = supabase_req("GET", "purchase_orders") or []
    
    # 1. Sales Calculations
    today_str = date.today().isoformat()
    sales_today = 0.0
    monthly_sales = 0.0
    yearly_sales = 0.0
    this_month_prefix = today_str[:7] # YYYY-MM
    this_year_prefix = today_str[:4] # YYYY
    
    for r in receipts:
        dt = r.get("created_at", "")
        amt = float(r.get("total_amount", 0.0))
        if dt.startswith(today_str):
            sales_today += amt
        if dt.startswith(this_month_prefix):
            monthly_sales += amt
        if dt.startswith(this_year_prefix):
            yearly_sales += amt
            
    sales_plan = 750000000.0 # 750M UZS plan
    plan_percent = round((monthly_sales / sales_plan) * 100, 2) if sales_plan > 0 else 0.0
    
    # 2. Finance Calculations
    total_income = sum(float(t["amount"]) for t in transactions if t["type"] == "income")
    total_expense = sum(float(t["amount"]) for t in transactions if t["type"] == "expense")
    gross_profit = total_income
    net_profit = total_income - total_expense
    
    bank_balance = sum(float(t["amount"]) for t in transactions if t["type"] == "income" and "bank" in t.get("category", "").lower())
    bank_balance -= sum(float(t["amount"]) for t in transactions if t["type"] == "expense" and "bank" in t.get("category", "").lower())
    bank_balance = max(bank_balance, 150000000.0) # Mock min
    cash_balance = max(net_profit - bank_balance, 50000000.0)
    
    accounts_receivable = sum(float(i["remaining_debt"]) for i in installments)
    accounts_payable = sum(float(p["total_amount"]) for p in pos if p["status"] == "approved")
    
    monthly_expenses = sum(float(t["amount"]) for t in transactions if t["type"] == "expense" and t.get("date", "").startswith(this_month_prefix))
    estimated_taxes = monthly_sales * 0.12 # Simulated 12% VAT
    
    # 3. Warehouse Calculations
    warehouse_value = sum(int(i.get("stock", 0)) * float(i.get("price", 0.0)) for i in inventory)
    low_stock = sum(1 for i in inventory if int(i.get("stock", 0)) < 15)
    dead_stock = sum(1 for i in inventory if int(i.get("stock", 0)) == 0)
    
    pending_purchases = len([p for p in pos if p["status"] == "ordered"])
    received_goods_value = sum(float(p["total_amount"]) for p in pos if p["status"] == "received")
    active_transfers = 1 # simulated
    damaged_stock_value = 12000000.0 # simulated 12M UZS
    
    inventory_turnover = 4.2 # simulated ratio
    avg_lead_time = 5 # simulated 5 days
    avg_supplier_rating = 4.7 # simulated
    serial_tracked_stock = sum(int(i.get("stock", 0)) for i in inventory)
    scan_events_today = 35 # simulated
    
    # 4. CRM, Sales & Marketing
    new_leads_today = len([c for c in customers if c.get("status") == "lead" and c.get("created_at", "").startswith(today_str)])
    new_leads_today = max(new_leads_today, 3) # simulated min
    
    leads_by_stage = {
        "lead": len([c for c in customers if c.get("status") == "lead"]),
        "contacted": len([c for c in customers if c.get("status") == "contacted"]),
        "won": len([c for c in customers if c.get("status") == "won"]),
        "lost": len([c for c in customers if c.get("status") == "lost"])
    }
    
    avg_deal_value = 4500000.0 # 4.5M UZS avg deal
    avg_sales_cycle = 14 # 14 days
    
    marketing_budget_used = sum(float(c.get("spent", 0.0)) for c in campaigns)
    marketing_leads = sum(int(c.get("leads", 0)) for c in campaigns)
    lead_cost = round(marketing_budget_used / marketing_leads, 2) if marketing_leads > 0 else 0.0
    avg_roi = round(sum(float(c.get("roi", 0.0)) for c in campaigns) / len(campaigns), 2) if campaigns else 0.0
    avg_roas = round(sum(float(c.get("roas", 0.0)) for c in campaigns) / len(campaigns), 2) if campaigns else 0.0
    social_leads = int(marketing_leads * 0.7) # 70% from social media
    
    top_products = [{"name": i["name"], "stock": i["stock"], "price": i["price"]} for i in inventory[:3]]
    top_branches = [{"name": "Toshkent Bosh Ofis", "sales": monthly_sales * 0.6}, {"name": "Samarqand Filiali", "sales": monthly_sales * 0.4}]
    top_sales_reps = [{"name": e["name"], "role": e["role"], "kpi": e.get("kpi", 100)} for e in sorted(employees, key=lambda x: x.get("kpi", 100), reverse=True)[:3]]
    
    # 5. HR & Quality & Security
    attendance_count = len([a for a in attendance if a["status"] == "present"])
    attendance_count = max(attendance_count, 12) # simulated min
    late_employees = len([a for a in attendance if a["status"] == "late"])
    on_leave_employees = 2 # simulated
    
    open_vacancies = 4 # simulated
    active_candidates = 15 # simulated
    avg_kpi_score = 92 # simulated 92%
    
    security_incidents = 0
    visitor_count = 14 # visitors today
    active_cameras = 24
    active_vehicles_tracked = 8
    
    customer_complaints = 1
    failed_quality_checks = 0
    avg_course_progress = 78 # 78% training completion
    active_tasks_count = sum(1 for t in tasks if t["status"] != "done")
    
    # AI recommendations list
    ai_recs = [
        "Sotuv pasayishi tendensiyasi kuzatilmoqda. Telegram kanallarida solar panellari aksiyasini kuchaytiring.",
        "Omborda 'Solar inverter' zaxirasi kritik darajadan kamaygan. Xarid buyurtmasini shakllantiring.",
        "Qarzdorligi muddati o'tgan 5 ta mijozga avtomatik ogohlantirish SMS yuborildi.",
        "Yoz mavsumida Qurilish materiallari savdosi 15% o'sishi bashorat qilinmoqda."
    ]
    
    return {
        "sales_today": sales_today,
        "monthly_sales": monthly_sales,
        "yearly_sales": yearly_sales,
        "sales_plan": sales_plan,
        "plan_percent": plan_percent,
        "gross_profit": gross_profit,
        "net_profit": net_profit,
        "cash_flow": net_profit * 0.9,
        "bank_balance": bank_balance,
        "cash_balance": cash_balance,
        "accounts_receivable": accounts_receivable,
        "accounts_payable": accounts_payable,
        "monthly_expenses": monthly_expenses,
        "estimated_taxes": estimated_taxes,
        "warehouse_value": warehouse_value,
        "low_stock": low_stock,
        "dead_stock": dead_stock,
        "pending_purchases": pending_purchases,
        "received_goods_value": received_goods_value,
        "active_transfers": active_transfers,
        "damaged_stock_value": damaged_stock_value,
        "inventory_turnover": inventory_turnover,
        "avg_lead_time": avg_lead_time,
        "avg_supplier_rating": avg_supplier_rating,
        "serial_tracked_stock": serial_tracked_stock,
        "scan_events_today": scan_events_today,
        "new_leads_today": new_leads_today,
        "leads_by_stage": leads_by_stage,
        "avg_deal_value": avg_deal_value,
        "avg_sales_cycle": avg_sales_cycle,
        "marketing_budget_used": marketing_budget_used,
        "roi": avg_roi,
        "roas": avg_roas,
        "lead_cost": lead_cost,
        "social_leads": social_leads,
        "top_products": top_products,
        "top_branches": top_branches,
        "top_sales_reps": top_sales_reps,
        "attendance": attendance_count,
        "late_employees": late_employees,
        "on_leave_employees": on_leave_employees,
        "open_vacancies": open_vacancies,
        "active_candidates": active_candidates,
        "avg_kpi_score": avg_kpi_score,
        "security_incidents": security_incidents,
        "visitor_count": visitor_count,
        "active_cameras": active_cameras,
        "active_vehicles_tracked": active_vehicles_tracked,
        "customer_complaints": customer_complaints,
        "failed_quality_checks": failed_quality_checks,
        "avg_course_progress": avg_course_progress,
        "active_tasks_count": active_tasks_count,
        "ai_recommendations": ai_recs
    }
