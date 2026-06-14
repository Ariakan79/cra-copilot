-- Hash-Kette für Manipulationsevidenz (ADR-035).
-- pgcrypto (digest) ist bereits aktiviert (0000_init.sql).

create table audit_kette (
  seq bigint primary key,
  entity text not null,
  entity_id uuid not null,
  payload_hash text not null,
  vorgaenger_hash text not null,
  hash text not null,
  erstellt_am timestamptz not null default now()
);
create index audit_kette_entity_idx on audit_kette(entity, entity_id);

-- Vergibt seq/vorgaenger_hash/hash atomar beim Anhängen. Der Advisory-Lock
-- serialisiert konkurrierende Appends (genügt im self-hosted, geringvolumigen
-- Betrieb). Trennzeichen '|' zwischen den Bestandteilen.
create function audit_kette_verketten() returns trigger as $$
declare
  v_prev_hash text;
  v_prev_seq  bigint;
begin
  perform pg_advisory_xact_lock(hashtext('audit_kette')::bigint);
  select hash, seq into v_prev_hash, v_prev_seq from audit_kette order by seq desc limit 1;
  if v_prev_hash is null then
    v_prev_hash := '';
    v_prev_seq := 0;
  end if;
  new.seq := v_prev_seq + 1;
  new.vorgaenger_hash := v_prev_hash;
  new.hash := encode(
    digest(
      v_prev_hash || '|' || new.seq::text || '|' || new.entity || '|' ||
        new.entity_id::text || '|' || new.payload_hash,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$ language plpgsql;

create trigger audit_kette_vor_insert before insert on audit_kette
  for each row execute function audit_kette_verketten();

-- Die Kette selbst ist unveränderlich (analog Evidenz/Lieferung).
create trigger audit_kette_kein_update before update on audit_kette
  for each row execute function evidenz_unveraenderlich();
create trigger audit_kette_kein_delete before delete on audit_kette
  for each row execute function evidenz_unveraenderlich();
