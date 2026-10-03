-- =============================================================================
-- Personal Finance OS — 0004 bootstrap del nuovo utente
--
-- Alla creazione di un utente in auth.users: profilo + configurazione iniziale
-- (conti, business, fonti di reddito, categorie, regole base).
-- Nessun dato finanziario: solo strutture vuote, tutto modificabile dall'utente.
-- =============================================================================

create function public.seed_default_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voxel   uuid;
  v_youtube uuid;
  v_tr      uuid;
  v_parent  uuid;
  v_subs    uuid;
  v_invest  uuid;
  cat       record;
  child     text;
  i         integer;
begin
  -- Conti ---------------------------------------------------------------------
  insert into public.accounts (user_id, name, institution, account_type, default_bank_profile, color, icon, sort_order)
  values
    (p_user_id, 'ING Direct',     'ING',            'checking', 'ing',            '#FF6200', 'landmark', 10),
    (p_user_id, 'Revolut',        'Revolut',        'checking', 'revolut',        '#4F5BD5', 'credit-card', 20);

  insert into public.accounts (user_id, name, institution, account_type, default_bank_profile, color, icon, sort_order)
  values (p_user_id, 'Trade Republic', 'Trade Republic', 'broker', 'trade_republic', '#1F2937', 'trending-up', 30)
  returning id into v_tr;

  insert into public.investment_accounts (account_id, user_id, broker)
  values (v_tr, p_user_id, 'Trade Republic');

  -- Business ------------------------------------------------------------------
  insert into public.businesses (user_id, name, slug, description, color, icon, sort_order)
  values (p_user_id, 'VOXEL Studio', 'voxel-studio', 'Studio di design e vendita prodotti', '#7C6CF2', 'box', 10)
  returning id into v_voxel;

  insert into public.businesses (user_id, name, slug, description, color, icon, sort_order)
  values (p_user_id, 'Il Progettista Meccanico', 'il-progettista-meccanico', 'Canale YouTube', '#E5484D', 'youtube', 20)
  returning id into v_youtube;

  insert into public.businesses (user_id, name, slug, description, color, icon, sort_order)
  values (p_user_id, 'Altro', 'altro', 'Altre attività', '#8B8D98', 'briefcase', 90);

  -- Fonti di reddito ----------------------------------------------------------
  insert into public.income_sources (user_id, name, business_id, color, icon, sort_order) values
    (p_user_id, 'Stipendio',                         null,      '#30A46C', 'wallet',    10),
    (p_user_id, 'VOXEL Studio',                      v_voxel,   '#7C6CF2', 'box',       20),
    (p_user_id, 'YouTube — Il Progettista Meccanico', v_youtube, '#E5484D', 'youtube',   30),
    (p_user_id, 'Altri guadagni',                    null,      '#8B8D98', 'sparkles',  90);

  -- Categorie -----------------------------------------------------------------
  i := 0;
  for cat in
    select * from (values
      ('Casa',          'expense',    '#3E63DD', 'home',          array['Mutuo', 'Bollette', 'Manutenzione', 'Casa — altro']),
      ('Alimentazione', 'expense',    '#30A46C', 'utensils',      array['Spesa', 'Ristorante', 'Delivery', 'Bar']),
      ('Trasporti',     'expense',    '#F76B15', 'car',           array['Carburante', 'Auto', 'Trasporto pubblico', 'Parcheggio']),
      ('Shopping',      'expense',    '#D6409F', 'shopping-bag',  array['Abbigliamento', 'Elettronica', 'Acquisti online', 'Shopping — altro']),
      ('Svago',         'expense',    '#8E4EC6', 'gamepad-2',     array['Intrattenimento', 'Hobby', 'Gaming', 'Uscite']),
      ('Tecnologia',    'expense',    '#0090FF', 'cpu',           array['Hardware', 'Software', 'Servizi digitali']),
      ('Business',      'expense',    '#7C6CF2', 'briefcase',     array['VOXEL Studio', 'YouTube', 'Laboratorio', 'Materiali', 'Spedizioni', 'Marketing', 'Software', 'Attrezzatura']),
      ('Abbonamenti',   'expense',    '#12A594', 'repeat',        array[]::text[]),
      ('Salute',        'expense',    '#E5484D', 'heart-pulse',   array[]::text[]),
      ('Altro',         'expense',    '#8B8D98', 'circle-dashed', array[]::text[]),
      ('Stipendio',     'income',     '#30A46C', 'wallet',        array[]::text[]),
      ('Vendite',       'income',     '#7C6CF2', 'receipt',       array[]::text[]),
      ('YouTube',       'income',     '#E5484D', 'youtube',       array[]::text[]),
      ('Interessi e dividendi', 'income', '#12A594', 'percent',   array[]::text[]),
      ('Altre entrate', 'income',     '#8B8D98', 'sparkles',      array[]::text[]),
      ('Trasferimenti', 'transfer',   '#8B8D98', 'arrow-left-right', array['Giroconto']),
      ('Investimenti',  'investment', '#0D74CE', 'trending-up',   array['Versamenti', 'PAC'])
    ) as v(name, kind, color, icon, children)
  loop
    i := i + 10;
    insert into public.transaction_categories (user_id, name, kind, color, icon, is_system, sort_order)
    values (p_user_id, cat.name, cat.kind::public.category_kind, cat.color, cat.icon, true, i)
    returning id into v_parent;

    if cat.name = 'Abbonamenti' then
      v_subs := v_parent;
    end if;

    for child in select unnest(cat.children)
    loop
      insert into public.transaction_categories (user_id, parent_id, name, kind, color, icon, is_system, sort_order)
      values (p_user_id, v_parent, child, cat.kind::public.category_kind, cat.color, cat.icon, true, i);
    end loop;
  end loop;

  select c.id into v_invest
  from public.transaction_categories c
  join public.transaction_categories p on p.id = c.parent_id
  where c.user_id = p_user_id and p.name = 'Investimenti' and c.name = 'Versamenti';

  -- Regole di categorizzazione di base ---------------------------------------
  insert into public.categorization_rules
    (user_id, name, priority, origin, match_type, pattern, direction, set_type, set_nature, set_category_id, confidence)
  values
    (p_user_id, 'Spotify → Abbonamenti', 100, 'system', 'contains', 'spotify', 'out', 'expense', 'personal', v_subs, 0.95),
    (p_user_id, 'Netflix → Abbonamenti', 100, 'system', 'contains', 'netflix', 'out', 'expense', 'personal', v_subs, 0.95),
    (p_user_id, 'Trade Republic → Investimento', 50, 'system', 'contains', 'trade republic', 'out', 'investment', 'investment', v_invest, 0.90);
end;
$$;

-- Mai invocabile dal client: permetterebbe di scrivere dati per un altro user_id.
revoke execute on function public.seed_default_data(uuid) from public, anon, authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  perform public.seed_default_data(new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
