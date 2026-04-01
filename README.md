# troqueAI

Plataforma SaaS de automação de trocas e devoluções para e-commerce.

## Setup

```bash
npm install
cp .env.example .env
# Preencha as variáveis no .env
npm run dev
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/solicitacoes` | Criar solicitação (portal) |
| GET | `/api/solicitacoes` | Listar solicitações (admin) |
| PATCH | `/api/solicitacoes` | Atualizar status (admin) |
| GET | `/api/portal` | Portal público do cliente |
| GET | `/api/dashboard` | Métricas do dashboard |
| POST | `/api/tenants` | Criar tenant (loja) |
| GET | `/api/tenants` | Buscar tenant |
| PUT | `/api/tenants` | Atualizar configurações |

## URLs

- **Admin:** `/admin`
- **Portal:** `/portal/{slug-da-loja}`

## Banco de Dados

Execute `supabase-schema.sql` no Supabase SQL Editor.
