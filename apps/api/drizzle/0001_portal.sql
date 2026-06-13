-- Portal: Ingestion & Monitoring (Phase 3).

create table portal_user (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  benutzername text not null unique,
  passwort_hash text not null,
  erstellt_am timestamptz not null default now()
);

create table ingestion_token (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid not null references produkt(id),
  token_hash text not null,
  bezeichnung text,
  erstellt_am timestamptz not null default now(),
  widerrufen_am timestamptz
);
create index ingestion_token_hash_idx on ingestion_token(token_hash);

-- Append-only Lieferungen (ADR-024): Roh-SBOM bleibt als Nachweis erhalten.
create table sbom_lieferung (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid not null references produkt(id),
  stream_name text not null,
  format text not null,
  format_version text,
  kanal text not null,
  trigger text,
  roh jsonb not null,
  profil_konform boolean not null,
  validierung jsonb,
  eingegangen_am timestamptz not null default now()
);
create index sbom_lieferung_scope_idx on sbom_lieferung(produkt_id, stream_name);

-- Unveränderlichkeit der Lieferhistorie (analog Evidenzknoten, ADR-015/024).
create trigger sbom_lieferung_kein_update before update on sbom_lieferung
  for each row execute function evidenz_unveraenderlich();
create trigger sbom_lieferung_kein_delete before delete on sbom_lieferung
  for each row execute function evidenz_unveraenderlich();

-- Komponenten der jüngsten profilkonformen Lieferung je Stream (ersetzt bei neuer).
create table komponente (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid not null references produkt(id),
  stream_name text not null,
  lieferung_id uuid not null references sbom_lieferung(id),
  purl text,
  name text not null,
  version text,
  lieferant text
);
create index komponente_scope_idx on komponente(produkt_id, stream_name);

create table finding (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid not null references produkt(id),
  komponente_purl text,
  komponente_name text,
  schwachstelle_id text not null,
  schweregrad text,
  quelle text not null default 'osv',
  triage_status text not null default 'neu',
  exploitability_hinweis text,
  behoben_durch_daten boolean not null default false,
  erste_sichtung timestamptz not null default now(),
  letzte_sichtung timestamptz not null default now()
);
create unique index finding_scope_unique on finding(produkt_id, schwachstelle_id, komponente_purl);
