CREATE TABLE IF NOT EXISTS public.scale_reset_discoveries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  session JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS scale_reset_discoveries_updated_at_idx
  ON public.scale_reset_discoveries (updated_at DESC);

ALTER TABLE public.scale_reset_discoveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.scale_reset_discoveries FROM anon, authenticated;
