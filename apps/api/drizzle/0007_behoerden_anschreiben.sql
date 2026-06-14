-- Behörden-Anschreiben / Meldebereitschaft (ADR-036): nach Versand
-- unveränderlich + verkettet (ADR-035); Eingangsbestätigung einmal nachtragbar.
create table behoerden_anschreiben (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  art text not null default 'meldebereitschaft',
  inhalt jsonb not null,
  kopf_hash text,
  versendet_am timestamptz,
  versendet_von text,
  eingangsbestaetigung text,
  bestaetigt_am timestamptz
);
create index behoerden_anschreiben_mandant_idx on behoerden_anschreiben(mandant_id);

-- Entwurf editierbar; nach Versand unveränderlich — außer dem einmaligen
-- Nachtragen der Eingangsbestätigung (null -> Wert), die nichts anderes ändert.
create function behoerden_anschreiben_schutz() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.versendet_am is not null then
      raise exception 'Versendetes Anschreiben ist unveraenderlich (ADR-036).';
    end if;
    return old;
  end if;
  if old.versendet_am is null then
    return new; -- Entwurf
  end if;
  if old.eingangsbestaetigung is null
     and new.eingangsbestaetigung is not null
     and new.inhalt is not distinct from old.inhalt
     and new.kopf_hash is not distinct from old.kopf_hash
     and new.versendet_am is not distinct from old.versendet_am
     and new.versendet_von is not distinct from old.versendet_von
     and new.art is not distinct from old.art then
    return new; -- einmaliges Nachtragen der Eingangsbestätigung
  end if;
  raise exception 'Versendetes Anschreiben ist unveraenderlich; nur Eingangsbestaetigung einmal nachtragbar (ADR-036).';
end;
$$ language plpgsql;

create trigger behoerden_anschreiben_kein_update before update on behoerden_anschreiben
  for each row execute function behoerden_anschreiben_schutz();
create trigger behoerden_anschreiben_kein_delete before delete on behoerden_anschreiben
  for each row execute function behoerden_anschreiben_schutz();
