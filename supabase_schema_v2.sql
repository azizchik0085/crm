-- =========================================================================
-- PRO-TECH ERP (V2) Database Schema & Migrations
-- Supabase SQL Editor'da ushbu kodni to'liq ishga tushiring.
-- =========================================================================

-- 1. UUID kengaytmasini faollashtirish
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Omborlar jadvali (Warehouses)
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    branch_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 3. Yetkazib beruvchilar jadvali (Suppliers)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    rating NUMERIC(3,2) DEFAULT 5.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 4. Mahsulot seriya raqamlari jadvali (Product Serials)
CREATE TABLE IF NOT EXISTS public.product_serials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    inventory_id TEXT NOT NULL, -- inventory(id) ga havola (SKU yoki ID)
    serial_number TEXT NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'in_stock', -- 'in_stock', 'sold', 'in_repair', 'damaged'
    purchase_price NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, serial_number)
);

-- 5. Xarid buyurtmalari jadvali (Purchase Orders)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft', -- 'draft', 'pending_approval', 'approved', 'ordered', 'received', 'cancelled'
    total_amount NUMERIC(15,2) DEFAULT 0.00,
    approved_by TEXT, -- Xodim login/ID-si
    expected_delivery_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Xarid tovarlari (Purchase Order Items)
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    inventory_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    price NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Muddatli to'lov savdolari (Installment Sales)
CREATE TABLE IF NOT EXISTS public.installment_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL, -- receipts(id) ga havola
    customer_id TEXT NOT NULL, -- customers(id) ga havola
    total_amount NUMERIC(15,2) NOT NULL,
    paid_amount NUMERIC(15,2) DEFAULT 0.00,
    remaining_debt NUMERIC(15,2) DEFAULT 0.00,
    period_months INTEGER DEFAULT 12,
    monthly_payment NUMERIC(15,2) DEFAULT 0.00,
    status TEXT DEFAULT 'active', -- 'active', 'overdue', 'completed'
    next_payment_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Loyihalar jadvali (Projects)
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'planning', -- 'planning', 'in_progress', 'completed', 'on_hold'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Vazifalar jadvali (Tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT, -- employees(id) ga havola
    priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    status TEXT DEFAULT 'todo', -- 'todo', 'in_progress', 'review', 'done'
    deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 8. Tizim audit jurnali (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE' va boshqalar
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    device_info TEXT,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Soliqlar jurnali (Tax Records)
CREATE TABLE IF NOT EXISTS public.tax_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    transaction_id TEXT, -- transactions(id) ga havola
    tax_type TEXT NOT NULL, -- 'VAT' (QQS), 'Corporate', 'Property', 'Payroll'
    amount NUMERIC(15,2) NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'paid'
    due_date DATE,
    invoice_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Xodimlar davomat jurnali (Employee Attendance)
CREATE TABLE IF NOT EXISTS public.employee_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    employee_id TEXT NOT NULL, -- employees(id) ga havola
    date DATE NOT NULL,
    clock_in TIMESTAMP WITH TIME ZONE,
    clock_out TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'present', -- 'present', 'late', 'absent', 'excused'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, employee_id, date)
);

-- Xodimlar ta'tillari (Employee Leaves)
CREATE TABLE IF NOT EXISTS public.employee_leaves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    employee_id TEXT NOT NULL, -- employees(id) ga havola
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type TEXT DEFAULT 'annual', -- 'annual', 'sick', 'unpaid'
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Servis ta'mirlash markazi (Service Orders)
CREATE TABLE IF NOT EXISTS public.service_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    customer_id TEXT NOT NULL, -- customers(id) ga havola
    product_name TEXT NOT NULL,
    serial_number TEXT,
    issue TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'diagnosing', 'in_progress', 'ready', 'delivered', 'cancelled'
    assigned_to TEXT, -- employees(id) ga havola (ustalar)
    cost NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Servis ehtiyot qismlari (Service Parts Used)
CREATE TABLE IF NOT EXISTS public.service_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,
    inventory_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    price NUMERIC(15,2) DEFAULT 0.00
);

-- 12. Marketing kampaniyalari (Marketing Campaigns)
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL, -- 'facebook', 'instagram', 'google', 'telegram'
    status TEXT DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
    budget NUMERIC(15,2) DEFAULT 0.00,
    spent NUMERIC(15,2) DEFAULT 0.00,
    leads INTEGER DEFAULT 0,
    roi NUMERIC(5,2) DEFAULT 0.00,
    roas NUMERIC(5,2) DEFAULT 0.00,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) ni o'chirib qo'yish (ishlab chiqish bosqichi uchun)
ALTER TABLE public.warehouses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_serials DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leaves DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_parts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns DISABLE ROW LEVEL SECURITY;
