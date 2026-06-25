-- Supabase Database Schema for Smart ERP & CRM (Multi-Company Version)

-- 0. Companies Table (Kompaniyalar)
CREATE TABLE IF NOT EXISTS public.companies (
    id TEXT PRIMARY KEY, -- e.g., 'maxdecor'
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- 'active' yoki 'disabled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1. Customers Table (Mijozlar)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone2 TEXT,
    source TEXT DEFAULT 'manual',
    operator TEXT,
    email TEXT,
    company TEXT,
    status TEXT DEFAULT 'lead',
    value NUMERIC DEFAULT 0,
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Inventory Table (Omborxona)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    price NUMERIC DEFAULT 0,
    stock INTEGER DEFAULT 0,
    category TEXT,
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Employees Table (Xodimlar - HR)
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    salary NUMERIC DEFAULT 0,
    kpi INTEGER DEFAULT 100,
    status TEXT DEFAULT 'active',
    login TEXT,
    password TEXT,
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Transactions Table (Moliya)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'income' yoki 'expense'
    category TEXT,
    amount NUMERIC NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Calls Table (Qo'ng'iroqlar tarixi)
CREATE TABLE IF NOT EXISTS public.calls (
    id TEXT PRIMARY KEY,
    customer_id TEXT, -- agar bazada bo'lsa
    phone TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'incoming' yoki 'outgoing'
    duration INTEGER DEFAULT 0, -- soniyalarda
    status TEXT NOT NULL, -- 'answered', 'missed', 'failed'
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Messages Table (Xabarlar bazasi)
CREATE TABLE IF NOT EXISTS public.messages (
    id SERIAL PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    sender TEXT NOT NULL, -- 'customer' yoki 'agent'
    platform TEXT NOT NULL, -- 'telegram' yoki 'instagram'
    text TEXT NOT NULL,
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Receipts Table (Sotuv cheklari)
CREATE TABLE IF NOT EXISTS public.receipts (
    id TEXT PRIMARY KEY,
    code TEXT,
    cashier_name TEXT,
    total_amount NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    payment_type TEXT DEFAULT 'cash',
    items JSONB,
    company_id TEXT, -- Multi-tenant partitioning
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) ni o'chirib qo'yish (ishlab chiqish rejimi uchun)
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts DISABLE ROW LEVEL SECURITY;


-- =========================================================================
-- MIGRATION SCRIPT (Mavjud bazaga ustunlarni qo'shish uchun)
-- Supabase SQL Editor'da ushbu qismni alohida ishga tushirsangiz ham bo'ladi:
-- =========================================================================

-- ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id TEXT;
-- ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS company_id TEXT;
-- ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company_id TEXT;
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS company_id TEXT;
-- ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS company_id TEXT;
-- ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS company_id TEXT;
-- ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS company_id TEXT;
