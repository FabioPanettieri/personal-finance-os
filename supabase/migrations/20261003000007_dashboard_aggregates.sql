-- =============================================================================
-- Personal Finance OS — 0007 aggregati della dashboard (Sprint 4)
--
-- Solo funzioni di lettura: nessuna tabella, nessuna metrica salvata. Ogni
-- numero della dashboard è calcolato al momento dalle transazioni.
--
-- Tutte le funzioni sono SECURITY INVOKER: girano con i permessi di chi le
-- chiama, quindi RLS (user_id) e le policy restrictive AAL2 della 0005 si
-- applicano esattamente come a una SELECT diretta. Un utente AAL1 o un altro
-- utente ottiene zero righe.
--
-- Le funzioni sono scritte in SQL diretto (niente funzioni annidate) così il
-- planner usa gli indici transactions(user_id, booked_on) e (account_id, booked_on).
--
-- Stessa finestra di account_balances: le transazioni precedenti alla data
-- del saldo iniziale di un conto sono già comprese nel saldo iniziale e non
-- vengono contate di nuovo.
--
-- Classificazione (nessun doppio conteggio):
--   entrate  = type 'income'
--   uscite   = type 'expense' al netto dei 'refund'
--   esclusi  = 'transfer' e 'investment' (movimenti tra conti propri,
--              versamenti al broker, addebito carta di credito)
-- Le righe "Saldo iniziale/finale" degli estratti non sono mai transazioni.
-- =============================================================================

-- Entrate, uscite e rimborsi per mese (Europe/Rome: booked_on è già una data locale).
create function public.dashboard_monthly_flows(p_from date, p_to date)
returns table (
  month         date,
  currency      text,
  income_cents  bigint,
  expense_cents bigint,
  refund_cents  bigint,
  income_count  bigint,
  expense_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', t.booked_on)::date,
    t.currency::text,
    coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint,
    coalesce(-sum(t.amount_cents) filter (where t.type = 'expense'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.type = 'refund'), 0)::bigint,
    count(*) filter (where t.type = 'income'),
    count(*) filter (where t.type in ('expense', 'refund'))
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.booked_on between p_from and p_to
    and t.type in ('income', 'expense', 'refund')
  group by 1, 2
  order by 1, 2
$$;

-- Spese nette per categoria (foglia; l'aggregazione per macro-categoria è nell'app).
create function public.dashboard_category_spending(p_from date, p_to date)
returns table (category_id uuid, currency text, spent_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.category_id, t.currency::text, (-sum(t.amount_cents))::bigint, count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.booked_on between p_from and p_to
    and t.type in ('expense', 'refund')
  group by 1, 2
$$;

-- Entrate per fonte di reddito (null = entrata senza fonte assegnata).
create function public.dashboard_income_by_source(p_from date, p_to date)
returns table (income_source_id uuid, currency text, income_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.income_source_id, t.currency::text, sum(t.amount_cents)::bigint, count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.booked_on between p_from and p_to
    and t.type = 'income'
  group by 1, 2
$$;

-- Ricavi e spese per business: solo movimenti classificati con quel business.
-- Una spesa personale (business_id null) non diventa mai una spesa business.
create function public.dashboard_business_performance(p_from date, p_to date)
returns table (business_id uuid, currency text, revenue_cents bigint, expense_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.business_id,
    t.currency::text,
    coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)::bigint,
    coalesce(-sum(t.amount_cents) filter (where t.type in ('expense', 'refund')), 0)::bigint,
    count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.booked_on between p_from and p_to
    and t.business_id is not null
    and t.type in ('income', 'expense', 'refund')
  group by 1, 2
$$;

-- Variazione di saldo di ogni conto nel periodo (tutti i tipi: è la variazione reale).
create function public.dashboard_account_changes(p_from date, p_to date)
returns table (account_id uuid, change_cents bigint, tx_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.account_id, sum(t.amount_cents)::bigint, count(*)
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where (a.initial_balance_on is null or t.booked_on >= a.initial_balance_on)
    and t.booked_on between p_from and p_to
  group by 1
$$;

-- Capitale netto investito in strumenti (acquisti − vendite), per conto broker.
-- Le operazioni su titoli non sono movimenti di cassa: il saldo del conto
-- broker comprende quindi liquidità + titoli al costo. Questo valore separa
-- le due parti senza contarle due volte. Nessun valore di mercato.
create function public.dashboard_invested_at_cost()
returns table (account_id uuid, invested_cents bigint, trade_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.account_id, (-sum(i.amount_cents))::bigint, count(*)
  from public.investment_transactions i
  join public.accounts a on a.id = i.account_id
  where i.kind in ('buy', 'sell')
    and (a.initial_balance_on is null or i.trade_on >= a.initial_balance_on)
  group by 1
$$;

-- Storico del patrimonio: saldo complessivo (somma dei saldi dei conti, come
-- account_balances) alla fine di ogni giorno in cui qualcosa cambia. Nessun
-- punto prima del primo dato disponibile; tra due giorni il valore resta
-- quello dell'ultimo giorno con movimenti.
create function public.net_worth_history()
returns table (day date, currency text, total_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with first_day as (
    select a.id, coalesce(a.initial_balance_on, min(t.booked_on), a.created_at::date) as day
    from public.accounts a
    left join public.transactions t on t.account_id = a.id
    group by a.id
  ),
  events as (
    select f.day, a.currency::text as currency, a.initial_balance_cents as delta
    from public.accounts a
    join first_day f on f.id = a.id
    where a.initial_balance_cents <> 0
    union all
    select t.booked_on, a.currency::text, t.amount_cents
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where a.initial_balance_on is null or t.booked_on >= a.initial_balance_on
  ),
  daily as (
    select e.day, e.currency, sum(e.delta) as delta
    from events e
    group by 1, 2
  )
  select d.day, d.currency, (sum(d.delta) over (partition by d.currency order by d.day))::bigint
  from daily d
  order by 2, 1
$$;

-- Mai invocabili senza sessione; per gli utenti autenticati valgono RLS + AAL2.
revoke execute on function
  public.dashboard_monthly_flows(date, date),
  public.dashboard_category_spending(date, date),
  public.dashboard_income_by_source(date, date),
  public.dashboard_business_performance(date, date),
  public.dashboard_account_changes(date, date),
  public.dashboard_invested_at_cost(),
  public.net_worth_history()
from public, anon;

grant execute on function
  public.dashboard_monthly_flows(date, date),
  public.dashboard_category_spending(date, date),
  public.dashboard_income_by_source(date, date),
  public.dashboard_business_performance(date, date),
  public.dashboard_account_changes(date, date),
  public.dashboard_invested_at_cost(),
  public.net_worth_history()
to authenticated;
