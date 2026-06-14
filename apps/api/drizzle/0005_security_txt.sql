-- security.txt-Publikationen (ADR-037): unveränderlich, verkettbar (ADR-035).
create table security_txt_publikation (
  id uuid primary key default gen_random_uuid(),
  mandant_id uuid not null references mandant(id),
  inhalt text not null,
  veroeffentlicht_am timestamptz not null default now()
);
create index security_txt_mandant_idx on security_txt_publikation(mandant_id);

create trigger security_txt_kein_update before update on security_txt_publikation
  for each row execute function evidenz_unveraenderlich();
create trigger security_txt_kein_delete before delete on security_txt_publikation
  for each row execute function evidenz_unveraenderlich();
