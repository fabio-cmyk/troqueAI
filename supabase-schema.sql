-- ============================================
-- troqueAI — Schema do Banco de Dados
-- Plataforma SaaS de Trocas e Devolucoes
-- ============================================

-- TENANTS (Lojas)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  plataforma TEXT DEFAULT 'shopify',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- PEDIDOS (importados da plataforma do lojista)
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id TEXT,
  order_number TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_cpf TEXT,
  items JSONB,
  total_value NUMERIC(10,2),
  shipping_value NUMERIC(10,2),
  status TEXT DEFAULT 'paid',
  created_at_origin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, order_number)
);

CREATE INDEX idx_pedidos_tenant ON pedidos(tenant_id);
CREATE INDEX idx_pedidos_email ON pedidos(customer_email);
CREATE INDEX idx_pedidos_cpf ON pedidos(customer_cpf);
CREATE INDEX idx_pedidos_order ON pedidos(order_number);

-- SOLICITACOES (Trocas e Devolucoes)
CREATE TABLE IF NOT EXISTS solicitacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pedido_id UUID REFERENCES pedidos(id),
  order_number TEXT NOT NULL,
  protocolo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('troca', 'devolucao')),
  motivo TEXT,
  itens JSONB NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_cpf TEXT,
  observacao TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'aprovada', 'postado', 'recebido', 'resolvida', 'rejeitada', 'cancelada'
  )),
  codigo_postagem TEXT,
  cupom_codigo TEXT,
  cupom_valor NUMERIC(10,2),
  nota_interna TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_solicitacoes_tenant ON solicitacoes(tenant_id);
CREATE INDEX idx_solicitacoes_status ON solicitacoes(tenant_id, status);
CREATE INDEX idx_solicitacoes_protocolo ON solicitacoes(protocolo);
CREATE INDEX idx_solicitacoes_email ON solicitacoes(customer_email);
CREATE INDEX idx_solicitacoes_cpf ON solicitacoes(customer_cpf);
CREATE INDEX idx_solicitacoes_created ON solicitacoes(created_at DESC);

-- CONFIGURACOES POR TENANT
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_settings_tenant ON tenant_settings(tenant_id);

-- HISTORICO DE STATUS (audit trail)
CREATE TABLE IF NOT EXISTS solicitacao_historico (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id),
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  usuario TEXT,
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historico_solicitacao ON solicitacao_historico(solicitacao_id);

-- AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenants_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_pedidos_updated
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_solicitacoes_updated
  BEFORE UPDATE ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacao_historico ENABLE ROW LEVEL SECURITY;

-- Politica: service key tem acesso total
CREATE POLICY "Service key full access" ON tenants FOR ALL USING (true);
CREATE POLICY "Service key full access" ON pedidos FOR ALL USING (true);
CREATE POLICY "Service key full access" ON solicitacoes FOR ALL USING (true);
CREATE POLICY "Service key full access" ON tenant_settings FOR ALL USING (true);
CREATE POLICY "Service key full access" ON solicitacao_historico FOR ALL USING (true);
