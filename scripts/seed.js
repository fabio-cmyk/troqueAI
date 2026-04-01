/**
 * Seed script — cria tenant de teste + pedidos com itens
 * Uso: node scripts/seed.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function seed() {
  console.log('=== troqueAI — Seed de Teste ===\n');

  // 1. Criar tenant
  console.log('1. Criando tenant "Loja Teste"...');
  const { data: tenant, error: errTenant } = await supabase
    .from('tenants')
    .upsert({
      nome: 'Loja Teste',
      slug: 'loja-teste',
      email: 'admin@lojateste.com.br',
      plataforma: 'shopify',
      ativo: true
    }, { onConflict: 'slug' })
    .select()
    .single();

  if (errTenant) {
    console.error('Erro ao criar tenant:', errTenant);
    process.exit(1);
  }
  console.log(`   OK — ID: ${tenant.id}`);
  console.log(`   Slug: ${tenant.slug}\n`);

  // 2. Configuracoes padrao
  console.log('2. Salvando configuracoes...');
  const configs = {
    loja_nome: 'Loja Teste',
    prazo_troca_dias: '30',
    prazo_devolucao_dias: '7',
    cor_primaria: '#6366f1',
    cor_secundaria: '#8b5cf6',
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
      order_id: 'SHP-1001',
      order_number: '1001',
      customer_name: 'Maria Silva',
      customer_email: 'maria@email.com',
      customer_cpf: '12345678901',
      items: JSON.stringify([
        { name: 'Camiseta Básica Branca', quantity: 2, price: '49.90', sku: 'CAM-BRA-M' },
        { name: 'Calça Jeans Slim', quantity: 1, price: '189.90', sku: 'CAL-JNS-42' },
        { name: 'Tênis Casual Preto', quantity: 1, price: '259.90', sku: 'TEN-CAS-41' }
      ]),
      total_value: 549.60,
      shipping_value: 0,
      status: 'paid',
      created_at_origin: '2026-03-15'
    },
    {
      tenant_id: tenant.id,
      order_id: 'SHP-1002',
      order_number: '1002',
      customer_name: 'João Santos',
      customer_email: 'joao@email.com',
      customer_cpf: '98765432100',
      items: JSON.stringify([
        { name: 'Moletom Oversized Cinza', quantity: 1, price: '179.90', sku: 'MOL-CIN-G' },
        { name: 'Bermuda Sarja Bege', quantity: 2, price: '99.90', sku: 'BER-BEG-40' }
      ]),
      total_value: 379.70,
      shipping_value: 15.90,
      status: 'paid',
      created_at_origin: '2026-03-20'
    },
    {
      tenant_id: tenant.id,
      order_id: 'SHP-1003',
      order_number: '1003',
      customer_name: 'Ana Costa',
      customer_email: 'ana@email.com',
      customer_cpf: '11122233344',
      items: JSON.stringify([
        { name: 'Vestido Floral Midi', quantity: 1, price: '219.90', sku: 'VES-FLO-P' },
        { name: 'Bolsa Couro Marrom', quantity: 1, price: '349.90', sku: 'BOL-COU-U' },
        { name: 'Sandália Rasteira Nude', quantity: 1, price: '129.90', sku: 'SAN-NUD-37' },
        { name: 'Brinco Argola Dourado', quantity: 1, price: '59.90', sku: 'BRI-ARG-U' }
      ]),
      total_value: 759.60,
      shipping_value: 0,
      status: 'paid',
      created_at_origin: '2026-03-25'
    }
  ];

  for (const pedido of pedidos) {
    const { data, error } = await supabase
      .from('pedidos')
      .upsert(pedido, { onConflict: 'tenant_id,order_number' })
      .select()
      .single();

    if (error) {
      console.error(`   ERRO pedido ${pedido.order_number}:`, error.message);
    } else {
      console.log(`   OK — Pedido #${data.order_number} (${pedido.customer_name}) — ${pedido.items.length > 50 ? JSON.parse(pedido.items).length + ' itens' : ''}`);
    }
  }

  console.log('\n=== Seed concluído! ===');
  console.log(`\nPara testar:`);
  console.log(`  1. npm run dev`);
  console.log(`  2. Abra: http://localhost:3001/portal/loja-teste`);
  console.log(`  3. Use os dados:`);
  console.log(`     - Maria: CPF 12345678901 | Pedido 1001`);
  console.log(`     - João:  CPF 98765432100 | Pedido 1002`);
  console.log(`     - Ana:   CPF 11122233344 | Pedido 1003`);
  console.log(`     (ou use os emails: maria@email.com, joao@email.com, ana@email.com)`);
}

seed().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
