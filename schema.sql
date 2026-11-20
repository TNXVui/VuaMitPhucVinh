-- VỰA MÍT PHÚC VINH — chạy toàn bộ trong Supabase SQL Editor.
-- Mật khẩu được Supabase Auth quản lý; KHÔNG lưu plaintext/password hash tự xử lý trong public.users.
create extension if not exists pgcrypto;

create table if not exists public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text not null default '',
 phone text not null unique,
 role text not null default 'user' check (role in ('admin','user')),
 created_at timestamptz not null default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 content text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(),
 invoice_code text not null unique,
 customer_phone text not null,
 customer_name text not null,
 customer_email text,
 admin_name text not null,
 total_amount numeric(14,2) not null default 0 check(total_amount>=0),
 status text not null default 'active' check(status in ('active','complained')),
 created_at timestamptz not null default now()
);
create table if not exists public.invoice_items (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.invoices(id) on delete cascade,
 stt integer not null,
 item_type text not null,
 quantity numeric(14,3) not null check(quantity>0),
 unit_price numeric(14,2) not null check(unit_price>=0),
 line_total numeric(14,2) not null check(line_total>=0)
);
create table if not exists public.complaints (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.invoices(id) on delete cascade,
 user_phone text not null,
 content text not null,
 status text not null default 'pending' check(status in ('pending','resolved')),
 created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.users where id=auth.uid() and role='admin') $$;

-- Tạo hồ sơ tự động khi đăng ký Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.users(id,email,full_name,phone,role)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),
        coalesce(new.raw_user_meta_data->>'phone',''),'user');
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Nếu tài khoản Auth cũ thiếu hồ sơ, quản trị viên có thể đồng bộ thủ công.
alter table public.users enable row level security;
alter table public.notifications enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.complaints enable row level security;

drop policy if exists "users read self or admin" on public.users;
create policy "users read self or admin" on public.users for select to authenticated
using(id=auth.uid() or public.is_admin());
drop policy if exists "users update self or admin" on public.users;
create policy "users update self or admin" on public.users for update to authenticated
using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());
-- Không cho khách tự nâng role: role phải giữ nguyên, admin có thể đổi role qua SQL/dashboard.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql as $$
begin
 if auth.uid() is not null and not public.is_admin() and new.role is distinct from old.role then
   raise exception 'Không được phép thay đổi quyền tài khoản';
 end if;
 return new;
end; $$;
drop trigger if exists protect_user_role on public.users;
create trigger protect_user_role before update on public.users for each row execute function public.prevent_role_escalation();

drop policy if exists "notifications readable" on public.notifications;
create policy "notifications readable" on public.notifications for select to authenticated using(true);
drop policy if exists "admin manage notifications" on public.notifications;
create policy "admin manage notifications" on public.notifications for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "invoice read own or admin" on public.invoices;
create policy "invoice read own or admin" on public.invoices for select to authenticated
using(public.is_admin() or customer_phone=(select phone from public.users where id=auth.uid()));
drop policy if exists "admin create invoice" on public.invoices;
create policy "admin create invoice" on public.invoices for insert to authenticated with check(public.is_admin());
drop policy if exists "admin update invoice" on public.invoices;
create policy "admin update invoice" on public.invoices for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admin delete invoice" on public.invoices;
drop policy if exists "invoice delete own or admin" on public.invoices;
create policy "invoice delete own or admin" on public.invoices for delete to authenticated
using(public.is_admin() or customer_phone=(select phone from public.users where id=auth.uid()));

drop policy if exists "items read own invoice or admin" on public.invoice_items;
create policy "items read own invoice or admin" on public.invoice_items for select to authenticated
using(public.is_admin() or exists(select 1 from public.invoices i join public.users u on u.phone=i.customer_phone where i.id=invoice_id and u.id=auth.uid()));
drop policy if exists "admin manage invoice items" on public.invoice_items;
create policy "admin manage invoice items" on public.invoice_items for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "complaint read own or admin" on public.complaints;
create policy "complaint read own or admin" on public.complaints for select to authenticated
using(public.is_admin() or user_phone=(select phone from public.users where id=auth.uid()));
drop policy if exists "customer create complaint" on public.complaints;
create policy "customer create complaint" on public.complaints for insert to authenticated
with check(user_phone=(select phone from public.users where id=auth.uid()) and exists(select 1 from public.invoices i where i.id=invoice_id and i.customer_phone=user_phone));
drop policy if exists "admin update complaint" on public.complaints;
create policy "admin update complaint" on public.complaints for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admin delete complaint" on public.complaints;
create policy "admin delete complaint" on public.complaints for delete to authenticated using(public.is_admin());

-- Xóa tài khoản hiện tại; ON DELETE CASCADE sẽ xóa hồ sơ liên quan.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
 delete from auth.users where id=auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

grant usage on schema public to authenticated;
grant select,update on public.users to authenticated;
grant select,insert,update,delete on public.notifications to authenticated;
grant select,insert,update,delete on public.invoices to authenticated;
grant select,insert,update,delete on public.invoice_items to authenticated;
grant select,insert,update,delete on public.complaints to authenticated;

-- TẠO ADMIN: đăng ký tài khoản bình thường trên ứng dụng, sau đó thay EMAIL bên dưới.
-- Chạy lệnh này bằng SQL Editor (quyền postgres), tuyệt đối không cho khách tự sửa role.
-- update public.users set role='admin' where email='admin@phucvinh.vn';


-- ADMIN: xóa tài khoản khách hàng khỏi Supabase Auth và hồ sơ public.users.
-- Không xóa hóa đơn cũ vì hóa đơn cần được giữ lại để lưu trữ.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then
    raise exception 'Bạn không có quyền quản trị';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Không thể tự xóa tài khoản quản trị đang đăng nhập';
  end if;

  if not exists(select 1 from public.users where id=p_user_id and role='user') then
    raise exception 'Không tìm thấy tài khoản khách hàng';
  end if;

  delete from auth.users where id=p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
