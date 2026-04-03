const axios = require('axios');

/**
 * Cria um cupom de desconto na Yampi API
 * Precisa de: yampi_alias, yampi_token e yampi_secret_key no tenant_settings
 *
 * API: https://api.dooki.com.br/v2/{alias}/coupons
 */
async function criarCupomYampi(alias, userToken, secretKey, { codigo, valor, tipo_desconto, validade_dias }) {
  const baseUrl = `https://api.dooki.com.br/v2/${alias}/coupons`;

  const now = new Date();
  const expires = new Date(now.getTime() + (validade_dias || 30) * 86400000);

  const formatDate = (d) => {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  const payload = {
    name: codigo,
    type: tipo_desconto === 'percent' || tipo_desconto === 'percentage' ? 'percent' : 'fixed',
    value: parseFloat(valor),
    quantity: 1,
    active: true,
    starts_at: formatDate(now),
    expires_at: formatDate(expires)
  };

  const res = await axios.post(baseUrl, payload, {
    headers: {
      'User-Token': userToken,
      'User-Secret-Key': secretKey,
      'Content-Type': 'application/json'
    }
  });

  const coupon = res.data.data || res.data;

  return {
    coupon_id: coupon.id,
    code: coupon.name || codigo,
    created: true
  };
}

/**
 * Deleta um cupom da Yampi (para cancelamentos)
 */
async function deletarCupomYampi(alias, userToken, secretKey, couponId) {
  const baseUrl = `https://api.dooki.com.br/v2/${alias}/coupons/${couponId}`;

  await axios.delete(baseUrl, {
    headers: {
      'User-Token': userToken,
      'User-Secret-Key': secretKey
    }
  });

  return { deleted: true };
}

module.exports = { criarCupomYampi, deletarCupomYampi };
