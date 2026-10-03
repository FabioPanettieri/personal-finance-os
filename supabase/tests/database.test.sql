-- =============================================================================
-- Test database: RLS, isolamento utenti, vincoli di dominio, audit, storage.
-- Eseguito da scripts/db-test-local.sh (psql, ON_ERROR_STOP): il primo
-- assert fallito interrompe la suite con exit code != 0.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.ok(condition boolean, description text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAIL - %', description;
  end if;
  raise notice 'ok - %', description;
end;
$$;

-- Esegue `statement` e verifica che fallisca con lo SQLSTATE atteso.
create function tests.throws(statement text, expected_state text, description text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'FAIL - % (nessun errore, atteso %)', description, expected_state;
exception
  when others then
    if sqlerrm like 'FAIL - %' then
      raise;
    end if;
    if sqlstate <> expected_state then
      raise exception 'FAIL - % (SQLSTATE %, atteso %: %)', description, sqlstate, expected_state, sqlerrm;
    end if;
    raise notice 'ok - %', description;
end;
$$;

create function tests.fp(seed text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(seed, 'UTF8')), 'hex') $$;

grant execute on all functions in schema tests to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Setup: due utenti (A = proprietario, B = estraneo)
-- -----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.test');

select id as b_ing from public.accounts
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'ING Direct' \gset
select id as b_cat from public.transaction_categories
where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'Casa' \gset

insert into public.transactions (user_id, account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', :'b_ing', '2026-09-30', 'Stipendio B', 'STIPENDIO B', 250000, 'income', 'personal', tests.fp('b-1'));

-- -----------------------------------------------------------------------------
-- Bootstrap nuovo utente
-- -----------------------------------------------------------------------------

select tests.ok((select count(*) from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1, 'bootstrap: profilo creato');
select tests.ok((select count(*) from public.accounts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 3, 'bootstrap: 3 conti (ING, Revolut, Trade Republic)');
select tests.ok((select count(*) from public.investment_accounts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1, 'bootstrap: Trade Republic registrato come conto investimento');
select tests.ok((select count(*) from public.businesses where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 3, 'bootstrap: 3 business');
select tests.ok((select count(*) from public.income_sources where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 4, 'bootstrap: 4 fonti di reddito');
select tests.ok((select count(*) from public.transaction_categories where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and parent_id is null) = 17, 'bootstrap: 17 macro-categorie');
select tests.ok((select count(*) from public.categorization_rules where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 3, 'bootstrap: 3 regole di sistema');
select tests.ok(
  (select count(*) from public.income_sources s join public.businesses b on b.id = s.business_id
   where s.user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2,
  'bootstrap: fonti VOXEL e YouTube collegate ai rispettivi business');

-- =============================================================================
-- Da qui in poi: sessione autenticata come utente A
-- =============================================================================

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

select id as a_ing from public.accounts where name = 'ING Direct' \gset
select id as a_rev from public.accounts where name = 'Revolut' \gset
select id as a_tr from public.accounts where name = 'Trade Republic' \gset
select id as a_casa from public.transaction_categories where name = 'Casa' \gset
select id as a_mutuo from public.transaction_categories where name = 'Mutuo' \gset
select id as a_salary from public.income_sources where name = 'Stipendio' \gset

-- Lettura -------------------------------------------------------------------

select tests.ok((select count(*) from public.accounts) = 3, 'RLS: A vede solo i propri 3 conti');
select tests.ok((select count(*) from public.transactions) = 0, 'RLS: A non vede le transazioni di B');
select tests.ok((select count(*) from public.transaction_categories where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0, 'RLS: A non vede le categorie di B');
select tests.ok((select count(*) from public.profiles) = 1, 'RLS: A vede solo il proprio profilo');
select tests.ok((select count(*) from public.account_balances) = 3, 'RLS: la vista account_balances rispetta la RLS');
select tests.ok((select count(*) from public.account_types) = 7, 'account_types leggibile da utenti autenticati');

-- Scrittura propria ---------------------------------------------------------

insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, income_source_id, fingerprint)
values (:'a_ing', '2026-09-27', 'Stipendio settembre', 'BONIFICO STIPENDIO SETTEMBRE', 210050, 'income', 'personal', :'a_salary', tests.fp('a-1'));

insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, category_id, fingerprint)
values (:'a_ing', '2026-09-28', 'Rata mutuo', 'ADDEBITO MUTUO', -65000, 'expense', 'personal', :'a_mutuo', tests.fp('a-2'));

select tests.ok((select count(*) from public.transactions) = 2, 'A inserisce transazioni sui propri conti');
select tests.ok(
  (select user_id from public.transactions limit 1) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'user_id valorizzato di default da auth.uid()');
select tests.ok(
  (select balance_cents from public.account_balances where account_id = :'a_ing') = 145050,
  'saldo derivato ING = 2.100,50 - 650,00 = 1.450,50 (centesimi interi)');

-- Isolamento in scrittura ---------------------------------------------------

select tests.throws(
  format($$insert into public.transactions (user_id, account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', %L, '2026-09-01', 'x', 'x', -100, 'expense', 'personal', tests.fp('x1'))$$, :'a_ing'),
  '42501', 'RLS: A non può inserire righe con user_id di B');

select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', -100, 'expense', 'personal', tests.fp('x2'))$$, :'b_ing'),
  '23503', 'FK composta: A non può scrivere sul conto di B anche conoscendone l''id');

select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, category_id, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', -100, 'expense', 'personal', %L, tests.fp('x3'))$$, :'a_ing', :'b_cat'),
  '23503', 'FK composta: A non può usare una categoria di B');

select tests.throws(
  format($$insert into public.transaction_categories (parent_id, name, kind) values (%L, 'Furto', 'expense')$$, :'b_cat'),
  '23503', 'FK composta: A non può creare sottocategorie sotto una categoria di B');

update public.accounts set name = 'Hacked' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.transactions where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select tests.throws(
  $$update public.transactions set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where fingerprint = tests.fp('a-1')$$,
  '42501', 'RLS: A non può trasferire una propria riga a B');

-- Funzioni privilegiate e tabelle protette ----------------------------------

select tests.throws(
  $$select public.seed_default_data('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  '42501', 'seed_default_data non invocabile dal client');
select tests.throws(
  $$insert into public.audit_logs (user_id, table_name, action) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'insert')$$,
  '42501', 'audit_logs: inserimento diretto vietato');
select tests.throws(
  $$delete from public.audit_logs$$,
  '42501', 'audit_logs: cancellazione vietata');
select tests.throws(
  $$insert into public.profiles (id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$,
  '42501', 'profiles: inserimento dal client vietato');
select tests.throws(
  $$insert into public.account_types (code, label, is_liquid, is_investment) values ('evil', 'x', true, false)$$,
  '42501', 'account_types: sola lettura');

-- Integrità dati finanziari -------------------------------------------------

select tests.throws(
  $$update public.transactions set original_description = 'riscritta' where fingerprint = tests.fp('a-1')$$,
  '23514', 'original_description immutabile');
select tests.throws(
  $$update public.transactions set fingerprint = tests.fp('zzz') where fingerprint = tests.fp('a-1')$$,
  '23514', 'fingerprint immutabile');
select tests.throws(
  format($$update public.transactions set account_id = %L where fingerprint = tests.fp('a-1')$$, :'a_rev'),
  '23514', 'conto di una transazione non modificabile');

update public.transactions set description = 'Stipendio — settembre', notes = 'ok' where fingerprint = tests.fp('a-1');
select tests.ok(
  (select description = 'Stipendio — settembre' and original_description = 'BONIFICO STIPENDIO SETTEMBRE'
   from public.transactions where fingerprint = tests.fp('a-1')),
  'la descrizione è modificabile, l''originale resta intatto');

select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', 100, 'expense', 'personal', tests.fp('c1'))$$, :'a_ing'),
  '23514', 'una spesa non può avere importo positivo');
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', -100, 'income', 'personal', tests.fp('c2'))$$, :'a_ing'),
  '23514', 'un''entrata non può avere importo negativo');
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', -100, 'transfer', 'personal', tests.fp('c3'))$$, :'a_ing'),
  '23514', 'un trasferimento deve avere natura transfer');
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', -100, 'expense', 'transfer', tests.fp('c4'))$$, :'a_ing'),
  '23514', 'natura transfer ammessa solo per i trasferimenti');
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, income_source_id, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', -100, 'expense', 'personal', %L, tests.fp('c5'))$$, :'a_ing', :'a_salary'),
  '23514', 'fonte di reddito ammessa solo sulle entrate');
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-01', 'x', 'x', 0, 'expense', 'personal', tests.fp('c6'))$$, :'a_ing'),
  '23514', 'importo zero rifiutato');
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-28', 'Rata mutuo', 'ADDEBITO MUTUO', -65000, 'expense', 'personal', tests.fp('a-2'))$$, :'a_ing'),
  '23505', 'duplicati: stesso fingerprint sullo stesso conto rifiutato');

-- Trasferimenti -------------------------------------------------------------

insert into public.transfer_groups (kind, detected_by, confidence) values ('internal', 'auto', 0.98);
select id as a_tg from public.transfer_groups limit 1 \gset

insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, transfer_group_id, fingerprint)
values
  (:'a_ing', '2026-09-29', 'Giroconto a Revolut', 'BONIFICO A REVOLUT', -50000, 'transfer', 'transfer', :'a_tg', tests.fp('t-1')),
  (:'a_rev', '2026-09-29', 'Giroconto da ING',    'TOP-UP ING',          50000, 'transfer', 'transfer', :'a_tg', tests.fp('t-2'));

select tests.ok((select count(*) from public.transactions where is_transfer) = 2, 'trasferimento ING → Revolut: due gambe marcate is_transfer');
select tests.ok((select sum(amount_cents) from public.transactions where transfer_group_id = :'a_tg') = 0, 'trasferimento interno a somma zero');
select tests.ok(
  (select sum(balance_cents) from public.account_balances) = 145050,
  'il trasferimento sposta saldo tra conti senza cambiare il totale');

-- Categorie, investimenti ---------------------------------------------------

select tests.throws(
  format($$insert into public.transaction_categories (parent_id, name, kind) values (%L, 'Nipote', 'expense')$$, :'a_mutuo'),
  '23514', 'categorie: massimo due livelli');
select tests.throws(
  format($$insert into public.transaction_categories (parent_id, name, kind) values (%L, 'Affitto ricevuto', 'income')$$, :'a_casa'),
  '23514', 'categorie: la sottocategoria eredita il tipo');
select tests.throws(
  format($$insert into public.investment_accounts (account_id) values (%L)$$, :'a_ing'),
  '23514', 'investment_accounts accetta solo conti di tipo investimento');

insert into public.instruments (isin, name, asset_class) values ('IE00B4L5Y983', 'iShares Core MSCI World', 'etf');
select tests.throws(
  $$insert into public.instruments (isin, name) values ('NOT-AN-ISIN', 'x')$$,
  '23514', 'ISIN validato');

-- Audit ---------------------------------------------------------------------

select tests.ok(
  (select count(*) from public.audit_logs where table_name = 'transactions' and action = 'update') = 1,
  'audit: la modifica della transazione è registrata');
select tests.ok(
  (select changed_fields = array['description', 'notes'] from public.audit_logs
   where table_name = 'transactions' and action = 'update'),
  'audit: registra i campi modificati');
select tests.ok(
  (select count(*) from public.audit_logs where user_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0,
  'audit: A non vede i log di B');

-- Storage -------------------------------------------------------------------

insert into storage.objects (bucket_id, name) values ('imports', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/imp-1/revolut.csv');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('imports', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/imp-1/evil.csv')$$,
  '42501', 'storage: A non può caricare nella cartella di B');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('imports', 'revolut.csv')$$,
  '42501', 'storage: file fuori dalla cartella utente rifiutato');

-- =============================================================================
-- Verifiche lato superuser su ciò che A ha tentato
-- =============================================================================

reset role;

select tests.ok(
  (select name from public.accounts where id = :'b_ing') = 'ING Direct',
  'RLS: l''update di A sui conti di B non ha avuto effetto');
select tests.ok(
  (select count(*) from public.transactions where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 1,
  'RLS: la delete di A sulle transazioni di B non ha avuto effetto');
select tests.ok((select not public from storage.buckets where id = 'imports'), 'storage: bucket imports privato');

-- Storage visto da B -----------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
select tests.ok((select count(*) from storage.objects) = 0, 'storage: B non vede i file di A');
select tests.ok((select count(*) from public.transactions) = 1, 'RLS: B vede solo la propria transazione');

-- Account (Sprint 2) ------------------------------------------------------------

select tests.ok((select count(*) from public.accounts) = 3, 'account: B vede solo i propri 3 conti');
select tests.ok(
  (select count(*) from public.accounts where id in (:'a_ing', :'a_rev', :'a_tr')) = 0,
  'account: B non legge i conti di A neppure conoscendone l''id');
select tests.ok(
  (select count(*) from public.account_balances where account_id = :'a_ing') = 0,
  'account: B non vede il saldo dei conti di A (vista security_invoker)');
select tests.ok(
  (select count(*) from public.account_balances) = 3,
  'account: la vista saldi di B contiene solo i suoi 3 conti');

with attempted as (
  update public.accounts set name = 'Preso da B', is_active = false, initial_balance_cents = 999999
  where id = :'a_ing' returning id
)
select tests.ok((select count(*) from attempted) = 0, 'account: B non può modificare nome, stato o saldo iniziale dei conti di A');

with attempted as (delete from public.accounts where id = :'a_rev' returning id)
select tests.ok((select count(*) from attempted) = 0, 'account: B non può cancellare i conti di A');

select tests.throws(
  format($$update public.accounts set user_id = %L where name = 'ING Direct'$$, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '42501', 'account: B non può regalare un proprio conto ad A');

-- Anonimo ----------------------------------------------------------------------

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tests.throws($$select count(*) from public.accounts$$, '42501', 'anon: nessun accesso ai conti');
select tests.throws($$select count(*) from public.transactions$$, '42501', 'anon: nessun accesso alle transazioni');
select tests.throws($$select count(*) from public.profiles$$, '42501', 'anon: nessun accesso ai profili');
select tests.throws($$select count(*) from public.account_balances$$, '42501', 'anon: nessun accesso alla vista saldi');
select tests.throws($$update public.accounts set name = 'x'$$, '42501', 'anon: nessuna modifica ai conti');

-- Cancellazione account utente -------------------------------------------------

reset role;

select tests.ok(
  (select name = 'ING Direct' and is_active and initial_balance_cents = 0 from public.accounts where id = :'a_ing'),
  'account: i conti di A sono rimasti intatti dopo i tentativi di B');
select tests.ok(
  (select count(*) from public.accounts where id = :'a_rev') = 1,
  'account: il conto Revolut di A esiste ancora');
select tests.ok(
  (select array_agg(name order by sort_order) from public.accounts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    = array['ING Direct', 'Revolut', 'Trade Republic'],
  'bootstrap: ING Direct, Revolut e Trade Republic appartengono all''utente creato');
select tests.ok(
  (select count(distinct user_id) = 2 and count(*) = 6 from public.accounts),
  'bootstrap: ogni utente ha i propri conti distinti (3 + 3)');
select tests.ok(
  (select a.account_type = 'broker' from public.accounts a where a.id = :'a_tr')
    and (select count(*) from public.investment_accounts where account_id = :'a_tr') = 1,
  'bootstrap: Trade Republic è un conto broker collegato a investment_accounts');

delete from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select tests.ok(
  (select count(*) from public.accounts where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0,
  'cancellazione utente: tutti i dati rimossi in cascata');
