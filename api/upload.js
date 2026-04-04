const { supabase } = require('../lib/supabase');

/**
 * POST /api/upload — Upload de foto para Supabase Storage
 *
 * Recebe base64 da imagem, salva no bucket 'solicitacoes-fotos'
 * Retorna a URL pública da imagem
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  try {
    const { file, filename, content_type } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'file (base64) obrigatorio' });
    }

    // Decodificar base64
    const base64Data = file.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Limitar tamanho (5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo muito grande (max 5MB)' });
    }

    // Gerar nome unico
    const ext = (content_type || 'image/jpeg').split('/')[1] || 'jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `fotos/${name}`;

    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from('solicitacoes-fotos')
      .upload(path, buffer, {
        contentType: content_type || 'image/jpeg',
        upsert: false
      });

    if (error) {
      // Se bucket nao existe, tentar criar
      if (error.message?.includes('not found') || error.statusCode === 400) {
        await supabase.storage.createBucket('solicitacoes-fotos', {
          public: true,
          fileSizeLimit: 5242880
        });

        // Tentar upload de novo
        const retry = await supabase.storage
          .from('solicitacoes-fotos')
          .upload(path, buffer, {
            contentType: content_type || 'image/jpeg',
            upsert: false
          });

        if (retry.error) throw retry.error;
      } else {
        throw error;
      }
    }

    // Gerar URL publica
    const { data: urlData } = supabase.storage
      .from('solicitacoes-fotos')
      .getPublicUrl(path);

    return res.json({ url: urlData.publicUrl, path });
  } catch (error) {
    console.error('Erro em /api/upload:', error);
    return res.status(500).json({ error: 'Erro ao fazer upload: ' + error.message });
  }
};
