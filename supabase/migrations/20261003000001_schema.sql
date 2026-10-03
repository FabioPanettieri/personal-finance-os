-- =============================================================================
-- Personal Finance OS — 0001 schema
--
-- Convenzioni (vedi docs/01-database.md):
--   * importi in centesimi interi (bigint, suffisso _cents), mai float;
--   * quantità/prezzi di strumenti finanziari in numeric;
--   * date contabili come `date` (giorno locale, nessun fuso orario);
--   * ogni tabella utente ha user_id + RLS; i riferimenti tra tabelle utente
--     usano FK composte (id, user_id) così un utente non può mai puntare a
--     righe di un altro utente, anche conoscendone l'id;
--   * original_description e fingerprint sono immutabili dopo l'inserimento.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipi enumerati
-- -----------------------------------------------------------------------------

-- Cosa rappresenta economicamente il movimento.
create type public.transaction_type as enum ('income', 'expense', 'transfer', 'investment', 'refund');
-- A quale sfera appartiene.
create type public.transaction_nature as enum ('personal', 'business', 'investment', 'transfer');
create type public.transaction_source as enum ('csv_import', 'manual');
create type public.categorization_method as enum ('none', 'rule', 'learned', 'ai', 'manual');
create type public.category_kind as enum ('income', 'expense', 'transfer', 'investment');
create type public.transfer_kind as enum ('internal', 'investment');
create type public.bank_profile as enum ('ing', 'revolut', 'trade_republic', 'generic');
create type public.import_status as enum ('pending', 'preview', 'committed', 'failed', 'cancelled', 'rolled_back');
create type public.import_row_status as enum ('new', 'duplicate', 'possible_duplicate', 'invalid', 'skipped', 'imported');
create type public.rule_match_type as enum ('contains', 'equals', 'starts_with', 'regex');
create type public.rule_origin as enum ('system', 'user', 'learned');
create type public.investment_tx_kind as enum ('buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal');
create type public.budget_period as enum ('monthly', 'yearly');
create type public.goal_tracking as enum ('manual', 'linked_accounts');
create type public.audit_action as enum ('insert', 'update', 'delete');

-- -----------------------------------------------------------------------------
-- Domini riutilizzabili
-- -----------------------------------------------------------------------------

create domain public.currency_code as char(3) check (value ~ '^[A-Z]{3}$');
create domain public.hex_color as text check (value ~ '^#[0-9a-fA-F]{6}$');
create domain public.icon_name as text check (value ~ '^[a-z0-9-]{1,40}$');
create domain public.confidence as numeric(4, 3) check (value between 0 and 1);

-- -----------------------------------------------------------------------------
-- Trigger condivisi
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- PROFILI E RIFERIMENTI
-- =============================================================================

create table public.profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  display_name              text check (char_length(display_name) between 1 and 80),
  base_currency             public.currency_code not null default 'EUR',
  locale                    text not null default 'it-IT' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  timezone                  text not null default 'Europe/Rome' check (char_length(timezone) between 1 and 64),
  week_starts_on            smallint not null default 1 check (week_starts_on between 0 and 6),
  theme                     text not null default 'system' check (theme in ('system', 'light', 'dark')),
  ai_categorization_enabled boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Tabella di riferimento globale (non per-utente), sola lettura dal client.
create table public.account_types (
  code          text primary key check (code ~ '^[a-z_]{2,30}$'),
  label         text not null,
  is_liquid     boolean not null,
  is_investment boolean not null,
  sort_order    smallint not null default 0,
  check (not (is_liquid and is_investment))
);

insert into public.account_types (code, label, is_liquid, is_investment, sort_order) values
  ('checking', 'Conto corrente',       true,  false, 10),
  ('savings',  'Conto deposito',       true,  false, 20),
  ('card',     'Carta',                true,  false, 30),
  ('wallet',   'Wallet',               true,  false, 40),
  ('cash',     'Contanti',             true,  false, 50),
  ('broker',   'Broker / Investimenti', false, true,  60),
  ('other',    'Altro',                false, false, 90);

-- =============================================================================
-- CONTI, BUSINESS, FONTI DI REDDITO, CATEGORIE
-- =============================================================================

create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 60),
  institution           text check (char_length(institution) between 1 and 80),
  account_type          text not null references public.account_types (code),
  currency              public.currency_code not null default 'EUR',
  -- Saldo all'inizio del giorno initial_balance_on. I movimenti con
  -- booked_on >= initial_balance_on si sommano a questo valore; se la data è
  -- null, si sommano tutti i movimenti.
  initial_balance_cents bigint not null default 0,
  initial_balance_on    date,
  default_bank_profile  public.bank_profile,
  color                 public.hex_color,
  icon                  public.icon_name,
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  description text check (char_length(description) <= 280),
  color       public.hex_color,
  icon        public.icon_name,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, slug)
);

create table public.income_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 280),
  business_id uuid,
  color       public.hex_color,
  icon        public.icon_name,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete set null (business_id)
);

create table public.transaction_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id  uuid,
  name       text not null check (char_length(name) between 1 and 60),
  kind       public.category_kind not null,
  color      public.hex_color,
  icon       public.icon_name,
  is_system  boolean not null default false,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique nulls not distinct (user_id, parent_id, name),
  check (parent_id is null or parent_id <> id),
  foreign key (parent_id, user_id) references public.transaction_categories (id, user_id) on delete no action
);

-- Gerarchia a due livelli (macro → sottocategoria); il figlio eredita il kind.
create function public.enforce_category_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent record;
begin
  if new.parent_id is null then
    if exists (select 1 from public.transaction_categories c where c.parent_id = new.id and c.kind <> new.kind) then
      raise exception 'Le sottocategorie devono avere lo stesso tipo della categoria padre'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select c.parent_id, c.kind into parent
  from public.transaction_categories c
  where c.id = new.parent_id;

  if parent.parent_id is not null then
    raise exception 'Le categorie supportano al massimo due livelli' using errcode = 'check_violation';
  end if;
  if parent.kind <> new.kind then
    raise exception 'La sottocategoria deve avere lo stesso tipo della categoria padre' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.transaction_categories c where c.parent_id = new.id) then
    raise exception 'Una categoria con sottocategorie non può diventare sottocategoria' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger transaction_categories_hierarchy
  before insert or update of parent_id, kind on public.transaction_categories
  for each row execute function public.enforce_category_hierarchy();

-- =============================================================================
-- IMPORTAZIONI CSV
-- =============================================================================

-- Mapping colonne per banca (impostazioni import, §35 della specifica).
create table public.import_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank_profile        public.bank_profile not null,
  name                text not null check (char_length(name) between 1 and 60),
  is_default          boolean not null default false,
  encoding            text not null default 'auto' check (encoding in ('auto', 'utf-8', 'utf-16le', 'windows-1252', 'iso-8859-1')),
  delimiter           text check (delimiter in (',', ';', E'\t', '|')),
  has_header          boolean not null default true,
  skip_rows           smallint not null default 0 check (skip_rows between 0 and 50),
  date_format         text not null check (date_format in ('DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'ISO_DATETIME')),
  decimal_separator   text not null default ',' check (decimal_separator in (',', '.')),
  amount_mode         text not null default 'signed' check (amount_mode in ('signed', 'debit_credit')),
  -- es. {"booked_on": "Data contabile", "description": "Descrizione", "amount": "Importo"}
  column_map          jsonb not null check (jsonb_typeof(column_map) = 'object'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create unique index import_profiles_one_default
  on public.import_profiles (user_id, bank_profile) where is_default;

create table public.imports (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id              uuid not null,
  import_profile_id       uuid,
  bank_profile            public.bank_profile not null,
  status                  public.import_status not null default 'pending',
  rows_total              integer not null default 0 check (rows_total >= 0),
  rows_new                integer not null default 0 check (rows_new >= 0),
  rows_duplicate          integer not null default 0 check (rows_duplicate >= 0),
  rows_possible_duplicate integer not null default 0 check (rows_possible_duplicate >= 0),
  rows_invalid            integer not null default 0 check (rows_invalid >= 0),
  rows_imported           integer not null default 0 check (rows_imported >= 0),
  income_cents            bigint not null default 0 check (income_cents >= 0),
  expense_cents           bigint not null default 0 check (expense_cents >= 0),
  transfer_cents          bigint not null default 0 check (transfer_cents >= 0),
  period_start            date,
  period_end              date,
  error_message           text check (char_length(error_message) <= 1000),
  committed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, user_id),
  check (period_end is null or period_start is null or period_end >= period_start),
  check ((status = 'committed') = (committed_at is not null) or status = 'rolled_back'),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete no action,
  foreign key (import_profile_id, user_id) references public.import_profiles (id, user_id) on delete set null (import_profile_id)
);

create table public.import_files (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_id         uuid not null,
  storage_path      text not null unique check (char_length(storage_path) <= 512),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  size_bytes        integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  detected_encoding text,
  detected_delimiter text,
  header            jsonb check (header is null or jsonb_typeof(header) = 'array'),
  created_at        timestamptz not null default now(),
  foreign key (import_id, user_id) references public.imports (id, user_id) on delete cascade
);

-- Stesso file ricaricato → avviso in UI (non blocco: l'utente può volerlo rivedere).
create index import_files_user_sha on public.import_files (user_id, sha256);

-- =============================================================================
-- TRASFERIMENTI E TRANSAZIONI
-- =============================================================================

create table public.transfer_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        public.transfer_kind not null,
  detected_by text not null check (detected_by in ('auto', 'manual')),
  confidence  public.confidence,
  note        text check (char_length(note) <= 280),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table public.categorization_rules (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                   text not null check (char_length(name) between 1 and 80),
  priority               integer not null default 100 check (priority between 0 and 10000),
  origin                 public.rule_origin not null default 'user',
  is_active              boolean not null default true,
  match_field            text not null default 'description' check (match_field in ('description', 'counterparty')),
  match_type             public.rule_match_type not null default 'contains',
  pattern                text not null check (char_length(pattern) between 1 and 200),
  account_id             uuid,
  direction              text not null default 'any' check (direction in ('in', 'out', 'any')),
  amount_min_cents       bigint check (amount_min_cents >= 0),
  amount_max_cents       bigint check (amount_max_cents >= 0),
  set_type               public.transaction_type,
  set_nature             public.transaction_nature,
  set_category_id        uuid,
  set_business_id        uuid,
  set_income_source_id   uuid,
  confidence             public.confidence not null default 0.95,
  hit_count              integer not null default 0 check (hit_count >= 0),
  last_matched_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, user_id),
  check (amount_min_cents is null or amount_max_cents is null or amount_min_cents <= amount_max_cents),
  check (num_nonnulls(set_type, set_nature, set_category_id, set_business_id, set_income_source_id) > 0),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (set_category_id, user_id) references public.transaction_categories (id, user_id) on delete cascade,
  foreign key (set_business_id, user_id) references public.businesses (id, user_id) on delete cascade,
  foreign key (set_income_source_id, user_id) references public.income_sources (id, user_id) on delete cascade
);

create index categorization_rules_user_priority on public.categorization_rules (user_id, priority) where is_active;

create table public.transactions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id                uuid not null,
  booked_on                 date not null,
  value_on                  date,
  description               text not null check (char_length(description) between 1 and 500),
  -- Testo originale della banca: immutabile (trigger sotto).
  original_description      text not null check (char_length(original_description) <= 1000),
  -- Importo firmato dal punto di vista del conto: < 0 uscita, > 0 entrata.
  amount_cents              bigint not null check (amount_cents <> 0),
  currency                  public.currency_code not null default 'EUR',
  original_amount_cents     bigint,
  original_currency         public.currency_code,
  type                      public.transaction_type not null,
  nature                    public.transaction_nature not null,
  category_id               uuid,
  income_source_id          uuid,
  business_id               uuid,
  counterparty              text check (char_length(counterparty) <= 200),
  notes                     text check (char_length(notes) <= 2000),
  is_transfer               boolean generated always as (type in ('transfer', 'investment')) stored,
  transfer_group_id         uuid,
  is_categorized            boolean not null default false,
  categorization_method     public.categorization_method not null default 'none',
  categorization_confidence public.confidence,
  categorization_rule_id    uuid,
  source                    public.transaction_source not null default 'manual',
  import_id                 uuid,
  -- Hash deterministico (conto, data, importo, descrizione normalizzata,
  -- indice di occorrenza): vedi docs/01-database.md §Duplicati.
  fingerprint               text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (id, user_id),
  unique (account_id, fingerprint),

  -- Coerenza segno/tipo: un'entrata è positiva, una spesa negativa.
  check (type not in ('income', 'refund') or amount_cents > 0),
  check (type <> 'expense' or amount_cents < 0),
  -- Un trasferimento non è mai personale/business, e viceversa.
  check ((type = 'transfer') = (nature = 'transfer')),
  check (type <> 'investment' or nature = 'investment'),
  -- La fonte di reddito ha senso solo per le entrate.
  check (income_source_id is null or type = 'income'),
  check ((original_amount_cents is null) = (original_currency is null)),
  -- Una proposta di categoria senza metodo non esiste.
  check (categorization_method <> 'none' or not is_categorized),

  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete no action,
  foreign key (category_id, user_id) references public.transaction_categories (id, user_id) on delete set null (category_id),
  foreign key (income_source_id, user_id) references public.income_sources (id, user_id) on delete set null (income_source_id),
  foreign key (business_id, user_id) references public.businesses (id, user_id) on delete set null (business_id),
  foreign key (transfer_group_id, user_id) references public.transfer_groups (id, user_id) on delete set null (transfer_group_id),
  foreign key (categorization_rule_id, user_id) references public.categorization_rules (id, user_id) on delete set null (categorization_rule_id),
  foreign key (import_id, user_id) references public.imports (id, user_id) on delete set null (import_id)
);

create index transactions_user_booked on public.transactions (user_id, booked_on desc);
create index transactions_account_booked on public.transactions (account_id, booked_on);
create index transactions_user_category on public.transactions (user_id, category_id);
create index transactions_user_business on public.transactions (user_id, business_id) where business_id is not null;
create index transactions_transfer_group on public.transactions (transfer_group_id) where transfer_group_id is not null;
create index transactions_import on public.transactions (import_id) where import_id is not null;
create index transactions_uncategorized on public.transactions (user_id, booked_on desc) where not is_categorized;
-- Ricerca testuale nel Transaction Explorer.
create index transactions_description_trgm on public.transactions
  using gin (lower(description) extensions.gin_trgm_ops);

create function public.protect_transaction_original_data()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.original_description is distinct from old.original_description then
    raise exception 'original_description è immutabile' using errcode = 'check_violation';
  end if;
  if new.fingerprint is distinct from old.fingerprint then
    raise exception 'fingerprint è immutabile' using errcode = 'check_violation';
  end if;
  if new.account_id is distinct from old.account_id then
    raise exception 'Il conto di una transazione non può essere cambiato' using errcode = 'check_violation';
  end if;
  if new.source is distinct from old.source then
    raise exception 'source è immutabile' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger transactions_protect_original
  before update on public.transactions
  for each row execute function public.protect_transaction_original_data();

-- Righe di staging dell'anteprima import: niente entra in `transactions`
-- finché l'utente non conferma.
create table public.import_rows (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  import_id                   uuid not null,
  row_index                   integer not null check (row_index >= 0),
  raw                         jsonb not null check (jsonb_typeof(raw) = 'object'),
  booked_on                   date,
  value_on                    date,
  description                 text check (char_length(description) <= 1000),
  amount_cents                bigint,
  currency                    public.currency_code,
  counterparty                text check (char_length(counterparty) <= 200),
  proposed_type               public.transaction_type,
  proposed_nature             public.transaction_nature,
  proposed_category_id        uuid,
  proposed_business_id        uuid,
  proposed_income_source_id   uuid,
  categorization_method       public.categorization_method not null default 'none',
  categorization_confidence   public.confidence,
  categorization_rule_id      uuid,
  transfer_candidate_id       uuid,
  fingerprint                 text check (fingerprint ~ '^[0-9a-f]{64}$'),
  status                      public.import_row_status not null default 'new',
  duplicate_of_transaction_id uuid,
  errors                      jsonb not null default '[]' check (jsonb_typeof(errors) = 'array'),
  transaction_id              uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (import_id, row_index),
  check (status <> 'invalid' or jsonb_array_length(errors) > 0),
  foreign key (import_id, user_id) references public.imports (id, user_id) on delete cascade,
  foreign key (proposed_category_id, user_id) references public.transaction_categories (id, user_id) on delete set null (proposed_category_id),
  foreign key (proposed_business_id, user_id) references public.businesses (id, user_id) on delete set null (proposed_business_id),
  foreign key (proposed_income_source_id, user_id) references public.income_sources (id, user_id) on delete set null (proposed_income_source_id),
  foreign key (categorization_rule_id, user_id) references public.categorization_rules (id, user_id) on delete set null (categorization_rule_id),
  foreign key (transfer_candidate_id, user_id) references public.transactions (id, user_id) on delete set null (transfer_candidate_id),
  foreign key (duplicate_of_transaction_id, user_id) references public.transactions (id, user_id) on delete set null (duplicate_of_transaction_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete set null (transaction_id)
);

-- Saldo corrente derivato (mai memorizzato: niente drift).
-- security_invoker: la vista rispetta la RLS di chi la interroga.
create view public.account_balances
with (security_invoker = true)
as
select
  a.id       as account_id,
  a.user_id,
  a.currency,
  a.initial_balance_cents
    + coalesce(sum(t.amount_cents) filter (
        where a.initial_balance_on is null or t.booked_on >= a.initial_balance_on
      ), 0)    as balance_cents,
  max(t.booked_on) as last_transaction_on,
  count(t.id)      as transaction_count
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- =============================================================================
-- INVESTIMENTI
-- =============================================================================

-- Estensione 1:1 di un conto di tipo broker.
create table public.investment_accounts (
  account_id uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  broker     text check (char_length(broker) between 1 and 80),
  notes      text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create function public.enforce_investment_account_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.accounts a
    join public.account_types t on t.code = a.account_type
    where a.id = new.account_id and t.is_investment
  ) then
    raise exception 'investment_accounts richiede un conto di tipo investimento' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger investment_accounts_type
  before insert or update on public.investment_accounts
  for each row execute function public.enforce_investment_account_type();

create table public.instruments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  isin        text check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  symbol      text check (char_length(symbol) between 1 and 20),
  name        text not null check (char_length(name) between 1 and 120),
  asset_class text not null default 'etf' check (asset_class in ('etf', 'stock', 'bond', 'fund', 'crypto', 'cash', 'other')),
  currency    public.currency_code not null default 'EUR',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, isin)
);

-- Piani di accumulo (PAC).
create table public.investment_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id    uuid not null,
  instrument_id uuid,
  name          text not null check (char_length(name) between 1 and 80),
  amount_cents  bigint not null check (amount_cents > 0),
  frequency     text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  day_of_month  smallint check (day_of_month between 1 and 31),
  starts_on     date not null,
  ends_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (account_id, user_id) references public.investment_accounts (account_id, user_id) on delete cascade,
  foreign key (instrument_id, user_id) references public.instruments (id, user_id) on delete set null (instrument_id)
);

-- Operazioni lato broker (acquisti, vendite, dividendi...). Il versamento di
-- liquidità verso il broker vive in `transactions` (type = investment) ed è
-- collegato tramite cash_transaction_id: versamento ≠ rendimento.
create table public.investment_transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id           uuid not null,
  instrument_id        uuid,
  plan_id              uuid,
  trade_on             date not null,
  kind                 public.investment_tx_kind not null,
  quantity             numeric(28, 10) check (quantity > 0),
  price                numeric(20, 8) check (price >= 0),
  price_currency       public.currency_code,
  -- Effetto sulla liquidità del broker (acquisto < 0, vendita/dividendo > 0).
  amount_cents         bigint not null,
  fees_cents           bigint not null default 0 check (fees_cents >= 0),
  taxes_cents          bigint not null default 0 check (taxes_cents >= 0),
  cash_transaction_id  uuid,
  description          text check (char_length(description) <= 500),
  original_description text check (char_length(original_description) <= 1000),
  source               public.transaction_source not null default 'manual',
  import_id            uuid,
  fingerprint          text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  unique (account_id, fingerprint),
  check (kind not in ('buy', 'sell') or (instrument_id is not null and quantity is not null)),
  check (kind <> 'buy' or amount_cents <= 0),
  check (kind not in ('sell', 'dividend', 'interest', 'deposit') or amount_cents >= 0),
  foreign key (account_id, user_id) references public.investment_accounts (account_id, user_id) on delete no action,
  foreign key (instrument_id, user_id) references public.instruments (id, user_id) on delete no action,
  foreign key (plan_id, user_id) references public.investment_plans (id, user_id) on delete set null (plan_id),
  foreign key (cash_transaction_id, user_id) references public.transactions (id, user_id) on delete set null (cash_transaction_id),
  foreign key (import_id, user_id) references public.imports (id, user_id) on delete set null (import_id)
);

create index investment_transactions_account_date on public.investment_transactions (account_id, trade_on);

-- Valore di mercato (non derivabile dai movimenti: nessuna API prezzi in v1).
-- instrument_id null = valore totale del conto.
create table public.investment_valuations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id         uuid not null,
  instrument_id      uuid,
  valued_on          date not null,
  market_value_cents bigint not null check (market_value_cents >= 0),
  source             text not null default 'manual' check (source in ('manual', 'import')),
  created_at         timestamptz not null default now(),
  unique nulls not distinct (account_id, instrument_id, valued_on),
  foreign key (account_id, user_id) references public.investment_accounts (account_id, user_id) on delete cascade,
  foreign key (instrument_id, user_id) references public.instruments (id, user_id) on delete cascade
);

-- =============================================================================
-- BUDGET E OBIETTIVI
-- =============================================================================

create table public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  period     public.budget_period not null default 'monthly',
  starts_on  date not null,
  ends_on    date,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.budget_categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  budget_id    uuid not null,
  category_id  uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  unique (budget_id, category_id),
  foreign key (budget_id, user_id) references public.budgets (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.transaction_categories (id, user_id) on delete cascade
);

create table public.goals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 80),
  target_amount_cents  bigint not null check (target_amount_cents > 0),
  -- Usato solo con tracking = manual; con linked_accounts si calcola dai saldi.
  current_amount_cents bigint not null default 0 check (current_amount_cents >= 0),
  tracking             public.goal_tracking not null default 'manual',
  deadline             date,
  color                public.hex_color,
  icon                 public.icon_name,
  is_archived          boolean not null default false,
  achieved_at          timestamptz,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goal_accounts (
  goal_id    uuid not null,
  account_id uuid not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Quota del saldo del conto destinata all'obiettivo, in basis point (10000 = 100%).
  share_bps  integer not null default 10000 check (share_bps between 1 and 10000),
  primary key (goal_id, account_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

-- =============================================================================
-- SNAPSHOT (cache ricalcolabili: la fonte di verità resta `transactions`)
-- =============================================================================

create table public.monthly_snapshots (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month             date not null check (extract(day from month) = 1),
  income_cents      bigint not null check (income_cents >= 0),
  expense_cents     bigint not null check (expense_cents >= 0),
  net_savings_cents bigint not null,
  invested_cents    bigint not null,
  net_worth_cents   bigint,
  computed_at       timestamptz not null default now(),
  primary key (user_id, month)
);

create table public.yearly_snapshots (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year              smallint not null check (year between 1990 and 2200),
  income_cents      bigint not null check (income_cents >= 0),
  expense_cents     bigint not null check (expense_cents >= 0),
  net_savings_cents bigint not null,
  invested_cents    bigint not null,
  net_worth_cents   bigint,
  computed_at       timestamptz not null default now(),
  primary key (user_id, year)
);

create table public.net_worth_snapshots (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  snapshot_on    date not null,
  liquid_cents   bigint not null,
  invested_cents bigint not null check (invested_cents >= 0),
  total_cents    bigint not null,
  -- [{ "account_id": "...", "balance_cents": 123 }, ...]
  breakdown      jsonb not null default '[]' check (jsonb_typeof(breakdown) = 'array'),
  source         text not null default 'computed' check (source in ('computed', 'manual')),
  created_at     timestamptz not null default now(),
  unique (user_id, snapshot_on),
  check (total_cents = liquid_cents + invested_cents)
);

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

create table public.audit_logs (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  table_name     text not null,
  record_id      uuid,
  action         public.audit_action not null,
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb,
  created_at     timestamptz not null default now()
);

create index audit_logs_user_created on public.audit_logs (user_id, created_at desc);
create index audit_logs_record on public.audit_logs (table_name, record_id);

-- =============================================================================
-- updated_at automatico
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'businesses', 'income_sources', 'transaction_categories',
    'import_profiles', 'imports', 'import_rows', 'categorization_rules', 'transactions',
    'investment_accounts', 'instruments', 'investment_plans', 'investment_transactions',
    'budgets', 'goals'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;
