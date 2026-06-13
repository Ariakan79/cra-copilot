-- Meldeworkflow CRA Art. 14 (Phase 4).

create table meldevorgang (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  produkt_id uuid not null references produkt(id),
  art text not null,
  quelle_finding_id uuid references finding(id),
  titel text not null,
  status text not null default 'offen',
  begruendung text,
  korrekturmassnahme_ab timestamptz,
  eroeffnet_von text not null,
  eroeffnet_am timestamptz not null default now()
);
create index meldevorgang_produkt_idx on meldevorgang(produkt_id);

create table meldung_stufe (
  id uuid primary key default gen_random_uuid(),
  vorgang_id uuid not null references meldevorgang(id),
  stufe text not null,
  inhalt jsonb,
  eingereicht_am timestamptz,
  eingereicht_von text,
  kanal text
);
create unique index meldung_stufe_unique on meldung_stufe(vorgang_id, stufe);

-- Eine Stufe ist erst NACH der Einreichung unveränderlich (ADR-031): Entwurf
-- darf bearbeitet werden, eingereichter Inhalt nicht mehr.
create function meldung_stufe_eingereicht_unveraenderlich() returns trigger as $$
begin
  if old.eingereicht_am is not null then
    raise exception 'Eingereichte Meldestufen sind unveraenderlich (Nachweis, ADR-031).';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$ language plpgsql;

create trigger meldung_stufe_kein_update before update on meldung_stufe
  for each row execute function meldung_stufe_eingereicht_unveraenderlich();
create trigger meldung_stufe_kein_delete before delete on meldung_stufe
  for each row execute function meldung_stufe_eingereicht_unveraenderlich();
