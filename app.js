let currentUser = null;
let token = localStorage.getItem('epremo_token') || '';
const API_URL = 'https://script.google.com/macros/s/AKfycbzf4QVA0lmEnJQPyUi4w3tgFglRcNbpCrr1LZIRRogQG9LAIpQBRGc6xX223_dj8KIL/exec';
let currentView = 'dashboard';
let rooms = [];
let subjects = [];
let monitoringRoom = '';
let selectedComputer = null;
let currentMonitoringComputers = [];
let monitorTimer = null;
let loginMode = 'mahasiswa';
let DEPLOYMENT_URL = 'scanner.html';
let lastQrTs = 0;
let pendingRoomQr = '';
let pendingRoomCode = '';

const menuByRole = {
  admin: [
    ['dashboard','Dashboard','fa-gauge-high'],
    ['monitoring','Monitoring Lab','fa-display'],
    ['pembuatan-qr','Pembuatan QR Code','fa-qrcode'],
    ['laporan','Laporan & Arsip','fa-file-export'],
    ['mahasiswa','Mahasiswa','fa-user-graduate'],
    ['dosen','Dosen','fa-user-tie'],
    ['pengguna-khusus','Pengguna Khusus','fa-id-badge'],
    ['ruangan','Ruangan & Komputer','fa-building']
  ],
  dosen: [
    ['dashboard','Dashboard','fa-gauge-high'],
    ['monitoring','Monitoring Lab','fa-display'],
    ['pemesanan','Pemesanan Ruangan','fa-calendar-check'],
    ['laporan','Laporan & Arsip','fa-file-export'],
    ['profil','Profil Dosen','fa-user-tie']
  ],
  mahasiswa: [
    ['dashboard','Dashboard','fa-gauge-high'],
    ['monitoring','Monitoring Lab','fa-display'],
    ['presensi','Presensi QR Code','fa-qrcode'],
    ['profil','Profil Mahasiswa','fa-user-graduate']
  ],
  pengguna_khusus: [
    ['dashboard','Dashboard','fa-gauge-high'],
    ['monitoring','Monitoring Lab','fa-display'],
    ['pemesanan','Registrasi Penggunaan','fa-clipboard-list'],
    ['profil','Profil Pengguna','fa-id-badge']
  ]
};

function gs(fn, ...args) {
  if (!API_URL || API_URL === 'ISI_URL_WEB_APP_APPS_SCRIPT_ANDA') {
    return Promise.resolve({ success: false, message: 'API_URL belum diisi dengan URL Web App Google Apps Script.' });
  }
  return new Promise((resolve, reject) => {
    const callback = 'epremo_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const sep = API_URL.indexOf('?') >= 0 ? '&' : '?';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('API tidak merespons. Periksa URL Web App Apps Script.'));
    }, 30000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callback] = data => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Gagal menghubungi API Apps Script.'));
    };

    script.src = API_URL + sep + 'action=' + encodeURIComponent(fn) +
      '&args=' + encodeURIComponent(JSON.stringify(args)) +
      '&callback=' + encodeURIComponent(callback) +
      '&_=' + Date.now();
    document.head.appendChild(script);
  });
}

function showLoading(show = true) {
  document.getElementById('loading').classList.toggle('hidden', !show);
  document.getElementById('loading').classList.toggle('flex', show);
}

function switchLoginTab(mode) {
  loginMode = mode;
  document.getElementById('formMahasiswaLogin').classList.toggle('hidden', mode !== 'mahasiswa');
  document.getElementById('formStaffLogin').classList.toggle('hidden', mode !== 'dosen' && mode !== 'admin');
  document.getElementById('formKhususLogin').classList.toggle('hidden', mode !== 'khusus');
  document.getElementById('btnMahasiswaTab').className = mode === 'mahasiswa' ? 'flex-1 btn bg-white text-epBlue' : 'flex-1 btn text-slate-500';
  document.getElementById('btnDosenTab').className = mode === 'dosen' ? 'flex-1 btn bg-white text-epBlue' : 'flex-1 btn text-slate-500';
  document.getElementById('btnAdminTab').className = mode === 'admin' ? 'flex-1 btn bg-white text-epBlue' : 'flex-1 btn text-slate-500';
  document.getElementById('btnKhususTab').className = mode === 'khusus' ? 'flex-1 btn bg-white text-epBlue' : 'flex-1 btn text-slate-500';
  ['mahasiswa','dosen','admin','khusus'].forEach(role => {
    const button = document.getElementById('btn' + (role === 'khusus' ? 'Khusus' : role.charAt(0).toUpperCase() + role.slice(1)) + 'Tab');
    if (button) button.setAttribute('aria-selected', String(role === mode));
  });
  document.getElementById('nim').required = mode === 'mahasiswa';
  document.getElementById('username').required = mode === 'dosen' || mode === 'admin';
  document.getElementById('password').required = mode === 'dosen' || mode === 'admin';
}

function toggleRegistration(show) {
  document.getElementById('loginForm').classList.toggle('hidden', show);
  document.getElementById('registrationForm').classList.toggle('hidden', !show);
  if (show) {
    toggleRegistrationFields();
    setTimeout(() => document.getElementById('regRole').focus(), 0);
  } else {
    setTimeout(() => document.getElementById(loginMode === 'mahasiswa' ? 'nim' : 'username').focus(), 0);
  }
}

function toggleRegistrationFields() {
  const isStudent = document.getElementById('regRole').value === 'mahasiswa';
  document.getElementById('regSemesterWrap').classList.toggle('hidden', !isStudent);
  document.getElementById('regSemester').required = isStudent;
  document.getElementById('regIdentifierLabel').textContent = isStudent ? 'NIM' : 'NIDN';
}

async function handleRegistration(e) {
  e.preventDefault();
  const password = document.getElementById('regPassword').value;
  if (password !== document.getElementById('regPasswordConfirm').value) {
    return Swal.fire('Validasi', 'Konfirmasi kata sandi tidak sama.', 'warning');
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return Swal.fire('Validasi', 'Kata sandi harus memuat huruf dan angka.', 'warning');
  }
  showLoading();
  try {
    const role = val('regRole');
    const res = await gs('registerAccount', {
      role, nama: val('regNama'), identifier: val('regIdentifier'),
      username: val('regUsername'), semester: role === 'mahasiswa' ? val('regSemester') : '',
      email: val('regEmail'), password
    });
    showLoading(false);
    await Swal.fire(res.success ? 'Registrasi Berhasil' : 'Registrasi Gagal', res.message, res.success ? 'success' : 'error');
    if (res.success) {
      e.target.reset();
      toggleRegistration(false);
      switchLoginTab(role);
    }
  } catch (err) {
    showLoading(false);
    Swal.fire('Error', String(err), 'error');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  showLoading();
  try {
    let res;
    if (loginMode === 'mahasiswa') {
      res = await gs('login', '', document.getElementById('studentPassword').value, document.getElementById('nim').value.trim());
    } else if (loginMode === 'khusus') {
      res = await gs('loginSpecialQr', document.getElementById('specialQrText').value.trim());
    } else {
      res = await gs('login', document.getElementById('username').value.trim(), document.getElementById('password').value, '');
      if (res.success && res.role !== loginMode) {
        res = { success: false, message: 'Akun ini bukan role ' + loginMode + '.' };
      }
    }
    showLoading(false);
    if (!res.success) return Swal.fire('Gagal Masuk', res.message, 'error');
    token = res.token;
    currentUser = res;
    localStorage.setItem('epremo_token', token);
    localStorage.setItem('epremo_user', JSON.stringify(res));
    bootApp(true);
  } catch (err) {
    showLoading(false);
    Swal.fire('Error', String(err), 'error');
  }
}

function bootApp(isFreshLogin = false) {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('appPage').classList.remove('hidden');
  document.getElementById('navUserName').textContent = currentUser.nama;
  document.getElementById('navUserRole').textContent = currentUser.role;
  renderMenu();
  const roleMenu = menuByRole[currentUser.role] || menuByRole.mahasiswa;
  const allowedViews = roleMenu.map(item => item[0]);
  const storedView = localStorage.getItem('epremo_last_view_' + currentUser.role);
  const initialView = !isFreshLogin && allowedViews.includes(storedView)
    ? storedView
    : 'dashboard';

  if (isFreshLogin) {
    localStorage.setItem('epremo_last_view_' + currentUser.role, 'dashboard');
  }

  preloadData().then(() => showView(initialView));
}

function renderMenu() {
  const menu = menuByRole[currentUser.role] || menuByRole.mahasiswa;
  document.getElementById('sidebarMenu').innerHTML = menu.map(m => `
    <button id="menu-${m[0]}" onclick="showView('${m[0]}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left hover:bg-white/10">
      <i class="fa-solid ${m[2]} w-5 text-center"></i><span>${m[1]}</span>
    </button>`).join('');
}

function toggleMobileMenu() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('mobileOverlay').classList.toggle('open');
}

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileOverlay').classList.remove('open');
}

async function preloadData() {
  const [r, s] = await Promise.all([gs('getRuanganList', token), gs('getMataKuliahList', token)]);
  rooms = r.success ? r.data : [];
  subjects = s.success ? s.data : [];
  monitoringRoom = rooms[0]?.kode || '';
}

function showView(view) {
  currentView = view;
  if (currentUser) localStorage.setItem('epremo_last_view_' + currentUser.role, view);
  closeMobileMenu();
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('#sidebarMenu button').forEach(el => el.classList.remove('nav-active'));
  const menu = document.getElementById('menu-' + view);
  if (menu) menu.classList.add('nav-active');
  document.getElementById('pageTitle').textContent = menu ? menu.textContent.trim() : 'E-Pre&Mo';
  if (monitorTimer) clearInterval(monitorTimer);
  if (view === 'dashboard') loadDashboard();
  if (view === 'monitoring') loadMonitoring();
  if (view === 'presensi') loadPresensi();
  if (view === 'pemesanan') loadPemesanan();
  if (view === 'qr-komputer') loadQrKomputer();
  if (view === 'pembuatan-qr') loadPembuatanQr();
  if (view === 'laporan') loadLaporan();
  if (view === 'profil') loadProfil();
  if (view === 'mahasiswa') loadMahasiswa();
  if (view === 'dosen') loadDosen();
  if (view === 'pengguna-khusus') loadPenggunaKhususAdmin();
  if (view === 'ruangan') loadRuangan();
}

function refreshCurrentView() { showView(currentView); }

async function loadDashboard() {
  const wrap = document.getElementById('view-dashboard');
  wrap.innerHTML = skeleton('Dashboard E-Pre&Mo');
  const res = await gs('getDashboardData', token);
  if (!res.success) return errorBox(wrap, res.message);
  const d = res.data;
  wrap.innerHTML = `
    <div class="grid lg:grid-cols-[1fr_360px] gap-4 md:gap-6">
      <div>
        <div class="card p-5 md:p-6 mb-4 md:mb-6 bg-gradient-to-r from-epBlue to-epBlue2 text-white">
          <p class="text-sm text-blue-100 font-semibold">Pengembangan Sistem Informasi Presensi dan Monitoring Penggunaan Ruangan Laboratorium Komputer Berbasis QR Code</p>
          <h2 class="text-2xl md:text-3xl font-extrabold mt-2">E-Pre&Mo</h2>
          <p class="mt-1">Pendidikan Informatika</p>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          ${statCard('Mahasiswa', d.mahasiswa, 'fa-user-graduate', 'text-epBlue')}
          ${statCard('Dosen', d.dosen, 'fa-user-tie', 'text-epBlue')}
          ${statCard('Ruangan Lab', d.ruangan, 'fa-building', 'text-epRed')}
          ${statCard('Komputer', d.komputer, 'fa-display', 'text-epBlue')}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-3 md:mt-4">
          ${statCard('Digunakan', d.digunakan, 'fa-circle-check', 'text-green-600')}
          ${statCard('Kosong', d.kosong, 'fa-circle', 'text-slate-500')}
          ${statCard('Maintenance', d.maintenance, 'fa-screwdriver-wrench', 'text-epRed')}
        </div>
      </div>
      <div class="card p-5">
        <h3 class="font-extrabold text-slate-900 mb-3">Profil Pengguna</h3>
        <div class="space-y-3 text-sm">
          ${infoRow('Nama', currentUser.nama)}
          ${infoRow(currentUser.role === 'mahasiswa' ? 'NIM' : 'NIDN/Username', currentUser.identifier || currentUser.username)}
          ${infoRow('Role', currentUser.role)}
          ${currentUser.role === 'mahasiswa' ? infoRow('Semester', currentUser.semester || '-') : ''}
          ${infoRow('Program Studi', currentUser.programStudi || 'Pendidikan Informatika')}
        </div>
      </div>
    </div>`;
}

async function loadMonitoring() {
  const wrap = document.getElementById('view-monitoring');
  wrap.innerHTML = monitoringShell();
  await refreshMonitoringData();
  monitorTimer = setInterval(refreshMonitoringData, 5000);
}

function monitoringShell() {
  return `
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
        <select id="roomSelect" class="field w-full md:w-64" onchange="monitoringRoom=this.value;selectedComputer=null;refreshMonitoringData()">
          ${rooms.map(r => `<option value="${r.kode}" ${r.kode === monitoringRoom ? 'selected' : ''}>${r.nama}</option>`).join('')}
        </select>
        <button class="btn btn-primary sm:w-auto" onclick="refreshMonitoringData()">Tampilkan</button>
      </div>
      <div class="text-xs font-bold text-slate-600"><span class="status-dot bg-green-600 mr-2"></span>Auto refresh: 5 detik</div>
    </div>
    <div id="monitoringContent"></div>`;
}

async function refreshMonitoringData() {
  if (!monitoringRoom && rooms[0]) monitoringRoom = rooms[0].kode;
  const res = await gs('getMonitoringData', token, monitoringRoom);
  const box = document.getElementById('monitoringContent');
  if (!res.success) return errorBox(box, res.message);
    const d = res.data;
    currentMonitoringComputers = d.komputer || [];
    box.innerHTML = `
    <div class="grid xl:grid-cols-[1fr_340px] gap-4 md:gap-5">
      <div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          ${miniInfo('Ruangan', d.ruangan.nama, 'fa-building')}
          ${miniInfo('Dosen', d.penggunaan.dosen, 'fa-user-tie')}
          ${miniInfo('Mata Kuliah', d.penggunaan.mataKuliah, 'fa-book-open')}
          ${miniInfo('Keperluan', d.penggunaan.keperluan, 'fa-clipboard-list')}
        </div>
        ${['admin', 'dosen'].includes(currentUser.role) && d.penggunaan.status === 'Sedang Digunakan'  ? `<button onclick="finishRoomUsage('${d.ruangan.kode}')"class="btn btn-danger mb-4"><i class="fa-solid fa-circle-stop mr-2"></i>${currentUser.role === 'dosen'  ? 'Selesai Menggunakan Ruangan'  : 'Tutup Penggunaan Ruangan'  } </button> ` : ''}
        <div class="card p-3 md:p-5 overflow-auto">
          <div class="mx-auto max-w-4xl min-w-[320px]">
            <div class="h-10 bg-gradient-to-b from-slate-700 to-slate-900 rounded text-white flex items-center justify-center text-xs font-extrabold mb-6 shadow">MONITOR / LCD PROYEKTOR</div>
            <div class="flex justify-between items-center mb-3">
              <div class="w-16 md:w-20 h-24 md:h-28 border-l-8 border-amber-800 bg-amber-600 rounded-r flex items-center justify-center text-white text-xs font-bold">PINTU</div>
              <div class="text-center">
                <div class="w-24 md:w-32 h-10 md:h-12 bg-amber-500 rounded shadow mb-1"></div>
                <p class="text-xs font-extrabold text-epBlue">MEJA DOSEN</p>
              </div>
            </div>
            <div class="lab-grid">
              ${d.komputer.map(pc => pcSeat(pc)).join('')}
            </div>
          </div>
        </div>
        <div class="card p-4 mt-3 flex flex-wrap gap-3 md:gap-5 text-xs font-bold">
          <span><span class="status-dot bg-green-600 mr-2"></span>Digunakan</span>
          <span><span class="status-dot bg-slate-300 border mr-2"></span>Kosong</span>
          <span><span class="status-dot bg-epRed mr-2"></span>Maintenance</span>
          <span class="w-full md:w-auto md:ml-auto">Total ${d.ringkasan.total} | Digunakan ${d.ringkasan.digunakan} | Kosong ${d.ringkasan.kosong} | Maintenance ${d.ringkasan.maintenance} | Okupansi ${d.ringkasan.okupansi}%</span>
        </div>
      </div>
      <div id="pcDetail">${renderPcDetail(d.komputer)}</div>
    </div>`;
}

async function finishRoomUsage(kodeRuangan) {
  const ask = await Swal.fire({
    title: 'Selesaikan penggunaan ruangan?',
    text: 'Jam selesai akan dicatat dan seluruh komputer pada ruangan ini akan dikosongkan.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Ya, Selesai',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#E21B2D'
  });

  if (!ask.isConfirmed) return;

  showLoading();

  const res = await gs(
    'closeRoomUsage',
    token,
    kodeRuangan
  );

  showLoading(false);

  await Swal.fire(
    res.success ? 'Berhasil' : 'Gagal',
    res.message,
    res.success ? 'success' : 'error'
  );

  if (res.success) {
    selectedComputer = null;
    await refreshMonitoringData();
  }
}
  
function pcSeat(pc) {
  const cls = pc.status === 'Digunakan' ? 'used' : pc.status === 'Maintenance' ? 'maintenance' : '';
  const sel = selectedComputer && selectedComputer.nomor === pc.nomor ? 'selected' : '';
  return `<button class="pc-seat" onclick='selectComputer(${pc.nomor})' title="Komputer ${pad2(pc.nomor)} - ${pc.status}">
    <div class="monitor ${cls} ${sel}">${pad2(pc.nomor)}</div>
    <div class="desk"></div>
    <div class="chair"></div>
  </button>`;
}

function selectComputer(nomor) {
  selectedComputer = currentMonitoringComputers.find(pc => Number(pc.nomor) === Number(nomor)) || null;
  document.querySelectorAll('.monitor.selected').forEach(el => el.classList.remove('selected'));
  const detail = document.getElementById('pcDetail');
  if (detail) detail.innerHTML = renderPcDetail(currentMonitoringComputers);
  const btn = [...document.querySelectorAll('.pc-seat')].find(el => el.title && el.title.indexOf('Komputer ' + pad2(nomor)) >= 0);
  if (btn) btn.querySelector('.monitor')?.classList.add('selected');
}

function renderPcDetail(list) {
  const pc = selectedComputer || list.find(x => x.status === 'Digunakan') || list[0];
  if (!pc) return '';
  const isAdmin = currentUser.role === 'admin';
  const isAvailable = pc.status === 'Kosong';
  return `
    <div class="card p-5 sticky top-20">
      <h3 class="font-extrabold text-epBlue text-lg mb-4">Informasi Komputer</h3>
      <div class="flex items-center gap-4 pb-4 border-b">
        <div class="w-20 h-20 rounded-full bg-epBlue flex items-center justify-center">
          <div class="monitor ${pc.status === 'Digunakan' ? 'used' : pc.status === 'Maintenance' ? 'maintenance' : ''}">${pad2(pc.nomor)}</div>
        </div>
        <div>
          <h4 class="font-extrabold text-xl">Komputer ${pad2(pc.nomor)}</h4>
          <p class="text-sm mt-1">Status: <span class="font-bold ${pc.status === 'Digunakan' ? 'text-green-600' : pc.status === 'Maintenance' ? 'text-epRed' : 'text-slate-500'}">${pc.status}</span></p>
        </div>
      </div>
      <div class="py-3 space-y-3 text-sm">
        ${infoRow('Pengguna', pc.pengguna || '-')}
        ${infoRow('NIM/NIDN', pc.identifier || '-')}
        ${infoRow('Jam Masuk', pc.jamMulai || '-')}
        ${infoRow('Keperluan', pc.keperluan || '-')}
        ${infoRow('Dosen', pc.dosen || '-')}
      </div>
      ${isAvailable && currentUser.role === 'dosen' ? `<button onclick="useComputer(${pc.nomor})" class="btn btn-primary w-full mb-2">Gunakan Komputer Ini</button>` : ''}
      ${isAvailable && currentUser.role === 'mahasiswa' ? `<button onclick="openScanner()" class="btn btn-primary w-full mb-2">Scan QR di Meja Komputer</button>` : ''}
      ${pc.status === 'Digunakan' ? `<button onclick="releaseSelected(${pc.nomor})" class="btn btn-light w-full mb-2">Selesai Gunakan</button>` : ''}
      ${isAdmin ? `<button onclick="setPcStatus(${pc.nomor}, 'Kosong')" class="btn btn-light w-full mb-2">Set Kosong</button><button onclick="setPcStatus(${pc.nomor}, 'Maintenance')" class="btn btn-danger w-full mb-2">Set Maintenance</button><button onclick="shutdownSelected(${pc.nomor})" class="btn btn-danger w-full">Matikan Manual oleh Admin</button>` : ''}
    </div>`;
}

async function setPcStatus(no, status) {
  const res = await gs('setComputerStatus', token, monitoringRoom, no, status);
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) {
    selectedComputer = null;
    refreshMonitoringData();
  }
}

async function useComputer(no) {
  const { value: form } = await Swal.fire({
    title: 'Gunakan Komputer ' + pad2(no),
    html: `
      <select id="swPurpose" class="swal2-input"><option>Praktik</option><option>Materi</option><option>Penelitian</option></select>
      <select id="swSubject" class="swal2-input"><option value="">Pilih Mata Kuliah</option>${subjects.map(s => `<option>${s.nama}</option>`).join('')}</select>
      <input id="swDosen" class="swal2-input" placeholder="Dosen penanggung jawab">`,
    preConfirm: () => ({ keperluan: document.getElementById('swPurpose').value, mataKuliah: document.getElementById('swSubject').value, dosen: document.getElementById('swDosen').value })
  });
  if (!form) return;
  const res = await gs('assignComputer', token, { kodeRuangan: monitoringRoom, nomorKomputer: no, ...form });
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  selectedComputer = null;
  refreshMonitoringData();
}

async function releaseSelected(no) {
  const res = await gs('releaseComputer', token, monitoringRoom, no, 'Selesai digunakan');
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  selectedComputer = null;
  refreshMonitoringData();
}

async function shutdownSelected(no) {
  const ask = await Swal.fire({ title: 'Matikan komputer?', text: 'Admin akan mengosongkan dan mencatat komputer ini dimatikan manual.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Matikan' });
  if (!ask.isConfirmed) return;
  const res = await gs('shutdownComputer', token, monitoringRoom, no);
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  selectedComputer = null;
  refreshMonitoringData();
}

async function loadPresensi() {
  const res = await gs('getPresensiList', token, 150);
  document.getElementById('view-presensi').innerHTML = `
    <div class="card p-5 mb-4">
      <div class="flex justify-between gap-3 flex-wrap">
        <div>
          <h3 class="font-extrabold text-lg">Presensi QR Code</h3>
          <p class="text-sm text-slate-500">Riwayat masuk/keluar penggunaan ruangan dan komputer laboratorium.</p>
        </div>
        <button onclick="openScanner()" class="btn btn-danger"><i class="fa-solid fa-qrcode mr-2"></i>Buka Scanner QR</button>
      </div>
      <div id="qrPreview" class="mt-4"></div>
    </div>
    ${table(['Tanggal','Jam Masuk','Jam Keluar','NIM/NIDN','Nama','Role','Ruangan','Komputer','Keperluan','Status','Sumber','Waktu Server','Lokasi'], (res.data || []).map(d => [d.tanggal,d.jamMasuk,d.jamKeluar,d.identifier,d.nama,d.role,d.kodeRuangan,pad2(d.nomorKomputer || ''),d.keperluan,d.status,d.sumberScan || '-',d.timestampServer || '-',d.statusLokasi || '-']))}`;
}

function openScanner() {
  window.open(DEPLOYMENT_URL, '_blank');
}

function checkQrResult() {
  const raw = localStorage.getItem('epremo_qr_result');
  if (!raw) return;
  try {
    const item = JSON.parse(raw);
    if (!item.ts || item.ts <= lastQrTs) return;
    lastQrTs = item.ts;
    localStorage.removeItem('epremo_qr_result');
    if (!currentUser && loginMode === 'khusus') {
      document.getElementById('specialQrText').value = item.value;
      Swal.fire('QR Terbaca', 'QR pengguna khusus sudah masuk ke form login.', 'success');
      return;
    }
    if (!currentUser || !token) return;
    processQrValue(item.value, item.source || 'camera');
  } catch (err) {
    localStorage.removeItem('epremo_qr_result');
  }
}

async function processQrValue(value, source) {
  let payload = {};
  try {
    payload = JSON.parse(value);
  } catch (err) {
    payload = { nomorKomputer: value };
  }

  if (payload.type === 'E_PREMO_SPECIAL') {
    if (!currentUser) {
      switchLoginTab('khusus');
      document.getElementById('specialQrText').value = value;
      Swal.fire('QR Pengguna Khusus', 'Silakan tekan Masuk E-Pre&Mo untuk melanjutkan registrasi.', 'info');
    }
    return;
  }

  if (payload.type === 'E_PREMO_ROOM') {
    if (currentUser.role !== 'dosen' && currentUser.role !== 'admin') {
      Swal.fire('Akses Ditolak', 'QR ruangan digunakan untuk pemesanan/penggunaan ruangan oleh dosen.', 'warning');
      return;
    }
    pendingRoomQr = value;
    pendingRoomCode = payload.kodeRuangan;
    showView('pemesanan');
    return;
  }

  const nomor = Number(payload.nomorKomputer || payload.nomor || payload.pc || value);
  const room = payload.kodeRuangan || payload.ruangan || monitoringRoom || rooms[0]?.kode;
  if (!room || !nomor) {
    Swal.fire('QR Tidak Valid', 'Kode QR harus memuat nomor komputer dan ruangan, atau minimal nomor komputer.', 'warning');
    return;
  }

  let manualReason = '';
  if (source === 'manual' && currentUser.role === 'mahasiswa') {
    const reason = await Swal.fire({
      title: 'Alasan Presensi Manual',
      text: 'Manual hanya boleh digunakan jika kamera blur/rusak.',
      input: 'select',
      inputOptions: {
        'Kamera blur': 'Kamera blur',
        'Kamera rusak': 'Kamera rusak',
        'Kamera tidak dapat membaca QR': 'Kamera tidak dapat membaca QR'
      },
      inputPlaceholder: 'Pilih alasan',
      showCancelButton: true,
      confirmButtonText: 'Lanjutkan'
    });
    if (!reason.isConfirmed || !reason.value) return;
    manualReason = reason.value;
  }
  let keperluan = payload.keperluan || '';
  let mataKuliah = payload.mataKuliah || '';
  let dosen = payload.dosen || '';
  if (currentUser.role === 'mahasiswa') {
  const dosenOptions = [
    ...new Set(
      subjects
        .map(subject => subject.dosen)
        .filter(Boolean)
    )
  ];

  const form = await Swal.fire({
    title: 'Presensi Komputer ' + pad2(nomor),

    html: `
      <div style="text-align:left; padding:0 12px;">
        <p style="margin-bottom:14px; color:#64748b; font-size:13px;">
          Ruangan:
          <b style="color:#0B3A75;">${room}</b>
        </p>

        <label
          for="qrPurpose"
          style="display:block; margin-bottom:6px; font-size:12px; font-weight:700;"
        >
          Keperluan
        </label>

        <select
          id="qrPurpose"
          class="swal2-select"
          style="display:block; width:100%; margin:0 0 14px;"
        >
          <option value="">Pilih Keperluan</option>
          <option value="Praktik">Praktik</option>
          <option value="Materi">Materi</option>
          <option value="Penelitian">Penelitian</option>
        </select>

        <label
          for="qrSubject"
          style="display:block; margin-bottom:6px; font-size:12px; font-weight:700;"
        >
          Mata Kuliah
        </label>

        <select
          id="qrSubject"
          class="swal2-select"
          style="display:block; width:100%; margin:0 0 14px;"
        >
          <option value="">Pilih Mata Kuliah</option>

          ${subjects
            .map(subject => `
              <option value="${subject.nama}">
                ${subject.nama}
              </option>
            `)
            .join('')}
        </select>

        <label
          for="qrDosen"
          style="display:block; margin-bottom:6px; font-size:12px; font-weight:700;"
        >
          Dosen Penanggung Jawab
        </label>

        <select
          id="qrDosen"
          class="swal2-select"
          style="display:block; width:100%; margin:0;"
        >
          <option value="">Pilih Dosen</option>

          ${dosenOptions
            .map(namaDosen => `
              <option value="${namaDosen}">
                ${namaDosen}
              </option>
            `)
            .join('')}
        </select>
      </div>
    `,

    showCancelButton: true,
    confirmButtonText: 'Submit Presensi',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#0B3A75',

    preConfirm: () => {
      const purpose =
        document.getElementById('qrPurpose').value;

      const subject =
        document.getElementById('qrSubject').value;

      const lecturer =
        document.getElementById('qrDosen').value;

      if (!purpose) {
        Swal.showValidationMessage(
          'Pilih keperluan penggunaan komputer.'
        );

        return false;
      }

      if (!subject) {
        Swal.showValidationMessage(
          'Pilih mata kuliah terlebih dahulu.'
        );

        return false;
      }

      if (!lecturer) {
        Swal.showValidationMessage(
          'Pilih dosen penanggung jawab.'
        );

        return false;
      }

      return {
        keperluan: purpose,
        mataKuliah: subject,
        dosen: lecturer
      };
    }
  });

  if (!form.isConfirmed) return;

  keperluan = form.value.keperluan;
  mataKuliah = form.value.mataKuliah;
  dosen = form.value.dosen;
  } else {
    const confirm = await Swal.fire({
      title: 'Gunakan Komputer ' + pad2(nomor) + '?',
      text: 'Ruangan: ' + room,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Gunakan'
    });
    if (!confirm.isConfirmed) return;
  }

  const audit = await collectAttendanceAudit(source);
  const res = await gs('assignComputer', token, {
    kodeRuangan: room,
    nomorKomputer: nomor,
    qrText: source === 'manual' ? '' : value,
    qrSource: source,
    manualReason,
    keperluan: keperluan || 'Praktik',
    mataKuliah,
    dosen,
    audit
  });
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (currentView === 'monitoring') refreshMonitoringData();
}

function getBrowserSummary() {
  const ua = navigator.userAgent || '';
  const match = ua.match(/(Edg|Chrome|Firefox|Safari)\/([\d.]+)/);
  return match ? match[1] + ' ' + match[2] : ua.slice(0, 180);
}

function getDeviceSummary() {
  return [
    navigator.platform || 'platform tidak diketahui',
    (navigator.language || ''),
    screen.width + 'x' + screen.height,
    navigator.maxTouchPoints ? 'touch' : 'non-touch'
  ].filter(Boolean).join(' | ').slice(0, 120);
}

function requestLocationWithConsent() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

async function collectAttendanceAudit(source) {
  const consent = await Swal.fire({
    title: 'Bagikan lokasi saat presensi?',
    text: 'Lokasi hanya dicatat untuk memeriksa radius presensi. Anda dapat menolak; kebijakan admin dapat mewajibkannya.',
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'Izinkan lokasi',
    cancelButtonText: 'Lanjut tanpa lokasi'
  });
  const location = consent.isConfirmed ? await requestLocationWithConsent() : null;
  if (consent.isConfirmed && !location) {
    await Swal.fire('Lokasi tidak tersedia', 'Izin ditolak atau perangkat tidak memperoleh lokasi. Presensi akan dicoba sesuai kebijakan admin.', 'warning');
  }
  return {
    source: source || 'unknown',
    clientTimestamp: new Date().toISOString(),
    device: getDeviceSummary(),
    browser: getBrowserSummary(),
    latitude: location ? location.latitude : null,
    longitude: location ? location.longitude : null,
    accuracy: location ? location.accuracy : null
  };
}

async function loadPemesanan() {
  if (currentUser.role === 'pengguna_khusus') {
    return loadRegistrasiKhusus();
  }

  const res = await gs('getBookingList', token);
  const bookings = res.data || [];

  const bookingRows = bookings.map(d => [
    d.tanggal,
    d.jamMulai + ' - ' + d.jamSelesai,
    d.kodeRuangan,
    d.nomorKomputer || '-',
    d.nama,
    d.keperluan,
    `<span class="booking-status">${d.status || '-'}</span>`
  ]);

  document.getElementById('view-pemesanan').innerHTML = `
    <div class="booking-page grid lg:grid-cols-[360px_1fr] gap-5 items-start">
      <form
        onsubmit="submitRoomUsage(event)"
        class="booking-form-card card p-5 space-y-4"
      >
        <div class="booking-form-header">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <i class="fa-solid fa-calendar-check text-xl"></i>
            </div>

            <div>
              <h3 class="font-extrabold text-lg">Pemesanan Ruangan</h3>
              <p class="text-xs text-blue-100 mt-1">
                Lengkapi data penggunaan laboratorium.
              </p>
            </div>
          </div>
        </div>

        <div>
          <span class="booking-label">
            <i class="fa-solid fa-qrcode"></i>
            QR Pintu Laboratorium
          </span>

          <button
            type="button"
            onclick="openScanner()"
            class="btn btn-primary w-full"
          >
            <i class="fa-solid fa-camera mr-2"></i>
            Scan QR Pintu Lab
          </button>

          <div
            id="roomQrStatus"
            class="booking-qr-status mt-2 ${pendingRoomCode ? 'ready' : ''}"
            role="status"
          >
            <i class="fa-solid ${
              pendingRoomCode ? 'fa-circle-check' : 'fa-circle-info'
            }"></i>

            <span>
              ${
                pendingRoomCode
                  ? 'QR terbaca: ' + pendingRoomCode
                  : 'Belum ada QR ruangan yang dipindai'
              }
            </span>
          </div>
        </div>

        <div>
          <label for="roomPurpose" class="booking-label">
            <i class="fa-solid fa-clipboard-list"></i>
            Keperluan
          </label>

          <select id="roomPurpose" class="field" required>
            <option>Praktik</option>
            <option>Materi</option>
            <option>Penelitian</option>
          </select>
        </div>

        <div>
          <label for="roomSubject" class="booking-label">
            <i class="fa-solid fa-book-open"></i>
            Mata Kuliah
          </label>

          <select id="roomSubject" class="field" required>
            <option value="">Pilih Mata Kuliah</option>
            ${subjects.map(s => `<option>${s.nama}</option>`).join('')}
          </select>
        </div>

        <div>
          <label for="roomDosen" class="booking-label">
            <i class="fa-solid fa-user-tie"></i>
            Dosen Penanggung Jawab
          </label>

          <input
            id="roomDosen"
            class="field"
            value="${currentUser.nama || ''}"
            placeholder="Nama dosen"
            autocomplete="name"
            required
          >
        </div>

        <button class="btn btn-danger w-full">
          <i class="fa-solid fa-paper-plane mr-2"></i>
          Submit Penggunaan Ruangan
        </button>
      </form>

      <div class="booking-history min-w-0">
        <div class="booking-history-title">
          <div>
            <h3 class="font-extrabold text-lg text-slate-900">
              Riwayat Pemesanan
            </h3>

            <p class="text-sm text-slate-500 mt-1">
              Daftar penggunaan ruangan yang pernah diajukan.
            </p>
          </div>

          <span class="booking-count">
            ${bookings.length} data
          </span>
        </div>

        ${responsiveDataView(
          [
            'Tanggal',
            'Jam',
            'Ruangan',
            'Komputer',
            'Pemesan',
            'Keperluan',
            'Status'
          ],
          bookingRows
        )}
      </div>
    </div>
  `;
}

async function submitRoomUsage(e) {
  e.preventDefault();

  if (!pendingRoomQr) {
    Swal.fire('QR Belum Ada', 'Scan QR pintu lab terlebih dahulu.', 'warning');
    return;
  }

  const kodeRuangan = pendingRoomCode;
  const keperluan = val('roomPurpose');
  const mataKuliah = val('roomSubject');
  const dosen = val('roomDosen');
  const sekarang = new Date();
  const tanggal = sekarang.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });
  const jamMulai = sekarang.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false
  });

  showLoading();

  const penggunaan = await gs('startRoomUsage', token, {
    qrText: pendingRoomQr,
    kodeRuangan,
    keperluan,
    mataKuliah,
    dosen
  });

  if (!penggunaan.success) {
    showLoading(false);
    return Swal.fire('Gagal', penggunaan.message, 'error');
  }

  const pemesanan = await gs('createBooking', token, {
    tanggal,
    jamMulai,
    jamSelesai: '',
    kodeRuangan,
    nomorKomputer: '',
    nama: currentUser.nama,
    identifier: currentUser.identifier || '',
    keperluan,
    catatan: mataKuliah ? 'Mata Kuliah: ' + mataKuliah : ''
  });

  showLoading(false);
  pendingRoomQr = '';
  pendingRoomCode = '';

  if (!pemesanan.success) {
    await Swal.fire(
      'Penggunaan Aktif',
      'Ruangan berhasil digunakan, tetapi data laporan gagal disimpan: ' + pemesanan.message,
      'warning'
    );
  } else {
    await Swal.fire(
      'Berhasil',
      'Penggunaan ruangan aktif dan data laporan berhasil disimpan.',
      'success'
    );
  }

  loadPemesanan();
}

async function loadRegistrasiKhusus() {
  document.getElementById('view-pemesanan').innerHTML = `
    <form onsubmit="submitSpecialRegistration(event)" class="card p-5 space-y-3 max-w-2xl">
      <h3 class="font-extrabold text-lg">Registrasi Penggunaan Ruangan/Komputer</h3>
      <p class="text-sm text-slate-500">Isi data diri dan keperluan penggunaan. Admin akan menentukan apakah penggunaan diperbolehkan.</p>
      <input id="spNama" class="field" placeholder="Nama lengkap" required>
      <input id="spIdentitas" class="field" placeholder="Identitas" required>
      <input id="spInstansi" class="field" placeholder="Instansi">
      <input id="spNoHp" class="field" placeholder="No HP">
      <input id="spEmail" class="field" placeholder="Email">
      <textarea id="spKeperluan" class="field" placeholder="Keperluan penggunaan" required></textarea>
      <select id="spRoom" class="field" onchange="renderSpecialComputerOptions()">${rooms.map(r => `<option value="${r.kode}">${r.nama}</option>`).join('')}</select>
      <select id="spComputer" class="field"><option value="">Tidak menggunakan komputer</option></select>
      <button class="btn btn-danger w-full">Kirim Registrasi</button>
    </form>`;
  renderSpecialComputerOptions();
}

function renderSpecialComputerOptions() {
  const room = val('spRoom');
  const select = document.getElementById('spComputer');
  if (!select) return;
  select.innerHTML = '<option value="">Tidak menggunakan komputer</option>' + Array.from({length: 30}, (_, i) => `<option value="${i+1}">Komputer ${pad2(i+1)}</option>`).join('');
}

async function submitSpecialRegistration(e) {
  e.preventDefault();
  const res = await gs('registerSpecialUser', token, {
    nama: val('spNama'),
    identitas: val('spIdentitas'),
    instansi: val('spInstansi'),
    noHp: val('spNoHp'),
    email: val('spEmail'),
    keperluan: val('spKeperluan'),
    kodeRuangan: val('spRoom'),
    nomorKomputer: val('spComputer')
  });
  Swal.fire(res.success ? 'Terkirim' : 'Gagal', res.message, res.success ? 'success' : 'error');
}

async function loadQrKomputer() {
  if (currentUser.role !== 'admin') {
    document.getElementById('view-qr-komputer').innerHTML = `<div class="card p-6 text-epRed font-bold">Menu QR komputer hanya untuk admin.</div>`;
    return;
  }
  document.getElementById('view-qr-komputer').innerHTML = `
    <div class="card p-5 mb-4">
      <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h3 class="font-extrabold text-lg">QR Komputer Permanen</h3>
          <p class="text-sm text-slate-500">QR dibuat oleh admin, dicetak, lalu ditempel pada meja komputer sesuai nomor komputer.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <select id="qrRoomSelect" class="field">${rooms.map(r => `<option value="${r.kode}">${r.nama}</option>`).join('')}</select>
          <button onclick="renderComputerQr()" class="btn btn-primary">Tampilkan QR</button>
          <button onclick="window.print()" class="btn btn-danger">Cetak</button>
        </div>
      </div>
    </div>
    <div id="qrComputerGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>`;
  renderComputerQr();
}

async function loadPembuatanQr() {
  if (currentUser.role !== 'admin') {
    document.getElementById('view-pembuatan-qr').innerHTML = `<div class="card p-6 text-epRed font-bold">Menu pembuatan QR hanya untuk admin.</div>`;
    return;
  }
  document.getElementById('view-pembuatan-qr').innerHTML = `
    <div class="card p-5 mb-4">
      <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h3 class="font-extrabold text-lg">Pembuatan QR Code</h3>
          <p class="text-sm text-slate-500">Buat QR paten untuk pintu ruangan, meja komputer, dan login pengguna khusus.</p>
        </div>
        <button onclick="window.print()" class="btn btn-danger">Cetak Halaman QR</button>
      </div>
      <div class="grid sm:grid-cols-3 gap-2 mt-4">
        <button onclick="renderQrKomputerAdmin()" class="btn btn-primary">QR Komputer</button>
        <button onclick="renderQrRuanganAdmin()" class="btn btn-primary">QR Ruangan</button>
        <button onclick="renderQrKhususAdmin()" class="btn btn-primary">QR Pengguna Khusus</button>
      </div>
    </div>
    <div id="qrAdminArea"></div>`;
  renderQrKomputerAdmin();
}

async function renderQrKomputerAdmin() {
  const area = document.getElementById('qrAdminArea');
  area.innerHTML = `
    <div class="card p-4 mb-4 flex flex-col sm:flex-row gap-2">
      <select id="adminQrRoom" class="field">${rooms.map(r => `<option value="${r.kode}">${r.nama}</option>`).join('')}</select>
      <button onclick="makeComputerQrs()" class="btn btn-primary">Tampilkan</button>
    </div>
    <div id="adminQrGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>`;
  makeComputerQrs();
}

async function makeComputerQrs() {
  const room = val('adminQrRoom') || rooms[0]?.kode || '';
  const res = await gs('getComputerQrList', token, room);
  renderQrCards('adminQrGrid', res);
}

async function renderQrRuanganAdmin() {
  const area = document.getElementById('qrAdminArea');
  area.innerHTML = `<div id="adminQrGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>`;
  const res = await gs('getRoomQrList', token);
  renderQrCards('adminQrGrid', res);
}

async function renderQrKhususAdmin() {
  const area = document.getElementById('qrAdminArea');
  area.innerHTML = `
    <div class="card p-4 mb-4 flex flex-col sm:flex-row gap-2">
      <input id="specialQrCount" type="number" min="1" value="1" class="field" placeholder="Jumlah QR">
      <button onclick="makeSpecialQrs()" class="btn btn-primary">Buat QR Khusus</button>
    </div>
    <div id="adminQrGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>`;
}

async function makeSpecialQrs() {
  const count = Number(document.getElementById('specialQrCount')?.value || 1);
  const res = await gs('getSpecialQrList', token, count);
  renderQrCards('adminQrGrid', res);
}

function renderQrCards(targetId, res) {
  const box = document.getElementById(targetId);
  if (!res.success) {
    box.innerHTML = `<div class="card p-6 text-epRed font-bold">${res.message}</div>`;
    return;
  }
  box.innerHTML = (res.data || []).map((item, i) => `
    <div class="card p-4 text-center break-inside-avoid">
      <h4 class="font-extrabold text-epBlue">${item.label || item.qrId || item.kodeRuangan}</h4>
      <div id="${targetId}-card-${i}" class="flex justify-center my-3"></div>
      <p class="text-xs text-slate-500">E-Pre&Mo - Pendidikan Informatika</p>
    </div>`).join('');
  (res.data || []).forEach((item, i) => {
    new QRCode(document.getElementById(targetId + '-card-' + i), {
      text: item.payload,
      width: 180,
      height: 180,
      colorDark: '#0B3A75',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H
    });
  });
}

async function renderComputerQr() {
  const room = val('qrRoomSelect') || rooms[0]?.kode || '';
  const box = document.getElementById('qrComputerGrid');
  box.innerHTML = `<div class="card p-6 text-slate-500 font-bold">Membuat QR komputer...</div>`;
  const res = await gs('getComputerQrList', token, room);
  if (!res.success) {
    box.innerHTML = `<div class="card p-6 text-epRed font-bold">${res.message}</div>`;
    return;
  }
  box.innerHTML = (res.data || []).map((item, i) => `
    <div class="card p-4 text-center break-inside-avoid">
      <h4 class="font-extrabold text-epBlue">${item.kodeRuangan}</h4>
      <p class="text-3xl font-extrabold text-slate-900">Komputer ${pad2(item.nomorKomputer)}</p>
      <div id="qr-card-${i}" class="flex justify-center my-3"></div>
      <p class="text-xs text-slate-500">E-Pre&Mo - Pendidikan Informatika</p>
    </div>`).join('');
  (res.data || []).forEach((item, i) => {
    new QRCode(document.getElementById('qr-card-' + i), {
      text: item.payload,
      width: 180,
      height: 180,
      colorDark: '#0B3A75',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H
    });
  });
}

async function loadLaporan() {
  const today = new Date().toISOString().slice(0,10);
  const monthStart = today.slice(0, 8) + '01';
  const archive = await gs('getArchiveList', token);
  const folder = await gs('getArchiveFolderUrl', token);
  document.getElementById('view-laporan').innerHTML = `
    <div class="grid xl:grid-cols-[380px_1fr] gap-4 md:gap-5">
      <div class="space-y-5">
        <form onsubmit="previewReport(event)" class="card p-4 md:p-5 space-y-3">
          <h3 class="font-extrabold text-lg">Laporan Data</h3>
          <p class="text-sm text-slate-500">Buat arsip data penggunaan, pemesanan, atau data pengguna ke folder Google Drive.</p>
          ${folder.success ? `<a href="${folder.url}" target="_blank" class="btn btn-primary block text-center">Buka Folder Drive Arsip</a>` : `<p class="text-xs text-epRed">${folder.message || ''}</p>`}
          <select id="reportType" class="field" onchange="toggleReportFilters()">
            <option value="penggunaan">Penggunaan Laboratorium Komputer</option>
            <option value="pemesanan">Pemesanan Ruangan dan Komputer</option>
            ${currentUser.role === 'admin' ? '<option value="pengguna">Data Pengguna</option>' : ''}
          </select>
          <div class="grid grid-cols-2 gap-2 mobile-stack" id="reportDateFields">
            <input id="reportStart" type="date" class="field" value="${monthStart}">
            <input id="reportEnd" type="date" class="field" value="${today}">
          </div>
          <select id="reportRoom" class="field">
            <option value="">Semua Ruangan</option>
            ${rooms.map(r => `<option value="${r.kode}">${r.nama}</option>`).join('')}
          </select>
          <select id="reportRole" class="field">
            <option value="">Semua Role</option>
            <option value="mahasiswa">Mahasiswa</option>
            <option value="dosen">Dosen</option>
          </select>
          <div class="grid grid-cols-2 gap-2 mobile-stack">
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-eye mr-2"></i>Tampilkan</button>
            <button class="btn btn-danger" type="button" onclick="archiveCurrentReport()"><i class="fa-solid fa-folder-plus mr-2"></i>Arsipkan</button>
          </div>
        </form>
        <div class="archive-panel card p-4 md:p-5">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 class="font-extrabold text-lg">Arsip Tersimpan</h3>
              <p class="text-xs text-slate-500 mt-1">Ketuk arsip untuk membuka file.</p>
            </div>
            <span class="booking-count">${(archive.data || []).length} arsip</span>
          </div>
          <div class="archive-list">
            ${(archive.data || []).length ? archive.data.map(a => `
              <a href="${a.url}" target="_blank" rel="noopener noreferrer" class="archive-item">
                <span class="archive-icon"><i class="fa-solid fa-file-arrow-down"></i></span>
                <span class="archive-content">
                  <span class="block font-extrabold text-sm text-epBlue">${a.jenis}</span>
                  <span class="archive-meta">
                    <span><i class="fa-regular fa-calendar mr-1"></i>${a.tanggal}</span>
                    <span><i class="fa-solid fa-database mr-1"></i>${a.jumlah} data</span>
                  </span>
                  <span class="archive-file block">${a.file}</span>
                </span>
                <i class="fa-solid fa-chevron-right text-xs text-slate-400 mt-3"></i>
              </a>`).join('') : '<p class="text-sm text-slate-400">Belum ada arsip laporan.</p>'}
          </div>
        </div>
      </div>
      <div>
        <div id="reportSummary" class="card p-4 md:p-5 mb-4">
          <h3 class="font-extrabold text-lg">Pratinjau Laporan</h3>
          <p class="text-sm text-slate-500">Pilih filter lalu tampilkan data sebelum diarsipkan.</p>
        </div>
        <div id="reportTable">
          <div class="desktop-table">${table(['Info'], [['Belum ada pratinjau laporan']])}</div>
          <div class="mobile-cards"><div class="card p-4 text-sm text-slate-500">Belum ada pratinjau laporan.</div></div>
        </div>
      </div>
    </div>`;
  toggleReportFilters();
}

function toggleReportFilters() {
  const type = val('reportType');
  const isUserReport = type === 'pengguna';
  document.getElementById('reportDateFields').classList.toggle('hidden', isUserReport);
  document.getElementById('reportRoom').classList.toggle('hidden', isUserReport);
}

function reportFilters() {
  const type = val('reportType');
  return {
    jenis: type,
    mulai: type === 'pengguna' ? '' : val('reportStart'),
    selesai: type === 'pengguna' ? '' : val('reportEnd'),
    kodeRuangan: type === 'pengguna' ? '' : val('reportRoom'),
    role: val('reportRole')
  };
}
  function mergeJamMasukKeluar(headers, rows) {
  const headerNames = headers.map(header =>
    String(header)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  );

  const tanggalIndex = headerNames.indexOf('tanggal');
  const jamMasukIndex = headerNames.indexOf('jam masuk');
  const jamKeluarIndex = headerNames.indexOf('jam keluar');

  const identitasIndex = headerNames.findIndex(header =>
    header.includes('nim') ||
    header.includes('nidn') ||
    header.includes('identitas') ||
    header.includes('identifier')
  );

  if (
    tanggalIndex === -1 ||
    jamMasukIndex === -1 ||
    jamKeluarIndex === -1
  ) {
    return rows;
  }

  const kosong = value => {
    const text = String(value ?? '').trim().toLowerCase();

    return (
      text === '' ||
      text === '-' ||
      text === 'null' ||
      text === 'undefined'
    );
  };

  const hasil = [];

  rows.forEach(originalRow => {
    const row = [...originalRow];

    const tanggal = String(row[tanggalIndex] ?? '').trim();
    const identitas =
      identitasIndex !== -1
        ? String(row[identitasIndex] ?? '').trim()
        : '';

    const adaJamMasuk = !kosong(row[jamMasukIndex]);
    const adaJamKeluar = !kosong(row[jamKeluarIndex]);

    /*
     * Jika baris hanya memiliki jam keluar,
     * cari baris jam masuk sebelumnya.
     */
    if (!adaJamMasuk && adaJamKeluar) {
      let pasanganIndex = -1;

      for (let i = hasil.length - 1; i >= 0; i--) {
        const kandidat = hasil[i];

        const tanggalKandidat =
          String(kandidat[tanggalIndex] ?? '').trim();

        const identitasKandidat =
          identitasIndex !== -1
            ? String(kandidat[identitasIndex] ?? '').trim()
            : '';

        const tanggalSama =
          tanggalKandidat === tanggal;

        const identitasSama =
          identitasIndex === -1 ||
          identitasKandidat === identitas;

        const memilikiJamMasuk =
          !kosong(kandidat[jamMasukIndex]);

        const belumMemilikiJamKeluar =
          kosong(kandidat[jamKeluarIndex]);

        if (
          tanggalSama &&
          identitasSama &&
          memilikiJamMasuk &&
          belumMemilikiJamKeluar
        ) {
          pasanganIndex = i;
          break;
        }
      }

      if (pasanganIndex !== -1) {
        const pasangan = hasil[pasanganIndex];

        pasangan[jamKeluarIndex] =
          row[jamKeluarIndex];

        /*
         * Isi kolom lain jika data pada baris pertama kosong.
         */
        row.forEach((value, index) => {
          if (
            kosong(pasangan[index]) &&
            !kosong(value)
          ) {
            pasangan[index] = value;
          }
        });

        return;
      }
    }

    hasil.push(row);
  });

  return hasil;
}
  async function previewReport(e) {
  if (e) e.preventDefault();

  showLoading();

  const res = await gs(
    'getReportData',
    token,
    reportFilters()
  );

  showLoading(false);

  if (!res.success) {
    return Swal.fire(
      'Gagal',
      res.message,
      'error'
    );
  }

  const jenisLaporan = val('reportType');

  const reportRows = mergeJamMasukKeluar(
  res.headers || [],
  res.data || []
);

  document.getElementById('reportSummary').innerHTML = `
    <h3 class="font-extrabold text-lg">
      Pratinjau Laporan
    </h3>

    <p class="text-sm text-slate-500">
      ${reportRows.length} data ditemukan.
      Data ini bisa disimpan sebagai arsip ke folder Google Drive.
    </p>
  `;

  document.getElementById('reportTable').innerHTML =
    responsiveDataView(
      res.headers || [],
      reportRows
    );
}

async function archiveCurrentReport() {
  const ask = await Swal.fire({
    title: 'Arsipkan laporan?',
    text: 'Sistem akan membuat file CSV dan menyimpannya ke folder Google Drive arsip.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Ya, Arsipkan'
  });
  if (!ask.isConfirmed) return;
  showLoading();
  const res = await gs('archiveReportToDrive', token, reportFilters());
  showLoading(false);
  if (!res.success) return Swal.fire('Gagal', res.message, 'error');
  Swal.fire({
    title: 'Berhasil',
    html: `${res.message}<br><a href="${res.url}" target="_blank" class="text-blue-700 underline">${res.filename}</a>`,
    icon: 'success'
  });
  loadLaporan();
}

async function loadProfil() {
  const res = await gs('getProfile', token);
  const data = res.data || {};
  const fieldsByRole = {
    mahasiswa: ['Nama','NIM','Semester','Program Studi','No HP','Email'],
    dosen: ['Nama','NIDN','No HP','Email','Keahlian'],
    pengguna_khusus: ['Nama','Identitas','Instansi','No HP','Email','Keperluan','Kode Ruangan','Nomor Komputer']
  };
  const fields = fieldsByRole[currentUser.role] || Object.keys(data);
  document.getElementById('view-profil').innerHTML = `
    <form onsubmit="saveProfileFront(event)" class="card p-5 max-w-3xl space-y-3">
      <h3 class="font-extrabold text-lg mb-4">Profil ${currentUser.role === 'mahasiswa' ? 'Mahasiswa' : currentUser.role === 'dosen' ? 'Dosen' : 'Pengguna'}</h3>
      ${fields.map(f => {
        const readonly = ['NIM','NIDN'].includes(f) ? 'readonly' : '';
        const label = f === 'Keahlian' ? 'Mata Kuliah' : f;
        const id = 'profile-' + f.replace(/\s+/g, '-').toLowerCase();
        const type = f === 'Semester' ? 'number" min="1" max="14' : f === 'Email' ? 'email' : 'text';
        return `<label for="${id}" class="block text-xs font-bold uppercase text-slate-700">${label}</label><input id="${id}" type="${type}" data-profile-field="${f}" class="field" ${readonly} value="${data[f] || ''}">`;
      }).join('')}
      <button class="btn btn-danger w-full">Simpan Profil</button>
    </form>`;
}

async function saveProfileFront(e) {
  e.preventDefault();
  const data = {};
  document.querySelectorAll('[data-profile-field]').forEach(input => data[input.dataset.profileField] = input.value);
  const res = await gs('updateProfile', token, data);
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
}

async function loadMahasiswa() {
  const res = await gs('getMahasiswaList', token);
  const list = res.data || [];
  const semesters = [...new Set(list.map(d => d.semester).filter(Boolean))].sort((a,b) => Number(a) - Number(b));
  const selectedSemester = localStorage.getItem('epremo_filter_semester') || '';
  const filtered = selectedSemester ? list.filter(d => String(d.semester) === String(selectedSemester)) : list;
  document.getElementById('view-mahasiswa').innerHTML = `
    <form onsubmit="saveMahasiswaFront(event)" class="card p-5 mb-4 grid md:grid-cols-3 gap-3">
      <h3 class="font-extrabold text-lg md:col-span-3">Data Mahasiswa</h3>
      <label for="mNama" class="font-bold text-sm">Nama<input id="mNama" class="field mt-1" placeholder="Nama lengkap" required></label>
      <label for="mNim" class="font-bold text-sm">NIM<input id="mNim" class="field mt-1" placeholder="NIM" required></label>
      <label for="mSemester" class="font-bold text-sm">Semester<input id="mSemester" type="number" min="1" max="14" class="field mt-1" placeholder="1–14" required></label>
      <label for="mProgramStudi" class="font-bold text-sm">Program Studi<input id="mProgramStudi" class="field mt-1" value="Pendidikan Informatika" required></label>
      <label for="mNoHp" class="font-bold text-sm">Nomor HP<input id="mNoHp" class="field mt-1" inputmode="tel"></label>
      <label for="mEmail" class="font-bold text-sm">Email<input id="mEmail" type="email" class="field mt-1"></label>
      <button class="btn btn-danger md:col-span-3">Simpan Mahasiswa</button>
    </form>
    <div class="card p-4 mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
      <label for="filterSemester" class="font-bold text-sm">Filter Semester</label>
      <select id="filterSemester" class="field sm:max-w-xs" onchange="setSemesterFilter(this.value)">
        <option value="">Semua Semester</option>
        ${semesters.map(s => `<option value="${s}" ${String(s) === String(selectedSemester) ? 'selected' : ''}>Semester ${s}</option>`).join('')}
      </select>
    </div>
    ${table(['Nama','NIM','Semester','Program Studi','No HP','Email','Status','Aksi'], filtered.map(d => [d.nama,d.nim,d.semester,d.programStudi,d.noHp,d.email,d.status, `<button class="btn btn-light" onclick='editMahasiswa(${JSON.stringify(d)})'>Edit</button> <button class="btn btn-danger" onclick="deleteMahasiswaFront('${d.nim}')">Hapus</button>`]))}`;
}

async function loadDosen() {
  const res = await gs('getDosenList', token);
  document.getElementById('view-dosen').innerHTML = `
    <form onsubmit="saveDosenFront(event)" class="card p-5 mb-4 grid md:grid-cols-3 gap-3">
      <h3 class="font-extrabold text-lg md:col-span-3">Data Dosen</h3>
      <input id="dNama" class="field" placeholder="Nama" required>
      <input id="dNidn" class="field" placeholder="NIDN" required>
      <input id="dUsername" class="field" placeholder="Username login" required>
      <input id="dPassword" class="field" placeholder="Password awal">
      <input id="dNoHp" class="field" placeholder="No HP">
      <input id="dEmail" class="field" placeholder="Email">
      <input id="dKeahlian" class="field md:col-span-2" placeholder="Mata Kuliah">
      <button class="btn btn-danger">Simpan Dosen</button>
    </form>
    ${table(['Nama','NIDN','Username','No HP','Email','Mata Kuliah','Status','Aksi'], (res.data || []).map(d => [d.nama,d.nidn,d.username,d.noHp,d.email,d.keahlian,d.status, `<button class="btn btn-light" onclick='editDosen(${JSON.stringify(d)})'>Edit</button> <button class="btn btn-danger" onclick="deleteDosenFront('${d.nidn}')">Hapus</button>`]))}`;
}

function editMahasiswa(d) {
  document.getElementById('mNama').value = d.nama || '';
  document.getElementById('mNim').value = d.nim || '';
  document.getElementById('mSemester').value = d.semester || '';
  document.getElementById('mProgramStudi').value = d.programStudi || 'Pendidikan Informatika';
  document.getElementById('mNoHp').value = d.noHp || '';
  document.getElementById('mEmail').value = d.email || '';
}

async function saveMahasiswaFront(e) {
  e.preventDefault();
  const res = await gs('saveMahasiswa', token, {
    nama: val('mNama'), nim: val('mNim'), jenisKelamin: '', semester: val('mSemester'),
    programStudi: val('mProgramStudi') || 'Pendidikan Informatika', noHp: val('mNoHp'), email: val('mEmail'), alamat: '', status: 'Aktif'
  });
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) loadMahasiswa();
}

function setSemesterFilter(value) {
  localStorage.setItem('epremo_filter_semester', value);
  loadMahasiswa();
}

async function deleteMahasiswaFront(nim) {
  const ask = await Swal.fire({ title: 'Hapus mahasiswa?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus' });
  if (!ask.isConfirmed) return;
  const res = await gs('deleteMahasiswa', token, nim);
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) loadMahasiswa();
}

function editDosen(d) {
  document.getElementById('dNama').value = d.nama || '';
  document.getElementById('dNidn').value = d.nidn || '';
  document.getElementById('dUsername').value = d.username || '';
  document.getElementById('dNoHp').value = d.noHp || '';
  document.getElementById('dEmail').value = d.email || '';
  document.getElementById('dKeahlian').value = d.keahlian || '';
}

async function saveDosenFront(e) {
  e.preventDefault();
  const res = await gs('saveDosen', token, {
    nama: val('dNama'), nidn: val('dNidn'), username: val('dUsername'), password: val('dPassword'),
    noHp: val('dNoHp'), email: val('dEmail'), keahlian: val('dKeahlian'), status: 'Aktif'
  });
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) loadDosen();
}

async function deleteDosenFront(nidn) {
  const ask = await Swal.fire({ title: 'Hapus dosen?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus' });
  if (!ask.isConfirmed) return;
  const res = await gs('deleteDosen', token, nidn);
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) loadDosen();
}

async function loadPenggunaKhususAdmin() {
  const res = await gs('getSpecialUserList', token);
  document.getElementById('view-pengguna-khusus').innerHTML = `
    <div class="card p-5 mb-4">
      <h3 class="font-extrabold text-lg">Pengguna Khusus</h3>
      <p class="text-sm text-slate-500">Admin memeriksa registrasi dan menentukan apakah pengguna khusus diperbolehkan menggunakan ruangan/komputer.</p>
    </div>
    ${table(['Nama','Identitas','Instansi','Ruangan','Komputer','Keperluan','Status','Aksi'], (res.data || []).map(d => [
      d.nama,d.identitas,d.instansi,d.kodeRuangan,d.nomorKomputer || '-',d.keperluan,d.status,
      `<button class="btn btn-primary" onclick="approveSpecial('${d.id}')">Izinkan</button> <button class="btn btn-danger" onclick="rejectSpecial('${d.id}')">Tolak</button>`
    ]))}`;
}

async function approveSpecial(id) {
  const res = await gs('updateSpecialUserStatus', token, id, 'Disetujui', 'Diizinkan menggunakan ruangan/komputer');
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) loadPenggunaKhususAdmin();
}

async function rejectSpecial(id) {
  const reason = await Swal.fire({ title: 'Alasan penolakan', input: 'text', showCancelButton: true, confirmButtonText: 'Tolak' });
  if (!reason.isConfirmed) return;
  const res = await gs('updateSpecialUserStatus', token, id, 'Ditolak', reason.value || '');
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) loadPenggunaKhususAdmin();
}

async function loadRuangan() {
  const headers = ['Kode','Nama Ruangan','Lokasi','Kapasitas','Status','Keterangan','Aksi'];
  const rows = rooms.map(r => [r.kode,r.nama,r.lokasi,r.kapasitas,r.status,r.keterangan, `<button class="btn btn-light" onclick='editRuangan(${JSON.stringify(r)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRuanganFront('${r.kode}')">Hapus</button>`]);
  document.getElementById('view-ruangan').innerHTML = `
    <div class="grid lg:grid-cols-[360px_1fr] gap-4 md:gap-5">
      <form onsubmit="saveRuanganFront(event)" class="card p-4 md:p-5 space-y-3">
        <h3 class="font-extrabold text-lg">Ruangan & Komputer</h3>
        <input id="rKode" class="field" placeholder="Kode Ruangan, contoh LAB-1" required>
        <input id="rNama" class="field" placeholder="Nama Ruangan" required>
        <input id="rLokasi" class="field" placeholder="Lokasi">
        <input id="rKapasitas" type="number" min="1" class="field" placeholder="Kapasitas Komputer" required>
        <select id="rStatus" class="field"><option>Aktif</option><option>Nonaktif</option><option>Maintenance</option></select>
        <textarea id="rKet" class="field" placeholder="Keterangan"></textarea>
        <button class="btn btn-danger w-full">Simpan Ruangan</button>
      </form>
      <div class="min-w-0">${responsiveDataView(headers, rows)}</div>
    </div>`;
}

async function saveRuanganFront(e) {
  e.preventDefault();
  const res = await gs('saveRuangan', token, { kode: val('rKode'), nama: val('rNama'), lokasi: val('rLokasi'), kapasitas: val('rKapasitas'), status: val('rStatus'), keterangan: val('rKet') });
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) {
    await preloadData();
    loadRuangan();
  }
}

function editRuangan(r) {
  document.getElementById('rKode').value = r.kode || '';
  document.getElementById('rNama').value = r.nama || '';
  document.getElementById('rLokasi').value = r.lokasi || '';
  document.getElementById('rKapasitas').value = r.kapasitas || '';
  document.getElementById('rStatus').value = r.status || 'Aktif';
  document.getElementById('rKet').value = r.keterangan || '';
}

async function deleteRuanganFront(kode) {
  const ask = await Swal.fire({ title: 'Hapus ruangan?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus' });
  if (!ask.isConfirmed) return;
  const res = await gs('deleteRuangan', token, kode);
  Swal.fire(res.success ? 'Berhasil' : 'Gagal', res.message, res.success ? 'success' : 'error');
  if (res.success) {
    await preloadData();
    loadRuangan();
  }
}

function statCard(label, value, icon, color) {
  return `<div class="card p-4 md:p-5"><div class="flex justify-between items-center gap-2"><div class="min-w-0"><p class="text-[10px] md:text-xs font-bold uppercase text-slate-400 truncate">${label}</p><h3 class="text-2xl md:text-3xl font-extrabold mt-1">${value}</h3></div><i class="fa-solid ${icon} ${color} text-xl md:text-2xl shrink-0"></i></div></div>`;
}

function miniInfo(label, value, icon) {
  return `<div class="card p-4 flex items-center gap-3"><i class="fa-solid ${icon} text-epBlue text-xl"></i><div><p class="text-[10px] uppercase font-bold text-slate-400">${label}</p><p class="font-extrabold text-sm">${value || '-'}</p></div></div>`;
}

function infoRow(k, v) {
  return `<div class="flex justify-between gap-3 border-b border-slate-100 pb-2"><span class="font-bold text-epBlue">${k}</span><span class="text-right">${v || '-'}</span></div>`;
}

function responsiveDataView(headers, rows) {
  const desktop = `<div class="desktop-table">${table(headers, rows)}</div>`;
  const mobile = `<div class="mobile-cards">${rows.length ? rows.map(row => `
    <div class="card p-4">
      ${headers.map((header, i) => {
        const value = row[i] || '-';
        const isAction = String(header).toLowerCase() === 'aksi';
        return `<div class="mobile-card-row ${isAction ? 'block' : ''}">
          <span>${header}</span>
          <span class="${isAction ? 'flex flex-col gap-2 items-stretch w-full text-right' : ''}">${value}</span>
        </div>`;
      }).join('')}
    </div>`).join('') : `<div class="card p-4 text-sm text-slate-500">Belum ada data.</div>`}</div>`;
  return desktop + mobile;
}

function table(headers, rows) {
  return `<div class="card overflow-auto table-scroll"><table class="w-full min-w-[720px] text-sm"><thead class="bg-epBlue text-white"><tr>${headers.map(h => `<th class="px-3 md:px-4 py-3 text-left text-xs uppercase whitespace-nowrap">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr class="border-b hover:bg-slate-50">${r.map(c => `<td class="px-3 md:px-4 py-3 whitespace-nowrap">${c || '-'}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="text-center py-8 text-slate-400">Belum ada data.</td></tr>`}</tbody></table></div>`;
}

function skeleton(title) { return `<div class="card p-8 text-center text-slate-500 font-bold">${title} sedang dimuat...</div>`; }
function errorBox(el, msg) { el.innerHTML = `<div class="card p-6 text-epRed font-bold">${msg}</div>`; }
function val(id) { return document.getElementById(id).value; }
function pad2(n) { return String(n || '').padStart(2, '0'); }

function logout() {
  if (token) gs('logout', token).catch(() => {});
  localStorage.removeItem('epremo_token');
  localStorage.removeItem('epremo_user');
  location.reload();
}

async function loadAppLogo() {
  try {
    const res = await gs('getLogoDataUrl');
    if (!res.success || !res.dataUrl) return;
    document.querySelectorAll('[data-logo]').forEach(img => {
      img.src = res.dataUrl;
      img.classList.remove('hidden');
    });
    document.querySelectorAll('[data-logo-fallback]').forEach(el => el.classList.add('hidden'));
  } catch (err) {
    console.warn('Logo tidak dimuat', err);
  }
}

setInterval(() => document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID'), 1000);
setInterval(checkQrResult, 1200);
loadAppLogo();

const savedUser = localStorage.getItem('epremo_user');
const navigationEntry = performance.getEntriesByType('navigation')[0];
const isPageRefresh = navigationEntry
  ? navigationEntry.type === 'reload'
  : performance.navigation && performance.navigation.type === 1;

if (token && savedUser && isPageRefresh) {
  currentUser = JSON.parse(savedUser);
  bootApp(false);
} else if (!isPageRefresh) {
  token = '';
  currentUser = null;
  localStorage.removeItem('epremo_token');
  localStorage.removeItem('epremo_user');
}
