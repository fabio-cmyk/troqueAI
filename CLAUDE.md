# troqueAI

Plataforma SaaS de automacao de trocas e devolucoes para e-commerce brasileiro.
Inspirada na Troquecommerce, com foco em multi-tenancy e simplicidade.

## Tech Stack
- **Backend:** Node.js + Express (Vercel Serverless)
- **Database:** Supabase (PostgreSQL + RLS) — projeto: xinnterhoowbjuvcsddz
- **Auth:** JWT customizado (jsonwebtoken + bcryptjs)
- **Email:** Resend (ainda nao configurado — emails sao logados no console)
- **Frontend:** HTML/CSS/JS vanilla
- **Deploy:** Vercel

## Estrutura
```
api/                    → Endpoints serverless
  auth.js               → Login JWT (POST action=login|me)
  solicitacoes.js       → CRUD de trocas/devolucoes + emails automaticos
  portal.js             → Endpoint publico (cliente busca pedido por CPF/email)
  tenants.js            → Gestao de lojas (multi-tenant)
  dashboard.js          → Metricas e stats para admin
  webhooks.js           → Recebe pedidos do Shopify/Yampi
lib/
  supabase.js           → ORM (tenants, solicitacoes, pedidos, configs)
  auth-middleware.js    → JWT helper (gerar/verificar token)
  email.js              → Templates de email (Resend, opcional)
public/
  admin/index.html      → Dashboard admin com login + modal detalhe
  portal/index.html     → Portal self-service do cliente
migrations/
  002_auth_and_webhooks.sql → DDL para colunas de auth e webhooks
scripts/
  seed.js               → Cria tenant de teste + pedidos + solicitacao
docs/
  PRD.md                → Product Requirements Document completo
```

## Database (Supabase)
5 tabelas criadas e funcionando:
- **tenants** — lojas (multi-tenant por slug) + password_hash para auth
- **pedidos** — pedidos importados (manual ou webhook) + platform, platform_order_id, raw_payload
- **solicitacoes** — trocas e devolucoes com status workflow
- **tenant_settings** — configuracoes key-value por loja
- **solicitacao_historico** — audit trail de mudancas de status

## Status Atual
- [x] Estrutura do projeto criada
- [x] API funcionando (6 endpoints: auth, solicitacoes, portal, tenants, dashboard, webhooks)
- [x] Database schema criado no Supabase
- [x] Server local rodando (porta 3001)
- [x] Dashboard admin com login JWT + modal de detalhe (aprovar/rejeitar/cupom)
- [x] Portal do cliente basico (HTML)
- [x] Templates de email (3 templates)
- [x] Auth do lojista (login JWT com bcrypt)
- [x] Detalhe da solicitacao no admin (aprovar/rejeitar/gerar cupom)
- [x] Webhooks Shopify e Yampi (com verificacao HMAC)
- [x] Seed script com tenant de teste + pedidos
- [x] Deploy config Vercel (vercel.json)
- [x] Sistema de memoria persistente configurado
- [ ] Rodar migration 002 no Supabase SQL Editor
- [ ] Rodar seed (npm run seed)
- [ ] Deploy efetivo no Vercel (vercel --prod)
- [ ] Integracao Shopify (discount codes API)
- [ ] Integracao Correios (logistica reversa)
- [ ] Widget embeddable (JS para colar em qualquer loja)

## Comandos
```bash
npm run dev          # Roda local na porta 3001
npm run seed         # Cria tenant de teste (admin@lojateste.com / teste123)
```

## Credenciais de Teste
- **Admin:** admin@lojateste.com / teste123
- **Portal:** http://localhost:3001/portal/loja-teste
- **Clientes teste:** maria@email.com (pedido 1001), joao@email.com (1002), ana@email.com (1003)

## URLs locais
- Admin: http://localhost:3001/admin
- Portal: http://localhost:3001/portal/{slug-da-loja}

## Webhook URLs (apos deploy)
- Shopify: {APP_URL}/api/webhooks?platform=shopify&tenant_id={ID}
- Yampi: {APP_URL}/api/webhooks?platform=yampi&tenant_id={ID}

## Environment Variables (Vercel)
```
SUPABASE_URL=https://xinnterhoowbjuvcsddz.supabase.co
SUPABASE_KEY=<service_role_key>
JWT_SECRET=<random_secret>
EMAIL_FROM=noreply@troqueai.com.br
RESEND_API_KEY=<optional>
```

## Git
- Repo: github.com/fabio-cmyk/troqueAI
- Branch principal: main
