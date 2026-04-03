const axios = require('axios');
const { supabase } = require('../lib/supabase');
const { buscarConfiguracoes, salvarConfiguracao } = require('../lib/supabase');
const { verificarToken } = require('../lib/auth-middleware');

/**
 * POST /api/integracoes — Conectar plataforma, criar webhooks, importar pedidos
 *
 * Body: { action: "connect-shopify"|"connect-yampi"|"disconnect"|"import-status", ...params }
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  // Auth obrigatoria
  const payload = verificarToken(req);
  if (!payload) return res.status(401).json({ error: 'Token invalido' });

  const tenantId = payload.tenant_id;

  try {
    const { action } = req.body;

    // ==================== CONNECT SHOPIFY ====================
    if (action === 'connect-shopify') {
      const { store, access_token } = req.body;

      if (!store || !access_token) {
        return res.status(400).json({ error: 'store e access_token obrigatorios' });
      }

      const cleanStore = store.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const baseUrl = `https://${cleanStore}/admin/api/2024-01`;
      const headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
      };

      // 1. Verificar credenciais
      try {
        const shopRes = await axios.get(`${baseUrl}/shop.json`, { headers, timeout: 10000 });
        var shopName = shopRes.data.shop.name;
      } catch (err) {
        return res.status(400).json({ error: 'Credenciais Shopify invalidas. Verifique a store URL e o access token.' });
      }

      // 2. Criar webhook automaticamente
      const webhookUrl = `${getBaseUrl(req)}/api/webhooks?platform=shopify&tenant_id=${tenantId}`;

      try {
        // Listar webhooks existentes para evitar duplicatas
        const existing = await axios.get(`${baseUrl}/webhooks.json`, { headers });
        const alreadyExists = existing.data.webhooks?.some(w =>
          w.address === webhookUrl && w.topic === 'orders/create'
        );

        if (!alreadyExists) {
          await axios.post(`${baseUrl}/webhooks.json`, {
            webhook: {
              topic: 'orders/create',
              address: webhookUrl,
              format: 'json'
            }
          }, { headers });
        }
      } catch (err) {
        console.error('[SHOPIFY] Erro ao criar webhook:', err.response?.data || err.message);
        // Continua mesmo se webhook falhar (permissao pode nao existir)
      }

      // 3. Salvar credenciais
      await salvarConfiguracao(tenantId, 'shopify_store', cleanStore);
      await salvarConfiguracao(tenantId, 'shopify_access_token', access_token);
      await salvarConfiguracao(tenantId, 'plataforma_conectada', 'shopify');

      // 4. Importar pedidos dos ultimos 30 dias (async)
      const importResult = await importShopifyOrders(tenantId, cleanStore, access_token);

      return res.json({
        ok: true,
        shop_name: shopName,
        webhook_created: true,
        orders_imported: importResult.count,
        message: `Shopify conectada! ${importResult.count} pedidos importados.`
      });
    }

    // ==================== CONNECT YAMPI ====================
    if (action === 'connect-yampi') {
      const { alias, user_token, secret_key } = req.body;

      if (!alias || !user_token || !secret_key) {
        return res.status(400).json({ error: 'alias, user_token e secret_key obrigatorios' });
      }

      const yampiHeaders = {
        'User-Token': user_token,
        'User-Secret-Key': secret_key,
        'Content-Type': 'application/json'
      };

      // 1. Verificar credenciais
      try {
        var yampiShop = await axios.get(`https://api.dooki.com.br/v2/${alias}`, {
          headers: yampiHeaders,
          timeout: 10000
        });
      } catch (err) {
        return res.status(400).json({ error: 'Credenciais Yampi invalidas. Verifique alias, token e secret key.' });
      }

      // 2. Criar webhook
      const webhookUrl = `${getBaseUrl(req)}/api/webhooks?platform=yampi&tenant_id=${tenantId}`;

      try {
        await axios.post(`https://api.dooki.com.br/v2/${alias}/webhooks`, {
          url: webhookUrl,
          event: 'order.paid'
        }, { headers: yampiHeaders });
      } catch (err) {
        console.error('[YAMPI] Erro ao criar webhook:', err.response?.data || err.message);
      }

      // 3. Salvar credenciais
      await salvarConfiguracao(tenantId, 'yampi_alias', alias);
      await salvarConfiguracao(tenantId, 'yampi_token', user_token);
      await salvarConfiguracao(tenantId, 'yampi_secret_key', secret_key);
      await salvarConfiguracao(tenantId, 'plataforma_conectada', 'yampi');

      // 4. Importar pedidos dos ultimos 30 dias
      const importResult = await importYampiOrders(tenantId, alias, yampiHeaders);

      return res.json({
        ok: true,
        shop_name: yampiShop.data?.data?.name || alias,
        webhook_created: true,
        orders_imported: importResult.count,
        message: `Yampi conectada! ${importResult.count} pedidos importados.`
      });
    }

    // ==================== DISCONNECT ====================
    if (action === 'disconnect') {
      const keysToRemove = [
        'shopify_store', 'shopify_access_token', 'shopify_webhook_secret',
        'yampi_alias', 'yampi_token', 'yampi_secret_key',
        'plataforma_conectada'
      ];

      for (const key of keysToRemove) {
        await supabase
          .from('tenant_settings')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('key', key);
      }

      return res.json({ ok: true, message: 'Plataforma desconectada.' });
    }

    // ==================== STATUS ====================
    if (action === 'status') {
      const config = await buscarConfiguracoes(tenantId);
      const connected = config.plataforma_conectada || null;

      let platformInfo = null;
      if (connected === 'shopify' && config.shopify_store) {
        platformInfo = { platform: 'shopify', store: config.shopify_store };
      } else if (connected === 'yampi' && config.yampi_alias) {
        platformInfo = { platform: 'yampi', alias: config.yampi_alias };
      }

      // Contar pedidos importados
      const { count } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      return res.json({
        connected: !!connected,
        platform: platformInfo,
        orders_count: count || 0
      });
    }

    return res.status(400).json({ error: 'action invalida' });
  } catch (error) {
    console.error('Erro em /api/integracoes:', error);
    return res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
};

// ==================== HELPERS ====================

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Importa pedidos dos ultimos 30 dias da Shopify
 */
async function importShopifyOrders(tenantId, store, accessToken) {
  const baseUrl = `https://${store}/admin/api/2024-01`;
  const headers = { 'X-Shopify-Access-Token': accessToken };

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  let count = 0;
  let pageUrl = `${baseUrl}/orders.json?created_at_min=${since}&status=any&limit=250`;

  try {
    while (pageUrl) {
      const res = await axios.get(pageUrl, { headers, timeout: 30000 });
      const orders = res.data.orders || [];

      for (const order of orders) {
        const customer = order.customer || {};
        const items = (order.line_items || []).map(item => ({
          name: item.title || item.name,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku || '',
          variant_title: item.variant_title || ''
        }));

        // Extrair CPF de note_attributes
        let cpf = '';
        if (order.note_attributes) {
          const cpfAttr = order.note_attributes.find(a =>
            a.name.toLowerCase().includes('cpf') || a.name.toLowerCase().includes('documento')
          );
          if (cpfAttr) cpf = cpfAttr.value.replace(/[.\-\/]/g, '');
        }

        const pedido = {
          tenant_id: tenantId,
          order_number: String(order.order_number || order.name || order.id),
          platform_order_id: String(order.id),
          platform: 'shopify',
          customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          customer_email: customer.email || order.email || '',
          customer_cpf: cpf,
          items: JSON.stringify(items),
          total_value: parseFloat(order.total_price || 0),
          status: mapShopifyStatus(order.financial_status, order.fulfillment_status),
          raw_payload: order
        };

        const { error } = await supabase
          .from('pedidos')
          .upsert(pedido, { onConflict: 'tenant_id,order_number' });

        if (!error) count++;
      }

      // Paginacao via Link header
      const linkHeader = res.headers.link || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = nextMatch ? nextMatch[1] : null;
    }
  } catch (err) {
    console.error('[SHOPIFY] Erro importando pedidos:', err.message);
  }

  console.log(`[SHOPIFY] ${count} pedidos importados para tenant ${tenantId}`);
  return { count };
}

/**
 * Importa pedidos dos ultimos 30 dias da Yampi
 */
async function importYampiOrders(tenantId, alias, headers) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  let count = 0;
  let page = 1;

  try {
    while (true) {
      const res = await axios.get(
        `https://api.dooki.com.br/v2/${alias}/orders?created_at_start=${since}&page=${page}&limit=50`,
        { headers, timeout: 30000 }
      );

      const orders = res.data.data || [];
      if (orders.length === 0) break;

      for (const order of orders) {
        const customer = order.customer || {};
        const items = (order.items || order.line_items || []).map(item => ({
          name: item.name || item.product_name,
          quantity: item.quantity,
          price: String(item.price || item.unit_price || 0),
          sku: item.sku || ''
        }));

        const pedido = {
          tenant_id: tenantId,
          order_number: String(order.number || order.id),
          platform_order_id: String(order.id),
          platform: 'yampi',
          customer_name: customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          customer_email: customer.email || '',
          customer_cpf: (customer.cpf || customer.document || '').replace(/[.\-\/]/g, ''),
          items: JSON.stringify(items),
          total_value: parseFloat(order.total || order.amount || 0),
          status: mapYampiStatus(order.status),
          raw_payload: order
        };

        const { error } = await supabase
          .from('pedidos')
          .upsert(pedido, { onConflict: 'tenant_id,order_number' });

        if (!error) count++;
      }

      // Proxima pagina
      if (res.data.meta?.last_page && page >= res.data.meta.last_page) break;
      page++;
    }
  } catch (err) {
    console.error('[YAMPI] Erro importando pedidos:', err.message);
  }

  console.log(`[YAMPI] ${count} pedidos importados para tenant ${tenantId}`);
  return { count };
}

function mapShopifyStatus(financial, fulfillment) {
  if (fulfillment === 'fulfilled') return 'delivered';
  if (financial === 'paid') return 'paid';
  if (financial === 'pending') return 'pending';
  return 'processing';
}

function mapYampiStatus(status) {
  const map = { paid: 'paid', approved: 'paid', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' };
  return map[status] || 'processing';
}
