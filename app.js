/**
 * KKW 93 Reunion — LIFF Web Application
 * File: app.js
 *
 * ขั้นตอนตาม PRD ข้อ 2:
 *   1. ดึง Identity: LINE User ID & Display Name อัตโนมัติ
 *   2. กรอกข้อมูล: ชื่อ-นามสกุล, ชื่อเล่น, ห้องเรียน, เบอร์โทร
 *   3. เลือกไซส์เสื้อแจ็กเก็ต: S, M, L, XL, 2XL, 3XL, 4XL
 *   4. เลือกโต๊ะ: โต๊ะ 1 - 15 (แสดงจำนวนที่นั่งว่างแบบ Realtime)
 *   5. ชำระเงิน & แนบสลิป: ย่อขนาดภาพในเครื่อง (Client-side Resize < 800KB)
 */

(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const $ = function (id) { return document.getElementById(id); };

  /** สถานะของแอป */
  const state = {
    liffReady: false,
    lineUid: '',
    displayName: '',
    slipDataUrl: '',
    slipBytes: 0,
    submitting: false,
    order: {
      variants: [],
      colors: [],
      sizes: [],
      color: '',
      size: '',
      qty: 1,
      slipDataUrl: '',
      loaded: false,
      submitting: false
    }
  };

  /* ============================================================
   * เริ่มต้นระบบ
   * ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    applyStaticConfig();
    populateJacketSizes();

    $('checkMyBtn').addEventListener('click', checkMyBooking);

    // ---- แท็บ ----
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.getAttribute('data-pane')); });
    });

    // ---- ฟอร์มสั่งเสื้อ ----
    $('orderForm').addEventListener('submit', onOrderSubmit);
    $('odMinus').addEventListener('click', function () { changeQty(-1); });
    $('odPlus').addEventListener('click', function () { changeQty(1); });
    $('odAgain').addEventListener('click', function () { resetOrderForm(); });
    $('odSlip').addEventListener('change', onOrderSlip);
    ['odName', 'odPhone', 'odConsent'].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () { clearOrderError(id); });
    });
    $('bookingForm').addEventListener('submit', onSubmit);
    $('slipFile').addEventListener('change', onSlipSelected);

    // ล้างข้อความ error ทันทีที่ผู้ใช้แก้ไขช่องนั้น
    ['fullName', 'nickname', 'classroom', 'phone', 'jacketSize', 'slipFile', 'consent'].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, function () { clearFieldError(id); });
    });
    $('newBookingBtn').addEventListener('click', function () { window.location.reload(); });

    // เปิดแท็บตามที่ Rich Menu สั่งมา (เช่น ปุ่ม "สั่งเสื้อ" → ?tab=order)
    switchTab(initialPane());

    initLiff()
      .catch(function (err) {
        showStatus('error', 'เชื่อมต่อ LINE ไม่สำเร็จ: ' + err.message + '<br />กรุณาเปิดฟอร์มนี้จากเมนูใน LINE OA อีกครั้ง');
      })
      .then(loadTableQuota);
  });

  /** แสดงค่าคงที่จาก config ลงบนหน้าจอ */
  function applyStaticConfig() {
    const ev = CFG.EVENT || {};
    if (ev.name) $('eventName').textContent = ev.name;
    if (ev.date) $('eventDate').textContent = ev.date;
    if (ev.venue) $('eventVenue').textContent = ev.venue;
    if (ev.bank) $('bankAccount').textContent = ev.bank;
    if (ev.bankName) $('bankName').textContent = ev.bankName;
  }

  /** สร้างตัวเลือกไซส์เสื้อ */
  function populateJacketSizes() {
    const sel = $('jacketSize');
    (CFG.JACKET_SIZES || []).forEach(function (size) {
      const opt = document.createElement('option');
      opt.value = size;
      opt.textContent = size;
      sel.appendChild(opt);
    });
  }

  /* ============================================================
   * 1. LINE LIFF — ดึง Identity
   * ============================================================ */
  async function initLiff() {
    const configured = CFG.LIFF_ID && CFG.LIFF_ID.indexOf('YOUR_') !== 0;

    if (!configured) {
      // โหมดทดสอบในเครื่อง (ยังไม่ได้ตั้ง LIFF_ID)
      state.lineUid = 'U0000000000000000000000000000000';
      state.displayName = 'โหมดทดสอบ (ยังไม่ได้ตั้ง LIFF_ID)';
      renderProfile(state.displayName, state.lineUid, '');
      showStatus('info', 'กำลังทำงานในโหมดทดสอบ: ยังไม่ได้ตั้งค่า <code>LIFF_ID</code> ใน <code>liff/config.js</code>');
      return;
    }

    await liff.init({ liffId: CFG.LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return; // จะ redirect กลับมาที่หน้านี้อีกครั้ง
    }

    state.liffReady = true;
    const profile = await liff.getProfile();
    state.lineUid = profile.userId;
    state.displayName = profile.displayName;
    renderProfile(profile.displayName, profile.userId, profile.pictureUrl || '');
  }

  function renderProfile(name, uid, pictureUrl) {
    $('profileName').textContent = name || '—';
    $('profileUid').textContent = uid || '—';
    if (pictureUrl) $('profileImage').src = pictureUrl;
  }

  /* ============================================================
   * 4. โหลดโควตาที่นั่ง (Realtime) → Dropdown โต๊ะ 1-15
   * ============================================================ */
  async function loadTableQuota() {
    try {
      const quota = await fetchTableQuota();
      renderTableGrid(quota);
    } catch (err) {
      // fallback: แสดงทุกโต๊ะโดยยังไม่ทราบจำนวนที่นั่งว่าง
      const fallback = [];
      for (let i = 1; i <= (CFG.TOTAL_TABLES || 15); i++) {
        fallback.push({ tableNo: i, maxSeats: CFG.MAX_SEATS_PER_TABLE || 10, booked: null, remaining: null });
      }
      renderTableGrid(fallback);
      showStatus('error', 'ไม่สามารถดึงจำนวนที่นั่งว่างล่าสุดได้: ' + err.message +
        '<br />ยังสามารถกรอกข้อมูลต่อได้ แต่ระบบจะตรวจที่นั่งอีกครั้งตอนยืนยัน');
    }
  }

  /** เรียก GAS: GET ?action=quota */
  async function fetchTableQuota() {
    requireGasUrl();
    const res = await fetch(CFG.GAS_WEB_APP_URL + '?action=quota', { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'โหลดข้อมูลโควตาไม่สำเร็จ');
    return json.data || [];
  }

  /** สร้างกริดปุ่มเลือกโต๊ะ (เห็นชัดว่าโต๊ะไหนเต็ม) */
  function renderTableGrid(quota) {
    const grid = $('tableGrid');
    grid.innerHTML = '';

    if (!quota.length) {
      grid.innerHTML = '<div class="table-loading">ไม่พบข้อมูลโต๊ะ</div>';
      return;
    }

    quota.forEach(function (q) {
      const remaining = q.remaining;
      const full = remaining !== null && remaining !== undefined && remaining <= 0;
      const label = (remaining === null || remaining === undefined) ? 'ว่าง ?' : ('ว่าง ' + remaining);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'table-btn' + (full ? ' full' : '');
      btn.disabled = full;
      btn.dataset.table = String(q.tableNo);
      btn.innerHTML = '<span class="t">โต๊ะ ' + q.tableNo + '</span>' +
                      '<span class="r">' + (full ? 'เต็ม' : label) + '</span>';

      if (!full) {
        btn.addEventListener('click', function () { selectTable(q.tableNo, btn); });
      }
      grid.appendChild(btn);
    });
  }

  /** เลือกโต๊ะ */
  function selectTable(no, btn) {
    $('tableNo').value = String(no);
    $('tableGrid').querySelectorAll('.table-btn').forEach(function (b) {
      b.classList.remove('selected');
    });
    btn.classList.add('selected');
    clearFieldError('tableNo');
    showToast('เลือกโต๊ะ ' + no + ' แล้ว');
  }

  /* ============================================================
   * 5. ย่อภาพฝั่ง client (Client-side Resize)
   * ============================================================ */
  async function onSlipSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!/^image\//.test(file.type)) {
      showStatus('error', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG หรือ PNG)');
      event.target.value = '';
      return;
    }

    try {
      const result = await resizeImage(file);
      state.slipDataUrl = result.dataUrl;
      state.slipBytes = result.bytes;

      $('slipPreview').src = result.dataUrl;
      $('slipPreviewWrap').classList.remove('hidden');

      const kb = Math.round(result.bytes / 1024);
      $('slipMeta').textContent =
        'ขนาดหลังย่อ: ' + result.width + '×' + result.height + 'px · ' + kb + ' KB · quality ' + result.quality.toFixed(1);

      // แจ้งขนาดความกว้างไม่เกิน 1,200px และบีบอัด Quality เหลือ 0.7 เพื่อส่ง API ภายใน 1 วินาที
      $('slipHint').textContent = 'ย่อภาพอัตโนมัติแล้ว พร้อมส่ง';
    } catch (err) {
      showStatus('error', 'อ่านไฟล์ภาพไม่สำเร็จ: ' + err.message);
      event.target.value = '';
    }
  }

  /**
   * ย่อภาพให้กว้างไม่เกิน MAX_IMAGE_WIDTH และบีบอัดจนขนาดไม่เกิน MAX_IMAGE_BYTES
   * @param {File} file
   * @return {Promise<{dataUrl: string, bytes: number, width: number, height: number, quality: number}>}
   */
  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onerror = function () { reject(new Error('ไม่สามารถอ่านไฟล์ได้')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('ไฟล์ไม่ใช่รูปภาพที่รองรับ')); };
        img.onload = function () {
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          const maxWidth = CFG.MAX_IMAGE_WIDTH || 1200;

          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          let quality = CFG.IMAGE_QUALITY || 0.7;
          const minQuality = CFG.MIN_IMAGE_QUALITY || 0.3;
          const maxBytes = CFG.MAX_IMAGE_BYTES || 800 * 1024;

          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (approxBytes(dataUrl) > maxBytes && quality > minQuality) {
            quality = Math.max(minQuality, quality - 0.1);
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          resolve({ dataUrl: dataUrl, bytes: approxBytes(dataUrl), width: width, height: height, quality: quality });
        };
        img.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  }

  /** ประมาณขนาดไฟล์จริง (bytes) จาก base64 data URL */
  function approxBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const padding = (base64.match(/=+$/) || [''])[0].length;
    return Math.floor(base64.length * 3 / 4) - padding;
  }

  /* ============================================================
   * ส่งข้อมูลการจอง (HTTP POST JSON + Base64 Image)
   * ============================================================ */
  async function onSubmit(event) {
    event.preventDefault();
    if (state.submitting) return;

    const payload = {
      lineUid: state.lineUid,
      fullName: value('fullName'),
      nickname: value('nickname'),
      classroom: value('classroom'),
      phone: value('phone'),
      tableNo: parseInt(value('tableNo'), 10),
      jacketSize: value('jacketSize'),
      slipBase64: state.slipDataUrl,
      consent: $('consent').checked
    };

    const errors = validate(payload);
    if (!showFieldErrors(errors)) return;   // แสดง error ใต้ช่องที่ผิด แล้วหยุด

    setSubmitting(true);
    const startedAt = Date.now();

    try {
      requireGasUrl();
      const res = await fetch(CFG.GAS_WEB_APP_URL, {
        method: 'POST',
        // ใช้ text/plain เพื่อเลี่ยง CORS preflight (GAS อ่าน e.postData.contents เป็นสตริง JSON)
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      const json = await res.json();
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (!json.success) {
        showStatus('error', json.message || 'ไม่สามารถลงทะเบียนได้ กรุณาลองใหม่อีกครั้ง');
        return;
      }

      renderSuccess(json.data || {}, payload, elapsed);
    } catch (err) {
      showStatus('error', 'ส่งข้อมูลไม่สำเร็จ: ' + err.message + '<br />กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * ตรวจสอบข้อมูลฝั่ง client ก่อนส่ง (server ยังตรวจซ้ำอีกชั้น)
   * @return {Object} { ชื่อช่อง: ข้อความ error } — ว่าง = ผ่าน
   */
  function validate(p) {
    const e = {};

    if (!p.lineUid) e.__global = 'ไม่พบ LINE User ID กรุณาเปิดฟอร์มนี้จากเมนูใน LINE OA';

    if (!p.fullName || p.fullName.length < 3) {
      e.fullName = 'กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน';
    }

    if (!p.classroom) {
      e.classroom = 'กรุณากรอกห้องเรียน เช่น ม.6/1';
    }

    const digits = String(p.phone || '').replace(/[^0-9]/g, '');
    if (!digits) {
      e.phone = 'กรุณากรอกเบอร์โทรศัพท์';
    } else if (!/^0[0-9]{8,9}$/.test(digits)) {
      e.phone = 'เบอร์โทรไม่ถูกต้อง — ต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก (เช่น 0812345678)';
    }

    if (!p.jacketSize) e.jacketSize = 'กรุณาเลือกไซส์เสื้อแจ็กเก็ต';
    if (!p.tableNo) e.tableNo = 'กรุณาแตะเลือกโต๊ะที่ต้องการ';
    if (!p.slipBase64) e.slipFile = 'กรุณาแนบภาพสลิปการโอนเงิน';
    if (p.consent !== true) e.consent = 'กรุณาติ๊กยอมรับประกาศความเป็นส่วนตัวก่อนลงทะเบียน';

    return e;
  }

  /* ---------- จัดการ error ใต้ช่องกรอก ---------- */

  /** หา element ที่ใช้ไฮไลต์ + เลื่อนไปหา */
  function fieldElement(key) {
    if (key === 'tableNo') return $('tableGrid');
    if (key === 'consent') return document.querySelector('.consent-box');
    return $(key);
  }

  /**
   * แสดง error ใต้ช่องที่ผิด + ไฮไลต์ + เลื่อนไปช่องแรก
   * @param {Object} errors
   * @return {boolean} true = ไม่มี error
   */
  function showFieldErrors(errors) {
    clearAllFieldErrors();
    const keys = Object.keys(errors || {});
    if (!keys.length) { $('statusBox').classList.add('hidden'); return true; }

    if (errors.__global) showStatus('error', errors.__global);

    let firstEl = null;
    keys.forEach(function (key) {
      if (key === '__global') return;
      const errEl = $('err-' + key);
      if (errEl) {
        errEl.textContent = errors[key];
        errEl.classList.remove('hidden');
      }
      const el = fieldElement(key);
      if (el) {
        el.classList.add('invalid');
        if (!firstEl) firstEl = el;
      }
    });

    if (firstEl) {
      try { firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ข้ามได้ */ }
      if (firstEl.tagName === 'INPUT' && firstEl.type !== 'hidden') {
        try { firstEl.focus({ preventScroll: true }); } catch (e) { /* ข้ามได้ */ }
      }
    }

    showToast('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง');
    return false;
  }

  function clearFieldError(key) {
    const errEl = $('err-' + key);
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
    const el = fieldElement(key);
    if (el) el.classList.remove('invalid');
  }

  function clearAllFieldErrors() {
    document.querySelectorAll('.field-error').forEach(function (el) {
      el.classList.add('hidden');
      el.textContent = '';
    });
    document.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
  }

  function renderSuccess(data, payload, elapsed) {
    const pending = data.pendingReview === true;

    $('bookingForm').classList.add('hidden');
    $('successCard').classList.remove('hidden');
    $('successBookingCode').textContent = data.bookingCode || '-';

    // ปรับข้อความตามโหมดตรวจสลิป (อัตโนมัติ = ส่งบัตรแล้ว / manual = รอตรวจ)
    $('successTitle').textContent = pending ? 'ส่งข้อมูลเรียบร้อย' : 'ลงทะเบียนสำเร็จ';
    $('successNote').textContent = pending
      ? 'ระบบได้รับข้อมูลและสลิปของคุณแล้ว กำลังตรวจสอบสลิปโอนเงิน — เมื่อตรวจสอบเรียบร้อย จะส่งบัตรเข้างาน (E-Ticket + QR Code) เข้าแชท LINE ของคุณทันที'
      : 'ระบบได้ส่งบัตร E-Ticket พร้อม QR Code เข้าห้องแชท LINE ของคุณแล้ว กรุณาใช้ QR Code นี้ที่จุดลงทะเบียนหน้าประตูงาน';
    $('successDetail').innerHTML =
      '<div><strong>ผู้จอง:</strong> ' + escapeHtml(payload.fullName) + '</div>' +
      '<div><strong>โต๊ะ:</strong> ' + payload.tableNo + '</div>' +
      '<div><strong>ไซส์เสื้อ:</strong> ' + escapeHtml(payload.jacketSize) + '</div>' +
      '<div class="text-xs text-gray-500 mt-2">ประมวลผลเสร็จใน ' + elapsed + ' วินาที</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
   * ตรวจสอบการจองของฉัน
   * ============================================================ */
  async function checkMyBooking() {
    const btn = $('checkMyBtn');
    const panel = $('myBookingPanel');

    if (!state.lineUid) {
      panel.classList.remove('hidden');
      panel.innerHTML = '<div class="status status--error">ไม่พบ LINE User ID กรุณาเปิดหน้านี้จากเมนูใน LINE OA</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังตรวจ...';
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="status status--info">กำลังตรวจสอบข้อมูล...</div>';

    try {
      const res = await fetch(CFG.GAS_WEB_APP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'my-booking', lineUid: state.lineUid })
      });
      const json = await res.json();
      renderMyBooking(json);
    } catch (err) {
      panel.innerHTML = '<div class="status status--error">เชื่อมต่อระบบไม่ได้: ' + escapeHtml(err.message) + '</div>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'ตรวจสอบ';
    }
  }

  function renderMyBooking(json) {
    const panel = $('myBookingPanel');
    const list = (json && json.data && json.data.bookings) || [];

    if (!json || !json.success) {
      panel.innerHTML = '<div class="status status--error">' + escapeHtml((json && json.message) || 'ตรวจสอบไม่สำเร็จ') + '</div>';
      return;
    }

    if (!list.length) {
      panel.innerHTML = '<div class="status status--info">ยังไม่พบการจองของท่าน — กรุณาลงทะเบียนด้วยแบบฟอร์มด้านล่าง</div>';
      return;
    }

    panel.innerHTML = list.map(function (b) {
      const badge = b.status === 'CONFIRMED'
        ? '<span class="bk-badge ok">ยืนยันแล้ว</span>'
        : b.status === 'PENDING'
          ? '<span class="bk-badge wait">รอตรวจสลิป</span>'
          : '<span class="bk-badge no">ถูกปฏิเสธ</span>';

      const extra = b.status === 'CONFIRMED'
        ? (b.isCheckedIn ? ' · เช็คอินแล้ว' : '') + (b.isJacketTaken ? ' · รับเสื้อแล้ว' : '')
        : '';

      const resend = b.status === 'CONFIRMED'
        ? '<button class="btn-mini" type="button" data-resend="' + escapeHtml(b.bookingCode) + '">📩 ส่งบัตรอีกครั้ง</button>'
        : '';

      return '<div class="bk-card">' +
        '<div class="bk-head"><span class="bk-code">' + escapeHtml(b.bookingCode) + '</span>' + badge + '</div>' +
        '<div class="bk-meta">' +
          'ผู้จอง: ' + escapeHtml(b.fullName) + '<br />' +
          'โต๊ะ ' + escapeHtml(String(b.tableNo)) + ' · ไซส์ ' + escapeHtml(b.jacketSize) + escapeHtml(extra) +
        '</div>' + resend +
      '</div>';
    }).join('');

    // ผูกปุ่มส่งบัตรอีกครั้ง
    panel.querySelectorAll('[data-resend]').forEach(function (el) {
      el.addEventListener('click', function () { resendTicket(el); });
    });
  }

  async function resendTicket(btn) {
    const code = btn.getAttribute('data-resend');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'กำลังส่ง...';

    try {
      const res = await fetch(CFG.GAS_WEB_APP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'resend-ticket', lineUid: state.lineUid, bookingCode: code })
      });
      const json = await res.json();
      showToast(json.success ? '✅ ส่งบัตรแล้ว — เช็คในแชท LINE' : '⚠️ ' + json.message);
      btn.textContent = json.success ? 'ส่งแล้ว ✓' : original;
      if (!json.success) btn.disabled = false;
    } catch (err) {
      showToast('❌ เชื่อมต่อไม่ได้: ' + err.message);
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  /* ============================================================
   * แท็บ: ลงทะเบียน / สั่งเสื้อ
   * ============================================================ */
  function switchTab(pane) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-pane') === pane);
    });
    $('paneRegister').classList.toggle('hidden', pane !== 'register');
    $('paneOrder').classList.toggle('hidden', pane !== 'order');

    if (pane === 'order' && !state.order.loaded) loadJacketOptions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * แท็บที่ต้องเปิดตอนเข้าหน้า — อ่านจาก URL ที่ Rich Menu ส่งมา
   *   https://liff.line.me/2012050647-grre6Xzn?tab=order  → เปิดแท็บ "สั่งเสื้อ" ทันที
   *   ...#order                                           → เหมือนกัน (เผื่อบางแอปตัด query ทิ้ง)
   * หมายเหตุ: LIFF บางเวอร์ชันส่งพารามิเตอร์มาใน liff.state แทน location.search
   */
  function initialPane() {
    var want = '';

    try {
      var params = new URLSearchParams(window.location.search);
      want = params.get('tab') || '';

      var raw = params.get('liff.state') || '';
      if (!want && raw) {
        var q = raw.indexOf('?');
        if (q >= 0) want = new URLSearchParams(raw.slice(q + 1)).get('tab') || '';
      }
    } catch (e) {
      /* เบราว์เซอร์เก่า — ใช้ค่าเริ่มต้น */
    }

    if (!want && window.location.hash) want = window.location.hash.replace('#', '');

    return want === 'order' ? 'order' : 'register';
  }

  /* ============================================================
   * สั่งซื้อเสื้อแจ็กเก็ต
   * ============================================================ */
  async function loadJacketOptions() {
    const box = $('odColors');
    box.innerHTML = '<div class="od-loading">กำลังโหลดตัวเลือก...</div>';

    try {
      const res = await fetch(CFG.GAS_WEB_APP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'jacket-options' })
      });
      const json = await res.json();

      if (!json.success) {
        box.innerHTML = '<div class="od-loading">' + escapeHtml(json.message || 'โหลดตัวเลือกไม่สำเร็จ') + '</div>';
        return;
      }

      const o = state.order;
      o.variants = json.data.variants || [];
      o.colors = json.data.colors || [];
      o.sizes = json.data.sizes || [];
      o.loaded = true;

      if (!o.variants.length) {
        box.innerHTML = '<div class="od-loading">ยังไม่มีตัวเลือกเสื้อที่เปิดขาย</div>';
        return;
      }

      renderSwatches();
      renderSizes();
      updateOrderPrice();
    } catch (err) {
      box.innerHTML = '<div class="od-loading">เชื่อมต่อไม่ได้: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderSwatches() {
    const o = state.order;
    const box = $('odColors');
    box.innerHTML = '';

    // สีเดียว → ไม่ต้องให้เลือก (ซ่อนทั้งช่อง แล้วเลือกให้อัตโนมัติ)
    const single = o.colors.length === 1;
    if ($('odColorField')) $('odColorField').classList.toggle('hidden', single);
    if (single) {
      o.color = o.colors[0].name;
      clearOrderError('odColor');
    }

    o.colors.forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.color = c.name;
      btn.innerHTML = '<span class="dot" style="background:' + escapeHtml(c.hex) + '"></span>' +
                      escapeHtml(c.name);
      btn.addEventListener('click', function () { selectColor(c.name); });
      box.appendChild(btn);
    });
  }

  function renderSizes() {
    const o = state.order;
    const box = $('odSizes');
    box.innerHTML = '';

    o.sizes.forEach(function (size) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'size-btn';
      btn.dataset.size = size;
      btn.textContent = size;
      btn.addEventListener('click', function () { selectSize(size); });
      box.appendChild(btn);
    });
  }

  function selectColor(name) {
    state.order.color = name;
    document.querySelectorAll('#odColors .swatch').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.color === name);
    });
    syncOptionAvailability();
    clearOrderError('odColor');
  }

  function selectSize(size) {
    state.order.size = size;
    document.querySelectorAll('#odSizes .size-btn').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.size === size);
    });
    syncOptionAvailability();
    clearOrderError('odSize');
  }

  /** เปิด/ปิดตัวเลือกที่มีอยู่จริงตามสีที่เลือก */
  function syncOptionAvailability() {
    const o = state.order;

    document.querySelectorAll('#odSizes .size-btn').forEach(function (b) {
      const size = b.dataset.size;
      const available = o.variants.some(function (v) {
        return v.size === size && (!o.color || v.color === o.color);
      });
      b.disabled = !available;
      if (!available && o.size === size) { o.size = ''; b.classList.remove('selected'); }
    });

    updateOrderPrice();
  }

  /** หา variant ที่เลือกอยู่ */
  function currentVariant() {
    const o = state.order;
    return o.variants.filter(function (v) {
      return v.color === o.color && v.size === o.size;
    })[0] || null;
  }

  function updateOrderPrice() {
    const o = state.order;
    const v = currentVariant();
    const unit = v ? v.price : 0;

    $('odUnit').textContent = v ? unit.toLocaleString('th-TH') : '—';
    $('odTotal').textContent = v ? (unit * o.qty).toLocaleString('th-TH') : '—';
  }

  function changeQty(delta) {
    const o = state.order;
    o.qty = Math.min(10, Math.max(1, o.qty + delta));
    $('odQty').value = String(o.qty);
    updateOrderPrice();
  }

  async function onOrderSlip(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) { state.order.slipDataUrl = ''; return; }

    if (!/^image\//.test(file.type)) {
      showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      ev.target.value = '';
      return;
    }

    try {
      const result = await resizeImage(file);
      state.order.slipDataUrl = result.dataUrl;
      showToast('แนบสลิปแล้ว (' + Math.round(result.bytes / 1024) + ' KB)');
    } catch (err) {
      showToast('อ่านไฟล์ภาพไม่สำเร็จ: ' + err.message);
      ev.target.value = '';
    }
  }

  function orderErrors() {
    const o = state.order;
    const e = {};
    const name = value('odName');
    const phone = value('odPhone').replace(/[^0-9]/g, '');

    if (!name || name.length < 3) e.odName = 'กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน';
    if (!/^0[0-9]{8,9}$/.test(phone)) e.odPhone = 'เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)';
    if (!o.color && o.colors.length > 1) e.odColor = 'กรุณาเลือกสีเสื้อ';
    if (!o.size) e.odSize = 'กรุณาเลือกไซส์';
    if (!$('odConsent').checked) e.odConsent = 'กรุณาติ๊กยอมรับประกาศความเป็นส่วนตัว';

    return e;
  }

  function showOrderErrors(errors) {
    const keys = Object.keys(errors || {});
    if (!keys.length) return true;

    let first = null;
    keys.forEach(function (key) {
      const el = $('err-' + key);
      if (el) { el.textContent = errors[key]; el.classList.remove('hidden'); }

      let target = null;
      if (key === 'odColor') target = $('odColors');
      else if (key === 'odSize') target = $('odSizes');
      else if (key === 'odConsent') target = document.querySelector('#paneOrder .consent-box');
      else target = $(key);

      if (target) {
        target.classList.add('invalid');
        if (!first) first = target;
      }
    });

    if (first) {
      try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ข้ามได้ */ }
    }
    return false;
  }

  function clearOrderError(key) {
    const el = $('err-' + key);
    if (el) { el.classList.add('hidden'); el.textContent = ''; }

    let target = null;
    if (key === 'odColor') target = $('odColors');
    else if (key === 'odSize') target = $('odSizes');
    else if (key === 'odConsent') target = document.querySelector('#paneOrder .consent-box');
    else target = $(key);
    if (target) target.classList.remove('invalid');
  }

  async function onOrderSubmit(ev) {
    ev.preventDefault();
    if (state.order.submitting) return;

    const o = state.order;
    const errors = orderErrors();
    if (!showOrderErrors(errors)) { showToast('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง'); return; }

    const v = currentVariant();
    if (!v) { showToast('ตัวเลือกนี้ไม่พร้อมขาย กรุณาเลือกใหม่'); return; }

    o.submitting = true;
    const btn = $('odSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>กำลังส่งคำสั่งซื้อ...';

    const payload = {
      action: 'jacket-order',
      lineUid: state.lineUid,
      fullName: value('odName'),
      phone: value('odPhone'),
      color: o.color,
      size: o.size,
      qty: o.qty,
      slipBase64: o.slipDataUrl,
      consent: $('odConsent').checked
    };

    try {
      const res = await fetch(CFG.GAS_WEB_APP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (!json.success) {
        showToast('⚠️ ' + (json.message || 'สั่งซื้อไม่สำเร็จ'));
        return;
      }
      renderOrderSuccess(json.data || {}, payload);
    } catch (err) {
      showToast('❌ เชื่อมต่อไม่ได้: ' + err.message);
    } finally {
      o.submitting = false;
      btn.disabled = false;
      btn.textContent = 'ยืนยันคำสั่งซื้อ';
    }
  }

  function renderOrderSuccess(data, payload) {
    $('orderForm').classList.add('hidden');
    $('odResult').classList.remove('hidden');
    $('odCode').textContent = data.orderCode || '-';
    $('odDetail').innerHTML =
      '<div><strong>ผู้สั่ง:</strong> ' + escapeHtml(payload.fullName) + '</div>' +
      '<div><strong>สี / ไซส์:</strong> ' + escapeHtml(payload.color) + ' / ' + escapeHtml(payload.size) + '</div>' +
      '<div><strong>จำนวน:</strong> ' + payload.qty + ' ตัว</div>' +
      '<div><strong>ยอดรวม:</strong> ' + Number(data.total || 0).toLocaleString('th-TH') + ' บาท</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetOrderForm() {
    $('odResult').classList.add('hidden');
    $('orderForm').classList.remove('hidden');
    $('odSlip').value = '';
    $('odConsent').checked = false;
    state.order.slipDataUrl = '';
    state.order.qty = 1;
    $('odQty').value = '1';
    updateOrderPrice();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
   * UI helpers
   * ============================================================ */
  function value(id) { return ($(id).value || '').trim(); }

  function setSubmitting(flag) {
    state.submitting = flag;
    const btn = $('submitBtn');
    btn.disabled = flag;
    btn.innerHTML = flag ? '<span class="spinner"></span>กำลังตรวจสอบสลิปและบันทึกข้อมูล...' : 'ยืนยันการลงทะเบียน &amp; จองโต๊ะ';
  }

  function showStatus(type, html) {
    const box = $('statusBox');
    box.className = 'status status--' + type;
    box.innerHTML = html;
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function requireGasUrl() {
    if (!CFG.GAS_WEB_APP_URL || CFG.GAS_WEB_APP_URL.indexOf('YOUR_') === 0) {
      throw new Error('ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL ใน liff/config.js');
    }
  }

  // เปิดให้เรียกใช้จาก console เพื่อ debug
  window.KKW93 = { state: state, showToast: showToast };
})();
