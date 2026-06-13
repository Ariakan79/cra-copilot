-- Lokaler OSV-Spiegel (ADR-022): offline-Matching, keine Kundendaten gehen raus.
create table osv_advisory (
  id uuid primary key default gen_random_uuid(),
  osv_id text not null,
  ecosystem text not null,
  paket text not null,
  eingefuehrt text not null default '0',
  behoben text,
  schweregrad text,
  zusammenfassung text,
  zurueckgezogen boolean not null default false
);
create index osv_paket_idx on osv_advisory(ecosystem, paket);
