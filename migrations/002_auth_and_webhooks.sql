-- Migration 002: Auth + Webhooks
-- Rodar no Supabase SQL Editor

-- 1. Adicionar password_hash na tabela tenants para login do lojista
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Indices para performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_order ON pedidos(tenant_id, order_number);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_customer ON pedidos(tenant_id, customer_cpf);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_tenant_status ON solicitacoes(tenant_id, status);

-- 3. Garantir que pedidos tem campos necessarios para webhooks
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS platform_order_id TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'manual';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS raw_payload JSONB;
