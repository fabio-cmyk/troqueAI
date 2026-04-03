const { buscarPedidoCliente, buscarSolicitacoesCliente, buscarTenantPorSlug, buscarConfiguracoes } = require('../lib/supabase');

// GET /api/portal?slug=minha-loja&identificador=cpf-ou-email&pedido=12345
// Endpoint publico para o portal do cliente

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const { slug, identificador, pedido, action } = req.query;

    if (!slug) return res.status(400).json({ error: 'slug da loja obrigatorio' });

    // Buscar tenant pelo slug
    const tenant = await buscarTenantPorSlug(slug);
    if (!tenant) return res.status(404).json({ error: 'Loja nao encontrada' });

    // Retornar config publica do tenant (para montar o portal)
    if (action === 'config') {
      const config = await buscarConfiguracoes(tenant.id);
      return res.json({
        tenant_id: tenant.id,
        loja_nome: config.loja_nome || tenant.nome,
        logo_url: config.logo_url || null,
        cor_primaria: config.cor_primaria || '#6366f1',
        cor_secundaria: config.cor_secundaria || '#8b5cf6',
        prazo_troca_dias: config.prazo_troca_dias || '30',
        motivos_troca: config.motivos_troca ? JSON.parse(config.motivos_troca) : [
          'Tamanho errado',
          'Cor diferente do esperado',
          'Produto com defeito',
          'Nao gostei do produto',
          'Produto diferente da foto',
          'Outro'
        ],
        motivos_devolucao: config.motivos_devolucao ? JSON.parse(config.motivos_devolucao) : [
          'Arrependimento',
          'Produto com defeito',
          'Produto errado enviado',
          'Outro'
        ]
      });
    }

    // Limpar CPF (remover pontos e tracos)
    const idLimpo = identificador ? identificador.replace(/[.\-\/]/g, '').trim() : '';

    // Buscar solicitacoes do cliente (nao precisa do numero do pedido)
    if (action === 'solicitacoes') {
      if (!idLimpo) return res.status(400).json({ error: 'identificador obrigatorio' });
      const solicitacoes = await buscarSolicitacoesCliente(tenant.id, idLimpo);
      return res.json(solicitacoes);
    }

    // Buscar pedido do cliente
    if (!idLimpo || !pedido) {
      return res.status(400).json({ error: 'identificador e pedido obrigatorios' });
    }

    if (action === 'pedido') {
      const pedidoData = await buscarPedidoCliente(tenant.id, idLimpo, pedido);
      if (!pedidoData) return res.status(404).json({ error: 'Pedido nao encontrado' });

      // Retornar dados seguros (sem info sensivel)
      return res.json({
        order_number: pedidoData.order_number,
        customer_name: pedidoData.customer_name,
        items: typeof pedidoData.items === 'string' ? JSON.parse(pedidoData.items) : pedidoData.items,
        status: pedidoData.status,
        created_at: pedidoData.created_at,
        total_value: pedidoData.total_value
      });
    }

    return res.status(400).json({ error: 'action obrigatorio: config, pedido, ou solicitacoes' });
  } catch (error) {
    console.error('Erro em /api/portal:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
