-- Domain tables for the Client Onboarding Research Engine.
-- The workflow kit creates onboarding_workflow_runs / _steps / _logs / _suspensions
-- automatically on first write. These tables hold the business records.
-- Names assume TABLE_PREFIX=onboarding_.

create table if not exists onboarding_requests (
  request_id text primary key,
  client_name text not null,
  industry text not null default 'unspecified',
  website text,
  source text not null default 'webhook',
  completeness integer not null default 0,
  status text not null default 'received'
    check (status in ('received', 'screening', 'researching', 'drafting', 'awaiting_approval', 'delivered', 'rejected', 'failed')),
  intake jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists onboarding_research_briefs (
  request_id text primary key references onboarding_requests(request_id) on delete cascade,
  context_brief text not null,
  workflow_audit text not null,
  tech_stack text not null,
  strategy text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists onboarding_documents (
  id bigserial primary key,
  request_id text not null references onboarding_requests(request_id) on delete cascade,
  kind text not null,
  filename text not null,
  storage_key text,
  url text,
  content text not null,
  quality_passed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, kind)
);

create table if not exists onboarding_approvals (
  id bigserial primary key,
  request_id text not null references onboarding_requests(request_id) on delete cascade,
  stage text not null check (stage in ('screen', 'approval')),
  action text not null check (action in ('auto', 'supplement', 'proceed', 'approve', 'reject')),
  decided_by text not null,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_requests_status_idx
  on onboarding_requests (status, created_at desc);

create index if not exists onboarding_documents_request_idx
  on onboarding_documents (request_id);

create index if not exists onboarding_approvals_request_idx
  on onboarding_approvals (request_id, created_at asc);
