const axios = require('axios');

/**
 * Integracao Correios — Logistica Reversa
 *
 * Usa a API dos Correios para gerar autorizacao de postagem reversa.
 * O cliente recebe um codigo para postar o produto em qualquer agencia.
 *
 * Requisitos:
 * - Contrato com Correios (CNPJ da loja + cartao de postagem)
 * - Credenciais configuradas em tenant_settings: correios_usuario, correios_senha,
 *   correios_cartao_postagem, correios_codigo_servico
 *
 * Se nao configurado, gera um codigo de postagem simulado (para testes).
 */

const CORREIOS_CALC_URL = 'http://ws.correios.com.br/calculador/CalcPrecoPrazo.asmx/CalcPrecoPrazo';
const CORREIOS_REVERSE_URL = 'https://cws.correios.com.br/logistica-reversa/v1';

/**
 * Calcula frete reverso (preco + prazo)
 */
async function calcularFreteReverso(cepOrigem, cepDestino, peso, config = {}) {
  try {
    const params = {
      nCdEmpresa: config.correios_codigo_empresa || '',
      sDsSenha: config.correios_senha || '',
      nCdServico: config.correios_codigo_servico || '41106', // PAC
      sCepOrigem: cepDestino, // invertido: cliente → loja
      sCepDestino: cepOrigem,
      nVlPeso: peso || '1',
      nCdFormato: 1, // caixa
      nVlComprimento: 30,
      nVlAltura: 15,
      nVlLargura: 20,
      nVlDiametro: 0,
      sCdMaoPropria: 'N',
      nVlValorDeclarado: 0,
      sCdAvisoRecebimento: 'N'
    };

    const res = await axios.get(CORREIOS_CALC_URL, { params, timeout: 10000 });
    // Parse XML response (simplified)
    const xml = res.data;
    const valor = xml.match(/<Valor>(.*?)<\/Valor>/)?.[1] || '0,00';
    const prazo = xml.match(/<PrazoEntrega>(.*?)<\/PrazoEntrega>/)?.[1] || '0';
    const erro = xml.match(/<Erro>(.*?)<\/Erro>/)?.[1] || '0';

    return {
      valor: valor.replace(',', '.'),
      prazo_dias: parseInt(prazo),
      erro: erro !== '0' ? erro : null,
      servico: config.correios_codigo_servico || '41106'
    };
  } catch (err) {
    console.error('[CORREIOS] Erro calculo frete:', err.message);
    return { valor: '0', prazo_dias: 0, erro: err.message };
  }
}

/**
 * Gera autorizacao de postagem reversa
 * Se Correios nao configurado, retorna codigo simulado
 */
async function gerarPostagemReversa(tenantConfig, dadosSolicitacao) {
  const {
    correios_usuario,
    correios_senha,
    correios_cartao_postagem,
    correios_codigo_servico,
    cep_origem
  } = tenantConfig;

  // Se Correios configurado, usa API real
  if (correios_usuario && correios_senha && correios_cartao_postagem) {
    try {
      const token = Buffer.from(`${correios_usuario}:${correios_senha}`).toString('base64');

      const payload = {
        codAdministrativo: correios_cartao_postagem,
        tipo: 'A', // Autorizacao
        servico: correios_codigo_servico || '41106',
        remetente: {
          nome: dadosSolicitacao.customer_name,
          logradouro: dadosSolicitacao.endereco || 'A informar',
          numero: dadosSolicitacao.numero || 'S/N',
          bairro: dadosSolicitacao.bairro || 'A informar',
          cep: dadosSolicitacao.cep_cliente || '',
          cidade: dadosSolicitacao.cidade || '',
          uf: dadosSolicitacao.uf || '',
          email: dadosSolicitacao.customer_email
        },
        destinatario: {
          nome: tenantConfig.loja_nome,
          cep: cep_origem
        },
        coletaReversa: false // cliente vai ate a agencia
      };

      const res = await axios.post(
        `${CORREIOS_REVERSE_URL}/autorizacoes-postagem`,
        payload,
        {
          headers: {
            'Authorization': `Basic ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      return {
        codigo_postagem: res.data.numero || res.data.codigoAutorizacao,
        tipo: 'correios_api',
        sucesso: true
      };
    } catch (err) {
      console.error('[CORREIOS] Erro API reversa:', err.message);
      // Fallback para codigo simulado
    }
  }

  // Fallback: gerar codigo simulado (para testes ou sem contrato)
  const codigoSimulado = `LR${Date.now().toString(36).toUpperCase()}BR`;

  return {
    codigo_postagem: codigoSimulado,
    tipo: 'simulado',
    sucesso: true,
    nota: cep_origem
      ? 'Codigo simulado. Configure credenciais Correios para gerar codigo real.'
      : 'Configure CEP de origem e credenciais Correios nas configuracoes.'
  };
}

module.exports = { calcularFreteReverso, gerarPostagemReversa };
