-- =============================================================================
-- Personal Finance OS — 0009 modifica di gruppo dei movimenti (Sprint 6)
--
-- Due operazioni su un elenco di movimenti (massimo 1000 per chiamata):
-- conferma della classificazione proposta e classificazione con una scelta.
-- Un array nel corpo della chiamata evita URL lunghi con centinaia di id.
--
-- SECURITY INVOKER: RLS (user_id) e AAL2 valgono come per un UPDATE diretto;
-- gli id di un altro utente vengono semplicemente ignorati (zero righe).
-- =============================================================================

create function public.bulk_confirm_transactions(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(cardinality(p_ids), 0) > 1000 then
    raise exception 'Al massimo 1000 movimenti alla volta' using errcode = 'check_violation';
  end if;
  update public.transactions
  set is_categorized = true,
      categorization_method = 'manual',
      categorization_confidence = 1
  where id = any (p_ids) and not is_categorized;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Applica tipo/natura/categoria/business/fonte. Solo ai movimenti con il segno
-- compatibile (un'entrata è positiva, una spesa negativa): gli altri restano
-- invariati e la funzione restituisce quanti ne ha aggiornati. Un movimento che
-- smette di essere un trasferimento esce dal suo gruppo, che viene sciolto.
create function public.bulk_classify_transactions(
  p_ids            uuid[],
  p_type           public.transaction_type,
  p_nature         public.transaction_nature,
  p_category       uuid,
  p_business       uuid,
  p_income_source  uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_internal boolean := p_type in ('transfer', 'investment');
  v_targets  uuid[];
  v_groups   uuid[];
  v_count    integer;
begin
  if coalesce(cardinality(p_ids), 0) > 1000 then
    raise exception 'Al massimo 1000 movimenti alla volta' using errcode = 'check_violation';
  end if;

  select array_agg(t.id), array_agg(distinct t.transfer_group_id) filter (where t.transfer_group_id is not null)
    into v_targets, v_groups
  from public.transactions t
  where t.id = any (p_ids)
    and case
          when p_type in ('income', 'refund') then t.amount_cents > 0
          when p_type = 'expense' then t.amount_cents < 0
          else true
        end;
  if v_targets is null then
    return 0;
  end if;

  if not v_internal and v_groups is not null then
    update public.transactions set transfer_group_id = null where transfer_group_id = any (v_groups);
    delete from public.transfer_groups where id = any (v_groups);
  end if;

  update public.transactions t
  set type = p_type,
      nature = p_nature,
      category_id = p_category,
      business_id = case when v_internal then null else p_business end,
      income_source_id = case when p_type = 'income' then p_income_source else null end,
      is_categorized = true,
      categorization_method = 'manual',
      categorization_confidence = 1,
      categorization_rule_id = null
  where t.id = any (v_targets);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function
  public.bulk_confirm_transactions(uuid[]),
  public.bulk_classify_transactions(uuid[], public.transaction_type, public.transaction_nature, uuid, uuid, uuid)
from public, anon;

grant execute on function
  public.bulk_confirm_transactions(uuid[]),
  public.bulk_classify_transactions(uuid[], public.transaction_type, public.transaction_nature, uuid, uuid, uuid)
to authenticated;
