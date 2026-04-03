const crypto = require('crypto');
const axios = require('axios');
const { supabase } = require('../lib/supabase');
const { salvarConfiguracao, buscarConfiguracoes } = require('../lib/supabase');

/**
 * GET /api/shopify-callback?code=xxx&shop=xxx&state=xxx&hmac=xxx
 *
 * Callback do OAuth2 Shopify.
 * Troca o code por access_token, salva, cria webhook, importa pedidos.
 * Redireciona de volta para o admin.
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const { code, shop, state, hmac } = req.query;

    if (!code || !shop || !state) {
      return redirectWithError(res, 'Parametros de callback incompletos.');
    }

    // Verificar HMAC
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (clientSecret && hmac) {
      const params = { ...req.query };
      delete params.hmac;
      delete params.signature;
      const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
      const computedHmac = crypto.createHmac('sha256', clientSecret).update(sortedParams).digest('hex');
      if (computedHmac !== hmac) {
        return redirectWithError(res, 'HMAC invalido. Possivel adulteracao.');
      }
    }

    // Decodificar state para pegar tenant_id
    let tenantId;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      tenantId = stateData.tenant_id;
    } catch {
      return redirectWithError(res, 'State invalido.');
    }

    if (!tenantId) {
      return redirectWithError(res, 'Tenant nao identificado.');
    }

    // Trocar code por access_token
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    if (!clientId || !clientSecret) {
      return redirectWithError(res, 'Credenciais Shopify nao configuradas no servidor.');
    }

    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code
    });

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return redirectWithError(res, 'Nao foi possivel obter access token do Shopify.');
    }

    // Buscar info da loja
    const baseUrl = `https://${shop}/admin/api/2024-01`;
    const headers = { 'X-Shopify-Access-Token': accessToken };

    let shopName = shop;
    try {
      const shopRes = await axios.get(`${baseUrl}/shop.json`, { headers, timeout: 10000 });
      shopName = shopRes.data.shop.name || shop;
    } catch {}

    // Salvar credenciais
    await salvarConfiguracao(tenantId, 'shopify_store', shop);
    await salvarConfiguracao(tenantId, 'shopify_access_token', accessToken);
    await salvarConfiguracao(tenantId, 'plataforma_conectada', 'shopify');

    // Criar webhook automaticamente
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const webhookUrl = `${proto}://${host}/api/webhooks?platform=shopify&tenant_id=${tenantId}`;

    try {
      const existingWebhooks = await axios.get(`${baseUrl}/webhooks.json`, { headers });
      const alreadyExists = existingWebhooks.data.webhooks?.some(w =>
        w.address === webhookUrl && w.topic === 'orders/create'
      );

      if (!alreadyExists) {
        await axios.post(`${baseUrl}/webhooks.json`, {
          webhook: { topic: 'orders/create', address: webhookUrl, format: 'json' }
        }, { headers: { ...headers, 'Content-Type': 'application/json' } });
      }
    } catch (err) {
      console.error('[SHOPIFY OAUTH] Erro criando webhook:', err.response?.data || err.message);
    }

    // Importar pedidos dos ultimos 30 dias (SYNC — precisa terminar antes do redirect)
    let ordersImported = 0;
    try {
      const result = await importOrders(tenantId, shop, accessToken);
      ordersImported = result;
    } catch (err) {
      console.error('[SHOPIFY OAUTH] Erro importando pedidos:', err.message);
    }

    // Redirecionar de volta pro admin com sucesso
    const adminUrl = `${proto}://${host}/admin?shopify=connected&shop=${encodeURIComponent(shopName)}&orders=${ordersImported}`;
    return res.redirect(302, adminUrl);

  } catch (error) {
    console.error('Erro em /api/shopify-callback:', error);
    return redirectWithError(res, 'Erro ao conectar Shopify: ' + error.message);
  }
};

function redirectWithError(res, message) {
  const proto = 'https';
  return res.redirect(302, `/admin?shopify=error&message=${encodeURIComponent(message)}`);
}

/**
 * Importa pedidos dos ultimos 30 dias
 */
async function importOrders(tenantId, store, accessToken) {
  const baseUrl = `https://${store}/admin/api/2024-01`;
  const headers = { 'X-Shopify-Access-Token': accessToken };
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  let count = 0;
  let pageUrl = `${baseUrl}/orders.json?created_at_min=${since}&status=any&limit=250`;

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
        status: mapStatus(order.financial_status, order.fulfillment_status),
        raw_payload: order
      };

      const { error } = await supabase
        .from('pedidos')
        .upsert(pedido, { onConflict: 'tenant_id,order_number' });

      if (!error) count++;
    }

    const linkHeader = res.headers.link || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    pageUrl = nextMatch ? nextMatch[1] : null;
  }

  console.log(`[SHOPIFY OAUTH] ${count} pedidos importados para tenant ${tenantId}`);
  return count;
}

function mapStatus(financial, fulfillment) {
  if (fulfillment === 'fulfilled') return 'delivered';
  if (financial === 'paid') return 'paid';
  if (financial === 'pending') return 'pending';
  return 'processing';
}
