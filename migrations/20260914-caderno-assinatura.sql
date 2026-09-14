-- Assinatura do caderno de erros.
--
-- O que esta migração guarda é pouco de propósito: quem assinou, até quando
-- vale, e o caderno da pessoa. Não há senha porque o site inteiro é sem senha —
-- a chave que chega por e-mail é a identidade, do mesmo jeito que o session_id
-- do Stripe já é a identidade de quem comprou uma apostila.
--
-- As credenciais continuam nas funções de autenticação da Neon, nunca no
-- código. Rodar isto é manual: o repositório não tem DATABASE_URL.

CREATE TABLE IF NOT EXISTS public.caderno_assinantes (
  email text PRIMARY KEY,
  -- A chave é gerada na aplicação, não aqui: assim a tabela não depende da
  -- extensão pgcrypto estar instalada no projeto.
  chave text UNIQUE NOT NULL,
  stripe_customer text,
  stripe_subscription text UNIQUE,
  -- 'ativa' libera a sincronização. Qualquer outro valor só bloqueia o sync;
  -- nunca apaga o caderno, porque quem volta depois de dois meses parados
  -- espera encontrar o que anotou.
  status text NOT NULL DEFAULT 'pendente',
  vale_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.caderno_estado (
  email text PRIMARY KEY REFERENCES public.caderno_assinantes(email) ON DELETE CASCADE,
  estado jsonb NOT NULL DEFAULT '{"versao":1,"itens":[]}'::jsonb,
  -- Contador de gravações. Serve para o aparelho perceber que o outro gravou
  -- entre a leitura e a escrita dele e refazer a fusão em vez de sobrescrever.
  revisao bigint NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.caderno_assinantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caderno_estado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.caderno_assinantes FROM PUBLIC;
REVOKE ALL ON public.caderno_estado FROM PUBLIC;

-- Só o webhook do Stripe chama isto, e ele já validou a assinatura do evento.
CREATE OR REPLACE FUNCTION public.caderno_assinatura_registrar(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  e text := lower(trim(coalesce(payload->>'email','')));
  nova text := coalesce(nullif(payload->>'chave',''), '');
  atual record;
BEGIN
  IF length(e) > 240 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR length(nova) < 32 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  INSERT INTO caderno_assinantes(email, chave, stripe_customer, stripe_subscription, status, vale_ate)
  VALUES (
    e, nova,
    left(coalesce(payload->>'stripe_customer',''), 80),
    left(coalesce(payload->>'stripe_subscription',''), 80),
    left(coalesce(nullif(payload->>'status',''), 'ativa'), 20),
    nullif(payload->>'vale_ate','')::timestamptz
  )
  ON CONFLICT (email) DO UPDATE SET
    -- A chave de quem já assinou não muda: ela está no e-mail que a pessoa
    -- guardou, e trocá-la a cada renovação quebraria o acesso todo mês.
    stripe_customer = coalesce(nullif(excluded.stripe_customer,''), caderno_assinantes.stripe_customer),
    stripe_subscription = coalesce(nullif(excluded.stripe_subscription,''), caderno_assinantes.stripe_subscription),
    status = excluded.status,
    vale_ate = coalesce(excluded.vale_ate, caderno_assinantes.vale_ate),
    atualizado_em = now();

  INSERT INTO caderno_estado(email) VALUES (e) ON CONFLICT (email) DO NOTHING;

  SELECT * INTO atual FROM caderno_assinantes WHERE email = e;
  RETURN jsonb_build_object('ok', true, 'chave', atual.chave, 'status', atual.status);
END $$;

-- Renovação, cancelamento e falha de cobrança entram por aqui, achando a linha
-- pelo id da assinatura no Stripe — o e-mail pode ter sido trocado lá.
CREATE OR REPLACE FUNCTION public.caderno_assinatura_status(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sub text := left(coalesce(payload->>'stripe_subscription',''), 80);
BEGIN
  IF sub = '' THEN RETURN jsonb_build_object('ok', false); END IF;
  UPDATE caderno_assinantes SET
    status = left(coalesce(nullif(payload->>'status',''), status), 20),
    vale_ate = coalesce(nullif(payload->>'vale_ate','')::timestamptz, vale_ate),
    atualizado_em = now()
  WHERE stripe_subscription = sub;
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- Leitura. Devolve o caderno guardado para o aparelho fundir com o dele.
CREATE OR REPLACE FUNCTION public.caderno_puxar(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text := coalesce(payload->>'chave',''); a record; s record;
BEGIN
  IF length(k) < 32 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'chave'); END IF;
  SELECT * INTO a FROM caderno_assinantes WHERE chave = k;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'chave'); END IF;
  -- Uma assinatura cancelada hoje continua valendo até o fim do período pago.
  IF a.status NOT IN ('ativa','cancelando') OR (a.vale_ate IS NOT NULL AND a.vale_ate < now()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'inativa');
  END IF;
  SELECT * INTO s FROM caderno_estado WHERE email = a.email;
  RETURN jsonb_build_object('ok', true, 'email', a.email, 'vale_ate', a.vale_ate,
    'estado', coalesce(s.estado, '{"versao":1,"itens":[]}'::jsonb),
    'revisao', coalesce(s.revisao, 0));
END $$;

-- Escrita. Recusa se o outro aparelho gravou depois da leitura desta chamada:
-- perder anotação por corrida é o único defeito que a pessoa não tem como
-- perceber nem como desfazer.
CREATE OR REPLACE FUNCTION public.caderno_gravar(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k text := coalesce(payload->>'chave','');
  base bigint := coalesce((payload->>'revisao')::bigint, -1);
  novo jsonb := payload->'estado';
  a record; atual bigint;
BEGIN
  IF length(k) < 32 OR novo IS NULL OR jsonb_typeof(novo->'itens') <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'payload');
  END IF;
  -- Um caderno tem dezenas de itens, não dezenas de milhares. O teto existe
  -- para que uma chave vazada não vire depósito de arquivo.
  IF jsonb_array_length(novo->'itens') > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grande');
  END IF;
  SELECT * INTO a FROM caderno_assinantes WHERE chave = k;
  IF NOT FOUND OR a.status NOT IN ('ativa','cancelando')
     OR (a.vale_ate IS NOT NULL AND a.vale_ate < now()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'inativa');
  END IF;

  SELECT revisao INTO atual FROM caderno_estado WHERE email = a.email FOR UPDATE;
  IF atual IS NULL THEN
    INSERT INTO caderno_estado(email, estado, revisao) VALUES (a.email, novo, 1);
    RETURN jsonb_build_object('ok', true, 'revisao', 1);
  END IF;
  IF atual <> base THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflito', 'revisao', atual);
  END IF;
  UPDATE caderno_estado SET estado = novo, revisao = atual + 1, atualizado_em = now()
  WHERE email = a.email;
  RETURN jsonb_build_object('ok', true, 'revisao', atual + 1);
END $$;
