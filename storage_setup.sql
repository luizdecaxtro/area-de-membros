-- ============================================================
-- ÁREA DE MEMBROS · LOJAS DE CASTRO
-- storage_setup.sql
--
-- Execute este SQL DEPOIS de criar o bucket "avatars" no Storage
-- Supabase → Storage → New bucket → nome: avatars → Public: ON
-- Depois cole este SQL no SQL Editor e clique Run
-- ============================================================

-- Política: qualquer autenticado pode fazer upload do próprio avatar
CREATE POLICY "Avatar: upload próprio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Política: qualquer autenticado pode atualizar o próprio avatar
CREATE POLICY "Avatar: atualizar próprio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Política: leitura pública (para exibir as fotos)
CREATE POLICY "Avatar: leitura pública"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Política: deletar próprio avatar
CREATE POLICY "Avatar: deletar próprio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- ✅ Pronto! Agora os alunos podem fazer upload de fotos.
-- ============================================================
