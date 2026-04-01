const { supabase } = require('../lib/supabase');

// GET /api/dashboard — Metricas e stats para o admin
// Query params: tenant_id, periodo (7d, 30d, 90d)

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id obrigatorio' });

    const periodo = req.query.periodo || '30d';
    const dias = parseInt(periodo.replace('d', ''));
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias);

    // Total de solicitacoes no periodo
    const { data: solicitacoes, error: errSol } = await supabase
      .from('solicitacoes')
      .select('id, tipo, status, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', dataInicio.toISOString());

    if (errSol) throw errSol;

    // Calcular metricas
    const total = solicitacoes.length;
    const trocas = solicitacoes.filter(s => s.tipo === 'troca').length;
    const devolucoes = solicitacoes.filter(s => s.tipo === 'devolucao').length;

    const porStatus = {};
    solicitacoes.forEach(s => {
      porStatus[s.status] = (porStatus[s.status] || 0) + 1;
    });

    const pendentes = porStatus['pendente'] || 0;
    const aprovadas = porStatus['aprovada'] || 0;
    const resolvidas = porStatus['resolvida'] || 0;
    const rejeitadas = porStatus['rejeitada'] || 0;

    // Taxa de resolucao
    const taxaResolucao = total > 0 ? Math.round((resolvidas / total) * 100) : 0;

    // Solicitacoes por dia (para grafico)
    const porDia = {};
    solicitacoes.forEach(s => {
      const dia = s.created_at.split('T')[0];
      porDia[dia] = (porDia[dia] || 0) + 1;
    });

    return res.json({
      periodo,
      total,
      trocas,
      devolucoes,
      porStatus,
      pendentes,
      aprovadas,
      resolvidas,
      rejeitadas,
      taxaResolucao,
      porDia
    });
  } catch (error) {
    console.error('Erro em /api/dashboard:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
