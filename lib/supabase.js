const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================
// TENANTS (Lojas)
// ============================================

async function criarTenant(dados) {
  const { data, error } = await supabase
    .from('tenants')
    .insert(dados)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function buscarTenant(tenantId) {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  return data;
}

async function buscarTenantPorSlug(slug) {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// SOLICITACOES (Trocas/Devolucoes)
// ============================================

async function criarSolicitacao(dados) {
  const { data, error } = await supabase
    .from('solicitacoes')
    .insert(dados)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function buscarSolicitacoes(tenantId, filtros = {}) {
  let query = supabase
    .from('solicitacoes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filtros.status) query = query.eq('status', filtros.status);
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
  if (filtros.limit) query = query.limit(filtros.limit);
  if (filtros.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limit || 20) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function buscarSolicitacaoPorId(id, tenantId) {
  const { data, error } = await supabase
    .from('solicitacoes')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (error) throw error;
  return data;
}

async function atualizarSolicitacao(id, tenantId, dados) {
  const { data, error } = await supabase
    .from('solicitacoes')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// BUSCA PELO CLIENTE (Portal)
// ============================================

async function buscarPedidoCliente(tenantId, identificador, numeroPedido) {
  // identificador pode ser CPF ou email
  const coluna = identificador.includes('@') ? 'customer_email' : 'customer_cpf';

  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq(coluna, identificador)
    .eq('order_number', numeroPedido)
    .single();

  if (error) throw error;
  return data;
}

async function buscarSolicitacoesCliente(tenantId, identificador) {
  const coluna = identificador.includes('@') ? 'customer_email' : 'customer_cpf';

  const { data, error } = await supabase
    .from('solicitacoes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq(coluna, identificador)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data;
}

// ============================================
// CONFIGURACOES DO TENANT
// ============================================

async function buscarConfiguracoes(tenantId) {
  const { data, error } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) throw error;

  // transforma array em objeto key-value
  return data.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

async function salvarConfiguracao(tenantId, key, value) {
  const { data, error } = await supabase
    .from('tenant_settings')
    .upsert({
      tenant_id: tenantId,
      key,
      value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,key' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  criarTenant,
  buscarTenant,
  buscarTenantPorSlug,
  criarSolicitacao,
  buscarSolicitacoes,
  buscarSolicitacaoPorId,
  atualizarSolicitacao,
  buscarPedidoCliente,
  buscarSolicitacoesCliente,
  buscarConfiguracoes,
  salvarConfiguracao
};
