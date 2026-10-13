-- 015: скретч-карточки, заморозка абонемента, объявления, сообщения клиенту, усиление безопасности.
-- Существующие данные, роли и аккаунты не меняются.

-- =====================================================================================
-- 1. СКРЕТЧ-КАРТОЧКИ
-- =====================================================================================
-- Призы задаёт админ текстом. chance — шанс в процентах. Если сумма шансов < 100%, остаток = «без приза».
-- Карточка за регистрацию всегда выигрышная (выбор только среди призов, пропорционально шансам).
create table prizes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 80),
  chance numeric(6,3) not null default 0 check (chance >= 0 and chance <= 100),
  bonus int not null default 0 check (bonus between 0 and 100000),   -- >0: бонусы начисляются сразу автоматически
  stock int check (stock >= 0),                                        -- null = без ограничения количества
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now());
alter table prizes enable row level security;
create policy p_prizes_r on prizes for select to authenticated using (is_admin());
create policy p_prizes_w on prizes for all to authenticated using (is_admin()) with check (is_admin());

create table scratch_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('welcome','purchase','manual','birthday','referral')),
  note text,
  status text not null default 'new' check (status in ('new','opened','redeemed','expired')),
  won boolean, prize_id uuid references prizes(id) on delete set null, prize_title text, prize_bonus int not null default 0,
  code text, expires_at timestamptz,
  drawn_at timestamptz, seen_at timestamptz, redeemed_at timestamptz, redeemed_by uuid references profiles(id),
  created_at timestamptz not null default now());
create index scratch_cards_user on scratch_cards(user_id, created_at desc);
create unique index scratch_cards_code_open on scratch_cards(code) where status = 'opened' and code is not null;
alter table scratch_cards enable row level security;
create policy p_cards_r on scratch_cards for select to authenticated using (user_id = auth.uid() or is_staff());

insert into settings values ('card_welcome','1'),('card_on_purchase','0'),('card_on_annual','0'),('card_prize_days','30') on conflict do nothing;

create function _give_card(p_user uuid, p_source text, p_note text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into scratch_cards(user_id, source, note) values (p_user, p_source, left(p_note, 120)) returning id into v_id;
  perform _notify(p_user, 'scratch_card', '🎁 Новая подарочная карточка', 'Сотрите карточку и узнайте свой приз!', 'card:' || v_id, jsonb_build_object('card_id', v_id));
  return v_id;
end $$;

-- Стереть карточку: приз разыгрывается на сервере ОДИН раз (повторный вызов возвращает тот же результат).
create function scratch_card(p_card uuid) returns json language plpgsql security definer set search_path=public as $$
declare c scratch_cards; pr prizes; v_total numeric; v_r numeric; v_acc numeric := 0; v_code text; i int := 0; v_days int;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into c from scratch_cards where id = p_card and user_id = auth.uid() for update;
  if not found then raise exception 'Карточка не найдена'; end if;
  if c.drawn_at is null then
    select coalesce(sum(chance), 0) into v_total from prizes where active and chance > 0 and (stock is null or stock > 0);
    v_r := random() * case when c.source = 'welcome' or v_total > 100 then v_total else 100 end;
    if v_total > 0 then
      for pr in select * from prizes where active and chance > 0 and (stock is null or stock > 0) order by sort, created_at, id loop
        v_acc := v_acc + pr.chance;
        if v_r < v_acc then exit; end if;
        pr := null;
      end loop;
    end if;
    if pr.id is not null then
      select * into pr from prizes where id = pr.id for update;
      if pr.stock is not null then
        if pr.stock <= 0 then pr := null; else update prizes set stock = stock - 1 where id = pr.id; end if;
      end if;
    end if;
    if pr.id is null then
      update scratch_cards set won = false, prize_title = 'Повезёт в следующий раз', status = 'opened', drawn_at = now() where id = c.id;
    elsif pr.bonus > 0 then
      perform _grant(c.user_id, pr.bonus, 'accrual', 'Подарочная карточка: ' || pr.title, c.id, false);
      update scratch_cards set won = true, prize_id = pr.id, prize_title = pr.title, prize_bonus = pr.bonus, status = 'redeemed', drawn_at = now(), redeemed_at = now() where id = c.id;
    else
      select coalesce(nullif(value,'')::int, 30) into v_days from settings where key = 'card_prize_days';
      loop
        v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
        exit when not exists (select 1 from scratch_cards where code = v_code and status = 'opened');
        i := i + 1; if i > 50 then raise exception 'try later'; end if;
      end loop;
      update scratch_cards set won = true, prize_id = pr.id, prize_title = pr.title, status = 'opened', code = v_code,
        expires_at = now() + make_interval(days => greatest(coalesce(v_days, 30), 1)), drawn_at = now() where id = c.id;
    end if;
    insert into audit_logs(actor_id, action, entity, entity_id, details) values (auth.uid(), 'scratch', 'scratch_cards', c.id, jsonb_build_object('prize', pr.title));
  end if;
  select * into c from scratch_cards where id = p_card;
  return json_build_object('won', c.won, 'title', c.prize_title, 'bonus', c.prize_bonus, 'code', case when c.status = 'opened' then c.code end, 'expires_at', c.expires_at, 'status', c.status);
end $$;

create function card_seen(p_card uuid) returns void language sql security definer set search_path=public as
$$ update scratch_cards set seen_at = coalesce(seen_at, now()) where id = p_card and user_id = auth.uid() and drawn_at is not null $$;

create function give_card(p_client uuid, p_note text default null) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if not exists (select 1 from profiles where id = p_client and role = 'client') then raise exception 'Клиент не найден'; end if;  -- себе и сотрудникам нельзя
  perform _give_card(p_client, 'manual', coalesce(nullif(trim(p_note), ''), 'Подарок от Formula'));
  insert into audit_logs(actor_id, action, entity, entity_id) values (auth.uid(), 'give_card', 'profiles', p_client);
end $$;
create function give_card_all(p_note text default null) returns int language plpgsql security definer set search_path=public as $$
declare u uuid; n int := 0;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  for u in select id from profiles where role = 'client' loop perform _give_card(u, 'manual', coalesce(nullif(trim(p_note), ''), 'Подарок от Formula')); n := n + 1; end loop;
  insert into audit_logs(actor_id, action, entity, details) values (auth.uid(), 'give_card_all', 'profiles', jsonb_build_object('count', n));
  return n;
end $$;

-- Выдача приза на ресепшене по 6-значному коду
create function prize_preview(p_code text) returns json language plpgsql security definer set search_path=public as $$
declare c scratch_cards; v_name text;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into c from scratch_cards where code = trim(p_code) and status = 'opened';
  if not found then raise exception 'Код не найден или приз уже выдан'; end if;
  if c.expires_at < now() then raise exception 'Срок действия приза истёк'; end if;
  select full_name into v_name from profiles where id = c.user_id;
  return json_build_object('client', v_name, 'title', c.prize_title, 'expires_at', c.expires_at);
end $$;
create function redeem_prize(p_code text) returns text language plpgsql security definer set search_path=public as $$
declare c scratch_cards;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into c from scratch_cards where code = trim(p_code) and status = 'opened' for update;
  if not found then raise exception 'Код не найден или приз уже выдан'; end if;
  if c.expires_at < now() then update scratch_cards set status = 'expired' where id = c.id; raise exception 'Срок действия приза истёк'; end if;
  update scratch_cards set status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid() where id = c.id;
  insert into audit_logs(actor_id, action, entity, entity_id, details) values (auth.uid(), 'redeem_prize', 'scratch_cards', c.id, jsonb_build_object('prize', c.prize_title));
  return c.prize_title;
end $$;

create function card_stats() returns json language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return json_build_object('issued', (select count(*) from scratch_cards), 'opened', (select count(*) from scratch_cards where drawn_at is not null),
    'won', (select count(*) from scratch_cards where won), 'waiting', (select count(*) from scratch_cards where status = 'opened' and code is not null and expires_at > now()),
    'redeemed', (select count(*) from scratch_cards where status = 'redeemed' and prize_bonus = 0 and won));
end $$;

-- =====================================================================================
-- 2. ЗАМОРОЗКА АБОНЕМЕНТА
-- =====================================================================================
alter table plans add column if not exists freeze_days int check (freeze_days >= 0);   -- null = по умолчанию из настроек
insert into settings values ('freeze_max_days','30'),('freeze_min_days','3') on conflict do nothing;

create table membership_freezes (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  starts_on date not null, planned_end date not null, ended_on date, days int not null,
  created_at timestamptz not null default now());
create index membership_freezes_client on membership_freezes(client_id, created_at desc);
alter table membership_freezes enable row level security;
create policy p_freeze_r on membership_freezes for select to authenticated using (client_id = auth.uid() or is_staff());

create function _today() returns date language sql stable as $$ select (now() at time zone 'Asia/Almaty')::date $$;
-- сколько дней заморозки разрешено на текущий абонемент и сколько уже использовано
create function _freeze_limits(p_m memberships) returns json language plpgsql stable security definer set search_path=public as $$
declare v_max int; v_min int; v_used int;
begin
  select coalesce(pl.freeze_days, (select nullif(value,'')::int from settings where key = 'freeze_max_days'), 30) into v_max from (select 1) x left join plans pl on pl.id = p_m.plan_id;
  select coalesce((select nullif(value,'')::int from settings where key = 'freeze_min_days'), 1) into v_min;
  select coalesce(sum(case when ended_on is null then days else greatest(ended_on - starts_on, 0) end), 0) into v_used from membership_freezes where membership_id = p_m.id;
  return json_build_object('max', v_max, 'min', greatest(v_min, 1), 'used', v_used, 'left', greatest(v_max - v_used, 0));
end $$;

create function _notify_admins(p_type text, p_title text, p_msg text, p_key text, p_meta jsonb default '{}') returns void language sql security definer set search_path=public as $$
  insert into notifications(user_id, type, title, message, dedupe_key, metadata)
  select id, p_type, p_title, p_msg, p_key, p_meta from profiles where role in ('admin','dev')
  on conflict (user_id, dedupe_key) do nothing $$;

create function my_freeze() returns json language plpgsql stable security definer set search_path=public as $$
declare m memberships; f membership_freezes;
begin
  if auth.uid() is null then return null; end if;
  select * into m from memberships where client_id = auth.uid() and status = 'active' and ends_on > _today() order by ends_on desc limit 1;
  if not found then return json_build_object('membership', null); end if;
  select * into f from membership_freezes where membership_id = m.id and ended_on is null and planned_end > _today() order by created_at desc limit 1;
  return json_build_object('membership', json_build_object('plan', m.plan, 'ends_on', m.ends_on), 'limits', _freeze_limits(m),
    'active', case when f.id is null then null else json_build_object('starts_on', f.starts_on, 'until', f.planned_end, 'days', f.days) end);
end $$;

create function freeze_membership(p_days int) returns json language plpgsql security definer set search_path=public as $$
declare m memberships; l json; v_name text; v_until date;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into m from memberships where client_id = auth.uid() and status = 'active' and ends_on > _today() order by ends_on desc limit 1 for update;
  if not found then raise exception 'Нет активного абонемента'; end if;
  if exists (select 1 from membership_freezes where membership_id = m.id and ended_on is null and planned_end > _today()) then raise exception 'Абонемент уже заморожен'; end if;
  l := _freeze_limits(m);
  if (l->>'left')::int <= 0 then raise exception 'Дни заморозки по этому абонементу закончились'; end if;
  if p_days is null or p_days < (l->>'min')::int then raise exception 'Минимум % дн.', l->>'min'; end if;
  if p_days > (l->>'left')::int then raise exception 'Можно заморозить максимум на % дн.', l->>'left'; end if;
  v_until := _today() + p_days;
  insert into membership_freezes(membership_id, client_id, starts_on, planned_end, days) values (m.id, auth.uid(), _today(), v_until, p_days);
  update memberships set ends_on = ends_on + p_days where id = m.id;
  select full_name into v_name from profiles where id = auth.uid();
  perform _notify_admins('freeze', '❄️ Заморозка абонемента', format('%s заморозил(а) абонемент «%s» на %s дн. — до %s.', v_name, m.plan, p_days, to_char(v_until, 'DD.MM.YYYY')),
    'freeze:' || m.id || ':' || extract(epoch from now())::bigint, jsonb_build_object('client_id', auth.uid()));
  insert into audit_logs(actor_id, action, entity, entity_id, details) values (auth.uid(), 'freeze', 'memberships', m.id, jsonb_build_object('days', p_days));
  return json_build_object('until', v_until, 'ends_on', m.ends_on + p_days);
end $$;

-- Досрочная разморозка: неиспользованные дни возвращаются (абонемент заканчивается раньше на эти дни)
create function _unfreeze(p_client uuid, p_actor uuid) returns json language plpgsql security definer set search_path=public as $$
declare f membership_freezes; v_back int; v_name text;
begin
  select * into f from membership_freezes where client_id = p_client and ended_on is null and planned_end > _today() order by created_at desc limit 1 for update;
  if not found then raise exception 'Абонемент не заморожен'; end if;
  v_back := f.planned_end - _today();
  update membership_freezes set ended_on = _today() where id = f.id;
  update memberships set ends_on = ends_on - v_back where id = f.membership_id;
  select full_name into v_name from profiles where id = p_client;
  perform _notify_admins('freeze', '☀️ Абонемент разморожен', format('%s: заморозка завершена досрочно, возвращено %s дн.', v_name, v_back),
    'unfreeze:' || f.id, jsonb_build_object('client_id', p_client));
  if p_actor <> p_client then
    perform _notify(p_client, 'freeze', '☀️ Абонемент разморожен', 'Администратор завершил заморозку. Ждём вас на тренировке!', 'unfreeze-c:' || f.id);
  end if;
  insert into audit_logs(actor_id, action, entity, entity_id, details) values (p_actor, 'unfreeze', 'memberships', f.membership_id, jsonb_build_object('returned_days', v_back));
  return json_build_object('returned', v_back);
end $$;
create function unfreeze_membership() returns json language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'auth'; end if; return _unfreeze(auth.uid(), auth.uid()); end $$;
create function staff_unfreeze(p_client uuid) returns json language plpgsql security definer set search_path=public as $$
begin if not is_staff() then raise exception 'forbidden'; end if; return _unfreeze(p_client, auth.uid()); end $$;

-- =====================================================================================
-- 3. ОБЪЯВЛЕНИЯ (админ пишет прямо в приложении)
-- =====================================================================================
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 3000),
  pinned boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table announcements enable row level security;
create policy p_ann_r on announcements for select to authenticated using (active or is_admin());
create policy p_ann_w on announcements for all to authenticated using (is_admin()) with check (is_admin());
create function notify_announcement(p_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare a announcements; n int;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into a from announcements where id = p_id and active; if not found then raise exception 'Объявление не найдено или скрыто'; end if;
  insert into notifications(user_id, type, title, message, dedupe_key, metadata)
    select p.id, 'announcement', '📢 ' || left(a.title, 80), left(coalesce(nullif(a.body, ''), 'Новое объявление Formula'), 160), 'ann:' || a.id, jsonb_build_object('announcement_id', a.id)
    from profiles p where p.role = 'client'
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count; return n;
end $$;

-- =====================================================================================
-- 4. НАПИСАТЬ КЛИЕНТУ (сообщение сотрудника = тикет поддержки, клиент может ответить)
-- =====================================================================================
create function staff_message(p_client uuid, p_body text) returns uuid language plpgsql security definer set search_path=public as $$
declare p profiles; v_id uuid;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Напишите сообщение'; end if;
  select * into p from profiles where id = p_client; if not found then raise exception 'Клиент не найден'; end if;
  insert into support_tickets(user_id, type, category, description, status, client_name, phone)
    values (p.id, 'formula', 'message', '', 'in_progress', p.full_name, p.phone) returning id into v_id;
  insert into ticket_messages(ticket_id, author_id, from_staff, body) values (v_id, auth.uid(), true, left(trim(p_body), 2000));
  perform _notify(p.id, 'support_reply', '💬 Сообщение от Formula', left(trim(p_body), 140), 'msg:' || v_id, jsonb_build_object('ticket_id', v_id));
  insert into audit_logs(actor_id, action, entity, entity_id) values (auth.uid(), 'staff_message', 'support_tickets', v_id);
  return v_id;
end $$;

-- =====================================================================================
-- 5. Карточка при регистрации + карточки за покупку абонемента (настраивается в админке)
-- =====================================================================================
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare v_ref uuid; v_first boolean;
begin
  select not exists(select 1 from profiles where role in ('admin','dev')) into v_first;
  select id into v_ref from profiles where referral_code = upper(left(nullif(new.raw_user_meta_data->>'ref',''), 16));
  insert into profiles(id, full_name, phone, role, referred_by) values (new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(new.email,'@',1)), 60),
    left(norm_phone(new.raw_user_meta_data->>'phone'), 16), case when v_first then 'admin' else 'client' end, v_ref)
  on conflict (id) do nothing;
  insert into bonus_wallets(client_id) values (new.id) on conflict do nothing;
  if v_ref is not null then insert into referrals(referrer_id, referred_id) values (v_ref, new.id); end if;
  if not v_first and coalesce((select value from settings where key = 'card_welcome'), '1') = '1' then
    insert into scratch_cards(user_id, source, note) values (new.id, 'welcome', 'Подарок за регистрацию');
  end if;
  return new;
end $$;

create or replace function _sell(p_client uuid, p_plan text, p_price int, p_days int, p_annual boolean, p_plan_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare v_start date; v_id uuid; v_acc int; v_cards int;
begin
  if p_annual and exists(select 1 from memberships where client_id = p_client and annual and status = 'active' and ends_on > current_date + 300) then
    raise exception 'У клиента уже действует годовой абонемент'; end if;
  select greatest(current_date, coalesce(max(ends_on), current_date)) into v_start from memberships where client_id = p_client and status = 'active';
  update memberships set status = 'expired' where client_id = p_client and status = 'active';
  insert into memberships(client_id,plan,price,starts_on,ends_on,annual,plan_id) values (p_client,p_plan,p_price,current_date,v_start + p_days,p_annual,p_plan_id) returning id into v_id;
  if p_annual then v_acc := 10000; perform _grant(p_client, v_acc, 'annual', 'Годовой абонемент', v_id, true);
  else v_acc := floor(p_price * 0.05); perform _grant(p_client, v_acc, 'accrual', p_plan || ' · 5%', v_id, false); end if;
  perform _confirm_referral(p_client, v_id);
  v_cards := least(greatest(coalesce((select nullif(value,'')::int from settings where key = case when p_annual then 'card_on_annual' else 'card_on_purchase' end), 0), 0), 10);
  for i in 1..v_cards loop perform _give_card(p_client, 'purchase', p_plan); end loop;
  insert into audit_logs(actor_id,action,entity,entity_id,details) values (auth.uid(),'sell_membership','memberships',v_id,jsonb_build_object('client',p_client,'price',p_price,'annual',p_annual));
  return v_acc;
end $$;

-- =====================================================================================
-- 6. БЕЗОПАСНОСТЬ
-- =====================================================================================
-- 6.1 Цены тарифов, товары, категории и акции меняет только админ (раньше — и ресепшен)
drop policy if exists p_plans_w on plans;      create policy p_plans_w on plans for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists p_rewards_w on rewards;  create policy p_rewards_w on rewards for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists p_cat_w on categories;   create policy p_cat_w on categories for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists p_promos_w on promos;    create policy p_promos_w on promos for all to authenticated using (is_admin()) with check (is_admin());
create or replace function delete_reward(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update redemptions set status = 'cancelled' where reward_id = p_id and status = 'pending';
  update redemptions set reward_id = null where reward_id = p_id;
  delete from rewards where id = p_id;
  insert into audit_logs(actor_id,action,entity,entity_id) values (auth.uid(),'delete_reward','rewards',p_id);
end $$;

-- 6.2 Анонимный посетитель (без входа) не имеет доступа ни к одной таблице
revoke all on all tables in schema public from anon;
-- 6.3 Опасные права, которые не нужны приложению (TRUNCATE не подчиняется RLS)
revoke truncate, references, trigger on all tables in schema public from authenticated;
-- 6.4 Таблицы, в которые приложение пишет ТОЛЬКО через проверенные серверные функции
revoke insert, update, delete on profiles, memberships, bonus_wallets, bonus_transactions, redemptions, referrals, audit_logs,
  orders, order_items, support_tickets, notifications, ticket_messages, push_subscriptions, private_config, scratch_cards, membership_freezes from authenticated;
revoke select on private_config, push_subscriptions from authenticated;

-- 6.5 Функции: без входа можно вызвать только «Забыли пароль»; внутренние — никому
revoke execute on all functions in schema public from public, anon;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    if f.proname like '\_%' or f.proname in ('handle_new_user','sync_all_notifications','expire_bonus') then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
grant execute on function request_password_reset(text) to anon;
-- функции, которые нужны политикам RLS, остаются доступны вошедшим пользователям (выше)
-- 6.6 Новые таблицы/функции по умолчанию закрыты для анонимов
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
-- 6.7 Предупреждение линтера Supabase: фиксированный search_path
alter function norm_phone(text) set search_path = public;
alter function _today() set search_path = public;
