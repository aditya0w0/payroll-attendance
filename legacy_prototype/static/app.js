/**
 * Zero-Trust Payroll & Single-Device Attendance Application Engine
 */

const app = {
  token: null,
  currentUser: null,
  deviceId: null,
  deviceName: null,
  activeOwnerTab: 'overview',
  simulatedPunchTime: null,
  clockTimer: null,
  cachedEmployees: [],

  // -------------------------------------------------------------
  // Initialization & Device Fingerprint
  // -------------------------------------------------------------
  init() {
    this.setupDeviceFingerprint();
    this.startDigitalClock();
    this.checkSession();
  },

  setupDeviceFingerprint() {
    // Check localStorage for existing device ID or generate a new hardware-style UUID
    let devId = localStorage.getItem('czt_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('czt_device_id', devId);
    }
    this.deviceId = devId;

    // Detect browser platform & OS
    const ua = navigator.userAgent;
    let platform = "Browser Terminal";
    if (ua.includes("Mac")) platform = "macOS Workstation";
    else if (ua.includes("Windows")) platform = "Windows PC";
    else if (ua.includes("iPhone")) platform = "iPhone Safari Mobile";
    else if (ua.includes("Android")) platform = "Android Chrome Mobile";
    else if (ua.includes("Linux")) platform = "Linux Desktop";

    this.deviceName = `${platform} (${navigator.language || 'en'})`;
    
    // Update header display
    const devDisplay = document.getElementById('current-device-name');
    if (devDisplay) {
      devDisplay.textContent = `${this.deviceName} [${this.deviceId.substring(0, 10)}...]`;
    }
  },

  startDigitalClock() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      
      const clockEl = document.getElementById('emp-live-clock');
      const dateEl = document.getElementById('emp-current-date');
      if (clockEl) clockEl.textContent = timeStr;
      if (dateEl) dateEl.textContent = dateStr;

      this.updateEmployeeLateWarning(now);
    };
    update();
    this.clockTimer = setInterval(update, 1000);
  },

  updateEmployeeLateWarning(now) {
    if (!this.currentUser || this.currentUser.role !== 'employee') return;
    const alertBox = document.getElementById('emp-punch-alert-box');
    const alertTitle = document.getElementById('emp-alert-title');
    const alertDesc = document.getElementById('emp-alert-desc');
    if (!alertBox) return;

    const schedStart = this.currentUser.work_start_time || '09:00';
    const [schedH, schedM] = schedStart.split(':').map(Number);
    const graceM = this.currentUser.grace_period_mins || 10;
    const dailyRate = this.currentUser.daily_rate || 160.0;

    const targetDate = this.simulatedPunchTime ? new Date(this.simulatedPunchTime) : now;
    const schedDate = new Date(targetDate);
    schedDate.setHours(schedH, schedM, 0, 0);

    const diffMins = Math.floor((targetDate - schedDate) / 60000);

    alertBox.style.display = 'flex';
    if (diffMins <= graceM) {
      alertBox.className = 'ontime-alert-box';
      alertTitle.textContent = '🟢 On-Time Clock-in Window Active';
      alertDesc.textContent = `Shift begins at ${schedStart}. You are within the ${graceM}m grace window. 100% daily salary ($${dailyRate.toFixed(2)}) will be earned.`;
    } else {
      alertBox.className = 'deduction-alert-box';
      alertTitle.textContent = `⚠️ Late Warning: ${diffMins} Minutes Late!`;
      const dedMode = this.currentUser.deduction_mode || 'FULL_DAILY';
      let penalty = dailyRate;
      if (dedMode === 'HALF_DAILY') penalty = dailyRate * 0.5;
      alertDesc.textContent = `Clocking in now will be penalized! Policy: ${dedMode}. Daily salary deduction of -$${penalty.toFixed(2)} will be applied immediately.`;
    }
  },

  // -------------------------------------------------------------
  // API Fetch Utility
  // -------------------------------------------------------------
  async api(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Device-Id': this.deviceId,
      'X-Device-Name': this.deviceName
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(endpoint, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw { status: res.status, ...data };
      }
      return data;
    } catch (err) {
      throw err;
    }
  },

  // -------------------------------------------------------------
  // Authentication & Session
  // -------------------------------------------------------------
  async checkSession() {
    const savedToken = localStorage.getItem('czt_session_token');
    if (!savedToken) {
      this.showLoginView();
      return;
    }
    this.token = savedToken;
    try {
      const res = await this.api('/api/auth/me');
      this.currentUser = res.user;
      this.onAuthSuccess();
    } catch (err) {
      this.token = null;
      localStorage.removeItem('czt_session_token');
      this.showLoginView();
    }
  },

  onDevicePresetChange() {
    const select = document.getElementById('login-device-select');
    const val = select.value;
    if (val === 'this_browser') {
      this.setupDeviceFingerprint();
    } else if (val === 'device_alice_macbook_pro_01') {
      this.deviceId = 'device_alice_macbook_pro_01';
      this.deviceName = "Alice's Authorized MacBook Pro";
    } else if (val === 'device_charlie_iphone_15') {
      this.deviceId = 'device_charlie_iphone_15';
      this.deviceName = "Charlie's Authorized iPhone 15 Pro";
    } else if (val === 'rogue_unauthorized_device') {
      this.deviceId = 'device_rogue_hacker_phone_999';
      this.deviceName = "Rogue Android Device (Unauthorized Bypass Attempt)";
    }
    const devDisplay = document.getElementById('current-device-name');
    if (devDisplay) {
      devDisplay.textContent = `${this.deviceName} [${this.deviceId.substring(0, 10)}...]`;
    }
  },

  fillDemoLogin(scenario) {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const devSelect = document.getElementById('login-device-select');

    if (scenario === 'owner') {
      emailEl.value = 'owner@company.com';
      passEl.value = 'admin123';
      devSelect.value = 'this_browser';
      this.onDevicePresetChange();
    } else if (scenario === 'alice_authorized') {
      emailEl.value = 'alice@company.com';
      passEl.value = 'employee123';
      devSelect.value = 'device_alice_macbook_pro_01';
      this.onDevicePresetChange();
    } else if (scenario === 'bob_unbound') {
      emailEl.value = 'bob@company.com';
      passEl.value = 'employee123';
      devSelect.value = 'this_browser';
      this.onDevicePresetChange();
    } else if (scenario === 'alice_unauthorized') {
      emailEl.value = 'alice@company.com';
      passEl.value = 'employee123';
      devSelect.value = 'rogue_unauthorized_device';
      this.onDevicePresetChange();
    }
    this.toast(`Loaded demo credentials: ${emailEl.value}`, 'info');
  },

  async handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying Zero-Trust Identity...';

    try {
      const res = await this.api('/api/auth/login', 'POST', {
        email,
        password,
        device_id: this.deviceId,
        device_name: this.deviceName
      });

      this.token = res.token;
      this.currentUser = res.user;
      localStorage.setItem('czt_session_token', this.token);
      this.toast(res.message || 'Authenticated successfully!', 'success');
      this.onAuthSuccess();
    } catch (err) {
      if (err.status === 423 || err.error === 'DEVICE_LOCKED') {
        // Trigger Single Device Lockout screen
        this.showLockoutModal(email, err);
      } else {
        this.toast(err.error || 'Authentication failed. Please verify credentials.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Authenticate & Proceed';
    }
  },

  showLockoutModal(email, errData) {
    document.getElementById('modal-device-locked').style.display = 'flex';
    document.getElementById('lockout-bound-device').textContent = errData.bound_device_name || 'Original Device';
    document.getElementById('lockout-attempted-device').textContent = this.deviceName;
    document.getElementById('lockout-request-code').textContent = errData.request_code || 'REQ-PENDING';
    document.getElementById('unlock-code-input').value = '';
    this.lockedEmail = email;
    this.toast('Access Denied: Single-Device Policy violation. Manual unlock code required.', 'error');
  },

  closeLockoutModal() {
    document.getElementById('modal-device-locked').style.display = 'none';
  },

  async submitUnlockCode() {
    const code = document.getElementById('unlock-code-input').value.trim();
    if (!code) {
      this.toast('Please enter the 6-digit Unlock Code from your Owner.', 'error');
      return;
    }

    try {
      const res = await this.api('/api/auth/verify-unlock-code', 'POST', {
        email: this.lockedEmail,
        unlock_code: code,
        device_id: this.deviceId,
        device_name: this.deviceName
      });

      this.closeLockoutModal();
      this.token = res.token;
      this.currentUser = res.user;
      localStorage.setItem('czt_session_token', this.token);
      this.toast(res.message || 'Device authorized and bound!', 'success');
      this.onAuthSuccess();
    } catch (err) {
      this.toast(err.error || 'Invalid or expired unlock code.', 'error');
    }
  },

  async logout() {
    try {
      await this.api('/api/auth/logout', 'POST');
    } catch (e) {}
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('czt_session_token');
    this.toast('Logged out safely.', 'info');
    this.showLoginView();
  },

  onAuthSuccess() {
    document.getElementById('view-login').style.display = 'none';
    const profileSec = document.getElementById('user-profile-section');
    profileSec.style.display = 'flex';

    const roleBadge = document.getElementById('header-user-badge');
    roleBadge.textContent = this.currentUser.role;
    roleBadge.className = `user-role-badge role-${this.currentUser.role}`;

    document.getElementById('header-user-name').textContent = this.currentUser.name;

    if (this.currentUser.role === 'owner') {
      document.getElementById('view-employee').style.display = 'none';
      document.getElementById('view-owner').style.display = 'block';
      this.loadOwnerData();
    } else {
      document.getElementById('view-owner').style.display = 'none';
      document.getElementById('view-employee').style.display = 'block';
      this.loadEmployeeData();
    }
  },

  showLoginView() {
    document.getElementById('view-owner').style.display = 'none';
    document.getElementById('view-employee').style.display = 'none';
    document.getElementById('user-profile-section').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
  },

  // -------------------------------------------------------------
  // Owner Operations
  // -------------------------------------------------------------
  switchOwnerTab(tabName) {
    this.activeOwnerTab = tabName;
    const tabs = ['overview', 'employees', 'payroll', 'audit', 'unlocks'];
    tabs.forEach(t => {
      const el = document.getElementById(`owner-tab-${t}`);
      if (el) el.style.display = (t === tabName) ? 'block' : 'none';
    });

    const buttons = document.querySelectorAll('.tabs .tab-btn');
    buttons.forEach((btn, idx) => {
      if (tabs[idx] === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    if (tabName === 'overview') this.loadOwnerData();
    if (tabName === 'employees') this.loadEmployees();
    if (tabName === 'payroll') this.loadPayrollData();
    if (tabName === 'audit') this.loadAuditLogs();
    if (tabName === 'unlocks') this.loadUnlockRequests();
  },

  async loadOwnerData() {
    try {
      // 1. Load today's attendance
      const attRes = await this.api('/api/attendance/today');
      this.renderOwnerTodayAttendance(attRes.attendances || []);

      // 2. Load system info / unlock requests count
      const unlockRes = await this.api('/api/owner/unlock-requests');
      const pendingCount = (unlockRes.requests || []).filter(r => r.status === 'PENDING').length;
      document.getElementById('kpi-pending-unlocks').textContent = pendingCount;
      document.getElementById('unlock-req-badge').textContent = pendingCount;

      // 3. Populate simulator employee dropdown
      const empRes = await this.api('/api/owner/employees');
      this.cachedEmployees = (empRes.employees || []).filter(e => e.role === 'employee');
      const simSelect = document.getElementById('sim-employee-select');
      simSelect.innerHTML = this.cachedEmployees.map(e => `
        <option value="${e.id}">${e.name} ($${e.monthly_salary}/mo, Daily: $${e.daily_rate})</option>
      `).join('');

      document.getElementById('kpi-total-employees').textContent = this.cachedEmployees.length;
    } catch (err) {
      console.error(err);
      this.toast('Failed to load owner overview.', 'error');
    }
  },

  renderOwnerTodayAttendance(attendances) {
    const tbody = document.getElementById('owner-today-attendance-table');
    if (!attendances || attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 2rem;">No employee attendance records found for today.</td></tr>`;
      return;
    }

    let presentCnt = 0;
    let onTimeCnt = 0;
    let lateCnt = 0;
    let totalDeductions = 0;

    tbody.innerHTML = attendances.map(row => {
      const isPresent = !!row.clock_in;
      if (isPresent) {
        presentCnt++;
        if (row.status === 'ON_TIME') onTimeCnt++;
        if (row.status === 'LATE') {
          lateCnt++;
          totalDeductions += (row.deduction_amount || 0);
        }
      }

      const statusBadge = !isPresent 
        ? `<span class="badge badge-gray">ABSENT</span>`
        : (row.status === 'ON_TIME' 
            ? `<span class="badge badge-green">ON TIME</span>` 
            : `<span class="badge badge-red">LATE (-$${(row.deduction_amount || 0).toFixed(2)})</span>`);

      const clockInTime = row.clock_in ? row.clock_in.substring(11, 19) : '--:--:--';
      const clockOutTime = row.clock_out ? row.clock_out.substring(11, 19) : '--:--:--';
      const lateMins = row.late_minutes ? `${row.late_minutes} mins` : '0';
      const dailyRate = row.daily_salary_rate ? `$${row.daily_salary_rate.toFixed(2)}` : '--';
      const deduction = row.deduction_amount ? `-$${row.deduction_amount.toFixed(2)}` : '$0.00';
      const netEarned = row.net_daily_earned !== undefined ? `$${row.net_daily_earned.toFixed(2)}` : '--';

      return `
        <tr>
          <td>
            <div style="font-weight: 600;">${row.employee_name}</div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${row.employee_email}</div>
          </td>
          <td>${row.work_start_time || '09:00'} (+${row.grace_period_mins || 10}m grace)</td>
          <td><strong>${clockInTime}</strong></td>
          <td>${clockOutTime}</td>
          <td>${statusBadge}</td>
          <td style="${row.late_minutes > 0 ? 'color: #fb7185; font-weight: 600;' : ''}">${lateMins}</td>
          <td>${dailyRate}</td>
          <td style="color: ${row.deduction_amount > 0 ? '#fb7185; font-weight: 700;' : 'var(--text-dim);'}">${deduction}</td>
          <td style="color: #34d399; font-weight: 700;">${netEarned}</td>
          <td><span class="hash-pill" title="${row.device_name || 'Authorized Device'}">${row.device_name || 'None'}</span></td>
        </tr>
      `;
    }).join('');

    document.getElementById('kpi-present-count').textContent = presentCnt;
    document.getElementById('kpi-on-time-count').textContent = `${onTimeCnt} on-time`;
    document.getElementById('kpi-late-count').textContent = lateCnt;
    document.getElementById('kpi-late-deductions').textContent = `-$${totalDeductions.toFixed(2)} total deducted today`;
  },

  async loadEmployees() {
    try {
      const res = await this.api('/api/owner/employees');
      const employees = res.employees || [];
      this.cachedEmployees = employees;
      const tbody = document.getElementById('owner-employees-table');

      tbody.innerHTML = employees.map(emp => {
        const isOwner = emp.role === 'owner';
        const deviceStatus = emp.bound_device_id 
          ? `<span class="badge badge-blue">📱 ${emp.bound_device_name || 'Bound Device'}</span>`
          : `<span class="badge badge-amber">🔓 Unbound (Next login binds)</span>`;

        const actionButtons = isOwner ? `<em>Owner Account</em>` : `
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="app.openEditSalaryModal(${emp.id})">
              💵 Set Salary
            </button>
            <button class="btn btn-secondary btn-sm" onclick="app.openEditRulesModal(${emp.id})">
              ⚙️ Shift Rules
            </button>
            <button class="btn btn-rose btn-sm" onclick="app.resetEmployeeDevice(${emp.id}, '${emp.name}')" title="Clear device binding to allow re-registering">
              🔄 Reset Device
            </button>
            <button class="btn btn-amber btn-sm" onclick="app.ownerGenerateUnlockCode(${emp.id})" title="Issue single-device unlock code">
              🔑 Unlock Code
            </button>
          </div>
        `;

        return `
          <tr>
            <td>
              <div style="font-weight: 700;">${emp.name}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${emp.email}</div>
            </td>
            <td style="font-size: 1rem; font-weight: 700; color: #60a5fa;">
              $${emp.monthly_salary.toLocaleString(undefined, {minimumFractionDigits: 2})}
              <div style="font-size: 0.7rem; color: var(--text-dim);">Monthly Base</div>
            </td>
            <td>${emp.working_days_per_month} days</td>
            <td style="font-size: 0.95rem; font-weight: 700; color: #34d399;">
              $${emp.daily_rate.toFixed(2)} / day
            </td>
            <td>
              <div>${emp.work_start_time} - ${emp.work_end_time}</div>
              <div style="font-size: 0.7rem; color: var(--text-dim);">${emp.grace_period_mins}m grace period</div>
            </td>
            <td>
              <span class="badge badge-purple">${emp.deduction_mode}</span>
            </td>
            <td>${deviceStatus}</td>
            <td>${actionButtons}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      this.toast('Failed to load employee list.', 'error');
    }
  },

  // Modal: Edit Salary
  openEditSalaryModal(empId) {
    const emp = this.cachedEmployees.find(e => e.id === empId);
    if (!emp) return;
    document.getElementById('edit-salary-emp-id').value = emp.id;
    document.getElementById('edit-salary-emp-name').value = `${emp.name} (${emp.email})`;
    document.getElementById('edit-salary-amount').value = emp.monthly_salary;
    document.getElementById('edit-salary-work-days').value = emp.working_days_per_month;
    document.getElementById('edit-salary-reason').value = 'Owner compensation adjustment';
    this.updateDailyRatePreview();
    document.getElementById('modal-edit-salary').style.display = 'flex';
  },

  updateDailyRatePreview() {
    const sal = parseFloat(document.getElementById('edit-salary-amount').value) || 0;
    const days = parseInt(document.getElementById('edit-salary-work-days').value) || 22;
    const daily = days > 0 ? (sal / days) : 0;
    document.getElementById('edit-salary-daily-preview').textContent = `$${daily.toFixed(2)} / day`;
  },

  async saveSalaryChange() {
    const empId = document.getElementById('edit-salary-emp-id').value;
    const salary = parseFloat(document.getElementById('edit-salary-amount').value);
    const workDays = parseInt(document.getElementById('edit-salary-work-days').value);
    const reason = document.getElementById('edit-salary-reason').value;

    if (!salary || salary <= 0) {
      this.toast('Monthly salary must be greater than 0.', 'error');
      return;
    }

    try {
      const res = await this.api(`/api/owner/employees/${empId}/salary`, 'PUT', {
        monthly_salary: salary,
        working_days_per_month: workDays,
        reason: reason
      });

      this.closeModal('modal-edit-salary');
      this.toast(res.message || 'Salary updated and logged to Zero Trust ledger!', 'success');
      this.loadEmployees();
    } catch (err) {
      this.toast(err.error || 'Failed to update salary.', 'error');
    }
  },

  // Modal: Edit Shift & Late Deduction Rules
  openEditRulesModal(empId) {
    const emp = this.cachedEmployees.find(e => e.id === empId);
    if (!emp) return;
    document.getElementById('edit-rules-emp-id').value = emp.id;
    document.getElementById('edit-rules-emp-name').value = `${emp.name} (${emp.email})`;
    document.getElementById('edit-rules-start').value = emp.work_start_time || '09:00';
    document.getElementById('edit-rules-end').value = emp.work_end_time || '17:00';
    document.getElementById('edit-rules-grace').value = emp.grace_period_mins || 10;
    document.getElementById('edit-rules-mode').value = emp.deduction_mode || 'FULL_DAILY';
    document.getElementById('modal-edit-rules').style.display = 'flex';
  },

  async saveRulesChange() {
    const empId = document.getElementById('edit-rules-emp-id').value;
    const work_start_time = document.getElementById('edit-rules-start').value;
    const work_end_time = document.getElementById('edit-rules-end').value;
    const grace_period_mins = parseInt(document.getElementById('edit-rules-grace').value);
    const deduction_mode = document.getElementById('edit-rules-mode').value;

    try {
      const res = await this.api(`/api/owner/employees/${empId}/rules`, 'PUT', {
        work_start_time,
        work_end_time,
        grace_period_mins,
        deduction_mode,
        deduction_percentage: 100.0
      });

      this.closeModal('modal-edit-rules');
      this.toast(res.message || 'Attendance rules updated!', 'success');
      this.loadEmployees();
    } catch (err) {
      this.toast(err.error || 'Failed to update attendance rules.', 'error');
    }
  },

  // Modal: Add New Employee
  openAddEmployeeModal() {
    document.getElementById('add-emp-name').value = '';
    document.getElementById('add-emp-email').value = '';
    document.getElementById('add-emp-password').value = 'employee123';
    document.getElementById('add-emp-salary').value = '3200.00';
    document.getElementById('modal-add-employee').style.display = 'flex';
  },

  async submitAddEmployee() {
    const name = document.getElementById('add-emp-name').value.trim();
    const email = document.getElementById('add-emp-email').value.trim();
    const password = document.getElementById('add-emp-password').value;
    const monthly_salary = parseFloat(document.getElementById('add-emp-salary').value);
    const working_days_per_month = parseInt(document.getElementById('add-emp-days').value);
    const work_start_time = document.getElementById('add-emp-start').value;
    const grace_period_mins = parseInt(document.getElementById('add-emp-grace').value);
    const deduction_mode = document.getElementById('add-emp-mode').value;

    if (!name || !email) {
      this.toast('Name and email are required.', 'error');
      return;
    }

    try {
      const res = await this.api('/api/owner/employees', 'POST', {
        name, email, password, monthly_salary, working_days_per_month,
        work_start_time, grace_period_mins, deduction_mode
      });

      this.closeModal('modal-add-employee');
      this.toast(res.message || 'Employee created!', 'success');
      this.loadEmployees();
    } catch (err) {
      this.toast(err.error || 'Failed to create employee.', 'error');
    }
  },

  async resetEmployeeDevice(empId, empName) {
    if (!confirm(`Are you sure you want to RESET the single-device binding for ${empName}?\n\nThis will allow them to authorize a new device on their next login.`)) {
      return;
    }

    try {
      const res = await this.api(`/api/owner/employees/${empId}/reset-device`, 'PUT');
      this.toast(res.message || 'Device binding reset!', 'success');
      this.loadEmployees();
    } catch (err) {
      this.toast(err.error || 'Failed to reset device.', 'error');
    }
  },

  async ownerGenerateUnlockCode(empId) {
    try {
      const res = await this.api('/api/owner/generate-unlock-code', 'POST', { employee_id: empId });
      alert(`🔐 ONE-TIME UNLOCK CODE GENERATED\n\nEmployee: ${res.employee_name}\nRequest ID: ${res.request_code}\nUnlock Code: ${res.unlock_code}\n\nValid for 30 minutes. Provide this 6-digit code to the employee.`);
      this.toast(`Generated Unlock Code: ${res.unlock_code}`, 'info');
      if (this.activeOwnerTab === 'unlocks') this.loadUnlockRequests();
    } catch (err) {
      this.toast(err.error || 'Failed to generate unlock code.', 'error');
    }
  },

  // -------------------------------------------------------------
  // Payroll & Deductions Ledger
  // -------------------------------------------------------------
  async loadPayrollData() {
    const monthInput = document.getElementById('payroll-month-select');
    if (!monthInput.value) {
      monthInput.value = new Date().toISOString().substring(0, 7);
    }
    const month = monthInput.value;

    try {
      const res = await this.api(`/api/owner/payroll-summary?month=${month}`);
      const summaries = res.summaries || [];
      this.cachedPayrollSummaries = summaries;
      const tbody = document.getElementById('owner-payroll-table');

      if (summaries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem;">No active employees found for payroll.</td></tr>`;
        return;
      }

      tbody.innerHTML = summaries.map((s, idx) => {
        return `
          <tr>
            <td>
              <div style="font-weight: 700;">${s.name}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${s.email}</div>
            </td>
            <td style="font-weight: 700;">$${s.monthly_salary.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="color: #93c5fd;">$${s.daily_rate.toFixed(2)}/d</td>
            <td>${s.working_days_standard}</td>
            <td><strong>${s.days_present}</strong> days</td>
            <td style="${s.days_late > 0 ? 'color: #fb7185; font-weight: 700;' : ''}">${s.days_late} days</td>
            <td style="color: ${s.total_late_deductions > 0 ? '#fb7185; font-weight: 700;' : 'var(--text-dim);'}">
              -$${s.total_late_deductions.toFixed(2)}
            </td>
            <td style="color: var(--text-dim);">-$${s.unworked_deduction.toFixed(2)} (${s.unworked_days}d)</td>
            <td style="font-size: 1.05rem; font-weight: 800; color: #34d399;">
              $${s.net_payable.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="app.viewPayslip(${idx})">
                📄 View Payslip
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      this.toast('Failed to load payroll ledger.', 'error');
    }
  },

  viewPayslip(idx) {
    const s = this.cachedPayrollSummaries[idx];
    if (!s) return;

    document.getElementById('payslip-title').textContent = `Payslip Statement - ${s.name} (${s.month})`;
    const content = document.getElementById('payslip-content');

    const recordsHtml = (s.records || []).map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.clock_in ? r.clock_in.substring(11, 19) : '--'}</td>
        <td>${r.clock_out ? r.clock_out.substring(11, 19) : '--'}</td>
        <td>${r.status === 'ON_TIME' ? '<span class="badge badge-green">ON TIME</span>' : '<span class="badge badge-red">LATE</span>'}</td>
        <td>${r.late_minutes}m</td>
        <td>$${r.daily_salary_rate.toFixed(2)}</td>
        <td style="color: ${r.deduction_amount > 0 ? '#fb7185; font-weight: 700;' : ''}">-$${r.deduction_amount.toFixed(2)}</td>
        <td style="color: #34d399; font-weight: 700;">$${r.net_daily_earned.toFixed(2)}</td>
      </tr>
    `).join('') || `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 1rem;">No punch records logged this month.</td></tr>`;

    content.innerHTML = `
      <div style="background: rgba(17, 24, 39, 0.7); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem;">
          <div>
            <div style="color: var(--text-muted);">Employee:</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #ffffff;">${s.name}</div>
            <div style="color: var(--text-dim); font-size: 0.75rem;">${s.email}</div>
          </div>
          <div style="text-align: right;">
            <div style="color: var(--text-muted);">Pay Period:</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #60a5fa;">${s.month}</div>
            <div style="color: var(--text-dim); font-size: 0.75rem;">Standard: ${s.working_days_standard} Days</div>
          </div>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 1rem 0;">

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; text-align: center;">
          <div style="background: rgba(0, 0, 0, 0.3); padding: 0.75rem; border-radius: 6px;">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Base Salary</div>
            <div style="font-size: 1.1rem; font-weight: 700;">$${s.monthly_salary.toFixed(2)}</div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.3); padding: 0.75rem; border-radius: 6px;">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Days Present</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #34d399;">${s.days_present} / ${s.working_days_standard}</div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.3); padding: 0.75rem; border-radius: 6px;">
            <div style="font-size: 0.72rem; color: #fb7185; text-transform: uppercase;">Late Deductions</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #fb7185;">-$${s.total_late_deductions.toFixed(2)}</div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.3); padding: 0.75rem; border-radius: 6px;">
            <div style="font-size: 0.72rem; color: #34d399; text-transform: uppercase;">Net Payable</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: #34d399;">$${s.net_payable.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.75rem;">Daily Clock-in Ledger & Deductions</h4>
      <div class="table-container" style="max-height: 240px; overflow-y: auto;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Status</th>
              <th>Late Mins</th>
              <th>Daily Rate</th>
              <th>Late Deduction</th>
              <th>Net Earned</th>
            </tr>
          </thead>
          <tbody>
            ${recordsHtml}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('modal-payslip').style.display = 'flex';
  },

  exportPayrollCSV() {
    if (!this.cachedPayrollSummaries || this.cachedPayrollSummaries.length === 0) {
      this.toast('No payroll data to export.', 'error');
      return;
    }
    const headers = ["Employee Name", "Email", "Month", "Base Salary", "Standard Days", "Daily Rate", "Days Present", "Days Late", "Total Late Deductions", "Unworked Deductions", "Net Payable"];
    const rows = this.cachedPayrollSummaries.map(s => [
      `"${s.name}"`, `"${s.email}"`, s.month, s.monthly_salary, s.working_days_standard, s.daily_rate,
      s.days_present, s.days_late, s.total_late_deductions, s.unworked_deduction, s.net_payable
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_attendance_${this.cachedPayrollSummaries[0].month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // -------------------------------------------------------------
  // Zero Trust Cryptographic Audit Trail
  // -------------------------------------------------------------
  async loadAuditLogs() {
    const action = document.getElementById('audit-filter-action').value;
    try {
      const res = await this.api(`/api/owner/audit-logs?limit=150${action ? `&action=${action}` : ''}`);
      const logs = res.logs || [];
      document.getElementById('audit-log-badge').textContent = logs.length;
      const tbody = document.getElementById('owner-audit-table');

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">No audit logs found.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(lg => {
        let actionBadge = `<span class="badge badge-blue">${lg.action_type}</span>`;
        if (lg.action_type.includes('SALARY')) actionBadge = `<span class="badge badge-purple">💰 ${lg.action_type}</span>`;
        if (lg.action_type.includes('LATE')) actionBadge = `<span class="badge badge-red">⏰ ${lg.action_type}</span>`;
        if (lg.action_type.includes('BLOCKED')) actionBadge = `<span class="badge badge-red">🚨 ${lg.action_type}</span>`;
        if (lg.action_type.includes('UNLOCKED')) actionBadge = `<span class="badge badge-green">🔓 ${lg.action_type}</span>`;

        const detailsStr = typeof lg.details === 'object' ? JSON.stringify(lg.details, null, 2) : lg.details;

        return `
          <tr>
            <td style="font-family: var(--font-mono); font-size: 0.75rem; white-space: nowrap;">
              ${lg.timestamp.substring(0, 19).replace('T', ' ')}
            </td>
            <td>
              <div style="font-weight: 600;">${lg.actor_name}</div>
              <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">${lg.actor_role}</div>
            </td>
            <td>${actionBadge}</td>
            <td><span class="badge badge-gray">${lg.resource_type}: ${lg.resource_id || 'N/A'}</span></td>
            <td style="font-family: var(--font-mono); font-size: 0.72rem;">${lg.ip_address}</td>
            <td>
              <div class="hash-pill" title="Current Entry Hash: ${lg.entry_hash}">
                #${lg.id} ${lg.entry_hash.substring(0, 16)}...
              </div>
              <div style="font-size: 0.68rem; color: var(--text-dim); font-family: var(--font-mono);">
                Prev: ${lg.previous_hash.substring(0, 12)}...
              </div>
            </td>
            <td>
              <details style="cursor: pointer;">
                <summary style="font-size: 0.75rem; color: #60a5fa;">View Diff / Payload</summary>
                <pre style="font-family: var(--font-mono); font-size: 0.7rem; background: rgba(0,0,0,0.5); padding: 0.5rem; border-radius: 4px; max-width: 300px; max-height: 150px; overflow: auto; margin-top: 0.35rem; color: #a7f3d0;">${detailsStr}</pre>
              </details>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      this.toast('Failed to load audit logs.', 'error');
    }
  },

  async verifyAuditChainNow() {
    this.toast('Scanning complete cryptographic chain...', 'info');
    try {
      const res = await this.api('/api/owner/verify-audit-chain', 'POST');
      this.showAuditVerificationModal(res);
      this.loadAuditLogs();
    } catch (err) {
      this.toast('Audit chain verification failed.', 'error');
    }
  },

  showAuditVerificationModal(data) {
    const modal = document.getElementById('modal-chain-verification');
    const content = document.getElementById('chain-verification-content');
    modal.style.display = 'flex';

    if (!data) {
      this.api('/api/owner/verify-audit-chain', 'POST').then(res => {
        this.renderVerificationResult(res);
      }).catch(err => {
        content.innerHTML = `<div style="color: #fb7185; padding: 2rem;">Error verifying audit ledger.</div>`;
      });
    } else {
      this.renderVerificationResult(data);
    }
  },

  renderVerificationResult(res) {
    const content = document.getElementById('chain-verification-content');
    if (res.valid) {
      content.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">🛡️✅</div>
          <h3 style="font-size: 1.3rem; font-weight: 800; color: #34d399; margin-bottom: 0.25rem;">
            Cryptographic Integrity 100% Verified
          </h3>
          <p style="font-size: 0.85rem; color: #a7f3d0;">
            All ${res.total_entries} historical records mathematically validate against SHA-256 Merkle links.
          </p>
        </div>

        <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 1rem; font-size: 0.8rem; font-family: var(--font-mono);">
          <div style="margin-bottom: 0.5rem;"><strong>Total Chained Blocks:</strong> ${res.total_entries} blocks</div>
          <div style="margin-bottom: 0.5rem;"><strong>Tampering Status:</strong> <span style="color: #34d399; font-weight: 700;">ZERO TAMPERING DETECTED</span></div>
          <div style="word-break: break-all;"><strong>Latest Merkle Root Hash:</strong><br><span style="color: #93c5fd;">${res.last_verified_hash}</span></div>
        </div>

        <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 1rem; text-align: center;">
          In accordance with Zero-Trust principles, no database mutation can occur without being permanently linked into the immutable ledger.
        </div>
      `;
    } else {
      content.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">🚨❌</div>
          <h3 style="font-size: 1.3rem; font-weight: 800; color: #fb7185; margin-bottom: 0.25rem;">
            Ledger Tampering Detected!
          </h3>
          <p style="font-size: 0.85rem; color: #fecdd3;">
            A historical row was modified or deleted outside the application layer!
          </p>
        </div>

        <div style="background: rgba(225, 29, 72, 0.15); border: 1px solid #f43f5e; border-radius: 8px; padding: 1rem; font-size: 0.82rem; color: #ffffff;">
          <div><strong>Broken At ID:</strong> ${res.broken_at_id}</div>
          <div style="margin-top: 0.5rem;"><strong>Error:</strong> ${res.error}</div>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------
  // Device Security & Unlock Requests
  // -------------------------------------------------------------
  async loadUnlockRequests() {
    try {
      const res = await this.api('/api/owner/unlock-requests');
      const reqs = res.requests || [];
      const pendingCount = reqs.filter(r => r.status === 'PENDING').length;
      document.getElementById('unlock-req-badge').textContent = pendingCount;
      const tbody = document.getElementById('owner-unlock-table');

      if (reqs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">No device unlock requests recorded.</td></tr>`;
        return;
      }

      tbody.innerHTML = reqs.map(r => {
        let statusBadge = `<span class="badge badge-amber">PENDING AUTHORIZATION</span>`;
        if (r.status === 'APPROVED' || r.status === 'USED') statusBadge = `<span class="badge badge-green">${r.status}</span>`;
        if (r.status === 'EXPIRED') statusBadge = `<span class="badge badge-gray">EXPIRED</span>`;

        const codeDisplay = `
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-family: var(--font-mono); font-size: 1.15rem; font-weight: 800; color: #fbbf24; background: rgba(0,0,0,0.5); padding: 0.2rem 0.6rem; border-radius: 6px; letter-spacing: 0.1em;">
              ${r.unlock_code}
            </span>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${r.unlock_code}'); app.toast('Code copied to clipboard: ${r.unlock_code}', 'info');" title="Copy code">📋</button>
          </div>
        `;

        const actionButtons = r.status === 'PENDING' ? `
          <button class="btn btn-emerald btn-sm" onclick="app.ownerApproveUnlockRequest(${r.id})">
            Direct Approve
          </button>
        ` : `<em>Resolved (${r.resolved_by || 'Verified'})</em>`;

        return `
          <tr>
            <td><span class="hash-pill" style="font-weight: 700; color: #fbbf24;">${r.request_code}</span></td>
            <td>
              <div style="font-weight: 700;">${r.employee_name}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${r.employee_email}</div>
            </td>
            <td><span class="hash-pill">${r.bound_device_name || 'None'}</span></td>
            <td>
              <div style="color: #fb7185; font-weight: 600;">${r.requested_device_name || 'Unknown Device'}</div>
              <div style="font-size: 0.7rem; color: var(--text-dim); font-family: var(--font-mono);">IP: ${r.ip_address}</div>
            </td>
            <td>${codeDisplay}</td>
            <td>${statusBadge}</td>
            <td style="font-size: 0.75rem; color: var(--text-dim);">${r.expires_at.substring(11, 19)} UTC</td>
            <td>${actionButtons}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      this.toast('Failed to load device unlock requests.', 'error');
    }
  },

  async ownerApproveUnlockRequest(reqId) {
    try {
      const res = await this.api(`/api/owner/unlock-requests/${reqId}/approve`, 'POST');
      this.toast(res.message || 'Device approved directly!', 'success');
      this.loadUnlockRequests();
      this.loadEmployees();
    } catch (err) {
      this.toast(err.error || 'Failed to approve request.', 'error');
    }
  },

  // Test Simulator on Owner Dashboard
  async simulatePunch(type) {
    const empId = document.getElementById('sim-employee-select').value;
    const now = new Date();
    let simTime;

    if (type === 'ontime') {
      // 08:55 today
      now.setHours(8, 55, 0, 0);
      simTime = now.toISOString();
    } else {
      // 09:32 today (late, triggers full deduction)
      now.setHours(9, 32, 0, 0);
      simTime = now.toISOString();
    }

    try {
      // Find employee
      const emp = this.cachedEmployees.find(e => e.id == empId);
      const res = await this.api('/api/attendance/clock-in', 'POST', {
        simulated_time: simTime,
        device_id: emp ? emp.bound_device_id : this.deviceId,
        device_name: emp ? emp.bound_device_name : this.deviceName
      });

      this.toast(res.message || `Simulated ${type} punch!`, type === 'ontime' ? 'success' : 'error');
      this.loadOwnerData();
    } catch (err) {
      this.toast(err.error || 'Simulation punch failed.', 'error');
    }
  },

  // -------------------------------------------------------------
  // Employee Operations
  // -------------------------------------------------------------
  async loadEmployeeData() {
    if (!this.currentUser) return;
    const emp = this.currentUser;

    document.getElementById('emp-shift-hours').textContent = `${emp.work_start_time || '09:00'} - ${emp.work_end_time || '17:00'}`;
    document.getElementById('emp-grace-period').textContent = `${emp.grace_period_mins || 10} mins`;
    
    const dailyRate = emp.monthly_salary / (emp.working_days_per_month || 22);
    emp.daily_rate = dailyRate;
    document.getElementById('emp-daily-rate').textContent = `$${dailyRate.toFixed(2)} / day`;
    document.getElementById('emp-base-salary').textContent = `$${emp.monthly_salary.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    try {
      // Check today's punch status
      const todayRes = await this.api('/api/attendance/today');
      const att = todayRes.attendance;
      const btnIn = document.getElementById('btn-clock-in');
      const btnOut = document.getElementById('btn-clock-out');

      if (att) {
        btnIn.disabled = true;
        btnIn.textContent = `Clocked In at ${att.clock_in ? att.clock_in.substring(11, 16) : '--'}`;
        if (att.clock_out) {
          btnOut.disabled = true;
          btnOut.textContent = `Clocked Out at ${att.clock_out.substring(11, 16)}`;
        } else {
          btnOut.disabled = false;
        }
      } else {
        btnIn.disabled = false;
        btnIn.textContent = '🟢 Clock In Now';
        btnOut.disabled = true;
      }

      // Load monthly history & payroll statement
      const currentMonth = new Date().toISOString().substring(0, 7);
      const payRes = await this.api(`/api/employee/my-payroll?month=${currentMonth}`);
      const summary = payRes.summary;

      document.getElementById('emp-days-present').textContent = summary.days_present;
      document.getElementById('emp-days-ontime-sub').textContent = `${summary.days_on_time} on-time days`;
      document.getElementById('emp-late-deductions').textContent = `-$${summary.total_late_deductions.toFixed(2)}`;
      document.getElementById('emp-late-days-sub').textContent = `${summary.days_late} late arrivals`;
      document.getElementById('emp-net-payout').textContent = `$${summary.net_payable.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

      this.renderEmployeeHistory(summary.records || []);
    } catch (err) {
      console.error(err);
      this.toast('Failed to load employee records.', 'error');
    }
  },

  renderEmployeeHistory(records) {
    const tbody = document.getElementById('emp-attendance-table');
    if (!records || records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem;">No attendance records found for this month.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const statusBadge = r.status === 'ON_TIME'
        ? `<span class="badge badge-green">ON TIME</span>`
        : `<span class="badge badge-red">LATE</span>`;

      return `
        <tr>
          <td><strong>${r.date}</strong></td>
          <td>${r.clock_in ? r.clock_in.substring(11, 19) : '--'}</td>
          <td>${r.clock_out ? r.clock_out.substring(11, 19) : '--'}</td>
          <td>${statusBadge}</td>
          <td style="${r.late_minutes > 0 ? 'color: #fb7185; font-weight: 700;' : ''}">${r.late_minutes}m</td>
          <td>$${r.daily_salary_rate.toFixed(2)}</td>
          <td style="color: ${r.deduction_amount > 0 ? '#fb7185; font-weight: 700;' : 'var(--text-dim);'}">-$${r.deduction_amount.toFixed(2)}</td>
          <td style="color: #34d399; font-weight: 700;">$${r.net_daily_earned.toFixed(2)}</td>
          <td style="font-size: 0.78rem; color: var(--text-muted);">${r.notes || '--'}</td>
        </tr>
      `;
    }).join('');
  },

  setEmployeeTestPunch(mode) {
    const now = new Date();
    if (mode === 'ontime') {
      now.setHours(8, 55, 0, 0);
      this.simulatedPunchTime = now.toISOString();
      this.toast('Simulated time set to 08:55 AM (On-Time window). Click Clock In!', 'info');
    } else if (mode === 'late') {
      now.setHours(9, 28, 0, 0);
      this.simulatedPunchTime = now.toISOString();
      this.toast('Simulated time set to 09:28 AM (18m Late past grace). Click Clock In to test daily deduction!', 'error');
    } else {
      this.simulatedPunchTime = null;
      this.toast('Reset to real current wall-clock time.', 'info');
    }
    this.updateEmployeeLateWarning(new Date());
  },

  async handleClockIn() {
    try {
      const payload = {
        device_id: this.deviceId,
        device_name: this.deviceName
      };
      if (this.simulatedPunchTime) {
        payload.simulated_time = this.simulatedPunchTime;
      }

      const res = await this.api('/api/attendance/clock-in', 'POST', payload);
      this.simulatedPunchTime = null;

      if (res.is_late) {
        this.toast(`⚠️ Late Punch! Daily Salary Deduction Applied: -$${res.deduction_amount.toFixed(2)}`, 'error');
      } else {
        this.toast(`🟢 Clocked in on time! Earned daily rate: +$${res.daily_rate.toFixed(2)}`, 'success');
      }
      this.loadEmployeeData();
    } catch (err) {
      this.toast(err.error || 'Clock in failed.', 'error');
    }
  },

  async handleClockOut() {
    try {
      const res = await this.api('/api/attendance/clock-out', 'POST');
      this.toast(res.message || 'Clocked out successfully!', 'success');
      this.loadEmployeeData();
    } catch (err) {
      this.toast(err.error || 'Clock out failed.', 'error');
    }
  },

  // -------------------------------------------------------------
  // Helpers & UI Modals
  // -------------------------------------------------------------
  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <span>${message}</span>
      <button style="background: none; border: none; color: inherit; font-size: 1.1rem; cursor: pointer;" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(15px)';
      t.style.transition = 'all 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 4500);
  }
};

// Start application when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
