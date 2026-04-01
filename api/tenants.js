const { criarTenant, buscarTenant, buscarConfiguracoes, salvarConfiguracao } = require('../lib/supabase');

// POST /api/tenants — Criar novo tenant (loja)
// GET  /api/tenants?id=xxx — Buscar tenant
// PUT  /api/tenants — Atualizar configuracoes do tenant

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // POST — Criar tenant
    if (req.method === 'POST') {
      const { nome, slug, email, plataforma } = req.body;

      if (!nome || !slug || !email) {
        return res.status(400).json({ error: 'nome, slug e email obrigatorios' });
      }

      // Validar slug (alfanumerico + hifens)
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'slug deve conter apenas letras minusculas, numeros e hifens' });
      }

      const tenant = await criarTenant({
        nome,
        slug,
        email,
        plataforma: plataforma || 'shopify',
        ativo: true
      });

      // Criar configuracoes padrao
      const configsPadrao = {
        loja_nome: nome,
        prazo_troca_dias: '30',
        prazo_devolucao_dias: '7',
        cor_primaria: '#6366f1',
        cor_secundaria: '#8b5cf6'
      };

      for (const [key, value] of Object.entries(configsPadrao)) {
        await salvarConfiguracao(tenant.id, key, value);
      }

      return res.status(201).json(tenant);
    }

    // GET — Buscar tenant
    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatorio' });

      const tenant = await buscarTenant(id);
      const config = await buscarConfiguracoes(id);

      return res.json({ ...tenant, config });
    }

    // PUT — Atualizar configuracoes
    if (req.method === 'PUT') {
      const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
      if (!tenantId) return res.status(400).json({ error: 'tenant_id obrigatorio' });

      const { configs } = req.body;
      if (!configs || typeof configs !== 'object') {
        return res.status(400).json({ error: 'configs (objeto) obrigatorio' });
      }

      const resultados = [];
      for (const [key, value] of Object.entries(configs)) {
        const r = await salvarConfiguracao(tenantId, key, typeof value === 'string' ? value : JSON.stringify(value));
        resultados.push(r);
      }

      return res.json({ updated: resultados.length });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (error) {
    console.error('Erro em /api/tenants:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
