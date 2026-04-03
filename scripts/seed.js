/**
 * Seed script — cria tenant de teste + pedidos com itens + senha de login
 * Uso: node scripts/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function seed() {
  console.log('=== troqueAI — Seed de Teste ===\n');

  // 0. Rodar migration (adicionar colunas se nao existem)
  console.log('0. Aplicando migration...');
  const migrations = [
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_hash TEXT`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS platform_order_id TEXT`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'manual'`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS raw_payload JSONB`
  ];

  for (const sql of migrations) {
    try {
      await supabase.rpc('exec_sql', { sql_query: sql });
    } catch {
      // rpc nao existe — colunas ja foram criadas via SQL Editor
    }
  }
  console.log('   Migration checada.\n');

  // 1. Criar tenant com senha
  console.log('1. Criando tenant "Loja Teste"...');
  const passwordHash = await bcrypt.hash('teste123', 10);

  const { data: tenant, error: errTenant } = await supabase
    .from('tenants')
    .upsert({
      nome: 'Loja Teste',
      slug: 'loja-teste',
      email: 'admin@lojateste.com',
      plataforma: 'shopify',
      ativo: true,
      password_hash: passwordHash
    }, { onConflict: 'slug' })
    .select()
    .single();

  if (errTenant) {
    console.error('Erro ao criar tenant:', errTenant);
    console.log('\n>> Se o erro for sobre password_hash, rode a migration primeiro:');
    console.log('>> Copie o conteudo de migrations/002_auth_and_webhooks.sql no Supabase SQL Editor');
    process.exit(1);
  }
  console.log(`   OK — ID: ${tenant.id}`);
  console.log(`   Slug: ${tenant.slug}`);
  console.log(`   Login: admin@lojateste.com / teste123\n`);

  // 2. Configuracoes padrao
  console.log('2. Salvando configuracoes...');
  const configs = {
    loja_nome: 'Loja Teste',
    prazo_troca_dias: '30',
    prazo_devolucao_dias: '7',
    cor_primaria: '#6366f1',
    cor_secundaria: '#8b5cf6',
    cupom_validade: '30 dias',
    motivos_troca: JSON.stringify([
      'Tamanho errado',
      'Cor diferente do esperado',
      'Produto com defeito',
      'Nao gostei do produto',
      'Produto diferente da foto',
      'Outro'
    ]),
    motivos_devolucao: JSON.stringify([
      'Arrependimento',
      'Produto com defeito',
      'Produto errado enviado',
      'Outro'
    ])
  };

  for (const [key, value] of Object.entries(configs)) {
    await supabase
      .from('tenant_settings')
      .upsert({ tenant_id: tenant.id, key, value }, { onConflict: 'tenant_id,key' });
  }
  console.log('   OK — configs salvas\n');

  // 3. Criar pedidos de teste
  console.log('3. Criando pedidos de teste...');
  const pedidos = [
    {
      tenant_id: tenant.id,
      order_number: '1001',
      customer_name: 'Maria Silva',
      customer_email: 'maria@email.com',
      customer_cpf: '12345678901',
      items: JSON.stringify([
        { name: 'Camiseta Basica Branca', quantity: 2, price: '49.90', sku: 'CAM-BRA-M' },
        { name: 'Calca Jeans Slim', quantity: 1, price: '189.90', sku: 'CAL-JNS-42' },
        { name: 'Tenis Casual Preto', quantity: 1, price: '259.90', sku: 'TEN-CAS-41' }
      ]),
      total_value: 549.60,
      status: 'delivered',
      platform: 'manual'
    },
    {
      tenant_id: tenant.id,
      order_number: '1002',
      customer_name: 'Joao Santos',
      customer_email: 'joao@email.com',
      customer_cpf: '98765432100',
      items: JSON.stringify([
        { name: 'Moletom Oversized Cinza', quantity: 1, price: '179.90', sku: 'MOL-CIN-G' },
        { name: 'Bermuda Sarja Bege', quantity: 2, price: '99.90', sku: 'BER-BEG-40' }
      ]),
      total_value: 379.70,
      status: 'delivered',
      platform: 'manual'
    },
    {
      tenant_id: tenant.id,
      order_number: '1003',
      customer_name: 'Ana Costa',
      customer_email: 'ana@email.com',
      customer_cpf: '11122233344',
      items: JSON.stringify([
        { name: 'Vestido Floral Midi', quantity: 1, price: '219.90', sku: 'VES-FLO-P' },
        { name: 'Bolsa Couro Marrom', quantity: 1, price: '349.90', sku: 'BOL-COU-U' },
        { name: 'Sandalia Rasteira Nude', quantity: 1, price: '129.90', sku: 'SAN-NUD-37' },
        { name: 'Brinco Argola Dourado', quantity: 1, price: '59.90', sku: 'BRI-ARG-U' }
      ]),
      total_value: 759.60,
      status: 'delivered',
      platform: 'manual'
    }
  ];

  for (const pedido of pedidos) {
    const { error } = await supabase
      .from('pedidos')
      .upsert(pedido, { onConflict: 'tenant_id,order_number' })
      .select()
      .single();

    if (error) {
      console.error(`   ERRO pedido ${pedido.order_number}:`, error.message);
    } else {
      console.log(`   OK — Pedido #${pedido.order_number} (${pedido.customer_name})`);
    }
  }

  // 4. Criar solicitacao de exemplo (pendente)
  console.log('\n4. Criando solicitacao de exemplo...');
  const { data: solExisting } = await supabase
    .from('solicitacoes')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('protocolo', 'TRQ-SEED001')
    .single();

  if (!solExisting) {
    const { error } = await supabase.from('solicitacoes').insert({
      tenant_id: tenant.id,
      order_number: '1001',
      protocolo: 'TRQ-SEED001',
      tipo: 'troca',
      motivo: 'Tamanho errado',
      itens: JSON.stringify([{ name: 'Camiseta Basica Branca', quantity: 1, price: '49.90' }]),
      customer_name: 'Maria Silva',
      customer_email: 'maria@email.com',
      customer_cpf: '12345678901',
      status: 'pendente',
      observacao: 'Preciso trocar por tamanho G'
    });
    if (error) console.error('   ERRO:', error.message);
    else console.log('   OK — Solicitacao TRQ-SEED001 criada');
  } else {
    console.log('   Solicitacao TRQ-SEED001 ja existe');
  }

  console.log('\n=== Seed completo! ===');
  console.log(`\nCredenciais admin:`);
  console.log(`  Email: admin@lojateste.com`);
  console.log(`  Senha: teste123`);
  console.log(`  Admin: http://localhost:3001/admin`);
  console.log(`\nPortal: http://localhost:3001/portal/loja-teste`);
  console.log(`  Maria: CPF 12345678901 | Pedido 1001`);
  console.log(`  Joao:  CPF 98765432100 | Pedido 1002`);
  console.log(`  Ana:   CPF 11122233344 | Pedido 1003`);
}

seed().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
