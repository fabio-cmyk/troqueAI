const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TEMPLATES = {
  solicitacao_criada: {
    subject: 'Sua solicitacao de {{tipo}} foi recebida - #{{protocolo}}',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">{{loja_nome}}</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;">
          <p>Ola <strong>{{cliente_nome}}</strong>,</p>
          <p>Recebemos sua solicitacao de <strong>{{tipo}}</strong> para o pedido <strong>#{{pedido_numero}}</strong>.</p>
          <p><strong>Protocolo:</strong> {{protocolo}}</p>
          <p><strong>Status:</strong> Aguardando analise</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 14px;">Voce sera notificado por e-mail sobre cada atualizacao.</p>
        </div>
      </div>
    `
  },
  solicitacao_aprovada: {
    subject: 'Solicitacao #{{protocolo}} aprovada!',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">Solicitacao Aprovada!</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;">
          <p>Ola <strong>{{cliente_nome}}</strong>,</p>
          <p>Sua solicitacao <strong>#{{protocolo}}</strong> foi aprovada.</p>
          {{#codigo_postagem}}
          <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <p style="margin: 0 0 10px; color: #065f46;">Codigo de postagem:</p>
            <p style="font-size: 24px; font-weight: bold; margin: 0; color: #065f46;">{{codigo_postagem}}</p>
          </div>
          {{/codigo_postagem}}
          <p>Envie o produto e acompanhe pelo portal.</p>
        </div>
      </div>
    `
  },
  vale_troca: {
    subject: 'Seu vale-troca de R$ {{valor}} esta disponivel!',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">Vale-Troca Disponivel!</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;">
          <p>Ola <strong>{{cliente_nome}}</strong>,</p>
          <div style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <p style="margin: 0 0 5px; color: #92400e;">Seu cupom de desconto:</p>
            <p style="font-size: 28px; font-weight: bold; margin: 0; color: #92400e;">{{cupom_codigo}}</p>
            <p style="margin: 10px 0 0; font-size: 20px; color: #b45309;">R$ {{valor}}</p>
          </div>
          <p>Use este cupom na sua proxima compra em <strong>{{loja_nome}}</strong>.</p>
          <p style="color: #6b7280; font-size: 14px;">Valido ate {{validade}}.</p>
        </div>
      </div>
    `
  }
};

function renderTemplate(template, dados) {
  let { subject, html } = template;
  for (const [key, value] of Object.entries(dados)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(regex, value || '');
    html = html.replace(regex, value || '');
  }
  return { subject, html };
}

async function enviarEmail(para, templateName, dados) {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error(`Template "${templateName}" nao encontrado`);

  const { subject, html } = renderTemplate(template, dados);

  if (!resend) {
    console.log(`[EMAIL SKIP] Para: ${para} | Assunto: ${subject}`);
    return { id: 'skip-no-api-key' };
  }

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'troqueAI <noreply@troqueai.com.br>',
    to: para,
    subject,
    html
  });

  if (error) throw error;
  return data;
}

module.exports = { enviarEmail, TEMPLATES };
