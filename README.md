# Vựa Mít Phúc Vinh

Ứng dụng PWA thuần HTML5 + Tailwind CDN + JavaScript ES6 + Supabase JS CDN. Không cần Node.js/npm/build.

## 1. Cấu trúc
- `index.html`: giao diện đăng nhập và ứng dụng.
- `styles.css`: giao diện responsive xanh rừng / glassmorphism.
- `config.js`: cấu hình Supabase (bắt buộc điền).
- `app.js`: xác thực, phân quyền, hóa đơn, xuất Excel/ảnh, khiếu nại.
- `manifest.json`, `service-worker.js`, `assets/icon.svg`: PWA.
- `supabase/schema.sql`: tạo bảng, trigger, RLS và hàm xóa tài khoản.

## 2. Cài đặt Supabase
1. Tạo project tại Supabase.
2. Mở SQL Editor, chạy toàn bộ `supabase/schema.sql`.
3. Mở `config.js`, thay `YOUR_SUPABASE_URL` và `YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY` bằng Project URL và anon/publishable key. Không dùng `service_role`.
4. Trong Authentication > Providers > Email, bật Email. Nếu muốn đăng ký và đăng nhập ngay không cần xác nhận, có thể tắt Confirm email trong giai đoạn thử nghiệm; khi triển khai thực tế nên bật xác nhận email.
5. Đăng ký tài khoản Admin bằng giao diện. Vào SQL Editor chạy:
   `update public.users set role='admin' where email='email-admin-cua-ban';`
   Đăng xuất rồi đăng nhập lại.
6. Tạo tài khoản khách hàng từ màn hình Đăng ký. Số điện thoại phải duy nhất.

**Nếu đã cài phiên bản cũ:** chạy lại các câu lệnh tạo policy/grant khiếu nại mới trong `supabase/schema.sql` (hoặc chạy lại toàn bộ file SQL) để bật quyền xóa khiếu nại cho admin.

## 3. Chạy
- Mở thư mục bằng Visual Studio Code.
- Mở `index.html` bằng Live Server (ví dụ `http://127.0.0.1:5500`).
- PWA/service worker cần localhost hoặc HTTPS. Không mở bằng `file://`.
- Để triển khai, tải toàn bộ thư mục lên host HTTPS (GitHub Pages, Netlify, Vercel static hosting).

## 4. Tính năng
- Đăng ký/đăng nhập Supabase Auth, hồ sơ, phân quyền admin/user.
- Thông báo: khách xem; admin thêm/sửa/xóa.
- Hóa đơn: khách chỉ xem hóa đơn theo số điện thoại hồ sơ; admin lọc ngày và điện thoại.
- Admin lập hóa đơn nhiều dòng; tự tính thành tiền/tổng tiền.
- Xuất XLSX, PNG; in bill khổ hẹp qua trình duyệt.
- Khiếu nại khách hàng; admin đánh dấu đã xử lý.
- Đổi tên, đổi mật khẩu, sáng/tối, yêu cầu quyền Notification, xóa tài khoản.
- PWA cài màn hình chính và cache tệp ứng dụng.

## 5. Lưu ý bảo mật và giới hạn
- Supabase Auth quản lý mật khẩu. Không lưu mật khẩu 6 ký tự vào bảng `users`. `password_pin` không được tạo vì lưu/nhân bản bí mật xác thực ở bảng ứng dụng là không an toàn; giới hạn 6 ký tự được kiểm tra ở giao diện và Supabase Auth phải được cấu hình mức tối thiểu 6 ký tự trong Authentication > Settings.
- Phân quyền admin được cấp thủ công bằng SQL; không có chức năng tự đăng ký admin.
- Trường phone là text để giữ số 0 đầu.
- Push notification khi PWA đóng cần Push API subscription, VAPID public/private key và server gửi push (Edge Function hoặc server riêng). Service worker trong bản này đã có handler `push`, nhưng không thể tự phát push nền chỉ bằng CDN/browser. Realtime + Notification API hoạt động khi trang đang mở.
- RLS dùng số điện thoại làm liên kết hóa đơn, vì vậy số điện thoại khách hàng phải duy nhất và không được cho khách tự sửa. Việc sửa số điện thoại nên do admin thực hiện sau khi kiểm tra danh tính; có thể mở rộng bằng luồng cập nhật riêng.
- Cần cấu hình SMTP/email provider nếu bật xác nhận email.
- Tailwind, Supabase, SheetJS, html2canvas và Google Fonts tải từ CDN, nên lần tải đầu cần internet.


## Cập nhật: thống kê và xóa hóa đơn

- Admin có nút **Thống kê** trong mục Hóa đơn: tổng tiền thu mua, số hóa đơn, trung bình mỗi hóa đơn, ngày có tổng tiền cao nhất và bảng/biểu đồ theo ngày.
- Admin có thể xóa từng hóa đơn hoặc xóa toàn bộ hóa đơn để reset thống kê.
- Khách hàng có thể xóa từng hóa đơn hoặc toàn bộ hóa đơn thuộc tài khoản của mình.
- Xóa hóa đơn sẽ xóa các dòng sản phẩm và khiếu nại gắn với hóa đơn (theo `ON DELETE CASCADE`), không xóa hồ sơ/tài khoản khách hàng trong `public.users` hoặc Supabase Auth.

### SQL cần chạy khi cập nhật dự án đã có dữ liệu

Mở Supabase → SQL Editor → New query, chạy toàn bộ file `supabase/migration_invoice_delete.sql` một lần. Đây là bước bắt buộc để RLS cho phép khách hàng xóa hóa đơn của chính họ; Admin vẫn có quyền xóa tất cả. Với cơ sở dữ liệu mới, chính sách này đã có trong `supabase/schema.sql`.
