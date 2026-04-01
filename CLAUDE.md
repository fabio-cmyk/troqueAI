# troqueAI

Plataforma SaaS de automação de trocas e devoluções para e-commerce brasileiro.
Inspirada na Troquecommerce, com foco em multi-tenancy e simplicidade.

## Tech Stack
- **Backend:** Node.js + Express (Vercel Serverless)
- **Database:** Supabase (PostgreSQL + RLS) — projeto: xinnterhoowbjuvcsddz
- **Email:** Resend (ainda não configurado — emails são logados no console)
- **Frontend:** HTML/CSS/JS vanilla
- **Deploy:** Vercel (ainda não deployado)

## Estrutura
```
api/                → Endpoints serverless
  solicitacoes.js   → CRUD de trocas/devoluções + emails automáticos
  portal.js         → Endpoint público (cliente busca pedido por CPF/email)
  tenants.js        → Gestão de lojas (multi-tenant)
  dashboard.js      → Métricas e stats para admin
lib/
  supabase.js       → ORM (tenants, solicitações, pedidos, configs)
  email.js          → Templates de email (Resend, opcional)
public/
  admin/index.html  → Dashboard administrativo do lojista
  portal/index.html → Portal self-service do cliente
docs/
  PRD.md            → Product Requirements Document completo
```

## Database (Supabase)
5 tabelas criadas e funcionando:
- **tenants** — lojas (multi-tenant por slug)
- **pedidos** — pedidos importados da plataforma do lojista
- **solicitacoes** — trocas e devoluções com status workflow
- **tenant_settings** — configurações key-value por loja
- **solicitacao_historico** — audit trail de mudanças de status

## Status Atual
- [x] Estrutura do projeto criada
- [x] API funcionando (4 endpoints)
- [x] Database schema criado no Supabase
- [x] Server local rodando (porta 3001)
- [x] Dashboard admin básico (HTML)
- [x] Portal do cliente básico (HTML)
- [x] Templates de email (3 templates)
- [ ] Criar tenant de teste e testar fluxo completo
- [ ] Detalhe da solicitação no admin (aprovar/rejeitar/gerar cupom)
- [ ] Auth do lojista (login)
- [ ] Webhook para receber pedidos do Shopify/Yampi
- [ ] Integração Shopify (discount codes API)
- [ ] Integração Correios (logística reversa)
- [ ] Widget embeddable (JS para colar em qualquer loja)
- [ ] Deploy no Vercel
- [x] Sistema de memória persistente configurado (4 arquivos + MEMORY.md)

## Comandos
```bash
npm run dev          # Roda local na porta 3001
```

## URLs locais
- Admin: http://localhost:3001/admin
- Portal: http://localhost:3001/portal/{slug-da-loja}

## Git
- Repo: github.com/fabio-cmyk/troqueAI
- Branch principal: main
