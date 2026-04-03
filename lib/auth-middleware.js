const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'troqueai-jwt-secret-2026';

function gerarToken(tenant) {
  return jwt.sign(
    { tenant_id: tenant.id, email: tenant.email, slug: tenant.slug },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verificarToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;

  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const payload = verificarToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'Token invalido ou ausente' });
  }
  req.tenantId = payload.tenant_id;
  req.tenantEmail = payload.email;
  req.tenantSlug = payload.slug;
  next();
}

module.exports = { gerarToken, verificarToken, authMiddleware, JWT_SECRET };
