const crypto = require('crypto');
const { verificarToken } = require('../lib/auth-middleware');

/**
 * GET /api/shopify-auth?store=minha-loja.myshopify.com
 *
 * Inicia o fluxo OAuth2 do Shopify.
 * Redireciona o lojista para a tela de autorizacao do Shopify.
 *
 * Requer: Authorization header (Bearer token) OU token via query param
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    // Auth — aceitar token no header OU query (porque e um redirect)
    let payload = verificarToken(req);
    if (!payload && req.query.token) {
      const jwt = require('jsonwebtoken');
      try {
        payload = jwt.verify(req.query.token, process.env.JWT_SECRET || 'troqueai-jwt-secret-2026');
      } catch {}
    }

    if (!payload) {
      return res.status(401).json({ error: 'Token invalido. Faca login novamente.' });
    }

    const store = (req.query.store || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!store || !store.includes('.myshopify.com')) {
      return res.status(400).json({ error: 'store obrigatoria (ex: minha-loja.myshopify.com)' });
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'SHOPIFY_CLIENT_ID nao configurado no servidor' });
    }

    const scopes = 'read_orders,write_orders,read_products,write_price_rules,write_discounts';

    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${proto}://${host}/api/shopify-callback`;

    // State: encode tenant_id + nonce para seguranca
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({
      tenant_id: payload.tenant_id,
      nonce
    })).toString('base64url');

    const authUrl = `https://${store}/admin/oauth/authorize?` +
      `client_id=${clientId}` +
      `&scope=${scopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    return res.redirect(302, authUrl);
  } catch (error) {
    console.error('Erro em /api/shopify-auth:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
