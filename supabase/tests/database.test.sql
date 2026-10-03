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

-- Simula il JWT di una richiesta PostgREST: sub + livello di autenticazione.
-- aal = null simula un token privo del claim (deve essere trattato come AAL1).
create function tests.login(user_id uuid, aal text)
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', '', false);
  select set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aal', aal))::text,
    false
  );
$$;

create function tests.logout()
returns void
language sql
as $$
  select set_config('request.jwt.claim.sub', '', false);
  select set_config('request.jwt.claims', '', false);
$$;

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
select tests.ok((select count(*) from public.accounts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 5, 'bootstrap: 5 conti (ING, ING Conto Risparmio, Revolut, Carta di credito, Trade Republic)');
select tests.ok((select count(*) from public.investment_accounts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1, 'bootstrap: Trade Republic registrato come conto investimento');
select tests.ok((select count(*) from public.businesses where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 3, 'bootstrap: 3 business');
select tests.ok((select count(*) from public.income_sources where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 4, 'bootstrap: 4 fonti di reddito');
select tests.ok((select count(*) from public.transaction_categories where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and parent_id is null) = 17, 'bootstrap: 17 macro-categorie');
select tests.ok((select count(*) from public.categorization_rules where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 36, 'bootstrap: 36 regole di sistema (3 di base + 33 iniziali per l''import)');
select tests.ok(
  (select count(*) from public.income_sources s join public.businesses b on b.id = s.business_id
   where s.user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2,
  'bootstrap: fonti VOXEL e YouTube collegate ai rispettivi business');

-- =============================================================================
-- Da qui in poi: sessione autenticata come utente A, con TOTP verificato (AAL2)
-- =============================================================================

set role authenticated;
select tests.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2');

select id as a_ing from public.accounts where name = 'ING Direct' \gset
select id as a_rev from public.accounts where name = 'Revolut' \gset
select id as a_tr from public.accounts where name = 'Trade Republic' \gset
select id as a_casa from public.transaction_categories where name = 'Casa' \gset
select id as a_mutuo from public.transaction_categories where name = 'Mutuo' \gset
select id as a_salary from public.income_sources where name = 'Stipendio' \gset

-- Lettura -------------------------------------------------------------------

select tests.ok((select count(*) from public.accounts) = 5, 'RLS: A vede solo i propri 5 conti');
select tests.ok((select count(*) from public.transactions) = 0, 'RLS: A non vede le transazioni di B');
select tests.ok((select count(*) from public.transaction_categories where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0, 'RLS: A non vede le categorie di B');
select tests.ok((select count(*) from public.profiles) = 1, 'RLS: A vede solo il proprio profilo');
select tests.ok((select count(*) from public.account_balances) = 5, 'RLS: la vista account_balances rispetta la RLS');
select tests.ok((select count(*) from public.account_types) = 7, 'account_types leggibile da utenti autenticati');

-- Hardening import su formati reali (0006) ------------------------------------

select id as a_sav from public.accounts where name = 'ING Conto Risparmio' \gset
select id as a_card from public.accounts where name = 'Carta di credito' \gset
select tests.ok(
  (select account_type = 'savings' and default_bank_profile is null from public.accounts where id = :'a_sav'),
  '0006: ING Conto Risparmio è un conto deposito senza banca CSV predefinita');
select tests.ok(
  (select account_type = 'card' and default_bank_profile is null from public.accounts where id = :'a_card'),
  '0006: Carta di credito è un conto separato di tipo carta');

update public.accounts set iban = 'IT00R0000000000000000000003' where id = :'a_rev';
select tests.ok((select iban from public.accounts where id = :'a_rev') = 'IT00R0000000000000000000003', '0006: IBAN salvabile sul conto');
select tests.throws(
  format($$update public.accounts set iban = 'non un iban' where id = %L$$, :'a_sav'),
  '23514', '0006: IBAN in formato non valido rifiutato');
select tests.throws(
  format($$update public.accounts set iban = 'IT00R0000000000000000000003' where id = %L$$, :'a_sav'),
  '23505', '0006: lo stesso IBAN non può stare su due conti dell''utente');

select tests.ok(
  (select set_transfer_account_id = :'a_card' and match_field = 'source_type' and sources = '{ing}'
   from public.categorization_rules where name like 'ING: addebito carta di credito%'),
  '0006: regola causale "Addebito Carta Di Credito" → conto Carta di credito');
select tests.ok(
  (select count(*) from public.categorization_rules where name like 'Etsy%' or name like 'Stripe%' or name like 'Google Ireland%'
     or name like 'Packlink%' or name like 'Elegoo%' or name like 'Aruba%' or name like 'GoDaddy%') = 7,
  '0006: 7 regole personali iniziali (Etsy, Stripe, Google Ireland, Packlink, Elegoo, Aruba, GoDaddy)');
select tests.ok(
  (select count(*) from public.categorization_rules where pattern ilike '%mangopay%') = 0,
  '0006: nessuna regola automatica per Mangopay');
select tests.ok(
  (select count(*) from public.categorization_rules where set_business_id is not null and name like 'Etsy%') = 1,
  '0006: regola Etsy collegata al business VOXEL Studio');
select tests.ok(
  (select count(*) from public.categorization_rules where review_reason is not null and set_type is null) = 2,
  '0006: regole di sola revisione (bonifico ricevuto, prelievo) senza tipo');

update public.categorization_rules set pattern = 'etsy' where name like 'Etsy%';
select tests.ok((select version from public.categorization_rules where name like 'Etsy%') = 2, '0006: modificare una regola ne incrementa la versione');
update public.categorization_rules set hit_count = hit_count + 1, last_matched_at = now() where name like 'Etsy%';
select tests.ok((select version from public.categorization_rules where name like 'Etsy%') = 2, '0006: i contatori d''uso non cambiano la versione');
update public.categorization_rules set version = 99 where name like 'Etsy%';
select tests.ok((select version from public.categorization_rules where name like 'Etsy%') = 2, '0006: la versione non è impostabile dal client');

insert into public.categorization_rules (name, match_field, pattern, set_type, set_nature)
values ('Test IBAN', 'counterparty_iban', 'IT00C0000000000000000000005', 'income', 'personal');
select tests.ok((select count(*) from public.categorization_rules where name = 'Test IBAN') = 1, '0006: regola su IBAN della controparte accettata');
select tests.throws(
  $$insert into public.categorization_rules (name, match_field, pattern, set_type) values ('x', 'importo', 'x', 'expense')$$,
  '23514', '0006: campo di confronto sconosciuto rifiutato');
select tests.throws(
  format($$insert into public.categorization_rules (name, pattern, set_type, set_nature, set_transfer_account_id) values ('x', 'x', 'expense', 'personal', %L)$$, :'a_card'),
  '23514', '0006: conto di destinazione solo su regole di trasferimento');
select tests.throws(
  format($$insert into public.categorization_rules (name, pattern, set_type, set_nature, set_transfer_account_id) values ('x', 'x', 'transfer', 'transfer', %L)$$, :'b_ing'),
  '23503', '0006: una regola non può puntare al conto di un altro utente');
select tests.throws(
  $$insert into public.categorization_rules (name, pattern) values ('vuota', 'x')$$,
  '23514', '0006: una regola senza alcuna azione è rifiutata');
delete from public.categorization_rules where name = 'Test IBAN';
update public.accounts set iban = null where id = :'a_rev';

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

-- Importazioni (Sprint 3): A crea import, file e riga di staging ---------------

insert into public.imports (account_id, bank_profile, status) values (:'a_ing', 'ing', 'preview');
select id as a_import from public.imports limit 1 \gset
insert into public.import_files (import_id, storage_path, original_filename, size_bytes, sha256)
values (:'a_import', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x/y.csv', 'ing.csv', 10, repeat('a', 64));
insert into public.import_rows (import_id, row_index, raw, status, fingerprint)
values (:'a_import', 0, '{"Data":"01/10/2026"}', 'new', tests.fp('row-0'));
select tests.ok((select count(*) from public.import_rows) = 1, 'import: A legge le proprie righe di staging');
select tests.throws(
  format($$insert into public.import_rows (import_id, row_index, raw, status, errors) values (%L, 1, '{}', 'invalid', '[]')$$, :'a_import'),
  '23514', 'import: una riga non valida deve avere almeno un errore');

-- =============================================================================
-- MFA obbligatoria (migration 0005): stessa utente A, sessione AAL1
-- =============================================================================

select tests.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal1');

-- SELECT → negato (nessuna riga visibile, anche se esistono)
select tests.ok((select count(*) from public.accounts) = 0, 'AAL1: SELECT accounts negato');
select tests.ok((select count(*) from public.transactions) = 0, 'AAL1: SELECT transactions negato');
select tests.ok((select count(*) from public.account_balances) = 0, 'AAL1: SELECT vista saldi negato');
select tests.ok((select count(*) from public.transaction_categories) = 0, 'AAL1: SELECT categorie negato');
select tests.ok((select count(*) from public.businesses) = 0, 'AAL1: SELECT businesses negato');
select tests.ok((select count(*) from public.income_sources) = 0, 'AAL1: SELECT fonti di reddito negato');
select tests.ok((select count(*) from public.transfer_groups) = 0, 'AAL1: SELECT gruppi di trasferimento negato');
select tests.ok((select count(*) from public.categorization_rules) = 0, 'AAL1: SELECT regole negato');
select tests.ok((select count(*) from public.investment_accounts) = 0, 'AAL1: SELECT conti investimento negato');
select tests.ok((select count(*) from public.instruments) = 0, 'AAL1: SELECT strumenti negato');
select tests.ok((select count(*) from public.profiles) = 0, 'AAL1: SELECT profilo negato');
select tests.ok((select count(*) from public.audit_logs) = 0, 'AAL1: SELECT audit log negato');
select tests.ok((select count(*) from storage.objects) = 0, 'AAL1: SELECT file importati negato');
select tests.ok((select count(*) from public.account_types) = 7, 'AAL1: account_types (riferimento pubblico) resta leggibile');

-- INSERT → negato
select tests.throws(
  format($$insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
           values (%L, '2026-09-30', 'x', 'x', -100, 'expense', 'personal', tests.fp('aal1-1'))$$, :'a_ing'),
  '42501', 'AAL1: INSERT transactions negato');
select tests.throws($$insert into public.accounts (name, account_type) values ('Conto AAL1', 'checking')$$, '42501', 'AAL1: INSERT accounts negato');
select tests.throws($$insert into public.goals (name, target_amount_cents) values ('Obiettivo', 100000)$$, '42501', 'AAL1: INSERT goals negato');
select tests.throws($$insert into public.budgets (name, starts_on) values ('Budget', '2026-10-01')$$, '42501', 'AAL1: INSERT budgets negato');
select tests.throws(format($$insert into public.imports (account_id, bank_profile) values (%L, 'ing')$$, :'a_ing'), '42501', 'AAL1: INSERT imports negato');
select tests.throws($$insert into public.instruments (name) values ('ETF')$$, '42501', 'AAL1: INSERT instruments negato');
select tests.throws($$insert into public.businesses (name, slug) values ('Nuovo', 'nuovo')$$, '42501', 'AAL1: INSERT businesses negato');
select tests.throws($$insert into public.income_sources (name) values ('Nuova fonte')$$, '42501', 'AAL1: INSERT income_sources negato');
select tests.throws(
  $$insert into public.net_worth_snapshots (snapshot_on, liquid_cents, invested_cents, total_cents) values ('2026-09-30', 1, 0, 1)$$,
  '42501', 'AAL1: INSERT snapshot patrimonio negato');
select tests.throws(
  $$insert into storage.objects (bucket_id, name) values ('imports', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/imp-2/ing.csv')$$,
  '42501', 'AAL1: upload CSV nella propria cartella negato');

-- UPDATE → negato (nessuna riga raggiungibile)
with attempted as (update public.accounts set name = 'Modificato in AAL1' returning id)
select tests.ok((select count(*) from attempted) = 0, 'AAL1: UPDATE accounts negato');
with attempted as (update public.transactions set notes = 'AAL1' returning id)
select tests.ok((select count(*) from attempted) = 0, 'AAL1: UPDATE transactions negato');
with attempted as (update public.profiles set display_name = 'AAL1' returning id)
select tests.ok((select count(*) from attempted) = 0, 'AAL1: UPDATE profilo negato');

-- DELETE → negato
with attempted as (delete from public.transactions returning id)
select tests.ok((select count(*) from attempted) = 0, 'AAL1: DELETE transactions negato');
with attempted as (delete from public.categorization_rules returning id)
select tests.ok((select count(*) from attempted) = 0, 'AAL1: DELETE regole negato');
-- (DELETE su storage.objects: Supabase vieta del tutto le delete SQL dirette;
-- il caso AAL1 è verificato tramite l'API Storage in tests/integration/aal.test.ts.)

-- Token senza claim aal: trattato come AAL1
select tests.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null);
select tests.ok((select count(*) from public.accounts) = 0, 'token senza claim aal: SELECT negato');
select tests.throws($$insert into public.goals (name, target_amount_cents) values ('x', 1)$$, '42501', 'token senza claim aal: INSERT negato');

-- =============================================================================
-- Stessa utente, di nuovo AAL2: CRUD consentito e dati intatti
-- =============================================================================

select tests.login('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aal2');

select tests.ok((select count(*) from public.accounts) = 5, 'AAL2: SELECT accounts consentito, nessun conto alterato');
select tests.ok((select count(*) from public.transactions) = 4, 'AAL2: SELECT transactions consentito, nessuna riga persa');
select tests.ok((select count(*) from public.profiles) = 1, 'AAL2: SELECT profilo consentito');
select tests.ok(
  (select count(*) from public.accounts where name = 'Modificato in AAL1') = 0,
  'AAL2: l''UPDATE tentato in AAL1 non ha avuto effetto');

insert into public.goals (name, target_amount_cents) values ('Fondo emergenza', 1000000);
select tests.ok((select count(*) from public.goals) = 1, 'AAL2: INSERT goals consentito');
with changed as (update public.goals set current_amount_cents = 250000 where name = 'Fondo emergenza' returning id)
select tests.ok((select count(*) from changed) = 1, 'AAL2: UPDATE goals consentito');
with removed as (delete from public.goals where name = 'Fondo emergenza' returning id)
select tests.ok((select count(*) from removed) = 1, 'AAL2: DELETE goals consentito');

insert into public.transactions (account_id, booked_on, description, original_description, amount_cents, type, nature, fingerprint)
values (:'a_rev', '2026-09-30', 'Caffè', 'BAR', -150, 'expense', 'personal', tests.fp('aal2-1'));
with changed as (update public.transactions set notes = 'ok' where fingerprint = tests.fp('aal2-1') returning id)
select tests.ok((select count(*) from changed) = 1, 'AAL2: INSERT e UPDATE transactions consentiti');
with removed as (delete from public.transactions where fingerprint = tests.fp('aal2-1') returning id)
select tests.ok((select count(*) from removed) = 1, 'AAL2: DELETE transactions consentito');

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
select tests.login('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal2');

-- Aggregati della dashboard (0007): SECURITY INVOKER → RLS + AAL2 come una SELECT
select tests.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('dashboard_monthly_flows', 'dashboard_category_spending', 'dashboard_income_by_source',
     'dashboard_business_performance', 'dashboard_account_changes', 'dashboard_invested_at_cost', 'net_worth_history')
     and not p.prosecdef and p.provolatile = 's') = 7,
  '0007: 7 funzioni di aggregazione, tutte SECURITY INVOKER e STABLE');
select tests.ok(
  not has_function_privilege('anon', 'public.net_worth_history()', 'execute')
    and not has_function_privilege('anon', 'public.dashboard_monthly_flows(date, date)', 'execute')
    and has_function_privilege('authenticated', 'public.dashboard_monthly_flows(date, date)', 'execute'),
  '0007: funzioni eseguibili solo da utenti autenticati');
select tests.ok(
  (select income_cents = 250000 and expense_cents = 0 from public.dashboard_monthly_flows('2026-09-01', '2026-09-30')) and
  (select count(*) from public.dashboard_monthly_flows('2000-01-01', '2100-12-31')) = 1,
  '0007: B vede solo i propri flussi (A ha movimenti nello stesso periodo)');
select tests.ok(
  (select count(*) from public.net_worth_history()) = 1 and (select total_cents from public.net_worth_history()) = 250000,
  '0007: storico patrimonio di B calcolato solo sui suoi conti');
select tests.ok(
  (select count(*) from public.dashboard_account_changes('2000-01-01', '2100-12-31') c
   where c.account_id in (select id from public.accounts where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) = 0,
  '0007: nessuna variazione dei conti di A visibile a B');
select tests.login('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal1');
select tests.ok(
  (select count(*) from public.dashboard_monthly_flows('2000-01-01', '2100-12-31')) = 0 and (select count(*) from public.net_worth_history()) = 0,
  '0007: con sessione AAL1 gli aggregati sono vuoti');
select tests.login('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aal2');
select tests.ok((select count(*) from storage.objects) = 0, 'storage: B non vede i file di A');
select tests.ok((select count(*) from public.transactions) = 1, 'RLS: B vede solo la propria transazione');

-- Importazioni (Sprint 3) -------------------------------------------------------

select tests.ok((select count(*) from public.imports where id = :'a_import') = 0, 'import: B non vede le importazioni di A');
select tests.ok((select count(*) from public.import_files where import_id = :'a_import') = 0, 'import: B non vede i file di A');
select tests.ok((select count(*) from public.import_rows where import_id = :'a_import') = 0, 'import: B non vede le righe di A');
select tests.throws(
  format($$insert into public.import_rows (import_id, row_index, raw) values (%L, 5, '{}')$$, :'a_import'),
  '23503', 'import: B non può aggiungere righe all''importazione di A');
with attempted as (update public.imports set status = 'cancelled' where id = :'a_import' returning id)
select tests.ok((select count(*) from attempted) = 0, 'import: B non può modificare l''importazione di A');

-- Account (Sprint 2) ------------------------------------------------------------

select tests.ok((select count(*) from public.accounts) = 5, 'account: B vede solo i propri 5 conti');
select tests.ok(
  (select count(*) from public.accounts where id in (:'a_ing', :'a_rev', :'a_tr')) = 0,
  'account: B non legge i conti di A neppure conoscendone l''id');
select tests.ok(
  (select count(*) from public.account_balances where account_id = :'a_ing') = 0,
  'account: B non vede il saldo dei conti di A (vista security_invoker)');
select tests.ok(
  (select count(*) from public.account_balances) = 5,
  'account: la vista saldi di B contiene solo i suoi 5 conti');

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
select tests.logout();
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
    = array['ING Direct', 'ING Conto Risparmio', 'Revolut', 'Carta di credito', 'Trade Republic'],
  'bootstrap: i 5 conti di default appartengono all''utente creato');
select tests.ok(
  (select count(distinct user_id) = 2 and count(*) = 10 from public.accounts),
  'bootstrap: ogni utente ha i propri conti distinti (5 + 5)');
select tests.ok(
  (select a.account_type = 'broker' from public.accounts a where a.id = :'a_tr')
    and (select count(*) from public.investment_accounts where account_id = :'a_tr') = 1,
  'bootstrap: Trade Republic è un conto broker collegato a investment_accounts');

delete from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select tests.ok(
  (select count(*) from public.accounts where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0,
  'cancellazione utente: tutti i dati rimossi in cascata');

-- =============================================================================
-- Copertura: ogni tabella con dati utente ha la policy AAL2 (anche le future)
-- =============================================================================

select tests.ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and (c.column_name = 'user_id' or c.table_name = 'profiles')
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.table_name
          and p.permissive = 'RESTRICTIVE'
          and p.cmd = 'ALL'
          and p.roles = '{authenticated}'
          and p.qual like '%aal2%'
          and p.with_check like '%aal2%'
      )
  ),
  'copertura: tutte le tabelle con dati utente richiedono AAL2');
select tests.ok(
  (select count(*) from pg_policies where schemaname = 'public' and policyname like '%_require_aal2') = 25,
  'copertura: 25 tabelle protette da policy restrictive AAL2');
select tests.ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_types' and qual like '%aal2%'),
  'copertura: account_types (riferimento pubblico) non richiede AAL2');
select tests.ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'imports_bucket_require_aal2' and permissive = 'RESTRICTIVE'),
  'copertura: il bucket imports richiede AAL2');
