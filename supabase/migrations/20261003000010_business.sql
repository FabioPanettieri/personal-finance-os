-- =============================================================================
-- Personal Finance OS — 0010 personale vs business (Sprint 7)
--
-- Regola unica, nessuna doppia conta: un'entrata, una spesa o un rimborso è
-- "business" se e solo se ha un business_id; altrimenti è "personale".
-- La natura si allinea da sola al business_id (trigger), così una modifica
-- che assegna o toglie il business non può lasciare dati incoerenti.
-- Trasferimenti e investimenti non sono né personali né business.
--
-- Funzioni di lettura SECURITY INVOKER: RLS (user_id) e AAL2 come per una
-- SELECT diretta. Stessa finestra di account_balances (saldo iniziale).
-- =============================================================================

create function public.sync_transaction_nature()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type in ('income', 'expense', 'refund') then
    new.nature := case when new.business_id is null then 'personal' else 'business' end;
  end if;
  return new;
end;
$$;

create trigger transactions_sync_nature
  before insert or update of type, nature, business_id on public.transactions
  for each row execute function public.sync_transaction_nature();

-- Allinea i dati esistenti (natura business senza business, o viceversa).
update public.transactions
set nature = case when business_id is null then 'personal' else 'business' end::public.transaction_nature
where type in ('income', 'expense', 'refund')
  and nature is distinct from (case when business_id is null then 'personal' else 'business' end)::public.transaction_nature;

-- Personale e business nel periodo: ogni movimento cade in uno solo dei due.
create function public.personal_business_split(p_from date, p_to date)
returns table (scope text, currency text, income_cents bigint, expense_cents bigint, refund_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when t.business_id is null then 'personal' else 'business' end,
    t.currency::text,
    coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint,
    coalesce(-sum(t.amount_cents) filter (where t.type = 'expense'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.type = 'refund'), 0)::bigint,
    count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.booked_on between p_from and p_to
    and t.type in ('income', 'expense', 'refund')
  group by 1, 2
$$;

-- Incassi e spese di un business, mese per mese.
create function public.business_monthly(p_business uuid, p_from date, p_to date)
returns table (month date, currency text, revenue_cents bigint, expense_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', t.booked_on)::date,
    t.currency::text,
    coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint,
    coalesce(-sum(t.amount_cents) filter (where t.type in ('expense', 'refund')), 0)::bigint,
    count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.business_id = p_business
    and t.booked_on between p_from and p_to
    and t.type in ('income', 'expense', 'refund')
  group by 1, 2
  order by 1, 2
$$;

-- Spese nette per categoria di un business (foglia; le macro si sommano nell'app).
create function public.business_category_spending(p_business uuid, p_from date, p_to date)
returns table (category_id uuid, currency text, expense_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.category_id,
    t.currency::text,
    (-sum(t.amount_cents))::bigint,
    count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.business_id = p_business
    and t.booked_on between p_from and p_to
    and t.type in ('expense', 'refund')
  group by 1, 2
$$;

revoke execute on function
  public.personal_business_split(date, date),
  public.business_monthly(uuid, date, date),
  public.business_category_spending(uuid, date, date)
from public, anon;

grant execute on function
  public.personal_business_split(date, date),
  public.business_monthly(uuid, date, date),
  public.business_category_spending(uuid, date, date)
to authenticated;
