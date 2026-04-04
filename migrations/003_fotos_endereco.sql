-- Migration 003: Fotos e Endereco nas solicitacoes
-- Rodar no Supabase SQL Editor

ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS fotos JSONB;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS endereco JSONB;
