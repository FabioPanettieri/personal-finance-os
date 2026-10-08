-- =============================================================================
-- Personal Finance OS — 0008 trasferimenti (Sprint 5)
--
-- Un trasferimento tra conti propri è un gruppo di due metà a somma zero.
-- Questa migration rende il vincolo esplicito nel database e aggiunge due
-- operazioni atomiche per collegare e scollegare le metà a mano.
--
-- Funzioni SECURITY INVOKER: girano con i permessi di chi le chiama, quindi
-- RLS (user_id) e le policy restrictive AAL2 valgono come per un UPDATE diretto.
-- Un altro utente non vede i movimenti e ottiene "Movimento non trovato".
-- =============================================================================

-- Solo trasferimenti e investimenti possono far parte di un gruppo. NOT VALID:
-- vale per ogni nuova scrittura senza bloccare la migration su dati esistenti.
alter table public.transactions
  add constraint transactions_transfer_group_internal
  check (transfer_group_id is null or type in ('transfer', 'investment')) not valid;

-- Al massimo due metà per gruppo; con due metà: conti diversi, stessa valuta,
-- importi opposti. Gira a fine istruzione, quindi un INSERT o UPDATE che
-- scrive entrambe le metà insieme viene controllato a coppia completa.
create function public.check_transfer_group()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_legs     integer;
  v_total    bigint;
  v_accounts integer;
  v_currency integer;
begin
  if new.transfer_group_id is null then
    return null;
  end if;
  select count(*), coalesce(sum(t.amount_cents), 0), count(distinct t.account_id), count(distinct t.currency)
    into v_legs, v_total, v_accounts, v_currency
  from public.transactions t
  where t.transfer_group_id = new.transfer_group_id;
  if v_legs > 2 then
    raise exception 'Un trasferimento ha al massimo due movimenti' using errcode = 'check_violation';
  end if;
  if v_legs = 2 and (v_total <> 0 or v_accounts <> 2 or v_currency <> 1) then
    raise exception 'Le due metà di un trasferimento devono avere importi opposti su conti diversi'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger transactions_transfer_group_check
  after insert or update of transfer_group_id, amount_cents, account_id, currency on public.transactions
  for each row execute function public.check_transfer_group();

-- Collega due movimenti come le due metà di un trasferimento. Verso un conto
-- di investimento diventa "investimento" (versamento), altrimenti "giroconto".
-- Entrambi escono dalle entrate/uscite: il patrimonio non cambia.
create function public.link_transfer(p_first uuid, p_second uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_a        public.transactions%rowtype;
  v_b        public.transactions%rowtype;
  v_kind     public.transfer_kind;
  v_type     public.transaction_type;
  v_category uuid;
  v_group    uuid;
begin
  select * into v_a from public.transactions where id = p_first for update;
  select * into v_b from public.transactions where id = p_second for update;
  if v_a.id is null or v_b.id is null then
    raise exception 'Movimento non trovato' using errcode = 'no_data_found';
  end if;
  if v_a.id = v_b.id or v_a.account_id = v_b.account_id then
    raise exception 'Le due metà devono essere su conti diversi' using errcode = 'check_violation';
  end if;
  if v_a.amount_cents <> -v_b.amount_cents or v_a.currency <> v_b.currency then
    raise exception 'Gli importi devono essere opposti e nella stessa valuta' using errcode = 'check_violation';
  end if;
  if v_a.transfer_group_id is not null or v_b.transfer_group_id is not null then
    raise exception 'Uno dei due movimenti è già collegato' using errcode = 'check_violation';
  end if;

  select case when bool_or(t.is_investment) then 'investment' else 'internal' end::public.transfer_kind
    into v_kind
  from public.accounts a
  join public.account_types t on t.code = a.account_type
  where a.id in (v_a.account_id, v_b.account_id);
  v_type := case when v_kind = 'investment' then 'investment' else 'transfer' end;

  select c.id into v_category
  from public.transaction_categories c
  join public.transaction_categories p on p.id = c.parent_id
  where (v_kind = 'investment' and p.name = 'Investimenti' and c.name = 'Versamenti')
     or (v_kind = 'internal' and p.name = 'Trasferimenti' and c.name = 'Giroconto')
  limit 1;

  insert into public.transfer_groups (kind, detected_by, confidence)
  values (v_kind, 'manual', 1)
  returning id into v_group;

  update public.transactions
  set transfer_group_id = v_group,
      type = v_type,
      nature = case when v_type = 'investment' then 'investment' else 'transfer' end::public.transaction_nature,
      category_id = v_category,
      business_id = null,
      income_source_id = null,
      is_categorized = true,
      categorization_method = 'manual',
      categorization_confidence = 1,
      categorization_rule_id = null
  where id in (v_a.id, v_b.id);

  return v_group;
end;
$$;

-- Scioglie un trasferimento: le due metà restano trasferimenti "da abbinare".
create function public.unlink_transfer(p_group uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_legs integer;
begin
  if not exists (select 1 from public.transfer_groups where id = p_group) then
    raise exception 'Trasferimento non trovato' using errcode = 'no_data_found';
  end if;
  update public.transactions set transfer_group_id = null where transfer_group_id = p_group;
  get diagnostics v_legs = row_count;
  delete from public.transfer_groups where id = p_group;
  return v_legs;
end;
$$;

revoke execute on function
  public.link_transfer(uuid, uuid),
  public.unlink_transfer(uuid)
from public, anon;

grant execute on function
  public.link_transfer(uuid, uuid),
  public.unlink_transfer(uuid)
to authenticated;
