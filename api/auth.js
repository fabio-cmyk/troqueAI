const bcrypt = require('bcryptjs');
const { supabase } = require('../lib/supabase');
const { gerarToken } = require('../lib/auth-middleware');

// POST /api/auth — { action: "login", email, password }
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const { action, email, password } = req.body;

    if (action === 'login') {
      if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha obrigatorios' });
      }

      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('email', email)
        .eq('ativo', true)
        .single();

      if (error || !tenant) {
        return res.status(401).json({ error: 'Credenciais invalidas' });
      }

      if (!tenant.password_hash) {
        return res.status(401).json({ error: 'Conta sem senha configurada. Rode o seed primeiro.' });
      }

      const senhaValida = await bcrypt.compare(password, tenant.password_hash);
      if (!senhaValida) {
        return res.status(401).json({ error: 'Credenciais invalidas' });
      }

      const token = gerarToken(tenant);

      return res.json({
        token,
        tenant: {
          id: tenant.id,
          nome: tenant.nome,
          slug: tenant.slug,
          email: tenant.email
        }
      });
    }

    if (action === 'me') {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token ausente' });
      }

      const jwt = require('jsonwebtoken');
      try {
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'troqueai-jwt-secret-2026');
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, nome, slug, email')
          .eq('id', payload.tenant_id)
          .single();

        return res.json({ tenant });
      } catch {
        return res.status(401).json({ error: 'Token invalido' });
      }
    }

    return res.status(400).json({ error: 'action deve ser "login" ou "me"' });
  } catch (error) {
    console.error('Erro em /api/auth:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
