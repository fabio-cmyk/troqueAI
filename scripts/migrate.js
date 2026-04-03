/**
 * Migration checker — verifica se migration 002 foi aplicada no Supabase
 * Uso: node scripts/migrate.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkColumn(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

async function migrate() {
  console.log('=== troqueAI — Migration Check ===\n');

  const checks = [
    { table: 'tenants', column: 'password_hash', sql: 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_hash TEXT;' },
    { table: 'pedidos', column: 'platform_order_id', sql: 'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS platform_order_id TEXT;' },
    { table: 'pedidos', column: 'platform', sql: "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'manual';" },
    { table: 'pedidos', column: 'raw_payload', sql: 'ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS raw_payload JSONB;' }
  ];

  let allOk = true;
  const pendingSql = [];

  for (const check of checks) {
    const exists = await checkColumn(check.table, check.column);
    if (exists) {
      console.log(`  [OK] ${check.table}.${check.column}`);
    } else {
      console.log(`  [MISSING] ${check.table}.${check.column}`);
      pendingSql.push(check.sql);
      allOk = false;
    }
  }

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);',
    'CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_order ON pedidos(tenant_id, order_number);',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_customer ON pedidos(tenant_id, customer_cpf);',
    'CREATE INDEX IF NOT EXISTS idx_solicitacoes_tenant_status ON solicitacoes(tenant_id, status);'
  ];

  if (allOk) {
    console.log('\n  Todas as colunas existem! Migration 002 aplicada.\n');
    console.log('  Rode estes indexes no SQL Editor (se ainda nao fez):\n');
    indexes.forEach(sql => console.log(`    ${sql}`));
  } else {
    console.log('\n  Colunas faltando! Rode este SQL no Supabase SQL Editor:\n');
    pendingSql.forEach(sql => console.log(`    ${sql}`));
    console.log('');
    indexes.forEach(sql => console.log(`    ${sql}`));
  }

  console.log(`\n  SQL Editor: https://supabase.com/dashboard/project/xinnterhoowbjuvcsddz/sql/new`);
  console.log('\n=== Done ===');
}

migrate().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
