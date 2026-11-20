(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const cfg = window.APP_CONFIG || {};

  let sb, session, profile;
  let invoicesCache = [], customersCache = [], noticesCache = [], complaintsCache = [];
  let currentPage = 'notifications';

  const money = n => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + ' ' + (cfg.CURRENCY || '₫');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateText = d => new Date(d).toLocaleString('vi-VN');

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  
function openConfirmModal({
    title = 'Xác nhận',
    message = 'Bạn có chắc chắn muốn thực hiện thao tác này?',
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    danger = false,
    onConfirm
}) {
    $('#modalContent').innerHTML = `
        <div class="confirm-modal">
            <div class="confirm-icon ${danger ? 'danger' : ''}">
                ${danger ? '!' : '?'}
            </div>

            <h3>${esc(title)}</h3>
            <p class="confirm-message">${esc(message)}</p>

            <div class="confirm-actions">
                <button type="button" class="btn-ghost" id="confirmCancelBtn">
                    ${esc(cancelText)}
                </button>

                <button type="button"
                    class="${danger ? 'btn-danger' : 'btn-primary'}"
                    id="confirmOkBtn">
                    ${esc(confirmText)}
                </button>
            </div>
        </div>
    `;

    $('#modal').classList.remove('hidden');

    const cancelBtn = $('#confirmCancelBtn');
    const confirmBtn = $('#confirmOkBtn');

    cancelBtn.onclick = () => {
        $('#modal').classList.add('hidden');
    };

    confirmBtn.onclick = async () => {
        if (confirmBtn.disabled) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Đang xử lý...';

        try {
            await onConfirm?.();

            // Đóng hộp thoại sau khi xác nhận thành công
            $('#modal').classList.add('hidden');

        } catch (error) {
            console.error(error);

            toast(error.message || 'Có lỗi xảy ra.');

            // Mở khóa để người dùng có thể thử lại
            confirmBtn.disabled = false;
            confirmBtn.textContent = confirmText;
        }
    };
}

window.__pvConfirm = openConfirmModal;
window.__pvToast = toast;

function askConfirm(options = {}) {
    return new Promise(resolve => {
        openConfirmModal({
            ...options,

            onConfirm: async () => {
                try {
                    await options.onConfirm?.();
                    resolve(true);
                } catch (error) {
                    resolve(false);
                    throw error;
                }
            }
        });

        $('#confirmCancelBtn').onclick = () => {
            $('#modal').classList.add('hidden');
            resolve(false);
        };
    });
}


  window.__pvConfirm = openConfirmModal;
  window.__pvToast = toast;

  function askConfirm(options = {}) {
    return new Promise(resolve => {
      openConfirmModal({
        ...options,
        onConfirm: async () => {
          await options.onConfirm?.();
          resolve(true);
        }
      });
      const originalCancel = $('#confirmCancelBtn');
      if (originalCancel) originalCancel.onclick = () => { $('#modal').classList.add('hidden'); resolve(false); };
    });
  }

  function validConfig() {
    return cfg.SUPABASE_URL?.startsWith('https://') &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes('YOUR_') &&
      !cfg.SUPABASE_ANON_KEY.includes('YOUR_');
  }

  function showAuth() {
    $('#authView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
  }

  function showApp() {
    $('#authView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
  }

  function setTheme(light) {
    document.body.classList.toggle('light', !!light);
    localStorage.setItem('pv_theme', light ? 'light' : 'dark');
    if ($('#themeToggle')) $('#themeToggle').checked = !!light;
  }

  function roleUI() {
    const admin = profile.role === 'admin';

    $$('.admin-only').forEach(el => el.classList.toggle('hidden', !admin));

    $('#sideName').textContent = profile.full_name || profile.email;
    $('#sideRole').textContent = admin ? '🜲 Quản trị viên' : '👥︎ Khách hàng';

    const initials = (profile.full_name || 'PV')
      .trim().split(/\s+/).slice(-2)
      .map(x => x[0]).join('').toUpperCase();

    $('#sideAvatar').textContent = initials;
    $('#topAvatar').textContent = initials;
    $('#creatorName').textContent = profile.full_name || profile.email;

    $('#settingName').value = profile.full_name || '';
    $('#settingEmail').value = profile.email || '';
    $('#settingPhone').value = profile.phone || '';
  }

  async function refreshCurrentPage() {
    const b = $('#refreshPageBtn');

    if (b) {
      b.disabled = true;
      b.textContent = '↻ Đang tải...';
    }

    try {
      if (currentPage === 'notifications') await loadNotices();
      else if (currentPage === 'invoices') await loadInvoices();
      else if (currentPage === 'create') await loadCustomers();
      else if (currentPage === 'settings' && profile.role === 'admin') await loadComplaints();

      toast('Đã tải lại dữ liệu');
    } finally {
      if (b) {
        b.disabled = false;
        b.textContent = '↻ Tải lại';
      }
    }
  }

  function navigate(page) {
    if (page === 'create' && profile.role !== 'admin') page = 'notifications';

    currentPage = page;

    $$('.page').forEach(x => x.classList.remove('active'));
    $('#page-' + page)?.classList.add('active');

    $$('.nav-item[data-page]').forEach(x =>
      x.classList.toggle('active', x.dataset.page === page)
    );

    $('#pageTitle').textContent = ({
      notifications: 'Thông báo',
      invoices: 'Hóa đơn',
      create: 'Lập hóa đơn',
      settings: 'Cài đặt'
    })[page];

    if (page === 'notifications') loadNotices();
    if (page === 'invoices') loadInvoices();
    if (page === 'create') loadCustomers();
    if (page === 'settings' && profile.role === 'admin') loadComplaints();

    const refresh = $('#refreshPageBtn');
    if (refresh) refresh.onclick = refreshCurrentPage;
  }

  async function getProfile() {
    const { data: { user }, error } = await sb.auth.getUser();

    if (error || !user) return null;

    const { data, error: e } = await sb
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (e) {
      console.error(e);
      throw new Error('Không tải được hồ sơ. Hãy chạy SQL khởi tạo trước.');
    }

    return { ...data, email: user.email };
  }

  async function enterApp() {
    try {
      profile = await getProfile();

      if (!profile) return showAuth();

      showApp();
      roleUI();
      setTheme(localStorage.getItem('pv_theme') === 'light');
      navigate('notifications');
      subscribeRealtime();
      exposeInvoiceAddonState();

    } catch (e) {
      toast(e.message);
      console.error(e);
    }
  }

  function subscribeRealtime() {
    sb.channel('pv-live-' + profile.id)

      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications'
      }, () => {
        if (currentPage === 'notifications') loadNotices();
        notify('Có thông báo mới từ Vựa Mít Phúc Vinh');
      })

      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices'
      }, payload => {
        const customer = payload.new?.customer_phone || payload.old?.customer_phone;

        if (profile.role === 'admin' || customer === profile.phone) {
          if (currentPage === 'invoices') loadInvoices();

          document.dispatchEvent(
            new CustomEvent('pv-invoice-addon-refresh')
          );

          if (payload.eventType === 'INSERT' && customer === profile.phone) {
            notify('Bạn vừa nhận được hóa đơn mới');
          }
        }
      })

      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoice_items'
      }, () => {
        if (currentPage === 'invoices') loadInvoices();
      })

      .subscribe();
  }

  async function notify(message) {
    if (
      localStorage.getItem('pv_push') === 'on' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('Vựa Mít Phúc Vinh', {
          body: message,
          icon: './assets/icon.svg'
        });
      } catch { }
    }
  }

  async function loadNotices() {
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return toast(error.message);

    noticesCache = data || [];

    $('#noticeList').innerHTML = noticesCache.length
      ? noticesCache.map(n => `
        <article class="notice-card">
          <div class="notice-meta">${dateText(n.created_at)}</div>
          <h4>${esc(n.title)}</h4>
          <p>${esc(n.content)}</p>
          ${profile.role === 'admin' ? `
            <div class="card-actions">
              <button class="btn-ghost" data-edit-notice="${n.id}">✍︎ Sửa</button>
              <button class="btn-danger" data-delete-notice="${n.id}">🗑︎ Xóa</button>
            </div>` : ''}
        </article>
      `).join('')
      : '<div class="empty-state">Chưa có thông báo nào.</div>';
  }

  function openNoticeModal(n) {
    $('#modalContent').innerHTML = `
      <h3>${n ? 'Chỉnh sửa thông báo' : 'Tạo thông báo mới'}</h3>
      <form id="noticeForm">
        <label>Tiêu đề
          <input name="title" required maxlength="150" value="${esc(n?.title || '')}">
        </label>
        <label>Nội dung
          <textarea name="content" rows="5" required maxlength="5000">${esc(n?.content || '')}</textarea>
        </label>
        <button class="btn-primary">💾︎ Lưu thông báo</button>
      </form>
    `;

    $('#modal').classList.remove('hidden');

    $('#noticeForm').onsubmit = async e => {
      e.preventDefault();

      const f = new FormData(e.target);

      const v = {
        title: f.get('title').trim(),
        content: f.get('content').trim()
      };

      const q = n
        ? sb.from('notifications').update(v).eq('id', n.id)
        : sb.from('notifications').insert(v);

      const { error } = await q;

      if (error) return toast(error.message);

      $('#modal').classList.add('hidden');
      toast('Đã lưu thông báo');
      loadNotices();
    };
  }

  async function loadInvoices() {
    let q = sb
      .from('invoices')
      .select('*,invoice_items(*)')
      .order('created_at', { ascending: false });

    if (profile.role === 'admin') {
      // ADMIN: Không hiển thị hóa đơn Admin đã xóa
      q = q.eq('admin_deleted', false);

      const from = $('#filterFrom').value;
      const to = $('#filterTo').value;
      const phone = $('#filterPhone').value.trim();

      if (from) q = q.gte('created_at', from + 'T00:00:00');
      if (to) q = q.lte('created_at', to + 'T23:59:59');
      if (phone) q = q.ilike('customer_phone', `%${phone}%`);

    } else {
      // KHÁCH HÀNG: Không hiển thị hóa đơn khách hàng đã xóa
      q = q
        .eq('customer_phone', profile.phone)
        .eq('customer_deleted', false);
    }

    const { data, error } = await q;

    if (error) {
      console.error('Lỗi tải hóa đơn:', error);
      return toast(error.message);
    }

    invoicesCache = data || [];

    $('#invoiceCount').textContent = invoicesCache.length + ' hóa đơn';

    $('#invoiceList').innerHTML = invoicesCache.length
      ? invoicesCache.map(i => `
        <article class="invoice-card">
          <div>
            <div class="flex gap-2 items-center flex-wrap">
              <span class="status ${i.status === 'complained' ? 'complained' : ''}">
                ${i.status === 'complained' ? 'Đang có khiếu nại' : 'Đã ghi nhận'}
              </span>
              <span class="notice-meta">${dateText(i.created_at)}</span>
            </div>
            <h4>${esc(i.invoice_code)}</h4>
            <p>
              ${esc(i.customer_name)} · ${esc(i.customer_phone)}
              ${profile.role === 'admin' ? '· Người lập: ' + esc(i.admin_name) : ''}
            </p>
            <p>${(i.invoice_items || []).length} dòng sản phẩm</p>
          </div>
          <div>
            <div class="invoice-amount">${money(i.total_amount)}</div>
            <div class="invoice-actions">
              <button class="btn-ghost" data-view="${i.id}">ⓘ Chi tiết</button>
              <button class="btn-ghost" data-excel="${i.id}">▤ Excel</button>
              <button class="btn-ghost" data-image="${i.id}">🖾 Ảnh</button>
              ${profile.role === 'admin'
          ? `<button class="btn-ghost" data-print="${i.id}">🖶 In bill</button>`
          : `<button class="btn-secondary" data-complain="${i.id}">✉ Khiếu nại</button>`}
            </div>
          </div>
        </article>
      `).join('')
      : '<div class="empty-state">Chưa có hóa đơn phù hợp.</div>';

    exposeInvoiceAddonState();
  }

  function invoiceMarkup(inv) {
    const rows = (inv.invoice_items || []).sort((a, b) => a.stt - b.stt);

    return `
      <div class="invoice-export" style="background:#fff;color:#17251b;padding:clamp(12px,3vw,25px);width:100%;max-width:720px;box-sizing:border-box;font-family:Arial">
        <div style="text-align:center">
          <h2 style="margin:0;color:#1b4332">VỰA MÍT PHÚC VINH</h2>
          <p>HÓA ĐƠN THU MUA</p>
        </div>
        <hr>
        <p><b>Mã hóa đơn:</b> ${esc(inv.invoice_code)}</p>
        <p><b>Khách hàng:</b> ${esc(inv.customer_name)}</p>
        <p><b>Số điện thoại:</b> ${esc(inv.customer_phone)}</p>
        <p><b>Email:</b> ${esc(inv.customer_email || '')}</p>
        <p><b>Ngày lập:</b> ${dateText(inv.created_at)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:18px">
          <thead>
            <tr>
              <th style="text-align:left;border-bottom:1px solid #aaa;padding:8px">STT</th>
              <th style="text-align:left;border-bottom:1px solid #aaa">Loại</th>
              <th style="text-align:right;border-bottom:1px solid #aaa">Số lượng</th>
              <th style="text-align:right;border-bottom:1px solid #aaa">Đơn giá</th>
              <th style="text-align:right;border-bottom:1px solid #aaa">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="padding:8px;border-bottom:1px solid #ddd">${r.stt}</td>
                <td style="border-bottom:1px solid #ddd">${esc(r.item_type)}</td>
                <td style="text-align:right;border-bottom:1px solid #ddd">${r.quantity}</td>
                <td style="text-align:right;border-bottom:1px solid #ddd">${money(r.unit_price)}</td>
                <td style="text-align:right;border-bottom:1px solid #ddd">${money(r.line_total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <h3 style="text-align:right;color:#1b4332">TỔNG TIỀN: ${money(inv.total_amount)}</h3>
        <p style="text-align:right;margin-top:35px">Người lập hóa đơn: <b>${esc(inv.admin_name)}</b></p>
        <p style="text-align:center;margin-top:35px">Cảm ơn quý khách!</p>
      </div>
    `;
  }

  function findInvoice(id) {
    return invoicesCache.find(x => String(x.id) === String(id));
  }

  function showInvoice(inv) {
    $('#modalContent').innerHTML = `<h3>Chi tiết hóa đơn</h3>${invoiceMarkup(inv)}`;
    $('#modal').classList.remove('hidden');
  }

  function exportExcel(inv) {
    const rows = [
      ['VỰA MÍT PHÚC VINH'],
      ['Mã hóa đơn', inv.invoice_code],
      ['Khách hàng', inv.customer_name],
      ['Số điện thoại', inv.customer_phone],
      ['Ngày lập', dateText(inv.created_at)],
      [],
      ['STT', 'Loại', 'Số lượng', 'Đơn giá', 'Thành tiền'],
      ...(inv.invoice_items || []).map(x => [
        x.stt, x.item_type, x.quantity, x.unit_price, x.line_total
      ]),
      [],
      ['', '', '', '', 'TỔNG TIỀN', inv.total_amount]
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, 'Hoa don');
    XLSX.writeFile(wb, `${inv.invoice_code}.xlsx`);
  }

  async function exportImage(inv) {
    const holder = document.createElement('div');

    holder.style.cssText = 'position:fixed;left:-10000px;top:0';
    holder.innerHTML = invoiceMarkup(inv);
    document.body.appendChild(holder);

    try {
      const canvas = await html2canvas(holder.firstElementChild, {
        scale: 2,
        backgroundColor: '#ffffff'
      });

      const a = document.createElement('a');
      a.download = `${inv.invoice_code}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();

    } catch (e) {
      toast('Không thể xuất ảnh: ' + e.message);
    } finally {
      holder.remove();
    }
  }



function printInvoice(inv) {
    const rows = (inv.invoice_items || [])
        .sort((a, b) => a.stt - b.stt)
        .map((r, i) => `
            <div class="item">
                <div class="item-name">
                    ${i + 1}. ${esc(r.item_type)}
                </div>
                <div class="item-info">
                    <span>${r.quantity} × ${money(r.unit_price)}</span>
                    <b>${money(r.line_total)}</b>
                </div>
            </div>
        `).join('');

    $('#printArea').innerHTML = `
        <style>
            @media print {
                @page {
                    size: 80mm auto;
                    margin: 2mm;
                }

                body {
                    margin: 0 !important;
                    background: white !important;
                }

                .print-area {
                    display: block !important;
                    width: 72mm !important;
                    max-width: 72mm !important;
                    margin: 0 auto !important;
                    padding: 0 !important;
                    color: #000 !important;
                    font-family: Arial, sans-serif !important;
                    font-size: 11px !important;
                    line-height: 1.4 !important;
                    box-sizing: border-box !important;
                }

                .print-area * {
                    box-sizing: border-box !important;
                }

                .receipt-title {
                    text-align: center;
                    font-size: 17px;
                    font-weight: bold;
                    margin-bottom: 3px;
                }

                .receipt-subtitle {
                    text-align: center;
                    font-size: 12px;
                    margin-bottom: 8px;
                }

                .receipt-info {
                    border-top: 1px dashed #000;
                    border-bottom: 1px dashed #000;
                    padding: 6px 0;
                    overflow-wrap: anywhere;
                }

                .receipt-info p {
                    margin: 3px 0;
                }

                .item-list {
                    margin-top: 8px;
                }

                .item {
                    padding: 6px 0;
                    border-bottom: 1px dashed #999;
                }

                .item-name {
                    font-weight: bold;
                    font-size: 12px;
                    overflow-wrap: anywhere;
                }

                .item-info {
                    display: flex;
                    justify-content: space-between;
                    gap: 5px;
                    margin-top: 3px;
                    font-size: 11px;
                }

                .item-info b {
                    text-align: right;
                    white-space: nowrap;
                }

                .receipt-total {
                    display: flex;
                    justify-content: space-between;
                    gap: 5px;
                    font-size: 14px;
                    font-weight: bold;
                    margin-top: 10px;
                    padding: 7px 0;
                    border-top: 1px solid #000;
                    border-bottom: 1px dashed #000;
                }

                .receipt-admin {
                    text-align: center;
                    margin-top: 15px;
                }

                .receipt-thanks {
                    text-align: center;
                    margin-top: 12px;
                    font-weight: bold;
                }
            }
        </style>

        <div class="receipt">
            <div class="receipt-title">VỰA MÍT PHÚC VINH</div>
            <div class="receipt-subtitle">HÓA ĐƠN THU MUA</div>

            <div class="receipt-info">
                <p><b>Mã hóa đơn:</b> ${esc(inv.invoice_code)}</p>
                <p><b>Khách hàng:</b> ${esc(inv.customer_name)}</p>
                <p><b>SĐT:</b> ${esc(inv.customer_phone)}</p>
                <p><b>Email:</b> ${esc(inv.customer_email || '')}</p>
                <p><b>Ngày lập:</b> ${dateText(inv.created_at)}</p>
            </div>

            <div class="item-list">
                ${rows}
            </div>

            <div class="receipt-total">
                <span>TỔNG TIỀN</span>
                <span>${money(inv.total_amount)}</span>
            </div>

            <div class="receipt-admin">
                Người lập hóa đơn:<br>
                <b>${esc(inv.admin_name)}</b>
            </div>

            <div class="receipt-thanks">
                Cảm ơn quý khách!
            </div>
        </div>
    `;

    window.print();
}



  function addItemRow() {
    const body = $('#itemRows');
    const idx = body.children.length + 1;
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${idx}</td>
      <td><input class="item-type" placeholder="Loại trái" required></td>
      <td><input class="item-qty" type="number" min="0.001" step="any" value="" required></td>
      <td><input class="item-price" type="number" min="0" step="any" value="" required></td>
      <td class="row-total">0 ₫</td>
      <td><button type="button" class="remove-row">×</button></td>
    `;

    body.appendChild(tr);

    tr.querySelectorAll('input').forEach(x => x.addEventListener('input', recalc));

    tr.querySelector('.remove-row').onclick = () => {
      tr.remove();
      renumber();
      recalc();
    };

    recalc();
  }

  function renumber() {
    $$('#itemRows tr').forEach((tr, i) => {
      tr.cells[0].textContent = i + 1;
    });
  }

  function recalc() {
    let total = 0;

    $$('#itemRows tr').forEach(tr => {
      const q = Number(tr.querySelector('.item-qty').value) || 0;
      const p = Number(tr.querySelector('.item-price').value) || 0;
      const v = q * p;

      tr.querySelector('.row-total').textContent = money(v);
      total += v;
    });

    $('#grandTotal').textContent = money(total);
  }


  async function loadAdminCustomers() {
    if (profile.role !== 'admin') return;

    const { data, error } = await sb
      .from('users')
      .select('id,email,full_name,phone,created_at,role')
      .eq('role', 'user')
      .order('created_at', { ascending: false });

    if (error) return toast(error.message);
    customersCache = data || [];
    openCustomerManager(false);
  }

  function openCustomerManager(open = true) {
    if (!open) return;

    const list = customersCache || [];
    $('#modalContent').innerHTML = `
      <div class="customer-manager">
        <div class="customer-manager-head">
          <div>
            <p class="eyebrow">QUẢN LÝ KHÁCH HÀNG</p>
            <h3>Tài khoản khách hàng</h3>
            <p class="muted">${list.length} tài khoản đang có trong hệ thống</p>
          </div>
          <div class="customer-manager-count">${list.length}</div>
        </div>
        <div class="customer-admin-search">
          <span>⌕</span><input id="adminCustomerSearch" placeholder="Tìm theo họ tên, email hoặc số điện thoại...">
        </div>
        <div id="adminCustomerList" class="admin-customer-list"></div>
      </div>
    `;
    $('#modal').classList.remove('hidden');
    renderAdminCustomers();
    $('#adminCustomerSearch').oninput = renderAdminCustomers;
  }

  function renderAdminCustomers() {
    const list = $('#adminCustomerList');
    if (!list) return;
    const keyword = ($('#adminCustomerSearch')?.value || '').trim().toLocaleLowerCase('vi');
    const rows = customersCache.filter(c =>
      [c.full_name, c.email, c.phone].some(v => String(v || '').toLocaleLowerCase('vi').includes(keyword))
    );

    list.innerHTML = rows.length ? rows.map(c => {
      const initials = (c.full_name || c.email || 'K').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase();
      return `
        <article class="admin-customer-card">
          <div class="admin-customer-avatar">${esc(initials)}</div>
          <div class="admin-customer-main">
            <div class="admin-customer-title"><b>${esc(c.full_name || 'Chưa cập nhật họ tên')}</b><span class="customer-status">Khách hàng</span></div>
            <div class="admin-customer-info"><span>✉ ${esc(c.email || 'Chưa có email')}</span><span>☎ ${esc(c.phone || 'Chưa có SĐT')}</span></div>
            <small>Tham gia: ${dateText(c.created_at)}</small>
          </div>
          <div class="admin-customer-actions">
            <button class="btn-ghost" data-admin-edit-customer="${esc(c.id)}">✎ Sửa</button>
            <button class="btn-danger" data-admin-delete-customer="${esc(c.id)}">Xóa</button>
          </div>
        </article>`;
    }).join('') : '<div class="empty-state">Không tìm thấy tài khoản khách hàng.</div>';
  }

  function openEditCustomer(c) {
    $('#modalContent').innerHTML = `
      <div class="customer-edit-modal">
        <p class="eyebrow">CHỈNH SỬA TÀI KHOẢN</p>
        <h3>${esc(c.full_name || 'Khách hàng')}</h3>
        <div class="account-summary-mini">
          <div class="admin-customer-avatar">${esc((c.full_name || 'K').trim().charAt(0).toUpperCase())}</div>
          <div><b>${esc(c.email || 'Chưa có email')}</b><small>Tài khoản Supabase Auth</small></div>
        </div>
        <form id="adminCustomerForm" class="stack-form">
          <label>Họ và tên<input id="adminEditName" value="${esc(c.full_name || '')}" maxlength="100" required></label>
          <label>Số điện thoại<input id="adminEditPhone" value="${esc(c.phone || '')}" maxlength="30" required></label>
          <label>Email đăng nhập<input value="${esc(c.email || '')}" disabled></label>
          <div class="password-notice"><span>🔒</span><div><b>Mật khẩu</b><small>Không thể xem mật khẩu của khách hàng!</small></div></div>
          <div class="edit-customer-actions"><button type="button" class="btn-ghost" id="cancelAdminCustomerEdit">Hủy</button><button class="btn-primary">Lưu thay đổi</button></div>
        </form>
      </div>
    `;
    $('#adminCustomerForm').onsubmit = async e => {
      e.preventDefault();
      const name = $('#adminEditName').value.trim();
      const phone = $('#adminEditPhone').value.trim();
      if (!name || !phone) return toast('Họ tên và số điện thoại không được để trống.');
      const save = e.submitter;
      save.disabled = true;
      const { error } = await sb.from('users').update({ full_name: name, phone }).eq('id', c.id).eq('role', 'user');
      if (error) { save.disabled = false; return toast(error.message); }
      const idx = customersCache.findIndex(x => x.id === c.id);
      if (idx >= 0) customersCache[idx] = { ...customersCache[idx], full_name: name, phone };
      toast('Đã cập nhật thông tin khách hàng');
      openCustomerManager(true);
    };
    $('#cancelAdminCustomerEdit').onclick = () => openCustomerManager(true);
  }

  function deleteAdminCustomer(c) {
    openConfirmModal({
      title: 'Xóa tài khoản khách hàng?',
      message: `Tài khoản ${c.full_name || c.email || 'khách hàng'} sẽ bị xóa vĩnh viễn khỏi hệ thống. Các hóa đơn cũ vẫn được giữ lại để lưu trữ.`,
      confirmText: 'Xóa tài khoản',
      danger: true,
      onConfirm: async () => {
        const { error } = await sb.rpc('admin_delete_user', { p_user_id: c.id });
        if (error) return toast('Không thể xóa tài khoản: ' + error.message);
        customersCache = customersCache.filter(x => x.id !== c.id);
        $('#modal').classList.add('hidden');
        toast('Đã xóa tài khoản khách hàng');
      }
    });
  }

  async function loadCustomers() {
    const { data, error } = await sb
      .from('users')
      .select('id,email,full_name,phone')
      .eq('role', 'user')
      .order('full_name');

    if (error) return toast(error.message);

    customersCache = data || [];

    renderCustomerOptions();

    $('#customerSelect').onchange = updateCustomerSummary;

    $('#itemRows').innerHTML = '';
    addItemRow();
  }

  function renderCustomerOptions() {
    const search = ($('#customerSearch')?.value || '').trim().toLocaleLowerCase('vi');
    const select = $('#customerSelect');
    const selected = select.value;

    const filtered = customersCache.filter(c =>
      [c.full_name, c.phone, c.email].some(v =>
        String(v || '').toLocaleLowerCase('vi').includes(search)
      )
    );

    select.innerHTML =
      '<option value="">Chọn khách hàng...</option>' +
      filtered.map(c =>
        `<option value="${esc(c.id)}">${esc(c.full_name)} · ${esc(c.phone)} · ${esc(c.email)}</option>`
      ).join('');

    if (filtered.some(c => String(c.id) === selected)) {
      select.value = selected;
    } else if (search && filtered.length === 1) {
      select.value = String(filtered[0].id);
    } else {
      select.value = '';
    }

    updateCustomerSummary();
  }


  function updateCustomerSummary() {
    const select = $('#customerSelect');
    const c = customersCache.find(x =>
      String(x.id) === String(select?.value || '')
    );
    const summary = $('#customerSummary');

    if (!summary) return;

    if (!c) {
      summary.classList.remove('customer-found');
      summary.textContent = 'Thông tin khách hàng sẽ hiển thị tại đây.';
      return;
    }

    const search = ($('#customerSearch')?.value || '').trim();

    summary.classList.add('customer-found');
    summary.innerHTML = `
    <span class="customer-found-icon">✓</span>
    <span>
      <strong class="customer-found-title">Đã tìm thấy khách hàng</strong>
      <br>
      <b>${esc(c.full_name)}</b>
      <br>
      <span>📞 ${esc(c.phone || 'Chưa có SĐT')}</span>
      <br>
      <span>✉ ${esc(c.email || 'Chưa có email')}</span>
    </span>
  `;
  }


function normalizeCustomerText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function highlightCustomerText(text, keyword) {
  const safeText = esc(text);
  const key = String(keyword || '').trim();

  if (!key) return safeText;

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedKey})`, 'gi');

  return safeText.replace(regex, '<mark>$1</mark>');
}

function renderCustomerSearchResults(showAll = false) {
  const input = $('#customerSearch');
  const select = $('#customerSelect');
  const results = $('#customerSearchResults');

  if (!input || !select || !results) return;

  const keyword = input.value.trim();
  const normalized = normalizeCustomerText(keyword);

  if (!showAll && !normalized) {
    results.classList.add('hidden');
    $('#showAllCustomersBtn')?.setAttribute('aria-expanded', 'false');
    return;
  }

  const filtered = customersCache.filter(c => {
    if (!normalized) return true;

    return [
      c.full_name,
      c.phone,
      c.email
    ].some(value =>
      normalizeCustomerText(value).includes(normalized)
    );
  });

  results.innerHTML = `
    <div class="customer-search-heading">
      <span>${normalized ? 'KẾT QUẢ TÌM KIẾM' : 'TẤT CẢ KHÁCH HÀNG'}</span>
      <span>${filtered.length} khách hàng</span>
    </div>

    ${
      filtered.length
        ? filtered.map(c => `
          <button
            type="button"
            class="customer-search-item"
            data-customer-id="${esc(c.id)}"
            role="option"
            aria-selected="false"
          >
            <span class="customer-result-avatar">
              ${esc((c.full_name || 'K').trim().charAt(0).toLocaleUpperCase('vi'))}
            </span>

            <span class="customer-result-copy">
              <strong>${highlightCustomerText(c.full_name || 'Chưa có tên', keyword)}</strong>
              <span>☎ ${highlightCustomerText(c.phone || 'Chưa có SĐT', keyword)}</span>
              <small>${highlightCustomerText(c.email || 'Chưa có email', keyword)}</small>
            </span>

            <span class="customer-result-enter">↵</span>
          </button>
        `).join('')
        : `
          <div class="customer-search-empty">
            <b>Không tìm thấy khách hàng</b>
            <span>Thử tên, số điện thoại hoặc email khác nhé.</span>
          </div>
        `
    }
  `;

  results.classList.remove('hidden');
  $('#showAllCustomersBtn')?.setAttribute('aria-expanded', 'true');

  results.querySelectorAll('.customer-search-item').forEach(item => {
    item.addEventListener('click', () => {
      const customer = customersCache.find(
        c => String(c.id) === String(item.dataset.customerId)
      );

      if (!customer) return;

      select.value = String(customer.id);
      input.value = customer.full_name || '';

      results.classList.add('hidden');
      $('#showAllCustomersBtn')?.setAttribute('aria-expanded', 'false');

      updateCustomerSummary();
    });
  });
}




  function renderCustomerOptions() {
    const search = ($('#customerSearch')?.value || '').trim().toLocaleLowerCase('vi');
    const select = $('#customerSelect');
    const selected = select.value;

    const filtered = customersCache.filter(c =>
      [c.full_name, c.phone, c.email].some(v =>
        String(v || '').toLocaleLowerCase('vi').includes(search)
      )
    );

    select.innerHTML =
      '<option value="">Chọn khách hàng...</option>' +
      filtered.map(c =>
        `<option value="${c.id}">${esc(c.full_name)} · ${esc(c.phone)}</option>`
      ).join('');

    if (filtered.some(c => String(c.id) === selected)) {
      select.value = selected;
    }
  }

  async function saveInvoice() {
    const c = customersCache.find(x => x.id === $('#customerSelect').value);

    if (!c) return toast('Vui lòng chọn khách hàng.');

    const rows = $$('#itemRows tr').map((tr, i) => ({
      stt: i + 1,
      item_type: tr.querySelector('.item-type').value.trim(),
      quantity: Number(tr.querySelector('.item-qty').value),
      unit_price: Number(tr.querySelector('.item-price').value)
    }));

    if (
      !rows.length ||
      rows.some(r =>
        !r.item_type ||
        !(r.quantity > 0) ||
        r.unit_price < 0 ||
        !Number.isFinite(r.quantity + r.unit_price)
      )
    ) {
      return toast('Vui lòng kiểm tra các dòng sản phẩm.');
    }

    const total = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);

    const code = 'PV-' +
      new Date().toISOString().slice(0, 10).replaceAll('-', '') +
      '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

    $('#saveInvoiceBtn').disabled = true;

    try {
      const { data: inv, error } = await sb
        .from('invoices')
        .insert({
          invoice_code: code,
          customer_phone: c.phone,
          customer_name: c.full_name,
          customer_email: c.email,
          admin_name: profile.full_name,
          total_amount: total,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      const items = rows.map(r => ({
        ...r,
        invoice_id: inv.id,
        line_total: r.quantity * r.unit_price
      }));

      const { error: e2 } = await sb
        .from('invoice_items')
        .insert(items);

      if (e2) {
        await sb.from('invoices').delete().eq('id', inv.id);
        throw e2;
      }

      toast('Đã tạo hóa đơn ' + code);

      $('#customerSelect').value = '';
      $('#customerSummary').textContent = 'Thông tin khách hàng sẽ hiển thị tại đây.';
      $('#itemRows').innerHTML = '';

      addItemRow();
      navigate('invoices');

      document.dispatchEvent(new CustomEvent('pv-invoice-addon-refresh'));

    } catch (e) {
      toast('Lỗi lưu hóa đơn: ' + e.message);
    } finally {
      $('#saveInvoiceBtn').disabled = false;
    }
  }

  function openComplaint(inv) {
    $('#modalContent').innerHTML = `
      <h3>Gửi khiếu nại</h3>
      <p class="muted text-sm mb-4">
        Hóa đơn ${esc(inv.invoice_code)} · ${money(inv.total_amount)}
      </p>
      <form id="complaintForm">
        <label>Nội dung khiếu nại
          <textarea name="content" rows="5" maxlength="3000" required
            placeholder="Mô tả phần bạn cho rằng chưa chính xác..."></textarea>
        </label>
        <button class="btn-primary">⚠ Gửi khiếu nại</button>
      </form>
    `;

    $('#modal').classList.remove('hidden');

    $('#complaintForm').onsubmit = async e => {
      e.preventDefault();

      const content = new FormData(e.target).get('content').trim();

      const { error } = await sb.from('complaints').insert({
        invoice_id: inv.id,
        user_phone: profile.phone,
        content
      });

      if (error) return toast(error.message);

      await sb.from('invoices')
        .update({ status: 'complained' })
        .eq('id', inv.id);

      $('#modal').classList.add('hidden');
      toast('Đã gửi khiếu nại đến quản trị viên');
      loadInvoices();
    };
  }

  async function loadComplaints() {
    const list = $('#complaintList');
    const btn = $('#refreshComplaints');

    if (!list) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Đang tải...';
    }

    list.innerHTML = '<p>Đang tải khiếu nại...</p>';

    try {
      const { data, error } = await sb
        .from('complaints')
        .select(`
          *,
          invoices(
            id,
            invoice_code,
            customer_name,
            customer_phone,
            total_amount,
            invoice_items(
              id,
              stt,
              item_type,
              quantity,
              unit_price,
              line_total
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || !data.length) {
        list.innerHTML = '<p class="muted">Chưa có khiếu nại.</p>';
        return;
      }

      list.innerHTML = data.map(c => {
        const inv = c.invoices;
        const items = [...(inv?.invoice_items || [])]
          .sort((a, b) => a.stt - b.stt);

        return `
          <div class="complaint-row" data-id="${c.id}">
            <div class="complaint-header">
              <b>${esc(inv?.invoice_code || 'Hóa đơn')} · ${esc(c.user_phone)}</b>
              <span class="status">
                ${c.status === 'resolved' ? 'Đã xử lý' : 'Chờ xử lý'}
              </span>
            </div>

            <p><b>Nội dung khách hàng khiếu nại:</b></p>
            <p class="complaint-content">${esc(c.content)}</p>

            <p><b>Thông tin hóa đơn:</b></p>

            <div class="complaint-invoice-editor">
              ${items.map(r => `
                <div class="complaint-item-row" data-item-id="${r.id}">
                  <label>Loại sản phẩm
                    <input class="ci-type" value="${esc(r.item_type)}" disabled>
                  </label>

                  <label>Số lượng (kg)
                    <input class="ci-quantity" type="number" min="0.001"
                      step="any" value="${r.quantity}" disabled>
                  </label>

                  <label>Đơn giá
                    <input class="ci-price" type="number" min="0"
                      step="any" value="${r.unit_price}" disabled>
                  </label>

                  <p>Thành tiền: <b class="ci-total">${money(r.line_total)}</b></p>
                </div>
              `).join('')}
            </div>

            <p class="complaint-total">
              Tổng hóa đơn: <b>${money(inv?.total_amount || 0)}</b>
            </p>

            <small>${dateText(c.created_at)}</small>

            <div class="complaint-actions">
              ${c.status === 'pending' ? `
                <button class="btn-primary" data-edit-invoice="${c.id}">
                  ✏️ Sửa hóa đơn
                </button>
                <button class="btn-primary hidden" data-update-invoice="${c.id}">
                  ✓ Cập nhật hóa đơn
                </button>
              ` : ''}

              <button class="btn-danger"
                data-delete-complaint="${c.id}"
                data-invoice="${c.invoice_id}">
                🗑 Xóa khiếu nại
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (error) {
      console.error(error);
      list.innerHTML = `<p class="muted">Lỗi tải dữ liệu: ${esc(error.message)}</p>`;
      toast(error.message);

    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Tải lại';
      }
    }
  }

  async function updateProfile(e) {
    e.preventDefault();

    const name = $('#settingName').value.trim();

    if (!name) return toast('Tên không được để trống.');

    const { error } = await sb
      .from('users')
      .update({ full_name: name })
      .eq('id', profile.id);

    if (error) return toast(error.message);

    await sb.auth.updateUser({ data: { full_name: name } });

    profile.full_name = name;
    roleUI();
    toast('Đã cập nhật tên hiển thị');
  }

  async function changePassword(e) {
    e.preventDefault();

    const old = $('#currentPassword').value;
    const newPass = $('#newPassword').value;

    if (!old) return toast('Vui lòng nhập mật khẩu hiện tại.');
    if (newPass.length !== 6) return toast('Mật khẩu mới phải đúng 6 ký tự.');

    return new Promise(resolve => openConfirmModal({
      title: 'Đổi mật khẩu',
      message: 'Bạn xác nhận muốn đổi mật khẩu tài khoản này?',
      confirmText: 'Đổi mật khẩu',
      onConfirm: async () => {
        const { error: verifyError } = await sb.auth.signInWithPassword({
      email: profile.email,
      password: old
    });

    if (verifyError) return toast('Mật khẩu cũ không chính xác. Không thể đổi mật khẩu.');

    const { error } = await sb.auth.updateUser({ password: newPass });

        if (error) return toast(error.message);

        e.target.reset();
        $('#modal').classList.add('hidden');
        toast('Đã đổi mật khẩu thành công');
        resolve();
      }
    }));
  }

  async function deleteAccount() {
    openConfirmModal({
      title: 'Xóa tài khoản vĩnh viễn?',
      message: 'Tài khoản của bạn sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.',
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        const { error } = await sb.rpc('delete_my_account');
        if (error) return toast('Không thể xóa tài khoản: ' + error.message);
        await sb.auth.signOut();
        location.reload();
      }
    });
  }

  async function togglePush(on) {
    if (!('Notification' in window)) {
      toast('Trình duyệt không hỗ trợ thông báo.');
      $('#pushToggle').checked = false;
      return;
    }

    if (on) {
      const p = await Notification.requestPermission();

      if (p !== 'granted') {
        toast('Bạn chưa cấp quyền thông báo.');
        $('#pushToggle').checked = false;
        return;
      }

      localStorage.setItem('pv_push', 'on');
      toast('Đã bật thông báo trên thiết bị này');

    } else {
      localStorage.setItem('pv_push', 'off');
      toast('Đã tắt thông báo');
    }
  }

  function wire() {
    $$('[data-auth-tab]').forEach(b => b.onclick = () => {
      $$('[data-auth-tab]').forEach(x => x.classList.toggle('active', x === b));

      $('#loginForm').classList.toggle('hidden', b.dataset.authTab !== 'login');
      $('#registerForm').classList.toggle('hidden', b.dataset.authTab !== 'register');
    });

   $('#loginForm').onsubmit = async e => {
    e.preventDefault();

    const loginName = $('#loginEmail').value.trim();

    const loginEmail = loginName.includes('@')
        ? loginName
        : loginName + '@gmail.com';

    const { error } = await sb.auth.signInWithPassword({
        email: loginEmail,
        password: $('#loginPassword').value
    });

    if (error) return toast(error.message);

    await enterApp();
};

    $('#registerForm').onsubmit = async e => {
      e.preventDefault();

      const password = $('#regPassword').value;

      if (password.length !== 6) return toast('Mật khẩu phải đúng 6 ký tự.');

      const phone = $('#regPhone').value.trim();

      if (!phone) return toast('Vui lòng nhập số điện thoại.');

      const { data, error } = await sb.auth.signUp({
        email: $('#regEmail').value.trim(),
        password,
        options: {
          data: {
            full_name: $('#regName').value.trim(),
            phone
          }
        }
      });

      if (error) return toast(error.message);

      if (data.session) {
        await enterApp();
      } else {
        toast('Đăng ký thành công. Hãy xác nhận email nếu Supabase yêu cầu, sau đó đăng nhập.');
      }
    };

   $('#logoutBtn').onclick = $('#settingsLogout').onclick = async () => {
  openConfirmModal({
    title: 'Đăng xuất',
    message: 'Bạn có muốn đăng xuất khỏi tài khoản hiện tại?',
    confirmText: 'Đăng xuất',
    cancelText: 'Ở lại',
    danger: true,
    onConfirm: async () => {
      await sb.auth.signOut();
      location.reload();
    }
  });
  
};


    $('#mainNav').onclick = e => {
      const b = e.target.closest('[data-page]');
      if (b) navigate(b.dataset.page);
    };

    $('#addNoticeBtn').onclick = () => openNoticeModal(null);
    $('#addItemBtn').onclick = addItemRow;
    $('#saveInvoiceBtn').onclick = saveInvoice;

    // Tìm khách hàng ngay khi nhập


// ===== SỰ KIỆN TÌM KIẾM VÀ CHỌN KHÁCH HÀNG =====

const customerSearch = $('#customerSearch');
const showAllCustomersBtn = $('#showAllCustomersBtn');

if (customerSearch) {

  // Gõ tìm kiếm: tự động hiển thị gợi ý
  customerSearch.addEventListener('input', () => {
    const select = $('#customerSelect');

    // Không giữ khách hàng cũ khi người dùng tìm người khác
    if (select.value) {
      select.value = '';
      updateCustomerSummary();
    }

    renderCustomerSearchResults();
  });

  // Bấm nút Tất cả khách hàng
  showAllCustomersBtn?.addEventListener('click', () => {
    const results = $('#customerSearchResults');

    const isOpen =
      results && !results.classList.contains('hidden');

    if (isOpen) {
      results.classList.add('hidden');
      showAllCustomersBtn.setAttribute('aria-expanded', 'false');
      return;
    }

    customerSearch.value = '';
    renderCustomerSearchResults(true);
    customerSearch.focus();
  });

  // Điều khiển bằng bàn phím
  customerSearch.addEventListener('keydown', e => {
    const results = $('#customerSearchResults');
    const items = results
      ? [...results.querySelectorAll('.customer-search-item')]
      : [];

    if (e.key === 'Escape') {
      results?.classList.add('hidden');
      showAllCustomersBtn?.setAttribute('aria-expanded', 'false');
      return;
    }

    if (results?.classList.contains('hidden')) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }

    let active = items.findIndex(
      item => item.classList.contains('active')
    );

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();

      active = e.key === 'ArrowDown'
        ? Math.min(active + 1, items.length - 1)
        : Math.max(active <= 0 ? 0 : active - 1, 0);

      items.forEach((item, index) => {
        item.classList.toggle('active', index === active);
        item.setAttribute(
          'aria-selected',
          index === active ? 'true' : 'false'
        );
      });

      items[active]?.scrollIntoView({ block: 'nearest' });
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      if (items.length) {
        (active >= 0 ? items[active] : items[0]).click();
      }
    }
  });

  // Bấm bên ngoài thì đóng danh sách
  document.addEventListener('click', e => {
    const picker = customerSearch.closest('.customer-picker');

    if (picker && !picker.contains(e.target)) {
      $('#customerSearchResults')?.classList.add('hidden');
      showAllCustomersBtn?.setAttribute('aria-expanded', 'false');
    }
  });
}




    $('#modalClose').onclick = () => $('#modal').classList.add('hidden');

    $('#modal').onclick = e => {
      if (e.target.id === 'modal') $('#modal').classList.add('hidden');
    };

    $('#filterBtn').onclick = loadInvoices;

    $('#clearFilterBtn').onclick = () => {
      $('#filterFrom').value = '';
      $('#filterTo').value = '';
      $('#filterPhone').value = '';
      loadInvoices();
    };

    $('#profileForm').onsubmit = updateProfile;
    $('#passwordForm').onsubmit = changePassword;

    $('#themeToggle').onchange = e => setTheme(e.target.checked);
    $('#themeQuick').onclick = () => setTheme(!document.body.classList.contains('light'));

    $('#pushToggle').onchange = e => togglePush(e.target.checked);
    $('#pushToggle').checked = localStorage.getItem('pv_push') === 'on';

    $('#deleteAccountBtn').onclick = deleteAccount;

    $('#openCustomerManagerBtn').onclick = async () => {
      const { data, error } = await sb.from('users').select('id,email,full_name,phone,created_at,role').eq('role', 'user').order('created_at', { ascending: false });
      if (error) return toast(error.message);
      customersCache = data || [];
      openCustomerManager(true);
    };

    $('#refreshCustomersAdmin').onclick = async () => {
      const btn = $('#refreshCustomersAdmin');
      btn.disabled = true;
      const { data, error } = await sb.from('users').select('id,email,full_name,phone,created_at,role').eq('role', 'user').order('created_at', { ascending: false });
      btn.disabled = false;
      if (error) return toast(error.message);
      customersCache = data || [];
      toast('Đã tải lại danh sách khách hàng');
    };

    $('#refreshComplaints').onclick = async () => {
      await loadComplaints();
    };

    $('#noticeList').onclick = async e => {
      const edit = e.target.closest('[data-edit-notice]');
      const del = e.target.closest('[data-delete-notice]');

      if (edit) {
        openNoticeModal(noticesCache.find(n => n.id == edit.dataset.editNotice));
      }

      if (del) {
        openConfirmModal({
          title: 'Xóa thông báo?',
          message: 'Thông báo này sẽ bị xóa khỏi hệ thống.',
          confirmText: 'Xóa thông báo',
          danger: true,
          onConfirm: async () => {
            const { error } = await sb
              .from('notifications')
              .delete()
              .eq('id', del.dataset.deleteNotice);
            if (error) return toast(error.message);
            $('#modal').classList.add('hidden');
            loadNotices();
            toast('Đã xóa thông báo');
          }
        });
      }
    };

    $('#modalContent').onclick = e => {
      const edit = e.target.closest('[data-admin-edit-customer]');
      const del = e.target.closest('[data-admin-delete-customer]');
      if (edit) {
        const c = customersCache.find(x => x.id === edit.dataset.adminEditCustomer);
        if (c) openEditCustomer(c);
      }
      if (del) {
        const c = customersCache.find(x => x.id === del.dataset.adminDeleteCustomer);
        if (c) deleteAdminCustomer(c);
      }
    };

    $('#invoiceList').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;

      const inv = findInvoice(
        b.dataset.view ||
        b.dataset.excel ||
        b.dataset.image ||
        b.dataset.print ||
        b.dataset.complain
      );

      if (!inv) return;

      if (b.dataset.view) showInvoice(inv);
      if (b.dataset.excel) exportExcel(inv);
      if (b.dataset.image) exportImage(inv);
      if (b.dataset.print) printInvoice(inv);
      if (b.dataset.complain) openComplaint(inv);
    };

  
$('#complaintList').onclick = async e => {
    const edit = e.target.closest('[data-edit-invoice]');
    const update = e.target.closest('[data-update-invoice]');
    const del = e.target.closest('[data-delete-complaint]');

    // =========================
    // CHẾ ĐỘ SỬA HÓA ĐƠN
    // =========================
    if (edit) {
        const row = edit.closest('.complaint-row');
        if (!row) return;

        row.querySelectorAll('.ci-type, .ci-quantity, .ci-price')
            .forEach(input => input.disabled = false);

        edit.classList.add('hidden');

        const updateButton = row.querySelector('[data-update-invoice]');
        if (updateButton) {
            updateButton.classList.remove('hidden');
            updateButton.disabled = false;
            updateButton.textContent = '✓ Cập nhật hóa đơn';
        }

        return;
    }

    // =========================
    // CẬP NHẬT HÓA ĐƠN
    // =========================
    if (update) {
        const row = update.closest('.complaint-row');
        if (!row || update.disabled) return;

        const items = [...row.querySelectorAll('.complaint-item-row')]
            .map((item, index) => ({
                id: item.dataset.itemId,
                stt: index + 1,
                item_type: item.querySelector('.ci-type').value.trim(),
                quantity: Number(item.querySelector('.ci-quantity').value),
                unit_price: Number(item.querySelector('.ci-price').value)
            }));

        if (
            !items.length ||
            items.some(x =>
                !x.item_type ||
                !(x.quantity > 0) ||
                x.unit_price < 0 ||
                !Number.isFinite(x.quantity + x.unit_price)
            )
        ) {
            return toast('Vui lòng kiểm tra thông tin hóa đơn.');
        }

        const okUpdate = await askConfirm({
            title: 'Cập nhật hóa đơn?',
            message: 'Hóa đơn mới sẽ được đồng bộ vào tài khoản khách hàng. Bạn có chắc chắn muốn tiếp tục không?',
            confirmText: 'Cập nhật'
        });

        if (!okUpdate) return;

        update.disabled = true;
        update.textContent = 'Đang cập nhật...';

        try {
            const { data, error } = await sb.rpc(
                'admin_update_complaint_invoice',
                {
                    p_complaint_id: update.dataset.updateInvoice,
                    p_items: items
                }
            );

            if (error) throw error;

            toast(
                'Đã cập nhật hóa đơn thành công! Tổng tiền mới: ' +
                money(data)
            );

            await loadComplaints();
            await loadInvoices();

        } catch (error) {
            console.error('Lỗi cập nhật hóa đơn:', error);
            toast('Không thể cập nhật hóa đơn: ' + error.message);

        } finally {
            if (update.isConnected) {
                update.disabled = false;
                update.textContent = '✓ Cập nhật hóa đơn';
            }
        }

        return;
    }

    // =========================
    // XÓA KHIẾU NẠI
    // =========================
    if (del) {
        if (del.disabled) return;

        const okDelete = await askConfirm({
            title: 'Xóa khiếu nại?',
            message: 'Khiếu nại này sẽ bị xóa khỏi danh sách quản trị.',
            confirmText: 'Xóa khiếu nại',
            danger: true
        });

        if (!okDelete) return;

        const invoiceId = del.dataset.invoice;
        const complaintId = del.dataset.deleteComplaint;
        const row = del.closest('.complaint-row');

        del.disabled = true;
        del.textContent = 'Đang xóa...';

        let deleted = false;

        try {
            const { error } = await sb
                .from('complaints')
                .delete()
                .eq('id', complaintId);

            if (error) throw error;

            deleted = true;

            // Xóa ngay khỏi giao diện
            if (row) row.remove();

            toast('Đã xóa khiếu nại.');

            // Kiểm tra khiếu nại còn chờ xử lý
            const { data: pending, error: checkError } = await sb
                .from('complaints')
                .select('id')
                .eq('invoice_id', invoiceId)
                .eq('status', 'pending');

            if (checkError) throw checkError;

            // Nếu không còn khiếu nại chờ xử lý
            if (!pending || pending.length === 0) {
                const { error: invoiceError } = await sb
                    .from('invoices')
                    .update({ status: 'active' })
                    .eq('id', invoiceId);

                if (invoiceError) throw invoiceError;
            }

        } catch (error) {
            console.error('Lỗi xử lý khiếu nại:', error);

            if (deleted) {
                toast('Đã xóa khiếu nại nhưng chưa cập nhật được trạng thái hóa đơn: ' + error.message);
            } else {
                toast('Không thể xóa khiếu nại: ' + error.message);
            }

        } finally {
            if (del.isConnected) {
                del.disabled = false;
                del.textContent = '🗑 Xóa khiếu nại';
            }

            // Đồng bộ lại danh sách
            await loadComplaints();
        }

        return;
    }
};

  }

  // CẦU NỐI CHO TIỆN ÍCH HÓA ĐƠN
  function exposeInvoiceAddonState() {
    window.__pvInvoiceAddonSB = sb;
    window.__pvInvoiceAddonProfile = profile;
    window.__pvInvoiceAddonInvoices = invoicesCache;

    window.__pvInvoiceAddonRefresh = async () => {
      await loadInvoices();
      exposeInvoiceAddonState();
    };

    window.__pvInvoiceAddonGetState = () => ({
      sb,
      profile,
      invoicesCache,
      loadInvoices
    });
  }

  window.__pvInvoiceAddonGetState = () => ({
    sb,
    profile,
    invoicesCache,
    loadInvoices
  });

  const __pvAddonStateObserver = new MutationObserver(() => {
    if (profile && sb) exposeInvoiceAddonState();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('#appView');

    if (root) {
      __pvAddonStateObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true
      });
    }

    if (profile && sb) exposeInvoiceAddonState();
  });

  async function init() {
    setTheme(localStorage.getItem('pv_theme') === 'light');
    wire();

    if (!validConfig()) {
      showAuth();
      toast('Hãy điền Supabase URL và anon key trong config.js');
      return;
    }

    sb = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data: { session: s } } = await sb.auth.getSession();

    if (s) {
      session = s;
      await enterApp();
    } else {
      showAuth();
    }

    sb.auth.onAuthStateChange(async (event, s) => {
      session = s;
      if (event === 'SIGNED_OUT') showAuth();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();


/* =====================================================
   TIỆN ÍCH BỔ SUNG HÓA ĐƠN - VỰA MÍT PHÚC VINH
   Thống kê và xóa hóa đơn
   ===================================================== */

(() => {
  'use strict';

  const q = s => document.querySelector(s);

  const fmtMoney = n =>
    new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + ' ₫';

  const safeText = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const localDay = value => {
    const d = new Date(value);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const prettyDay = day =>
    new Date(day + 'T00:00:00').toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

  const getRole = () =>
    window.__pvInvoiceAddonProfile?.role || null;

  let statsRequestId = 0;

  // LÀM MỚI THỐNG KÊ TỪ SUPABASE
  async function refreshOpenStats() {
    const body = q('#invoiceStatsBody');
    const modal = q('#modal');

    if (!body || !modal || modal.classList.contains('hidden')) return;

    const sb = window.__pvInvoiceAddonSB;
    const p = window.__pvInvoiceAddonProfile;

    if (!sb || !p || p.role !== 'admin') return;

    const requestId = ++statsRequestId;

    body.innerHTML =
      '<div class="invoice-stats-empty">Đang cập nhật thống kê...</div>';

    const { data, error } = await sb
      .from('invoices')
      .select('id,invoice_code,total_amount,created_at')
      .eq('admin_deleted', false)
      .order('created_at', { ascending: false });

    if (requestId !== statsRequestId) return;

    if (error) {
      body.innerHTML =
        `<div class="invoice-stats-empty">Không thể tải thống kê: ${safeText(error.message)}</div>`;
      return;
    }

    const from = q('#statsFrom')?.value || '';
    const to = q('#statsTo')?.value || '';

    renderStats(data || [], from, to);
  }

  // XÓA MỘT HÓA ĐƠN RIÊNG THEO VAI TRÒ
  // Không xóa bản ghi gốc; chỉ đánh dấu xóa ở đúng lịch sử đang đăng nhập.
  async function deleteOneInvoice(id) {
    const sb = window.__pvInvoiceAddonSB;
    const p = window.__pvInvoiceAddonProfile;

    if (!sb || !p) return;

    const invoices = window.__pvInvoiceAddonInvoices || [];
    const inv = invoices.find(x => String(x.id) === String(id));

    if (!inv) {
      window.__pvToast?.('Không tìm thấy hóa đơn trong danh sách hiện tại. Vui lòng tải lại trang.');
      return;
    }

    const admin = p.role === 'admin';
    const label = inv.invoice_code || 'hóa đơn này';
    const question = admin
      ? `Bạn có chắc chắn muốn xóa ${label} khỏi lịch sử Admin? Khách hàng vẫn giữ hóa đơn này và không bị ảnh hưởng.`
      : `Bạn có chắc chắn muốn xóa ${label} khỏi lịch sử của bạn? Admin vẫn giữ hóa đơn này và thống kê không bị ảnh hưởng.`;

    window.__pvConfirm?.({
      title: 'Xóa hóa đơn?',
      message: question,
      confirmText: 'Xóa hóa đơn',
      danger: true,
      onConfirm: async () => {
        const { data, error } = await sb.rpc('delete_invoice_for_current_role', {
          p_invoice_id: id
        });

        if (error) {
          console.error('Lỗi xóa hóa đơn:', error.message);
          window.__pvToast?.('Không thể xóa hóa đơn: ' + error.message);
          return;
        }

        if (Number(data) < 1) {
          window.__pvToast?.('Hóa đơn không được tìm thấy hoặc đã được xóa khỏi lịch sử của bạn.');
          return;
        }

        await window.__pvInvoiceAddonRefresh?.();
        await refreshOpenStats();
        document.dispatchEvent(new CustomEvent('pv-invoice-addon-refresh'));
        document.querySelector('#modal')?.classList.add('hidden');
        window.__pvToast?.(admin
          ? 'Đã xóa hóa đơn khỏi Admin. Khách hàng vẫn giữ hóa đơn này; thống kê Admin đã được cập nhật.'
          : 'Đã xóa hóa đơn khỏi tài khoản của bạn. Admin vẫn giữ hóa đơn này.');
      }
    });
  }

  async function deleteAllInvoices() {
    const sb = window.__pvInvoiceAddonSB;
    const p = window.__pvInvoiceAddonProfile;

    if (!sb || !p) return;

    const admin = p.role === 'admin';
    const message = admin
      ? 'Bạn xác nhận xóa TOÀN BỘ hóa đơn khỏi lịch sử Admin? Khách hàng vẫn giữ nguyên hóa đơn. Tổng tiền thu mua và số hóa đơn trong thống kê Admin sẽ được trừ tương ứng.'
      : 'Bạn xác nhận xóa TOÀN BỘ hóa đơn khỏi lịch sử tài khoản của mình? Admin vẫn giữ nguyên hóa đơn và thống kê.';

    window.__pvConfirm?.({
      title: 'Xóa toàn bộ hóa đơn?',
      message,
      confirmText: 'Xóa tất cả',
      danger: true,
      onConfirm: async () => {
        const { data, error } = await sb.rpc('delete_invoice_for_current_role', {
          p_invoice_id: null
        });

        if (error) {
          console.error('Lỗi xóa tất cả hóa đơn:', error.message);
          window.__pvToast?.('Không thể xóa hóa đơn: ' + error.message);
          return;
        }

        await window.__pvInvoiceAddonRefresh?.();
        await refreshOpenStats();
        document.dispatchEvent(new CustomEvent('pv-invoice-addon-refresh'));
        document.querySelector('#modal')?.classList.add('hidden');

        const count = Number(data) || 0;
        window.__pvToast?.(
          `Đã xóa ${count} hóa đơn khỏi lịch sử ${admin ? 'Admin' : 'khách hàng'}. ` +
          (admin ? 'Khách hàng vẫn giữ hóa đơn. Thống kê Admin đã được cập nhật.' : 'Admin vẫn giữ nguyên hóa đơn và thống kê.')
        );
      }
    });
  }

  // THÊM NÚT XÓA VÀO TỪNG HÓA ĐƠN
  function decorateInvoiceCards() {
    const p = window.__pvInvoiceAddonProfile;

    if (!p) return;

    document.querySelectorAll('#invoiceList .invoice-card').forEach(card => {
      if (card.querySelector('[data-addon-delete-invoice]')) return;

      const view = card.querySelector('[data-view]');
      const id = view?.dataset.view;

      if (!id) return;

      const actions =
        card.querySelector('.invoice-actions')?.parentElement ||
        card.lastElementChild;

      if (!actions) return;

      const btn = document.createElement('button');

      btn.type = 'button';
      btn.className = 'invoice-delete-btn';
      btn.dataset.addonDeleteInvoice = id;
      btn.textContent = '⌫ Xóa hóa đơn';

      actions.appendChild(btn);
    });
  }

  // TÍNH VÀ HIỂN THỊ THỐNG KÊ
  function renderStats(data, from = '', to = '') {
    const filtered = data.filter(inv => {
      const day = localDay(inv.created_at);

      return (!from || day >= from) &&
        (!to || day <= to);
    });

    const daily = {};

    filtered.forEach(inv => {
      const day = localDay(inv.created_at);

      if (!daily[day]) {
        daily[day] = { total: 0, count: 0 };
      }

      daily[day].total += Number(inv.total_amount) || 0;
      daily[day].count++;
    });

    const days = Object.entries(daily)
      .sort((a, b) => b[0].localeCompare(a[0]));

    // LUÔN TÍNH LẠI TỪ DANH SÁCH HÓA ĐƠN HIỆN CÓ
    const total = filtered.reduce(
      (sum, inv) => sum + (Number(inv.total_amount) || 0),
      0
    );

    const average = filtered.length ? total / filtered.length : 0;

    const best = [...days]
      .sort((a, b) => b[1].total - a[1].total)[0];

    const max = Math.max(1, ...days.map(x => x[1].total));

    const body = q('#invoiceStatsBody');

    if (!body) return;

    body.innerHTML = `
      <div class="invoice-stats-hero">
        <div class="invoice-stats-kicker">
          TỔNG TIỀN THU MUA · PHÚC VINH
        </div>

        <div class="invoice-stats-total">
          ${fmtMoney(total)}
        </div>

        <div class="invoice-stats-sub">
          Tổng số tiền phải thanh toán theo các hóa đơn trong khoảng thời gian đã chọn
        </div>
      </div>

      <div class="invoice-stats-cards">
        <div class="invoice-stat-card">
          <small>Tổng hóa đơn</small>
          <strong>${filtered.length}</strong>
        </div>

        <div class="invoice-stat-card">
          <small>Số ngày phát sinh</small>
          <strong>${days.length}</strong>
        </div>

        <div class="invoice-stat-card">
          <small>Trung bình / hóa đơn</small>
          <strong>${fmtMoney(average)}</strong>
        </div>
      </div>

      <div class="invoice-stats-cards">
        <div class="invoice-stat-card" style="grid-column:1/-1">
          <small>Ngày có tổng tiền cao nhất</small>
          <strong>
            ${best
        ? `${fmtMoney(best[1].total)} · ${prettyDay(best[0])}`
        : 'Chưa có dữ liệu'}
          </strong>
        </div>
      </div>

      <div class="invoice-stats-chart">
        <h4>✦ Biến động tiền thu mua theo ngày</h4>

        ${days.length
        ? days.map(([day, v]) => `
            <div class="invoice-day-row">
              <div class="invoice-day-label">${prettyDay(day)}</div>

              <div class="invoice-day-track">
                <div class="invoice-day-bar"
                  style="width:${Math.max(1, v.total / max * 100)}%">
                </div>
              </div>

              <div class="invoice-day-value">
                ${fmtMoney(v.total)}
                <span class="invoice-day-count">${v.count} hóa đơn</span>
              </div>
            </div>
          `).join('')
        : '<div class="invoice-stats-empty">Không có hóa đơn trong khoảng thời gian này.</div>'}
      </div>

      <div class="invoice-stats-chart">
        <h4>Chi tiết thống kê từng ngày</h4>

        ${days.length
        ? `
            <div style="overflow-x:auto">
              <table class="invoice-stats-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Số hóa đơn</th>
                    <th>Tổng tiền</th>
                  </tr>
                </thead>
                <tbody>
                  ${days.map(([day, v]) => `
                    <tr>
                      <td>${prettyDay(day)}</td>
                      <td>${v.count}</td>
                      <td><b>${fmtMoney(v.total)}</b></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
        : '<div class="invoice-stats-empty">Chưa có dữ liệu thống kê.</div>'}
      </div>
    `;
  }

  // MỞ THỐNG KÊ ADMIN
  async function openStats() {
    const sb = window.__pvInvoiceAddonSB;
    const p = window.__pvInvoiceAddonProfile;

    if (!sb || !p || p.role !== 'admin') return;

    const modal = q('#modal');
    const content = q('#modalContent');

    content.innerHTML = `
      <div class="invoice-stats-modal-title">
        <div>
          <p class="eyebrow">BÁO CÁO QUẢN TRỊ</p>
          <h3>Thống kê thu mua</h3>
        </div>
        <span class="count-pill">ADMIN</span>
      </div>

      <div class="invoice-stats-toolbar">
        <label>
          Từ ngày
          <input id="statsFrom" type="date">
        </label>

        <label>
          Đến ngày
          <input id="statsTo" type="date">
        </label>

        <button id="statsClear" class="btn-ghost" type="button">
          🗘 Đặt lại ngày
        </button>
      </div>

      <div id="invoiceStatsBody"
        class="invoice-stats-shell"
        style="margin-top:17px">
        <div class="invoice-stats-empty">
          Đang tổng hợp dữ liệu...
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    q('#statsClear').onclick = async () => {
      q('#statsFrom').value = '';
      q('#statsTo').value = '';
      await refreshOpenStats();
    };

    q('#statsFrom').onchange = refreshOpenStats;
    q('#statsTo').onchange = refreshOpenStats;

    await refreshOpenStats();
  }

  // BẮT SỰ KIỆN CÁC NÚT
  document.addEventListener('click', event => {
    const del = event.target.closest('[data-addon-delete-invoice]');

    if (del) {
      event.preventDefault();
      event.stopPropagation();
      deleteOneInvoice(del.dataset.addonDeleteInvoice);
      return;
    }

    if (event.target.closest('#deleteAllInvoices')) {
      deleteAllInvoices();
      return;
    }

    if (event.target.closest('#openInvoiceStats')) {
      openStats();
      return;
    }
  });

  // ĐỒNG BỘ GIAO DIỆN
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(decorateInvoiceCards);
    const list = q('#invoiceList');

    if (list) {
      observer.observe(list, {
        childList: true,
        subtree: true
      });
    }

    const sync = () => {
      const p = window.__pvInvoiceAddonProfile;
      const stats = q('#openInvoiceStats');

      if (stats) {
        stats.classList.toggle('hidden', p?.role !== 'admin');
      }

      if (list) decorateInvoiceCards();
    };

    document.addEventListener('pv-invoice-addon-refresh', sync);

    const attachRefresh = () => {
      if (window.__pvInvoiceAddonProfile) {
        sync();
      } else {
        setTimeout(attachRefresh, 200);
      }
    };

    attachRefresh();
  });

})();
