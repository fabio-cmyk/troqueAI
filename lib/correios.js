const axios = require('axios');

/**
 * Integração Correios — Logística Reversa via CWS REST API
 *
 * Fluxo:
 * 1. Autenticar com usuario + token → recebe JWT (1h)
 * 2. Criar autorização de postagem reversa
 * 3. Cliente recebe código para postar em qualquer agência
 *
 * Credenciais necessárias (tenant_settings):
 * - correios_usuario: login do Portal Meu Correios
 * - correios_token: token de API
 * - correios_cartao_postagem: número do cartão de postagem
 * - correios_cod_administrativo: código administrativo do contrato
 * - correios_codigo_sedex: código do serviço SEDEX reverso (ex: 03247)
 * - correios_codigo_pac: código do serviço PAC reverso (ex: 03301)
 * - correios_prazo_postagem: prazo em dias para o cliente postar (default: 14)
 *
 * Se não configurado, gera código simulado (para testes).
 */

const CORREIOS_API_URL = 'https://api.correios.com.br';
const CORREIOS_API_HOM = 'https://apihom.correios.com.br';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Autentica na API dos Correios e retorna JWT
 */
async function autenticar(config, useHomolog = false) {
  // Usar cache se token ainda válido (margem de 5min)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const baseUrl = useHomolog ? CORREIOS_API_HOM : CORREIOS_API_URL;
  const auth = Buffer.from(`${config.correios_usuario}:${config.correios_token}`).toString('base64');

  try {
    const res = await axios.post(
      `${baseUrl}/token/v1/autentica/cartaopostagem`,
      { numero: config.correios_cartao_postagem },
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    cachedToken = res.data.token;
    // Token expira em ~1h, cachear por 50min
    tokenExpiry = Date.now() + 50 * 60 * 1000;

    console.log('[CORREIOS] Autenticado com sucesso');
    return cachedToken;
  } catch (err) {
    console.error('[CORREIOS] Erro autenticação:', err.response?.data || err.message);
    cachedToken = null;
    tokenExpiry = 0;
    throw new Error('Falha na autenticação com Correios: ' + (err.response?.data?.msgs?.[0]?.texto || err.message));
  }
}

/**
 * Verifica se as credenciais dos Correios estão válidas
 */
async function verificarCredenciais(config) {
  try {
    const token = await autenticar(config);
    return { ok: true, token };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Gera autorização de postagem reversa
 *
 * @param {object} tenantConfig - configurações do tenant (correios_*)
 * @param {object} dadosSolicitacao - dados da solicitação + endereço do cliente
 * @param {string} servico - 'pac' ou 'sedex' (default: pac)
 */
async function gerarPostagemReversa(tenantConfig, dadosSolicitacao, servico = 'pac') {
  const {
    correios_usuario,
    correios_token,
    correios_cartao_postagem,
    correios_cod_administrativo,
    correios_codigo_sedex,
    correios_codigo_pac,
    cep_origem,
    loja_nome,
    loja_logradouro,
    loja_numero,
    loja_bairro,
    loja_cidade,
    loja_uf
  } = tenantConfig;

  // Se Correios não configurado, retornar erro
  if (!correios_usuario || !correios_token || !correios_cartao_postagem) {
    return {
      codigo_postagem: null,
      tipo: 'nao_configurado',
      sucesso: false,
      nota: 'Correios não configurado. Configure as credenciais em Integracoes para gerar códigos de postagem.'
    };
  }

  try {
    // 1. Autenticar
    const token = await autenticar(tenantConfig);

    // 2. Montar payload
    const codigoServico = servico === 'sedex'
      ? (correios_codigo_sedex || '03247')
      : (correios_codigo_pac || '03301');

    const payload = {
      codAdministrativo: correios_cod_administrativo,
      tipo: 'A', // Autorização (cliente vai até agência)
      cartao: correios_cartao_postagem,
      servico: codigoServico,
      ar: 0,
      remetente: {
        nome: dadosSolicitacao.customer_name || 'Cliente',
        logradouro: dadosSolicitacao.endereco || dadosSolicitacao.logradouro || 'A informar',
        numero: dadosSolicitacao.numero || 'S/N',
        complemento: dadosSolicitacao.complemento || '',
        bairro: dadosSolicitacao.bairro || 'A informar',
        cep: (dadosSolicitacao.cep_cliente || dadosSolicitacao.cep || '').replace(/\D/g, ''),
        cidade: dadosSolicitacao.cidade || '',
        uf: dadosSolicitacao.uf || '',
        telefone: dadosSolicitacao.telefone || '',
        email: dadosSolicitacao.customer_email || '',
        ddd: ''
      },
      destinatario: {
        nome: loja_nome || 'Loja',
        logradouro: loja_logradouro || 'A informar',
        numero: loja_numero || 'S/N',
        complemento: '',
        bairro: loja_bairro || '',
        cep: (cep_origem || '').replace(/\D/g, ''),
        cidade: loja_cidade || '',
        uf: loja_uf || '',
        telefone: '',
        email: '',
        ddd: ''
      },
      coletaReversa: false,
      objeto: [
        {
          item: '1',
          desc: dadosSolicitacao.descricao || `Troca/Devolução - ${dadosSolicitacao.protocolo || ''}`,
          num: '',
          id: dadosSolicitacao.protocolo || dadosSolicitacao.id || ''
        }
      ]
    };

    // 3. Chamar API
    const res = await axios.post(
      `${CORREIOS_API_URL}/logisticaReversa/v1/autorizacoes-postagem`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const data = res.data;

    return {
      codigo_postagem: data.codigoObjeto || data.numeroAutorizacaoPostagem || data.idAutorizacaoPostagem,
      id_autorizacao: data.idAutorizacaoPostagem,
      numero_autorizacao: data.numeroAutorizacaoPostagem,
      prazo: data.prazo,
      tipo: 'correios_api',
      servico: codigoServico,
      sucesso: true
    };
  } catch (err) {
    console.error('[CORREIOS] Erro ao gerar postagem reversa:', err.response?.data || err.message);

    return {
      codigo_postagem: null,
      tipo: 'erro',
      sucesso: false,
      nota: 'Erro na API Correios: ' + (err.response?.data?.msgs?.[0]?.texto || err.message)
    };
  }
}

/**
 * Gera código simulado (fallback quando Correios não configurado ou com erro)
 */
function gerarCodigoSimulado(tenantConfig, errMsg) {
  const codigoSimulado = `LR${Date.now().toString(36).toUpperCase()}BR`;
  const nota = errMsg
    ? `Erro na API Correios: ${errMsg}. Código simulado gerado.`
    : tenantConfig?.cep_origem
      ? 'Código simulado. Configure credenciais Correios para gerar código real.'
      : 'Configure CEP de origem e credenciais Correios nas configurações.';

  return {
    codigo_postagem: codigoSimulado,
    tipo: 'simulado',
    sucesso: true,
    nota
  };
}

/**
 * Calcula frete reverso via API nova dos Correios
 */
async function calcularFreteReverso(cepOrigem, cepDestino, peso, config = {}) {
  // Se tem credenciais, usar API nova
  if (config.correios_usuario && config.correios_token && config.correios_cartao_postagem) {
    try {
      const token = await autenticar(config);
      const codigoServico = config.correios_codigo_pac || '03301';

      const res = await axios.get(
        `${CORREIOS_API_URL}/preco/v1/nacional/${codigoServico}`,
        {
          params: {
            cepOrigem: cepDestino.replace(/\D/g, ''), // invertido: cliente → loja
            cepDestino: cepOrigem.replace(/\D/g, ''),
            psObjeto: peso || 1000, // gramas
            tpObjeto: 2, // pacote
            comprimento: 30,
            largura: 20,
            altura: 15
          },
          headers: { 'Authorization': `Bearer ${token}` },
          timeout: 10000
        }
      );

      return {
        valor: res.data.pcFinal || res.data.pcBase || '0',
        prazo_dias: res.data.prazoEntrega || 0,
        erro: null,
        servico: codigoServico
      };
    } catch (err) {
      console.error('[CORREIOS] Erro calculo frete:', err.message);
    }
  }

  // Fallback: retornar zero (sem estimativa)
  return { valor: '0', prazo_dias: 0, erro: 'Correios não configurado', servico: null };
}

/**
 * Rastreia objeto nos Correios
 * Retorna eventos do objeto (postado, em transito, entregue, etc)
 */
async function rastrearObjeto(config, codigoObjeto) {
  if (!config.correios_usuario || !config.correios_token || !config.correios_cartao_postagem) {
    return { eventos: [], erro: 'Correios não configurado' };
  }

  try {
    const token = await autenticar(config);

    const res = await axios.get(
      `${CORREIOS_API_URL}/srorastro/v1/objetos/${codigoObjeto}`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000
      }
    );

    const objetos = res.data.objetos || [res.data];
    const objeto = objetos[0] || {};
    const eventos = objeto.eventos || [];

    // Verificar se foi postado (evento com tipo "PO" ou descricao contendo "Postado")
    const foiPostado = eventos.some(e =>
      e.tipo === 'PO' ||
      (e.descricao || '').toLowerCase().includes('postado') ||
      (e.descricao || '').toLowerCase().includes('objeto postado')
    );

    // Verificar se foi entregue
    const foiEntregue = eventos.some(e =>
      e.tipo === 'BDE' || e.tipo === 'BDI' ||
      (e.descricao || '').toLowerCase().includes('entregue')
    );

    return {
      eventos,
      foiPostado,
      foiEntregue,
      ultimoEvento: eventos[0] || null,
      codigoObjeto
    };
  } catch (err) {
    console.error('[CORREIOS] Erro rastreamento:', err.response?.data || err.message);
    return { eventos: [], erro: err.message };
  }
}

module.exports = { autenticar, verificarCredenciais, gerarPostagemReversa, calcularFreteReverso, rastrearObjeto };
