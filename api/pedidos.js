const { supabase } = require('../lib/supabase');

/**
 * GET /api/pedidos?tenant_id=xxx — Listar pedidos (admin)
 * GET /api/pedidos?tenant_id=xxx&search=maria — Buscar por nome/email/pedido
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id obrigatorio' });

    const { search, status, platform, limit, offset } = req.query;

    let query = supabase
      .from('pedidos')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset || '0'), parseInt(offset || '0') + parseInt(limit || '50') - 1);

    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);

    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,order_number.ilike.%${search}%,customer_cpf.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({ pedidos: data, total: count });
  } catch (error) {
    console.error('Erro em /api/pedidos:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
