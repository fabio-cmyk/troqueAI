const { supabase } = require('../lib/supabase');
const { buscarConfiguracoes } = require('../lib/supabase');
const { rastrearObjeto } = require('../lib/correios');
const { criarCupomShopify } = require('../lib/shopify');
const { criarCupomYampi } = require('../lib/yampi');
const { enviarEmail } = require('../lib/email');

/**
 * GET /api/tracking — Verifica tracking de todas solicitacoes aprovadas com codigo de postagem
 *
 * Chamado pelo Vercel Cron (a cada 30min) ou manualmente.
 * Quando Correios confirma "postado":
 *   1. Muda status pra "postado"
 *   2. Gera cupom automaticamente (Shopify/Yampi)
 *   3. Envia email pro cliente
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Aceitar GET (cron) e POST (manual)
  try {
    // Buscar todas solicitacoes "aprovada" com codigo_postagem
    const { data: solicitacoes, error } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('status', 'aprovada')
      .not('codigo_postagem', 'is', null)
      .not('codigo_postagem', 'eq', '');

    if (error) throw error;
    if (!solicitacoes?.length) {
      return res.json({ checked: 0, updated: 0, message: 'Nenhuma solicitacao para rastrear.' });
    }

    let checked = 0;
    let updated = 0;
    const results = [];

    // Agrupar por tenant pra buscar config uma vez
    const tenantIds = [...new Set(solicitacoes.map(s => s.tenant_id))];

    for (const tenantId of tenantIds) {
      const config = await buscarConfiguracoes(tenantId);
      const tenantSolicitacoes = solicitacoes.filter(s => s.tenant_id === tenantId);

      for (const sol of tenantSolicitacoes) {
        checked++;

        // Pular codigos simulados
        if (sol.codigo_postagem.startsWith('LR') && sol.codigo_postagem.length < 13) {
          continue;
        }

        const tracking = await rastrearObjeto(config, sol.codigo_postagem);

        if (tracking.foiPostado) {
          // Gerar cupom automatico
          const cupom = await gerarCupomAutomatico(sol, config);

          // Atualizar status
          const updateData = { status: 'postado', updated_at: new Date().toISOString() };
          if (cupom) {
            updateData.cupom_codigo = cupom.codigo;
            updateData.cupom_valor = cupom.valor;
          }

          await supabase
            .from('solicitacoes')
            .update(updateData)
            .eq('id', sol.id);

          // Email pro cliente
          if (sol.customer_email) {
            enviarEmail(sol.customer_email, 'solicitacao_aprovada', {
              cliente_nome: sol.customer_name || 'Cliente',
              protocolo: sol.protocolo,
              codigo_postagem: sol.codigo_postagem
            }).catch(err => console.error('Erro email postado:', err));
          }

          updated++;
          results.push({
            protocolo: sol.protocolo,
            codigoPostagem: sol.codigo_postagem,
            status: 'postado',
            cupom: cupom?.codigo || null
          });

          console.log(`[TRACKING] ${sol.protocolo} → POSTADO | Cupom: ${cupom?.codigo || 'N/A'}`);
        }

        if (tracking.foiEntregue) {
          // Se já está postado e foi entregue, marcar como recebido
          const { data: current } = await supabase
            .from('solicitacoes')
            .select('status')
            .eq('id', sol.id)
            .single();

          if (current?.status === 'postado') {
            await supabase
              .from('solicitacoes')
              .update({ status: 'recebido', updated_at: new Date().toISOString() })
              .eq('id', sol.id);

            if (sol.customer_email) {
              enviarEmail(sol.customer_email, 'produto_recebido', {
                cliente_nome: sol.customer_name || 'Cliente',
                protocolo: sol.protocolo
              }).catch(err => console.error('Erro email recebido:', err));
            }

            console.log(`[TRACKING] ${sol.protocolo} → RECEBIDO`);
          }
        }
      }
    }

    return res.json({ checked, updated, results });
  } catch (error) {
    console.error('Erro em /api/tracking:', error);
    return res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
};

/**
 * Gera cupom automaticamente baseado nos itens da solicitacao
 * Nome: TROCA{order_number}{sequencia}
 * Valor: soma dos precos dos itens selecionados
 */
async function gerarCupomAutomatico(solicitacao, config) {
  try {
    // Calcular valor dos itens
    const itens = typeof solicitacao.itens === 'string'
      ? JSON.parse(solicitacao.itens)
      : (solicitacao.itens || []);

    const valor = itens.reduce((sum, item) => {
      const preco = parseFloat(item.price || item.preco || 0);
      const qtd = parseInt(item.quantity || item.qtd || 1);
      return sum + (preco * qtd);
    }, 0);

    if (valor <= 0) return null;

    // Gerar sequencia: contar quantas solicitacoes ja existem pra esse pedido
    const { count } = await supabase
      .from('solicitacoes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', solicitacao.tenant_id)
      .eq('order_number', solicitacao.order_number);

    const seq = (count || 1);
    const codigo = `TROCA${solicitacao.order_number}${seq}`;
    const valorStr = valor.toFixed(2);
    const validadeDias = parseInt(config.cupom_validade) || 30;

    // Criar na Shopify
    if (config.shopify_store && config.shopify_access_token) {
      criarCupomShopify(config.shopify_store, config.shopify_access_token, {
        codigo,
        valor: valorStr,
        tipo_desconto: 'fixed_amount',
        validade_dias: validadeDias
      }).then(r => {
        console.log(`[CUPOM] Shopify: ${codigo} = R$${valorStr} criado`);
      }).catch(err => {
        console.error(`[CUPOM] Shopify erro: ${err.message}`);
      });
    }

    // Criar na Yampi
    if (config.yampi_alias && config.yampi_token && config.yampi_secret_key) {
      criarCupomYampi(config.yampi_alias, config.yampi_token, config.yampi_secret_key, {
        codigo,
        valor: valorStr,
        tipo_desconto: 'fixed',
        validade_dias: validadeDias
      }).then(r => {
        console.log(`[CUPOM] Yampi: ${codigo} = R$${valorStr} criado`);
      }).catch(err => {
        console.error(`[CUPOM] Yampi erro: ${err.message}`);
      });
    }

    // Enviar email com cupom
    if (solicitacao.customer_email) {
      enviarEmail(solicitacao.customer_email, 'vale_troca', {
        cliente_nome: solicitacao.customer_name || 'Cliente',
        loja_nome: config.loja_nome || 'Loja',
        cupom_codigo: codigo,
        valor: valorStr,
        validade: `${validadeDias} dias`
      }).catch(err => console.error('Erro email cupom:', err));
    }

    return { codigo, valor: valorStr };
  } catch (err) {
    console.error('[CUPOM] Erro gerando cupom automatico:', err.message);
    return null;
  }
}
