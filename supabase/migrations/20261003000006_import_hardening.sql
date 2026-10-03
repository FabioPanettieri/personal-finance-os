-- =============================================================================
-- Personal Finance OS — 0006 hardening import su formati reali (Sprint 3)
--
-- Estensione minima emersa dalla validazione con gli export reali di ING,
-- Revolut e Trade Republic. Le migration 0001–0005 restano invariate; RLS e
-- policy AAL2 esistenti coprono automaticamente le nuove colonne (nessuna
-- nuova tabella).
--
-- 1. accounts.iban (facoltativo): riconoscere i trasferimenti tra conti propri
--    dall'IBAN della controparte (es. ING principale ↔ ING Conto Risparmio).
-- 2. categorization_rules: regole interamente nel database e modificabili
--    senza deploy — nuovi campi di confronto (causale/tipo della banca, IBAN
--    controparte), filtro per fonte, conto di destinazione del trasferimento,
--    motivo di revisione esplicito, versione incrementata a ogni modifica
--    (lo storico completo è già in audit_logs).
-- 3. import_rows.transfer_account_id: conto proprio di destinazione proposto
--    o scelto in anteprima.
-- 4. Nuovi conti di default (ING Conto Risparmio, Carta di credito) e regole
--    iniziali come dati, per i nuovi utenti e per quelli esistenti.
-- =============================================================================

-- 1. IBAN dei conti ---------------------------------------------------------------

alter table public.accounts
  add column iban text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$');

create unique index accounts_user_iban on public.accounts (user_id, iban) where iban is not null;

-- 2. Regole di classificazione ----------------------------------------------------

alter table public.categorization_rules
  drop constraint categorization_rules_match_field_check,
  add constraint categorization_rules_match_field_check
    check (match_field in ('description', 'counterparty', 'counterparty_iban', 'source_type'));

alter table public.categorization_rules
  add column sources public.bank_profile[],
  add column set_transfer_account_id uuid,
  add column review_reason text check (char_length(review_reason) between 1 and 280),
  add column version integer not null default 1 check (version >= 1),
  add foreign key (set_transfer_account_id, user_id)
    references public.accounts (id, user_id) on delete cascade;

alter table public.categorization_rules
  drop constraint categorization_rules_check1,
  add constraint categorization_rules_has_action check (
    num_nonnulls(set_type, set_nature, set_category_id, set_business_id, set_income_source_id, set_transfer_account_id, review_reason) > 0
  ),
  add constraint categorization_rules_transfer_target check (
    set_transfer_account_id is null or set_type in ('transfer', 'investment')
  );

-- Versione: +1 a ogni modifica della definizione (non per i contatori d'uso).
create function public.bump_rule_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['version', 'hit_count', 'last_matched_at', 'updated_at'])
     is distinct from (to_jsonb(old) - array['version', 'hit_count', 'last_matched_at', 'updated_at']) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_rule_version() from public, anon, authenticated;

create trigger categorization_rules_bump_version
  before update on public.categorization_rules
  for each row execute function public.bump_rule_version();

-- 3. Conto di destinazione proposto in anteprima ---------------------------------

alter table public.import_rows
  add column transfer_account_id uuid,
  add foreign key (transfer_account_id, user_id)
    references public.accounts (id, user_id) on delete set null (transfer_account_id);

-- 4. Dati iniziali (idempotenti) --------------------------------------------------

create function public.category_id_by_path(p_user_id uuid, p_path text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.transaction_categories c
  left join public.transaction_categories p on p.id = c.parent_id
  where c.user_id = p_user_id
    and case
      when position(' > ' in p_path) > 0
        then p.name = split_part(p_path, ' > ', 1) and c.name = split_part(p_path, ' > ', 2)
      else c.parent_id is null and c.name = p_path
    end
$$;

revoke execute on function public.category_id_by_path(uuid, text) from public, anon, authenticated;

create function public.seed_import_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card uuid;
begin
  -- Conti: secondo conto ING e carta di credito (rinominabili). Senza banca CSV
  -- predefinita: non sono alimentati da estratti, quindi i trasferimenti verso
  -- di loro creano la contropartita alla conferma dell'import.
  insert into public.accounts (user_id, name, institution, account_type, color, icon, sort_order)
  select p_user_id, 'ING Conto Risparmio', 'ING', 'savings', '#FF8A3D', 'piggy-bank', 15
  where not exists (select 1 from public.accounts where user_id = p_user_id and name = 'ING Conto Risparmio');

  insert into public.accounts (user_id, name, institution, account_type, color, icon, sort_order)
  select p_user_id, 'Carta di credito', 'ING', 'card', '#6B7280', 'credit-card', 25
  where not exists (select 1 from public.accounts where user_id = p_user_id and name = 'Carta di credito');

  select id into v_card from public.accounts where user_id = p_user_id and name = 'Carta di credito';

  -- Regole iniziali: dati modificabili, non codice.
  insert into public.categorization_rules (
    user_id, name, priority, origin, match_field, match_type, pattern, direction, sources,
    set_type, set_nature, set_category_id, set_business_id, set_income_source_id,
    set_transfer_account_id, review_reason, confidence
  )
  select
    p_user_id, r.name, r.priority, 'system', r.match_field, r.match_type::public.rule_match_type, r.pattern, r.direction,
    r.sources::public.bank_profile[],
    r.set_type::public.transaction_type, r.set_nature::public.transaction_nature,
    case when r.category is null then null else public.category_id_by_path(p_user_id, r.category) end,
    (select b.id from public.businesses b where b.user_id = p_user_id and b.slug = r.business),
    (select s.id from public.income_sources s where s.user_id = p_user_id and s.name = r.income_source),
    case when r.to_card then v_card end,
    r.review_reason,
    r.confidence
  from (values
    -- Struttura della banca
    ('ING: addebito carta di credito → Carta di credito', 40, 'source_type', 'equals', 'Addebito Carta Di Credito', 'any', '{ing}', 'transfer', 'transfer', 'Trasferimenti > Giroconto', null, null, true, null, 0.95),

    -- Regole personali iniziali
    ('Etsy → VOXEL Studio (vendite)', 100, 'description', 'regex', '\betsy\b', 'in', null, 'income', 'business', 'Vendite', 'voxel-studio', 'VOXEL Studio', false, null, 0.9),
    ('Stripe → VOXEL Studio (vendite)', 100, 'description', 'regex', '\bstripe\b', 'in', null, 'income', 'business', 'Vendite', 'voxel-studio', 'VOXEL Studio', false, null, 0.9),
    ('Google Ireland → YouTube', 100, 'description', 'contains', 'google ireland', 'in', null, 'income', 'business', 'YouTube', 'il-progettista-meccanico', 'YouTube — Il Progettista Meccanico', false, null, 0.9),
    ('Packlink → VOXEL Studio (spedizioni)', 110, 'description', 'contains', 'packlink', 'out', null, 'expense', 'business', 'Business > Spedizioni', 'voxel-studio', null, false, null, 0.9),
    ('Elegoo → VOXEL Studio (materiali)', 110, 'description', 'contains', 'elegoo', 'out', null, 'expense', 'business', 'Business > Materiali', 'voxel-studio', null, false, null, 0.9),
    ('Aruba → VOXEL Studio (servizi/software)', 110, 'description', 'regex', '\baruba\b', 'out', null, 'expense', 'business', 'Business > Software', 'voxel-studio', null, false, null, 0.9),
    ('GoDaddy → VOXEL Studio (servizi/software)', 110, 'description', 'contains', 'godaddy', 'out', null, 'expense', 'business', 'Business > Software', 'voxel-studio', null, false, null, 0.9),

    -- Regole generiche (prima nel codice, ora dati)
    ('Stipendio', 1000, 'description', 'regex', '\b(stipendio|emolument[io]|salary|payroll|cedolino|retribuzione)\b', 'in', null, 'income', 'personal', 'Stipendio', null, 'Stipendio', false, null, 0.85),
    ('YouTube / AdSense', 1010, 'description', 'regex', '\b(youtube|adsense)\b', 'in', null, 'income', 'business', 'YouTube', 'il-progettista-meccanico', 'YouTube — Il Progettista Meccanico', false, null, 0.8),
    ('VOXEL Studio', 1020, 'description', 'regex', '\bvoxel\b', 'in', null, 'income', 'business', 'Vendite', 'voxel-studio', 'VOXEL Studio', false, null, 0.8),
    ('Interessi', 1030, 'description', 'regex', '\b(interessi|interest)\b', 'in', null, 'income', 'personal', 'Interessi e dividendi', null, null, false, null, 0.8),
    ('Rimborso', 1040, 'description', 'regex', '\b(rimborso|refund|storno|reso)\b', 'in', null, 'refund', 'personal', null, null, null, false, null, 0.8),
    ('Bonifico verso Revolut', 1100, 'description', 'regex', '\brevolut\b', 'out', '{ing}', 'transfer', 'transfer', 'Trasferimenti > Giroconto', null, null, false, null, 0.75),
    ('Trasferimento verso ING', 1110, 'description', 'regex', '\b(ing direct|ing bank|to ing|verso ing)\b', 'any', '{revolut}', 'transfer', 'transfer', 'Trasferimenti > Giroconto', null, null, false, null, 0.75),
    ('Giroconto', 1120, 'description', 'regex', '\b(giroconto|trasferimento tra conti)\b', 'any', null, 'transfer', 'transfer', 'Trasferimenti > Giroconto', null, null, false, null, 0.75),
    ('Bonifico ricevuto', 1200, 'description', 'regex', '\b(bonifico ricevuto|bonifico a vostro favore|accredito bonifico)\b', 'in', null, null, null, null, null, null, false, 'Bonifico ricevuto: entrata o trasferimento da un tuo conto? Da verificare', 0),
    ('Prelievo contanti', 1210, 'description', 'regex', '\b(prelievo|atm|cash at|bancomat)\b', 'out', null, null, null, null, null, null, false, 'Prelievo di contanti: spesa o trasferimento verso contanti? Da verificare', 0),
    ('Mutuo', 1300, 'description', 'regex', '\b(mutuo|rata mutuo)\b', 'out', null, 'expense', 'personal', 'Casa > Mutuo', null, null, false, null, 0.9),
    ('Bollette', 1310, 'description', 'regex', '\b(bolletta|enel|a2a|hera|iren|edison|acea|servizio idrico)\b', 'out', null, 'expense', 'personal', 'Casa > Bollette', null, null, false, null, 0.75),
    ('Supermercato', 1320, 'description', 'regex', '\b(supermarket|supermercato|esselunga|coop|conad|carrefour|lidl|eurospin|despar|aldi|iper|pam)\b', 'out', null, 'expense', 'personal', 'Alimentazione > Spesa', null, null, false, null, 0.8),
    ('Delivery', 1330, 'description', 'regex', '\b(deliveroo|just eat|justeat|glovo|uber eats)\b', 'out', null, 'expense', 'personal', 'Alimentazione > Delivery', null, null, false, null, 0.85),
    ('Ristorante', 1340, 'description', 'regex', '\b(ristorante|restaurant|pizzeria|trattoria|osteria|sushi|braceria|mcdonald s|burger king)\b', 'out', null, 'expense', 'personal', 'Alimentazione > Ristorante', null, null, false, null, 0.75),
    ('Bar', 1350, 'description', 'regex', '\b(bar|caffe|cafe|coffee)\b', 'out', null, 'expense', 'personal', 'Alimentazione > Bar', null, null, false, null, 0.65),
    ('Carburante', 1360, 'description', 'regex', '\b(carburante|benzina|fuel|eni|q8|esso|tamoil|shell|ip station)\b', 'out', null, 'expense', 'personal', 'Trasporti > Carburante', null, null, false, null, 0.75),
    ('Auto: pedaggi e assicurazione', 1365, 'description', 'regex', '\b(autostrade|pedaggio|telepass|assicurazione auto)\b', 'out', null, 'expense', 'personal', 'Trasporti > Auto', null, null, false, null, 0.75),
    ('Trasporto pubblico', 1370, 'description', 'regex', '\b(trenitalia|italo|atm milano|metro|tper|flixbus)\b', 'out', null, 'expense', 'personal', 'Trasporti > Trasporto pubblico', null, null, false, null, 0.75),
    ('Parcheggio', 1380, 'description', 'regex', '\b(parcheggio|parking|easypark|parcometro)\b', 'out', null, 'expense', 'personal', 'Trasporti > Parcheggio', null, null, false, null, 0.75),
    ('Abbonamenti streaming', 1390, 'description', 'regex', '\b(spotify|netflix|disney|prime video|dazn|now tv)\b', 'out', null, 'expense', 'personal', 'Abbonamenti', null, null, false, null, 0.9),
    ('Servizi digitali', 1400, 'description', 'regex', '\b(icloud|google storage|dropbox|github|adobe|notion|figma|microsoft|anthropic|openai)\b', 'out', null, 'expense', 'personal', 'Tecnologia > Servizi digitali', null, null, false, null, 0.7),
    ('Acquisti online', 1410, 'description', 'regex', '\b(amazon|amzn|ebay|zalando|temu|aliexpress|shein)\b', 'out', null, 'expense', 'personal', 'Shopping > Acquisti online', null, null, false, null, 0.6),
    ('Salute', 1420, 'description', 'regex', '\b(farmacia|pharmacy|medico|ospedale|dentista)\b', 'out', null, 'expense', 'personal', 'Salute', null, null, false, null, 0.75),
    ('Pagamento POS generico', 1900, 'description', 'regex', '\b(pagamento|pos|card payment)\b', 'out', null, 'expense', 'personal', null, null, null, false, null, 0.6)
  ) as r(name, priority, match_field, match_type, pattern, direction, sources, set_type, set_nature, category, business, income_source, to_card, review_reason, confidence)
  where not exists (
    select 1 from public.categorization_rules x where x.user_id = p_user_id and x.name = r.name
  );
end;
$$;

revoke execute on function public.seed_import_defaults(uuid) from public, anon, authenticated;

-- Nuovi utenti: profilo + dati di default (0004) + dati import (0006).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  perform public.seed_default_data(new.id);
  perform public.seed_import_defaults(new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Utenti esistenti.
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.seed_import_defaults(u.id);
  end loop;
end;
$$;
