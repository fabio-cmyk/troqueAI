const {
  criarSolicitacao,
  buscarSolicitacoes,
  buscarSolicitacaoPorId,
  atualizarSolicitacao,
  buscarConfiguracoes
} = require('../lib/supabase');
const { enviarEmail } = require('../lib/email');

// POST /api/solicitacoes — Criar solicitacao (portal do cliente)
// GET  /api/solicitacoes — Listar solicitacoes (dashboard admin)
// GET  /api/solicitacoes?id=xxx — Detalhe de uma solicitacao
// PATCH /api/solicitacoes — Atualizar status (dashboard admin)

module.exports = async function handler(req, res) {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id obrigatorio' });

    // POST — Cliente cria solicitacao
    if (req.method === 'POST') {
      const { pedido_id, order_number, tipo, motivo, itens, customer_name, customer_email, customer_cpf, observacao } = req.body;

      // Validar campos obrigatorios
      if (!order_number || !tipo || !itens?.length) {
        return res.status(400).json({ error: 'order_number, tipo e itens sao obrigatorios' });
      }

      // Validar tipo
      if (!['troca', 'devolucao'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo deve ser "troca" ou "devolucao"' });
      }

      // Buscar configuracoes do tenant para validar prazo
      const config = await buscarConfiguracoes(tenantId);
      const prazoMaximo = parseInt(config.prazo_troca_dias || '30');

      // Gerar protocolo unico
      const protocolo = `TRQ-${Date.now().toString(36).toUpperCase()}`;

      const solicitacao = await criarSolicitacao({
        tenant_id: tenantId,
        pedido_id,
        order_number,
        protocolo,
        tipo,
        motivo,
        itens: JSON.stringify(itens),
        customer_name,
        customer_email,
        customer_cpf,
        observacao,
        status: 'pendente'
      });

      // Enviar e-mail de confirmacao (non-blocking)
      if (customer_email) {
        enviarEmail(customer_email, 'solicitacao_criada', {
          loja_nome: config.loja_nome || 'Loja',
          cliente_nome: customer_name || 'Cliente',
          tipo,
          pedido_numero: order_number,
          protocolo
        }).catch(err => console.error('Erro ao enviar email:', err));
      }

      return res.status(201).json(solicitacao);
    }

    // GET — Listar ou buscar por ID
    if (req.method === 'GET') {
      const { id, status, tipo, limit, offset } = req.query;

      if (id) {
        const solicitacao = await buscarSolicitacaoPorId(id, tenantId);
        return res.json(solicitacao);
      }

      const solicitacoes = await buscarSolicitacoes(tenantId, {
        status,
        tipo,
        limit: parseInt(limit || '20'),
        offset: parseInt(offset || '0')
      });

      return res.json(solicitacoes);
    }

    // PATCH — Atualizar status
    if (req.method === 'PATCH') {
      const { id, status, codigo_postagem, cupom_codigo, cupom_valor, nota_interna } = req.body;

      if (!id || !status) {
        return res.status(400).json({ error: 'id e status obrigatorios' });
      }

      const statusValidos = ['pendente', 'aprovada', 'postado', 'recebido', 'resolvida', 'rejeitada', 'cancelada'];
      if (!statusValidos.includes(status)) {
        return res.status(400).json({ error: `status invalido. Validos: ${statusValidos.join(', ')}` });
      }

      const atualizacao = { status };
      if (codigo_postagem) atualizacao.codigo_postagem = codigo_postagem;
      if (cupom_codigo) atualizacao.cupom_codigo = cupom_codigo;
      if (cupom_valor) atualizacao.cupom_valor = cupom_valor;
      if (nota_interna) atualizacao.nota_interna = nota_interna;

      const solicitacao = await atualizarSolicitacao(id, tenantId, atualizacao);

      // Enviar e-mail baseado no novo status (non-blocking)
      if (solicitacao.customer_email) {
        const config = await buscarConfiguracoes(tenantId);

        if (status === 'aprovada') {
          enviarEmail(solicitacao.customer_email, 'solicitacao_aprovada', {
            cliente_nome: solicitacao.customer_name || 'Cliente',
            protocolo: solicitacao.protocolo,
            codigo_postagem: codigo_postagem || ''
          }).catch(err => console.error('Erro email aprovacao:', err));
        }

        if (status === 'resolvida' && cupom_codigo) {
          enviarEmail(solicitacao.customer_email, 'vale_troca', {
            cliente_nome: solicitacao.customer_name || 'Cliente',
            loja_nome: config.loja_nome || 'Loja',
            cupom_codigo,
            valor: cupom_valor || '0',
            validade: config.cupom_validade || '30 dias'
          }).catch(err => console.error('Erro email vale-troca:', err));
        }
      }

      return res.json(solicitacao);
    }

    if (req.method === 'OPTIONS') return res.status(200).end();

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (error) {
    console.error('Erro em /api/solicitacoes:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
