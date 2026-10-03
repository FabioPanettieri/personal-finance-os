-- =============================================================================
-- Personal Finance OS — 0005 security: MFA (AAL2) obbligatoria sui dati
--
-- Fino alla 0004 le policy RLS verificavano solo il proprietario
-- (user_id = auth.uid()). Il TOTP era imposto dall'app (proxy + layout), ma un
-- token ottenuto con la sola password (AAL1) poteva interrogare direttamente
-- PostgREST e leggere/modificare i propri dati. Da qui in poi l'accesso ai
-- dati richiede contemporaneamente:
--   1. ruolo authenticated            (grant + policy "to authenticated")
--   2. proprietario corretto          (policy permissive già esistenti)
--   3. sessione AAL2                  (policy RESTRICTIVE di questa migration)
--
-- Le policy restrictive sono in AND con quelle permissive: non ne allargano
-- mai l'accesso, possono solo restringerlo. Le migration 0001–0004 restano
-- invariate.
--
-- Cosa NON viene toccato (e perché):
--   * account_types: tabella di riferimento globale, nessun dato utente;
--   * auth.mfa_factors / auth.mfa_challenges: gestite da Supabase Auth con il
--     proprio ruolo, non soggette a queste policy. La configurazione iniziale
--     del TOTP (enroll → challenge → verify) avviene con una sessione AAL1
--     tramite l'API di Auth e continua a funzionare;
--   * funzioni/trigger security definer (bootstrap utente, audit): girano
--     come owner e non dipendono dalla sessione del client.
-- =============================================================================

do $$
declare
  t text;
  aal2 constant text := $q$((select auth.jwt()) ->> 'aal') = 'aal2'$q$;
begin
  foreach t in array array[
    -- dati finanziari e strutture dell'utente
    'accounts', 'businesses', 'income_sources', 'transaction_categories',
    'transfer_groups', 'categorization_rules', 'transactions',
    -- importazioni
    'import_profiles', 'imports', 'import_files', 'import_rows',
    -- investimenti
    'investment_accounts', 'instruments', 'investment_plans',
    'investment_transactions', 'investment_valuations',
    -- pianificazione
    'budgets', 'budget_categories', 'goals', 'goal_accounts',
    -- dati derivati
    'monthly_snapshots', 'yearly_snapshots', 'net_worth_snapshots',
    -- profilo e storico modifiche (contiene copie dei dati finanziari)
    'profiles', 'audit_logs'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      t || '_require_aal2', t, aal2, aal2
    );
  end loop;
end;
$$;

-- CSV caricati: stessi requisiti, limitati al bucket privato `imports`.
create policy imports_bucket_require_aal2 on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'imports' or ((select auth.jwt()) ->> 'aal') = 'aal2')
  with check (bucket_id <> 'imports' or ((select auth.jwt()) ->> 'aal') = 'aal2');
