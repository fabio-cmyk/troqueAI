const bcrypt = require('bcryptjs');
const { supabase } = require('../lib/supabase');
const { criarTenant, salvarConfiguracao } = require('../lib/supabase');
const { gerarToken } = require('../lib/auth-middleware');

// POST /api/auth — { action: "login"|"signup"|"me", ... }
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const { action, email, password } = req.body;

    // ==================== SIGNUP ====================
    if (action === 'signup') {
      const { nome, slug, plataforma } = req.body;

      if (!nome || !slug || !email || !password) {
        return res.status(400).json({ error: 'nome, slug, email e password obrigatorios' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter no minimo 6 caracteres' });
      }

      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'Slug deve conter apenas letras minusculas, numeros e hifens' });
      }

      // Verificar se slug ja existe
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .single();

      if (existing) {
        return res.status(409).json({ error: 'Esse slug ja esta em uso. Escolha outro.' });
      }

      // Verificar se email ja existe
      const { data: existingEmail } = await supabase
        .from('tenants')
        .select('id')
        .eq('email', email)
        .single();

      if (existingEmail) {
        return res.status(409).json({ error: 'Esse e-mail ja esta cadastrado. Faca login.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const tenant = await criarTenant({
        nome,
        slug,
        email,
        plataforma: plataforma || 'shopify',
        ativo: true,
        password_hash: passwordHash
      });

      // Criar configuracoes padrao
      const configsPadrao = {
        loja_nome: nome,
        prazo_troca_dias: '30',
        prazo_devolucao_dias: '7',
        cor_primaria: '#6366f1',
        cor_secundaria: '#8b5cf6',
        cupom_validade: '30 dias',
        motivos_troca: JSON.stringify([
          'Tamanho errado', 'Cor diferente do esperado', 'Produto com defeito',
          'Nao gostei do produto', 'Produto diferente da foto', 'Outro'
        ]),
        motivos_devolucao: JSON.stringify([
          'Arrependimento', 'Produto com defeito', 'Produto errado enviado', 'Outro'
        ])
      };

      for (const [key, value] of Object.entries(configsPadrao)) {
        await salvarConfiguracao(tenant.id, key, value);
      }

      const token = gerarToken(tenant);

      return res.status(201).json({
        token,
        tenant: {
          id: tenant.id,
          nome: tenant.nome,
          slug: tenant.slug,
          email: tenant.email
        }
      });
    }

    // ==================== LOGIN ====================
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
