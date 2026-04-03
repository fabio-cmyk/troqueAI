const crypto = require('crypto');
const { supabase } = require('../lib/supabase');

// POST /api/webhooks?platform=shopify&tenant_id=xxx
// POST /api/webhooks?platform=yampi&tenant_id=xxx
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const { platform, tenant_id } = req.query;

    if (!platform || !tenant_id) {
      return res.status(400).json({ error: 'platform e tenant_id obrigatorios' });
    }

    // Verificar que o tenant existe
    const { data: tenant, error: errTenant } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('id', tenant_id)
      .eq('ativo', true)
      .single();

    if (errTenant || !tenant) {
      return res.status(404).json({ error: 'Tenant nao encontrado' });
    }

    let pedido;

    if (platform === 'shopify') {
      pedido = parseShopifyOrder(req.body, tenant_id);

      // Verificar HMAC se webhook_secret configurado
      const { data: settings } = await supabase
        .from('tenant_settings')
        .select('value')
        .eq('tenant_id', tenant_id)
        .eq('key', 'shopify_webhook_secret')
        .single();

      if (settings?.value && req.headers['x-shopify-hmac-sha256']) {
        const hmac = crypto.createHmac('sha256', settings.value)
          .update(JSON.stringify(req.body), 'utf8')
          .digest('base64');

        if (hmac !== req.headers['x-shopify-hmac-sha256']) {
          return res.status(401).json({ error: 'HMAC invalido' });
        }
      }
    } else if (platform === 'yampi') {
      pedido = parseYampiOrder(req.body, tenant_id);
    } else {
      return res.status(400).json({ error: 'platform deve ser "shopify" ou "yampi"' });
    }

    // Upsert do pedido (evitar duplicatas)
    const { data, error } = await supabase
      .from('pedidos')
      .upsert(pedido, { onConflict: 'tenant_id,order_number' })
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar pedido webhook:', error);
      return res.status(500).json({ error: 'Erro ao salvar pedido' });
    }

    console.log(`[WEBHOOK] ${platform} — Pedido #${data.order_number} salvo para tenant ${tenant.slug}`);
    return res.status(200).json({ ok: true, order_number: data.order_number });
  } catch (error) {
    console.error('Erro em /api/webhooks:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

function parseShopifyOrder(body, tenantId) {
  // Shopify order webhook payload
  const order = body;
  const customer = order.customer || {};
  const items = (order.line_items || []).map(item => ({
    name: item.title || item.name,
    quantity: item.quantity,
    price: item.price,
    sku: item.sku || '',
    variant_title: item.variant_title || ''
  }));

  // Extrair CPF de note_attributes ou metafields
  let cpf = '';
  if (order.note_attributes) {
    const cpfAttr = order.note_attributes.find(a =>
      a.name.toLowerCase().includes('cpf') || a.name.toLowerCase().includes('documento')
    );
    if (cpfAttr) cpf = cpfAttr.value.replace(/[.\-\/]/g, '');
  }

  return {
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
}

function parseYampiOrder(body, tenantId) {
  // Yampi webhook payload (event: order.created / order.paid)
  const order = body.resource || body;
  const customer = order.customer || {};
  const items = (order.items || order.line_items || []).map(item => ({
    name: item.name || item.product_name,
    quantity: item.quantity,
    price: String(item.price || item.unit_price || 0),
    sku: item.sku || ''
  }));

  return {
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
    raw_payload: body
  };
}

function mapShopifyStatus(financial, fulfillment) {
  if (fulfillment === 'fulfilled') return 'delivered';
  if (financial === 'paid') return 'paid';
  if (financial === 'pending') return 'pending';
  return 'processing';
}

function mapYampiStatus(status) {
  const map = {
    'paid': 'paid',
    'approved': 'paid',
    'shipped': 'shipped',
    'delivered': 'delivered',
    'cancelled': 'cancelled'
  };
  return map[status] || 'processing';
}
