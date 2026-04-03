const axios = require('axios');

/**
 * Cria um discount code na Shopify Admin API
 * Precisa de: shopify_store (ex: minha-loja.myshopify.com) e shopify_access_token no tenant_settings
 *
 * Fluxo: Cria price rule → cria discount code com o codigo fornecido
 */
async function criarCupomShopify(shopifyStore, accessToken, { codigo, valor, tipo_desconto, validade_dias }) {
  const baseUrl = `https://${shopifyStore}/admin/api/2024-01`;

  // 1. Criar price rule
  const startsAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + (validade_dias || 30) * 86400000).toISOString();

  const priceRulePayload = {
    price_rule: {
      title: codigo,
      target_type: 'line_item',
      target_selection: 'all',
      allocation_method: 'across',
      value_type: tipo_desconto === 'percentage' ? 'percentage' : 'fixed_amount',
      value: `-${valor}`,
      customer_selection: 'all',
      starts_at: startsAt,
      ends_at: endsAt,
      usage_limit: 1,
      once_per_customer: true
    }
  };

  const priceRuleRes = await axios.post(`${baseUrl}/price_rules.json`, priceRulePayload, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  const priceRuleId = priceRuleRes.data.price_rule.id;

  // 2. Criar discount code associado
  const discountRes = await axios.post(
    `${baseUrl}/price_rules/${priceRuleId}/discount_codes.json`,
    { discount_code: { code: codigo } },
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    discount_code_id: discountRes.data.discount_code.id,
    price_rule_id: priceRuleId,
    code: discountRes.data.discount_code.code,
    created: true
  };
}

/**
 * Deleta um discount code da Shopify (para cancelamentos)
 */
async function deletarCupomShopify(shopifyStore, accessToken, priceRuleId, discountCodeId) {
  const baseUrl = `https://${shopifyStore}/admin/api/2024-01`;

  await axios.delete(
    `${baseUrl}/price_rules/${priceRuleId}/discount_codes/${discountCodeId}.json`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  );

  await axios.delete(
    `${baseUrl}/price_rules/${priceRuleId}.json`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  );

  return { deleted: true };
}

module.exports = { criarCupomShopify, deletarCupomShopify };
