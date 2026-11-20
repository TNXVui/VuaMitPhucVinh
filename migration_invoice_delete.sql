-- VỰA MÍT PHÚC VINH
-- MỞ QUYỀN XÓA HÓA ĐƠN: admin xóa được tất cả, khách chỉ xóa hóa đơn của chính mình.
-- Chạy một lần trong Supabase > SQL Editor > New query.
-- ON DELETE CASCADE tự xóa các dòng invoice_items/complaints thuộc hóa đơn đó.
-- Bảng public.users và tài khoản Supabase Auth không bị xóa.

drop policy if exists "admin delete invoice" on public.invoices;
drop policy if exists "invoice delete own or admin" on public.invoices;

create policy "invoice delete own or admin"
on public.invoices
for delete
to authenticated
using (
  public.is_admin()
  or customer_phone = (
    select phone from public.users where id = auth.uid()
  )
);
