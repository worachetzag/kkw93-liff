/**
 * KKW 93 Reunion — หน้าหน้างานสำหรับทีมงาน (staff.html)
 *
 * ใช้: สแกน QR Code บนบัตร E-Ticket → เช็คอิน / จ่ายเสื้อแจ็กเก็ต
 * ต้องมี PIN ของทีมงาน (CONFIG.STAFF_PIN ฝั่ง GAS)
 *
 * หมายเหตุ: PIN ถูกเก็บใน localStorage ของเครื่องสตาฟฟ์ เพื่อให้กรอกครั้งเดียว
 */

(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const $ = function (id) { return document.getElementById(id); };

  const PIN_KEY = 'kkw93_staff_pin';
  const state = {
    pin: '',
    stream: null,
    scanning: false,
    current: null,   // ข้อมูลผู้ร่วมงานที่กำลังแสดง
    busy: false
  };

  /* ============================================================
   * เริ่มต้น
   * ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    $('pinBtn').addEventListener('click', onPinSubmit);
    $('pinInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') onPinSubmit(); });

    $('scanBtn').addEventListener('click', function () {
      if (state.scanning) stopScan(); else startScan();
    });
    $('findBtn').addEventListener('click', function () {
      const code = value('codeInput');
      if (!code) return showToast('กรุณาพิมพ์รหัสการจอง');
      lookup(code);
    });
    $('codeInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('findBtn').click();
    });

    $('checkinBtn').addEventListener('click', function () { act('staff-checkin'); });
    $('jacketBtn').addEventListener('click', function () { act('staff-jacket'); });
    $('nextBtn').addEventListener('click', resetToScan);

    // PIN ที่เคยกรอกไว้
    try {
      const saved = window.localStorage.getItem(PIN_KEY);
      if (saved) {
        state.pin = saved;
        enterStaffMode();
      }
    } catch (e) { /* โหมดส่วนตัวของเบราว์เซอร์ — ต้องกรอก PIN ทุกครั้ง */ }
  });

  /* ============================================================
   * PIN
   * ============================================================ */
  function onPinSubmit() {
    const pin = value('pinInput');
    if (!pin) { showPinError('กรุณากรอก PIN'); return; }

    state.pin = pin;
    // ทดสอบ PIN ด้วยการเรียก summary
    api('staff-summary', {}).then(function (res) {
      if (!res.success) { showPinError(res.message || 'PIN ไม่ถูกต้อง'); return; }
      try { window.localStorage.setItem(PIN_KEY, pin); } catch (e) { /* ข้ามได้ */ }
      enterStaffMode();
    }).catch(function (err) {
      showPinError('เชื่อมต่อระบบไม่ได้: ' + err.message);
    });
  }

  function showPinError(msg) {
    const box = $('pinMsg');
    box.className = 'status status--error';
    box.textContent = msg;
  }

  function enterStaffMode() {
    $('pinBox').classList.add('hidden');
    $('scanBox').classList.remove('hidden');
    $('summaryBox').classList.remove('hidden');
    refreshSummary();
  }

  /* ============================================================
   * เรียก API
   * ============================================================ */
  function api(action, extra) {
    const url = CFG.GAS_WEB_APP_URL;
    if (!url || url.indexOf('YOUR_') === 0) {
      return Promise.reject(new Error('ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL ใน config.js'));
    }
    const body = Object.assign({ action: action, pin: state.pin }, extra || {});
    return fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function refreshSummary() {
    api('staff-summary', {}).then(function (res) {
      if (!res.success) return;
      const d = res.data || {};
      $('sumIn').textContent = d.checkedIn || 0;
      $('sumJacket').textContent = d.jacketTaken || 0;
      $('sumLeft').textContent = d.jacketRemaining || 0;
    }).catch(function () { /* เงียบ — ไม่ให้รบกวนการทำงานหน้างาน */ });
  }

  /* ============================================================
   * ค้นหาผู้ร่วมงาน
   * ============================================================ */
  function lookup(code) {
    if (state.busy) return;
    state.busy = true;
    showToast('กำลังค้นหา...');

    api('staff-lookup', { code: code }).then(function (res) {
      if (!res.success) {
        stopScan();
        showResult(null, res.message || 'ไม่พบข้อมูล', 'bad');
        return;
      }
      stopScan();
      showResult(res.data, '', 'ok');
    }).catch(function (err) {
      showResult(null, 'เชื่อมต่อระบบไม่ได้: ' + err.message, 'bad');
    }).finally(function () {
      state.busy = false;
    });
  }

  /**
   * แสดงการ์ดผู้ร่วมงาน
   * @param {Object|null} p ข้อมูลผู้ร่วมงาน
   * @param {string} message ข้อความแจ้ง (ใช้เมื่อ error)
   * @param {'ok'|'bad'} kind
   */
  function showResult(p, message, kind) {
    $('resultBox').classList.remove('hidden');
    $('scanBox').classList.add('hidden');

    const msg = $('resultMsg');
    msg.className = 'status status--' + (kind === 'ok' ? 'success' : 'error');
    msg.textContent = message || (kind === 'ok' ? 'สแกนสำเร็จ' : 'เกิดข้อผิดพลาด');
    if (!message) msg.classList.add('hidden'); else msg.classList.remove('hidden');

    if (!p) {
      state.current = null;
      $('resultCard').className = 'result-card bad';
      $('checkinBtn').disabled = true;
      $('jacketBtn').disabled = true;
      return;
    }

    state.current = p;
    $('resultCard').className = 'result-card ' + (kind === 'bad' ? 'bad' : 'ok');
    $('pName').textContent = p.fullName || '—';
    $('pMeta').textContent = [p.nickname ? '(' + p.nickname + ')' : '', p.classroom || ''].join(' ').trim() || '—';
    $('pCode').textContent = p.bookingCode || '—';
    $('pTable').textContent = 'โต๊ะ ' + p.tableNo;
    $('pSize').textContent = p.jacketSize || '—';
    $('pStatus').textContent = p.status === 'CONFIRMED' ? 'ยืนยันแล้ว'
      : p.status === 'PENDING' ? 'รอตรวจสลิป' : 'ถูกปฏิเสธ';

    $('pIn').innerHTML = p.isCheckedIn
      ? '<span class="badge done">เช็คอินแล้ว</span>'
      : '<span class="badge todo">ยังไม่เช็คอิน</span>';
    $('pJacket').innerHTML = p.isJacketTaken
      ? '<span class="badge done">รับเสื้อแล้ว</span>'
      : '<span class="badge todo">ยังไม่รับเสื้อ</span>';

    $('checkinBtn').disabled = p.isCheckedIn || p.status === 'REJECTED';
    $('jacketBtn').disabled = p.isJacketTaken || p.status !== 'CONFIRMED';
    refreshSummary();
  }

  /* ============================================================
   * การกระทำ
   * ============================================================ */
  function act(action) {
    if (!state.current || state.busy) return;
    state.busy = true;

    const label = action === 'staff-checkin' ? 'เช็คอิน' : 'จ่ายเสื้อแล้ว';
    const btn = action === 'staff-checkin' ? $('checkinBtn') : $('jacketBtn');
    const original = btn.textContent;
    btn.textContent = 'กำลังบันทึก...';

    api(action, { code: state.current.bookingCode }).then(function (res) {
      if (res.success) {
        showResult(res.data || state.current, res.message || label + 'สำเร็จ', 'ok');
        showToast('✅ ' + (res.message || label + 'สำเร็จ'));
      } else {
        showResult(res.data || state.current, res.message || 'ไม่สำเร็จ', 'bad');
        showToast('⚠️ ' + (res.message || 'ไม่สำเร็จ'));
      }
    }).catch(function (err) {
      showToast('❌ เชื่อมต่อไม่ได้: ' + err.message);
    }).finally(function () {
      state.busy = false;
      btn.textContent = original;
    });
  }

  function resetToScan() {
    state.current = null;
    $('resultBox').classList.add('hidden');
    $('resultMsg').classList.add('hidden');
    $('scanBox').classList.remove('hidden');
    $('codeInput').value = '';
    refreshSummary();
  }

  /* ============================================================
   * กล้อง + อ่าน QR
   * ============================================================ */
  function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('เบราว์เซอร์นี้ไม่รองรับกล้อง — ให้พิมพ์รหัสเอง');
      return;
    }
    if (typeof jsQR !== 'function') {
      showToast('โหลดตัวอ่าน QR ไม่สำเร็จ — ให้พิมพ์รหัสเอง');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    }).then(function (stream) {
      state.stream = stream;
      const video = $('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      return video.play();
    }).then(function () {
      state.scanning = true;
      $('scanBtn').textContent = '⏹ หยุดสแกน';
      tick();
    }).catch(function (err) {
      showToast('เปิดกล้องไม่ได้: ' + err.message + ' — ให้พิมพ์รหัสเอง');
    });
  }

  function stopScan() {
    state.scanning = false;
    $('scanBtn').textContent = '📷 เริ่มสแกนบัตร';
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
    const v = $('video');
    if (v) v.srcObject = null;
  }

  /** อ่านภาพจากวิดีโอทีละเฟรม */
  function tick() {
    if (!state.scanning) return;

    const video = $('video');
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });

      if (qr && qr.data) {
        const code = extractCode(qr.data);
        if (code) {
          stopScan();
          showToast('พบรหัส ' + code);
          lookup(code);
          return;
        }
      }
    }
    window.requestAnimationFrame(tick);
  }

  /** ดึงรหัสการจองออกจากข้อความใน QR (รองรับกรณี QR เป็น URL) */
  function extractCode(text) {
    const m = String(text || '').toUpperCase().match(/KKW[\s\-_]*T\s*(\d{1,2})[\s\-_]*(\d{1,2})/);
    if (!m) return '';
    return 'KKW-T' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }

  /* ============================================================
   * UI helpers
   * ============================================================ */
  function value(id) { return ($(id).value || '').trim(); }

  function showToast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    window.setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  window.KKW93_STAFF = { state: state, showToast: showToast };
})();
