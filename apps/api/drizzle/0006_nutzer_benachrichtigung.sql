-- Nutzerbenachrichtigung (Art. 14 Abs. 8, ADR-037): am Meldevorgang,
-- nach Versand unveränderlich + verkettet (ADR-035).
create table nutzer_benachrichtigung (
  id uuid primary key default gen_random_uuid(),
  vorgang_id uuid not null references meldevorgang(id),
  mandant_id uuid not null references mandant(id),
  inhalt jsonb,
  versendet_am timestamptz,
  versendet_von text
);
create index nutzer_benachrichtigung_vorgang_idx on nutzer_benachrichtigung(vorgang_id);

-- Erst nach Versand unveränderlich (Entwurf bleibt editierbar).
create function nutzer_benachrichtigung_versendet_unveraenderlich() returns trigger as $$
begin
  if old.versendet_am is not null then
    raise exception 'Versendete Nutzerbenachrichtigungen sind unveraenderlich (Nachweis, ADR-037).';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$ language plpgsql;

create trigger nutzer_benachrichtigung_kein_update before update on nutzer_benachrichtigung
  for each row execute function nutzer_benachrichtigung_versendet_unveraenderlich();
create trigger nutzer_benachrichtigung_kein_delete before delete on nutzer_benachrichtigung
  for each row execute function nutzer_benachrichtigung_versendet_unveraenderlich();
