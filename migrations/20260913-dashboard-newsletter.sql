-- Credentials remain in the existing Neon authentication functions, never in source.
CREATE TABLE IF NOT EXISTS public.crm_newsletter_subscribers (
  email text PRIMARY KEY,
  consent_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL DEFAULT 'launches-v1',
  source text NOT NULL DEFAULT 'storefront',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_newsletter_subscribers FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.crm_newsletter_signup(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e text := lower(trim(coalesce(payload->>'email','')));
BEGIN
  IF length(e)>240 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR payload->>'consent' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok',false);
  END IF;
  -- Keep an existing unsubscribe in force; never reveal subscription status publicly.
  IF NOT EXISTS (SELECT 1 FROM crm_unsubscribes WHERE email=e) THEN
    INSERT INTO crm_newsletter_subscribers(email,source)
    VALUES(e,left(coalesce(nullif(payload->>'source',''),'storefront'),120))
    ON CONFLICT(email) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.crm_dashboard_activity(p_admin_key text, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE since_at timestamptz; result jsonb;
BEGIN
  PERFORM public.crm_dashboard_snapshot(p_admin_key);
  IF p_days NOT IN (1,7,30,90) THEN RAISE EXCEPTION 'invalid_period'; END IF;
  since_at := ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (p_days-1))::timestamp AT TIME ZONE 'America/Sao_Paulo';
  WITH sessions AS (
    SELECT * FROM crm_sessions WHERE started_at>=since_at
      AND lower(coalesce(source,'')) NOT IN ('qa','test','automation')
      AND session_id NOT LIKE 'qa-%' AND visitor_id NOT LIKE 'qa-%'
  ), events AS (
    SELECT e.* FROM crm_events e WHERE e.occurred_at>=since_at
      AND lower(coalesce(e.source,'')) NOT IN ('qa','test','automation')
      AND coalesce(e.session_id,'') NOT LIKE 'qa-%' AND coalesce(e.visitor_id,'') NOT LIKE 'qa-%'
  ), leads AS (
    SELECT * FROM crm_leads WHERE first_seen>=since_at
      AND lower(email) NOT LIKE '%@example.com' AND coalesce(session_id,'') NOT LIKE 'qa-%'
  ), subscribers AS (
    SELECT n.* FROM crm_newsletter_subscribers n
    WHERE NOT EXISTS(SELECT 1 FROM crm_unsubscribes u WHERE u.email=n.email)
  )
  SELECT jsonb_build_object(
    'generated_at',now(),'since',since_at,'timezone','America/Sao_Paulo','days',p_days,
    'summary',jsonb_build_object(
      'visitors',(SELECT count(DISTINCT visitor_id) FROM sessions),
      'sessions',(SELECT count(*) FROM sessions),
      'leads',(SELECT count(DISTINCT lower(email)) FROM leads),
      'newsletter_new',(SELECT count(*) FROM subscribers WHERE created_at>=since_at),
      'newsletter_total',(SELECT count(*) FROM subscribers),
      'pdf_downloads',(SELECT count(*) FROM events WHERE event_name='pdf_download'),
      'audio_plays',(SELECT count(*) FROM events WHERE event_name='audio_play'),
      'audio_downloads',(SELECT count(*) FROM events WHERE event_name='audio_download'),
      'access_opens',(SELECT count(*) FROM events WHERE event_name='access_open'),
      'whatsapp_clicks',(SELECT count(*) FROM events WHERE event_name='whatsapp_click')
    ),
    'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d."day") FROM (
      SELECT to_char(day_at,'YYYY-MM-DD') AS "day",
        (SELECT count(*) FROM sessions s WHERE (s.started_at AT TIME ZONE 'America/Sao_Paulo')::date=day_at::date) sessions
      FROM generate_series((since_at AT TIME ZONE 'America/Sao_Paulo')::date,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date,'1 day'::interval) AS series(day_at)
    ) d),'[]'::jsonb),
    'sources',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT coalesce(nullif(source,''),'direct') source,count(*) sessions
      FROM sessions GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    ) d),'[]'::jsonb),
    'locations',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT coalesce(nullif(city,''),'Não identificada') city,region,country,count(*) sessions
      FROM sessions GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 8
    ) d),'[]'::jsonb),
    'events',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT event_name,count(*) total FROM events GROUP BY 1 ORDER BY 2 DESC
    ) d),'[]'::jsonb),
    'subscribers',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (
      SELECT email,created_at,source FROM subscribers ORDER BY created_at DESC LIMIT 50
    ) d),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
