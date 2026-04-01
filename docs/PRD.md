# troqueAI — Product Requirements Document

## Visão
Plataforma SaaS de automação de trocas e devoluções para e-commerce brasileiro.
Inspirada na Troquecommerce, com foco em simplicidade, multi-tenancy e inteligência artificial.

## Problema
Lojistas gastam até 40% do tempo do SAC com trocas e devoluções manuais.
Clientes ficam frustrados com processos lentos e sem visibilidade.

## Solução
Portal self-service 24h onde o cliente solicita troca/devolução sem precisar do SAC.
Dashboard admin para o lojista gerenciar tudo com dados em tempo real.

## Público-Alvo
- Lojas Shopify, Yampi, Nuvemshop (Brasil)
- PMEs de moda, calçados, acessórios (maior volume de trocas)

## Funcionalidades — MVP

### Portal do Cliente
- [x] Buscar pedido por CPF/email + número do pedido
- [x] Selecionar itens para troca ou devolução
- [x] Escolher motivo (configurável por loja)
- [x] Receber protocolo e acompanhar status
- [ ] Receber código de postagem reversa
- [ ] Acompanhar timeline de status

### Dashboard Admin
- [x] Métricas (total, pendentes, trocas, devoluções, taxa de resolução)
- [x] Lista de solicitações com filtros (status, tipo)
- [x] Configurações da loja (nome, prazo, cores, motivos)
- [ ] Detalhe da solicitação (aprovar/rejeitar/gerar cupom)
- [ ] Geração de vale-troca/cupom com 1 clique
- [ ] Exportar relatórios (CSV)

### API
- [x] CRUD de solicitações
- [x] Portal público (config + busca de pedido)
- [x] Dashboard métricas
- [x] Gestão de tenants e configurações
- [ ] Webhook para receber pedidos de plataformas
- [ ] Integração Shopify (discount codes API)
- [ ] Integração Correios (logística reversa)

### Emails Transacionais
- [x] Solicitação criada
- [x] Solicitação aprovada (com código de postagem)
- [x] Vale-troca emitido
- [ ] Produto recebido
- [ ] Solicitação rejeitada

### Multi-Tenancy
- [x] Tenants isolados por slug
- [x] Configurações independentes por loja
- [x] Branding customizável (cores, nome, logo)
- [ ] Auth por tenant (login do lojista)
- [ ] Onboarding automatizado

## Tech Stack
- Backend: Node.js + Express (Vercel Serverless)
- Database: Supabase (PostgreSQL + RLS)
- Email: Resend
- Frontend: HTML/CSS/JS (vanilla)
- Deploy: Vercel

## Métricas de Sucesso
- Redução de 80% no volume de tickets de troca no SAC
- Tempo médio de resolução < 48h
- NPS do cliente > 8

## Roadmap
1. **MVP** — Portal + Dashboard + API (atual)
2. **V1** — Auth, Shopify integration, logística reversa Correios
3. **V2** — Widget embeddable, AI chatbot, Nuvemshop/Yampi integrations
4. **V3** — Anti-fraude, omnichannel, NF automática
