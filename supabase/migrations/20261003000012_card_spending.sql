-- =============================================================================
-- 0012 — Carta di credito senza estratto dettagliato + plafond
--
-- La carta di credito ING non ha un CSV dei singoli acquisti: si vede solo
-- l'addebito mensile sul conto corrente ("Estratto conto carta di credito"),
-- registrato come giroconto verso il conto "Carta di credito" (metà speculare,
-- 0006). Così però quei soldi non risultavano MAI spesi: "Dove sono andati i
-- soldi" restava vuota e il saldo della carta cresceva a ogni addebito.
--
-- Ora, quando sulla carta (conto di tipo card senza banca d'importazione)
-- arriva la metà speculare di un addebito, nella stessa carta si registra la
-- spesa corrispondente, categoria "Carta di credito": il patrimonio resta
-- corretto (il giroconto non cambia il totale, la spesa sì), il saldo della
-- carta torna a zero e la spesa compare nei report.
--
-- Plafond: accounts.credit_limit_cents (es. 2.000 € al mese), solo informativo.
-- =============================================================================

alter table public.accounts
  add column credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents > 0);

comment on column public.accounts.credit_limit_cents is 'Plafond mensile della carta (centesimi), facoltativo';

-- Categoria "Carta di credito" (spesa), creata quando serve.
create function public.card_spending_category(p_user uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.transaction_categories
  where user_id = p_user and parent_id is null and name = 'Carta di credito';
  if v_id is null then
    insert into public.transaction_categories (user_id, name, kind, color, icon, is_system, sort_order)
    values (p_user, 'Carta di credito', 'expense', '#6E56CF', 'credit-card', true, 95)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.transaction_categories
      where user_id = p_user and parent_id is null and name = 'Carta di credito';
    end if;
  end if;
  return v_id;
end;
$$;

-- Impronta della spesa collegata alla metà speculare (stesso formato degli altri: sha256 esadecimale).
create function public.card_spending_fingerprint(p_fingerprint text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_fingerprint || '|card-spend', 'UTF8')), 'hex')
$$;

create function public.add_card_spending()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card boolean;
begin
  if new.type <> 'transfer' or new.amount_cents <= 0 or new.source <> 'csv_import' or new.transfer_group_id is null then
    return new;
  end if;
  select a.account_type = 'card' and a.default_bank_profile is null into v_card
  from public.accounts a where a.id = new.account_id;
  if not coalesce(v_card, false) then
    return new;
  end if;

  insert into public.transactions (
    user_id, account_id, booked_on, value_on, description, original_description, amount_cents, currency,
    type, nature, category_id, is_categorized, categorization_method, categorization_confidence,
    source, import_id, fingerprint
  ) values (
    new.user_id, new.account_id, new.booked_on, new.value_on,
    'Spese con la carta (addebito del ' || to_char(new.booked_on, 'DD/MM/YYYY') || ')',
    new.original_description, -new.amount_cents, new.currency,
    'expense', 'personal', public.card_spending_category(new.user_id), true, 'rule', 0.95,
    'csv_import', new.import_id, public.card_spending_fingerprint(new.fingerprint)
  )
  on conflict (account_id, fingerprint) do nothing;
  return new;
end;
$$;

create trigger transactions_add_card_spending
  after insert on public.transactions
  for each row execute function public.add_card_spending();

-- Se la metà speculare sparisce (import annullato, movimento eliminato) sparisce anche la spesa.
-- security definer: il trigger scatta anche nelle cancellazioni a cascata fatte dal
-- servizio Auth (eliminazione dell'utente), che non ha permessi su public.transactions.
-- Tocca solo la riga gemella dello stesso conto (impronta derivata da quella cancellata).
create function public.remove_card_spending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.transactions
  where account_id = old.account_id
    and fingerprint = public.card_spending_fingerprint(old.fingerprint)
    and type = 'expense';
  return old;
end;
$$;

create trigger transactions_remove_card_spending
  after delete on public.transactions
  for each row
  when (old.type = 'transfer' and old.amount_cents > 0)
  execute function public.remove_card_spending();

-- Dati già importati: stessa spesa per ogni addebito carta esistente.
insert into public.transactions (
  user_id, account_id, booked_on, value_on, description, original_description, amount_cents, currency,
  type, nature, category_id, is_categorized, categorization_method, categorization_confidence,
  source, import_id, fingerprint
)
select
  t.user_id, t.account_id, t.booked_on, t.value_on,
  'Spese con la carta (addebito del ' || to_char(t.booked_on, 'DD/MM/YYYY') || ')',
  t.original_description, -t.amount_cents, t.currency,
  'expense', 'personal', public.card_spending_category(t.user_id), true, 'rule', 0.95,
  'csv_import', t.import_id, public.card_spending_fingerprint(t.fingerprint)
from public.transactions t
join public.accounts a on a.id = t.account_id
where a.account_type = 'card'
  and a.default_bank_profile is null
  and t.type = 'transfer'
  and t.amount_cents > 0
  and t.source = 'csv_import'
  and t.transfer_group_id is not null
on conflict (account_id, fingerprint) do nothing;

revoke execute on function public.remove_card_spending() from public, anon, authenticated;
revoke execute on function public.card_spending_category(uuid) from public, anon;
grant execute on function public.card_spending_category(uuid) to authenticated;
