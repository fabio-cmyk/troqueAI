const {
  supabase,
  criarSolicitacao,
  buscarSolicitacoes,
  buscarSolicitacaoPorId,
  atualizarSolicitacao,
  buscarConfiguracoes
} = require('../lib/supabase');
const { enviarEmail } = require('../lib/email');
const { criarCupomShopify } = require('../lib/shopify');
const { criarCupomYampi } = require('../lib/yampi');
const { gerarPostagemReversa } = require('../lib/correios');

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
      const { pedido_id, order_number, tipo, motivo, itens, customer_name, customer_email, customer_cpf, observacao, fotos, endereco } = req.body;

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

      const dados = {
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
      };

      // Tentar incluir fotos e endereco (colunas podem nao existir ainda)
      try {
        if (fotos && fotos.length > 0) dados.fotos = JSON.stringify(fotos);
        if (endereco) dados.endereco = JSON.stringify(endereco);
        var solicitacao = await criarSolicitacao(dados);
      } catch (insertErr) {
        // Se falhar por coluna inexistente, tentar sem fotos/endereco
        if (insertErr.message?.includes('fotos') || insertErr.message?.includes('endereco') || insertErr.code === '42703') {
          delete dados.fotos;
          delete dados.endereco;
          var solicitacao = await criarSolicitacao(dados);
          console.warn('[SOLICITACOES] Colunas fotos/endereco nao existem — rode a migration 003');
        } else {
          throw insertErr;
        }
      }

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
      const { id, status, tipo, limit, offset, export: exportFormat } = req.query;

      if (id) {
        const solicitacao = await buscarSolicitacaoPorId(id, tenantId);
        return res.json(solicitacao);
      }

      const solicitacoes = await buscarSolicitacoes(tenantId, {
        status,
        tipo,
        limit: exportFormat === 'csv' ? 10000 : parseInt(limit || '20'),
        offset: parseInt(offset || '0')
      });

      // CSV export
      if (exportFormat === 'csv') {
        const header = 'protocolo,pedido,cliente,email,cpf,tipo,motivo,status,cupom,valor_cupom,data_criacao\n';
        const rows = solicitacoes.map(s => [
          s.protocolo,
          s.order_number,
          `"${(s.customer_name || '').replace(/"/g, '""')}"`,
          s.customer_email || '',
          s.customer_cpf || '',
          s.tipo,
          `"${(s.motivo || '').replace(/"/g, '""')}"`,
          s.status,
          s.cupom_codigo || '',
          s.cupom_valor || '',
          s.created_at ? s.created_at.split('T')[0] : ''
        ].join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=solicitacoes.csv');
        return res.send('\uFEFF' + header + rows);
      }

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
      if (cupom_codigo) atualizacao.cupom_codigo = cupom_codigo;
      if (cupom_valor) atualizacao.cupom_valor = cupom_valor;
      if (nota_interna) atualizacao.nota_interna = nota_interna;

      // Logistica reversa: gerar codigo de postagem automaticamente ao aprovar
      if (status === 'aprovada') {
        if (codigo_postagem) {
          atualizacao.codigo_postagem = codigo_postagem;
        } else {
          // Tentar gerar via Correios
          const config = await buscarConfiguracoes(tenantId);
          const solicitacaoAtual = await buscarSolicitacaoPorId(id, tenantId);
          const resultado = await gerarPostagemReversa(config, {
            customer_name: solicitacaoAtual.customer_name,
            customer_email: solicitacaoAtual.customer_email,
            protocolo: solicitacaoAtual.protocolo
          });
          if (resultado.sucesso) {
            atualizacao.codigo_postagem = resultado.codigo_postagem;
          }
        }
      } else if (codigo_postagem) {
        atualizacao.codigo_postagem = codigo_postagem;
      }

      const solicitacao = await atualizarSolicitacao(id, tenantId, atualizacao);

      // Auto-gerar cupom ao marcar como postado (se nao tem cupom manual)
      if (status === 'postado' && !cupom_codigo) {
        const config = await buscarConfiguracoes(tenantId);
        const itens = typeof solicitacao.itens === 'string' ? JSON.parse(solicitacao.itens) : (solicitacao.itens || []);
        const valorItens = itens.reduce((sum, item) => {
          return sum + (parseFloat(item.price || 0) * parseInt(item.quantity || 1));
        }, 0);

        if (valorItens > 0) {
          // Contar sequencia de trocas do mesmo pedido
          const { count } = await supabase
            .from('solicitacoes')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('order_number', solicitacao.order_number);

          const seq = count || 1;
          const cupomAuto = `TROCA${solicitacao.order_number}${seq}`;
          const valorAuto = valorItens.toFixed(2);
          const validadeDias = parseInt(config.cupom_validade) || 30;

          // Atualizar solicitacao com cupom
          await atualizarSolicitacao(id, tenantId, { cupom_codigo: cupomAuto, cupom_valor: valorAuto });

          // Criar cupom na plataforma
          if (config.shopify_store && config.shopify_access_token) {
            criarCupomShopify(config.shopify_store, config.shopify_access_token, {
              codigo: cupomAuto, valor: valorAuto, tipo_desconto: 'fixed_amount', validade_dias: validadeDias
            }).then(() => console.log(`[CUPOM AUTO] Shopify: ${cupomAuto} = R$${valorAuto}`))
              .catch(err => console.error('[CUPOM AUTO] Shopify erro:', err.message));
          }
          if (config.yampi_alias && config.yampi_token && config.yampi_secret_key) {
            criarCupomYampi(config.yampi_alias, config.yampi_token, config.yampi_secret_key, {
              codigo: cupomAuto, valor: valorAuto, tipo_desconto: 'fixed', validade_dias: validadeDias
            }).then(() => console.log(`[CUPOM AUTO] Yampi: ${cupomAuto} = R$${valorAuto}`))
              .catch(err => console.error('[CUPOM AUTO] Yampi erro:', err.message));
          }

          // Email com cupom
          if (solicitacao.customer_email) {
            enviarEmail(solicitacao.customer_email, 'vale_troca', {
              cliente_nome: solicitacao.customer_name || 'Cliente',
              loja_nome: config.loja_nome || 'Loja',
              cupom_codigo: cupomAuto, valor: valorAuto,
              validade: `${validadeDias} dias`
            }).catch(err => console.error('Erro email cupom auto:', err));
          }
        }
      }

      // Integracoes de cupom: criar cupom MANUAL na plataforma configurada
      if ((status === 'resolvida' || status === 'postado') && cupom_codigo) {
        const config = await buscarConfiguracoes(tenantId);
        const validadeDias = parseInt(config.cupom_validade) || 30;

        // Shopify
        if (config.shopify_store && config.shopify_access_token) {
          criarCupomShopify(config.shopify_store, config.shopify_access_token, {
            codigo: cupom_codigo,
            valor: cupom_valor || '0',
            tipo_desconto: 'fixed_amount',
            validade_dias: validadeDias
          }).then(result => {
            console.log(`[SHOPIFY] Cupom ${cupom_codigo} criado:`, result.discount_code_id);
          }).catch(err => {
            console.error('[SHOPIFY] Erro ao criar cupom:', err.message);
          });
        }

        // Yampi
        if (config.yampi_alias && config.yampi_token && config.yampi_secret_key) {
          criarCupomYampi(config.yampi_alias, config.yampi_token, config.yampi_secret_key, {
            codigo: cupom_codigo,
            valor: cupom_valor || '0',
            tipo_desconto: 'fixed',
            validade_dias: validadeDias
          }).then(result => {
            console.log(`[YAMPI] Cupom ${cupom_codigo} criado:`, result.coupon_id);
          }).catch(err => {
            console.error('[YAMPI] Erro ao criar cupom:', err.message);
          });
        }
      }

      // Enviar e-mail baseado no novo status (non-blocking)
      if (solicitacao.customer_email) {
        const config = await buscarConfiguracoes(tenantId);

        if (status === 'aprovada') {
          enviarEmail(solicitacao.customer_email, 'solicitacao_aprovada', {
            cliente_nome: solicitacao.customer_name || 'Cliente',
            protocolo: solicitacao.protocolo,
            codigo_postagem: atualizacao.codigo_postagem || codigo_postagem || ''
          }).catch(err => console.error('Erro email aprovacao:', err));
        }

        if (status === 'recebido') {
          enviarEmail(solicitacao.customer_email, 'produto_recebido', {
            cliente_nome: solicitacao.customer_name || 'Cliente',
            protocolo: solicitacao.protocolo
          }).catch(err => console.error('Erro email recebido:', err));
        }

        if (status === 'rejeitada') {
          enviarEmail(solicitacao.customer_email, 'solicitacao_rejeitada', {
            cliente_nome: solicitacao.customer_name || 'Cliente',
            protocolo: solicitacao.protocolo,
            motivo_rejeicao: nota_interna || '',
            loja_nome: config.loja_nome || 'Loja'
          }).catch(err => console.error('Erro email rejeicao:', err));
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
