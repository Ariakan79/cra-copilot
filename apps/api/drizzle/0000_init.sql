-- Initiales Schema für das Cockpit (Phase 2).
-- Alle Tabellen mandantengetrennt (ADR-014); Evidenzknoten append-only (ADR-015).

create extension if not exists "pgcrypto";

create table mandant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  erstellt_am timestamptz not null default now()
);

create table produkt (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  name text not null,
  erstellt_am timestamptz not null default now()
);
create index produkt_mandant_idx on produkt(mandant_id);

create table evidenz_knoten (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid references produkt(id),
  feld_id text not null,
  wert jsonb not null,
  anmerkung text,
  quelle jsonb not null,
  ersetzt_id uuid references evidenz_knoten(id),
  erstellt_am timestamptz not null default now()
);
create index evidenz_scope_idx on evidenz_knoten(mandant_id, produkt_id, feld_id);
-- D1: lineare Supersession — kein Knoten wird zweimal ersetzt.
create unique index evidenz_ersetzt_unique on evidenz_knoten(ersetzt_id)
  where ersetzt_id is not null;

-- D2: Evidenzknoten sind unveränderlich. UPDATE/DELETE werden abgelehnt;
-- Korrekturen laufen ausschließlich über neue Knoten mit ersetzt_id.
create function evidenz_unveraenderlich() returns trigger as $$
begin
  raise exception 'Evidenzknoten sind unveraenderlich (append-only); Korrektur via neuen Knoten mit ersetzt_id (ADR-015).';
end;
$$ language plpgsql;

create trigger evidenz_kein_update before update on evidenz_knoten
  for each row execute function evidenz_unveraenderlich();
create trigger evidenz_kein_delete before delete on evidenz_knoten
  for each row execute function evidenz_unveraenderlich();

create table gap (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid references produkt(id),
  feld_id text not null,
  prioritaet text not null,
  status text not null default 'offen',
  verantwortlich text,
  frist text,
  erzeugt_am timestamptz not null default now()
);
create unique index gap_scope_unique on gap(mandant_id, produkt_id, feld_id);

create table sbom_stream (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid not null references produkt(id),
  name text not null,
  format text not null,
  tool text not null,
  ci_job text,
  kanal text not null,
  max_age_heartbeat_tage text
);
create index sbom_stream_produkt_idx on sbom_stream(produkt_id);

create table workshop (
  produkt_id uuid primary key references produkt(id),
  mandant_id uuid not null references mandant(id),
  workshop_durchgefuehrt_am timestamptz,
  onboarding_abgeschlossen_am timestamptz
);
