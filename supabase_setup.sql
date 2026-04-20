-- ============================================================
-- ÁREA DE MEMBROS · LOJAS DE CASTRO  v3
-- supabase_setup_v3.sql
--
-- ATENÇÃO: Execute APENAS se ainda NÃO rodou o supabase_setup.sql anterior.
-- Se já rodou, execute APENAS o bloco "NOVOS RECURSOS" no final.
-- ============================================================

-- ── TABELAS PRINCIPAIS (se ainda não existem) ───────────────

CREATE TABLE IF NOT EXISTS public.membros (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL DEFAULT '',
  email         TEXT,
  cel           TEXT DEFAULT '',
  grau_instrucao TEXT DEFAULT '',
  curso         TEXT DEFAULT '',
  bio           TEXT DEFAULT '',
  avatar_url    TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id    UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  conteudo    TEXT NOT NULL,
  topico      TEXT CHECK (topico IN ('dica','duvida','parceria','conquista','discussao') OR topico IS NULL),
  likes       INTEGER DEFAULT 0,
  likes_ids   UUID[] DEFAULT '{}',
  comentarios INTEGER DEFAULT 0,
  fixado      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comentarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  autor_id    UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  conteudo    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOVOS RECURSOS (execute mesmo se já tinha o setup anterior) ──

-- Coluna "fixado" na tabela posts (caso já exista a tabela)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS fixado BOOLEAN DEFAULT FALSE;

-- Tabela: notificacoes
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dest_id     UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  autor_id    UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  autor_nome  TEXT DEFAULT '',
  autor_ini   TEXT DEFAULT '',
  mensagem    TEXT NOT NULL,
  post_id     UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  lida        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: eventos
CREATE TABLE IF NOT EXISTS public.eventos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT NOT NULL,
  descricao   TEXT DEFAULT '',
  data_hora   TIMESTAMPTZ NOT NULL,
  link        TEXT DEFAULT '',
  curso       TEXT DEFAULT '',
  criado_por  UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.membros      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos      ENABLE ROW LEVEL SECURITY;

-- Membros
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='membros' AND policyname='Membros: leitura autenticada') THEN
    CREATE POLICY "Membros: leitura autenticada" ON public.membros FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='membros' AND policyname='Membros: inserir próprio') THEN
    CREATE POLICY "Membros: inserir próprio" ON public.membros FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='membros' AND policyname='Membros: atualizar próprio') THEN
    CREATE POLICY "Membros: atualizar próprio" ON public.membros FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- Posts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='Posts: leitura autenticada') THEN
    CREATE POLICY "Posts: leitura autenticada" ON public.posts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='Posts: criar autenticado') THEN
    CREATE POLICY "Posts: criar autenticado" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = autor_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='Posts: atualizar likes (qualquer autenticado)') THEN
    CREATE POLICY "Posts: atualizar likes (qualquer autenticado)" ON public.posts FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='Posts: deletar próprio') THEN
    CREATE POLICY "Posts: deletar próprio" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = autor_id);
  END IF;
END $$;

-- Comentários
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comentarios' AND policyname='Comentarios: leitura autenticada') THEN
    CREATE POLICY "Comentarios: leitura autenticada" ON public.comentarios FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comentarios' AND policyname='Comentarios: criar autenticado') THEN
    CREATE POLICY "Comentarios: criar autenticado" ON public.comentarios FOR INSERT TO authenticated WITH CHECK (auth.uid() = autor_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comentarios' AND policyname='Comentarios: deletar próprio') THEN
    CREATE POLICY "Comentarios: deletar próprio" ON public.comentarios FOR DELETE TO authenticated USING (auth.uid() = autor_id);
  END IF;
END $$;

-- Notificações
CREATE POLICY "Notif: ver próprias" ON public.notificacoes FOR SELECT TO authenticated USING (auth.uid() = dest_id);
CREATE POLICY "Notif: criar autenticado" ON public.notificacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = autor_id);
CREATE POLICY "Notif: marcar lida" ON public.notificacoes FOR UPDATE TO authenticated USING (auth.uid() = dest_id);

-- Eventos
CREATE POLICY "Eventos: leitura autenticada" ON public.eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Eventos: criar autenticado" ON public.eventos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Eventos: deletar próprio" ON public.eventos FOR DELETE TO authenticated USING (auth.uid() = criado_por);

-- ── TRIGGER novo usuário ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.membros (id, nome, email, cel, grau_instrucao, curso, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'cel', ''),
    COALESCE(NEW.raw_user_meta_data->>'grau', ''),
    COALESCE(NEW.raw_user_meta_data->>'curso', ''),
    COALESCE(NEW.raw_user_meta_data->>'bio', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── ÍNDICES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posts_created     ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_topico      ON public.posts(topico);
CREATE INDEX IF NOT EXISTS idx_posts_fixado      ON public.posts(fixado);
CREATE INDEX IF NOT EXISTS idx_comentarios_post  ON public.comentarios(post_id);
CREATE INDEX IF NOT EXISTS idx_membros_last_seen ON public.membros(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_notif_dest        ON public.notificacoes(dest_id, lida);
CREATE INDEX IF NOT EXISTS idx_eventos_data      ON public.eventos(data_hora);

-- ============================================================
-- ✅ Setup v3 completo!
-- Agora faça também o storage_setup.sql para as fotos.
-- ============================================================
