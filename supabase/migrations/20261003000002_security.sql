-- =============================================================================
-- Personal Finance OS — 0002 security: RLS, privilegi, audit log
--
-- Modello (docs/02-security.md):
--   * anon: nessun accesso a nessuna tabella;
--   * authenticated: solo le proprie righe (user_id = auth.uid());
--   * audit_logs: sola lettura, scritto solo da trigger security definer;
--   * service_role: solo script amministrativi/server, mai nel browser.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilegi di base: anon non vede nulla nello schema public.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Le funzioni trigger non sono API: nessuno deve poterle invocare via RPC.
revoke execute on function public.set_updated_at() from public, authenticated;
revoke execute on function public.enforce_category_hierarchy() from public, authenticated;
revoke execute on function public.protect_transaction_original_data() from public, authenticated;
revoke execute on function public.enforce_investment_account_type() from public, authenticated;

-- -----------------------------------------------------------------------------
-- RLS: tabelle di proprietà dell'utente (colonna user_id)
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'businesses', 'income_sources', 'transaction_categories',
    'import_profiles', 'imports', 'import_files', 'import_rows',
    'transfer_groups', 'categorization_rules', 'transactions',
    'investment_accounts', 'instruments', 'investment_plans',
    'investment_transactions', 'investment_valuations',
    'budgets', 'budget_categories', 'goals', 'goal_accounts',
    'monthly_snapshots', 'yearly_snapshots', 'net_worth_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);

    -- Indice per la condizione RLS dove la PK non inizia già con user_id.
    if t not in ('monthly_snapshots', 'yearly_snapshots') then
      execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: chiave = id utente. Creato dal trigger di signup, mai dal client.
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke insert, delete on public.profiles from authenticated;

-- -----------------------------------------------------------------------------
-- account_types: riferimento globale in sola lettura.
-- -----------------------------------------------------------------------------

alter table public.account_types enable row level security;

create policy account_types_read on public.account_types
  for select to authenticated using (true);

revoke insert, update, delete, truncate on public.account_types from authenticated;

-- -----------------------------------------------------------------------------
-- audit_logs: append-only, scrivibile solo dal trigger.
-- -----------------------------------------------------------------------------

alter table public.audit_logs enable row level security;

create policy audit_logs_select_own on public.audit_logs
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.audit_logs from authenticated;

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  changed text[];
begin
  -- Cancellazione dell'account utente: le righe spariscono in cascata insieme
  -- al log stesso, non c'è nulla da registrare.
  if not exists (select 1 from auth.users u where u.id = (row_data ->> 'user_id')::uuid) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into changed
    from jsonb_each(new_row) n
    where n.key not in ('updated_at')
      and n.value is distinct from old_row -> n.key;

    -- Update senza modifiche reali: niente rumore nel log.
    if changed is null then
      return new;
    end if;
  end if;

  insert into public.audit_logs (user_id, table_name, record_id, action, changed_fields, old_data, new_data)
  values (
    (row_data ->> 'user_id')::uuid,
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'account_id')::uuid,
    lower(tg_op)::public.audit_action,
    changed,
    old_row,
    -- Per gli insert basta il riferimento: la riga stessa è il dato.
    case when tg_op = 'UPDATE' then new_row end
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.write_audit_log() from public, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'businesses', 'income_sources', 'transaction_categories',
    'import_profiles', 'imports', 'categorization_rules', 'transactions',
    'transfer_groups', 'investment_accounts', 'investment_plans',
    'investment_transactions', 'investment_valuations', 'budgets', 'goals'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      t || '_audit', t);
  end loop;
end;
$$;
