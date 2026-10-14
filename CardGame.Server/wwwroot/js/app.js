/**
 * CARD GAME ECOSYSTEM - REAL DATA CLIENT CONTROLLER (V2)
 */

// Global Application State
const state = {
    token: localStorage.getItem('cardgame_token') || '',
    user: JSON.parse(localStorage.getItem('cardgame_user') || 'null'),
    balance: 0,
    currentRoom: null,   // { code, tableId, gameType, expireTime }
    hand: [],            // Array of { rawValue, rank, suit, displayName }
    phoms: [],           // Array of arrays of cards (Ta La)
    trashCards: [],      // Remaining trash cards (Ta La)
    selectedCards: new Set(),
    activeGameType: 'tala', // 'tala' | 'poker' | 'tienlen' | 'sam'
    stakePerRound: 2000,    // chip per round/hand stake
    stakeUnit: 'van',       // 'van' (per round) | 'la' (per card, Sam Loc)
    minBuyIn: 20000,        // min chips to enter
    roomCountdownInterval: null,
    playerPollInterval: null,
    pot: 0,
    deckRemaining: 52,
    discardPile: [],
    pokerPhase: 'preflop',  // preflop|flop|turn|river|showdown
    pokerCommunity: [],     // community cards
    pokerCurrentBet: 0,
    authMode: 'login',
    chatMessages: [],
    playerCount: 1
};

// Web Audio API Synthesizer
const audio = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playCardSound() {
        try {
            this.init();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(450, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.09);
        } catch (e) { }
    },
    playChipSound() {
        try {
            this.init();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2400, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.07);
        } catch (e) { }
    },
    playWinSound() {
        try {
            this.init();
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const now = this.ctx.currentTime + idx * 0.1;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.36);
            });
        } catch (e) { }
    },
    playDealSound() {
        // Rapid card-flipping sound burst
        try {
            this.init();
            for (let i = 0; i < 4; i++) {
                const now = this.ctx.currentTime + i * 0.07;
                const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let j = 0; j < data.length; j++) {
                    data[j] = (Math.random() * 2 - 1) * (1 - j / data.length);
                }
                const src = this.ctx.createBufferSource();
                src.buffer = buf;
                const filt = this.ctx.createBiquadFilter();
                filt.type = 'bandpass';
                filt.frequency.value = 1800;
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.15, now);
                src.connect(filt);
                filt.connect(gain);
                gain.connect(this.ctx.destination);
                src.start(now);
            }
        } catch (e) { }
    },
    playLossSound() {
        try {
            this.init();
            const notes = [400, 320, 240];
            notes.forEach((freq, idx) => {
                const now = this.ctx.currentTime + idx * 0.15;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.26);
            });
        } catch (e) { }
    }
};

// UI Notification Toasts
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✔' : '✖'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================================================
// CUSTOM ASYNC CONFIRM & PROMPT DIALOG POPUP
// ==========================================================================
let _customDialogResolver = null;

function showConfirmDialog({ title = 'Xác Nhận', message = '', confirmText = 'Đồng Ý', cancelText = 'Hủy', type = 'info', icon = '' }) {
    return new Promise((resolve) => {
        _customDialogResolver = resolve;
        const modal = document.getElementById('custom-dialog-modal');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-message');
        const iconEl = document.getElementById('custom-dialog-icon');
        const inputGroup = document.getElementById('custom-dialog-input-group');
        const confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        const cancelBtn = document.getElementById('custom-dialog-cancel-btn');

        if (!modal) {
            resolve(window.confirm(message.replace(/<[^>]+>/g, '')));
            return;
        }

        let defaultIcon = 'ℹ️';
        confirmBtn.className = 'btn btn-primary';
        if (type === 'danger') {
            defaultIcon = '🚨';
            confirmBtn.className = 'btn btn-danger';
        } else if (type === 'success') {
            defaultIcon = '✔';
            confirmBtn.className = 'btn btn-success';
        } else if (type === 'warning') {
            defaultIcon = '⚠️';
            confirmBtn.className = 'btn btn-warning';
        }

        iconEl.textContent = icon || defaultIcon;
        titleEl.textContent = title;
        msgEl.innerHTML = message;
        inputGroup.style.display = 'none';

        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        cancelBtn.style.display = 'inline-block';

        modal.classList.add('active');
        confirmBtn.focus();
    });
}

function showPromptDialog({ title = 'Nhập Thông Tin', message = '', placeholder = '', defaultValue = '', confirmText = 'Xác Nhận', cancelText = 'Hủy', type = 'info', icon = '' }) {
    return new Promise((resolve) => {
        _customDialogResolver = resolve;
        const modal = document.getElementById('custom-dialog-modal');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-message');
        const iconEl = document.getElementById('custom-dialog-icon');
        const inputGroup = document.getElementById('custom-dialog-input-group');
        const inputEl = document.getElementById('custom-dialog-input');
        const confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        const cancelBtn = document.getElementById('custom-dialog-cancel-btn');

        if (!modal) {
            resolve(window.prompt(message.replace(/<[^>]+>/g, ''), defaultValue));
            return;
        }

        let defaultIcon = '✏️';
        confirmBtn.className = 'btn btn-primary';
        if (type === 'danger') {
            defaultIcon = '⚠️';
            confirmBtn.className = 'btn btn-danger';
        } else if (type === 'warning') {
            defaultIcon = '🪙';
            confirmBtn.className = 'btn btn-warning';
        }

        iconEl.textContent = icon || defaultIcon;
        titleEl.textContent = title;
        msgEl.innerHTML = message;

        inputGroup.style.display = 'block';
        inputEl.placeholder = placeholder;
        inputEl.value = defaultValue;

        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        cancelBtn.style.display = 'inline-block';

        modal.classList.add('active');
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 50);
    });
}

function closeCustomDialog(result) {
    const modal = document.getElementById('custom-dialog-modal');
    if (modal) modal.classList.remove('active');
    if (_customDialogResolver) {
        _customDialogResolver(result);
        _customDialogResolver = null;
    }
}

// In-Modal Alert Box (Warnings / Errors)
function showAuthAlert(message, type = 'error') {
    const alertBox = document.getElementById('auth-alert');
    const modalDialog = document.querySelector('.modal-dialog');
    alertBox.style.display = 'flex';
    alertBox.className = `auth-alert alert-${type}`;
    alertBox.innerHTML = `<span>${type === 'error' ? '⚠️' : 'ℹ️'}</span> <span>${message}</span>`;

    modalDialog.classList.remove('shake');
    void modalDialog.offsetWidth; // Trigger reflow
    modalDialog.classList.add('shake');
}

function clearAuthAlert() {
    const alertBox = document.getElementById('auth-alert');
    alertBox.style.display = 'none';
    alertBox.textContent = '';
    document.querySelectorAll('.form-input').forEach(i => i.classList.remove('input-error'));
}

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    const res = await fetch(endpoint, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const errorMsg = data.message || data.title || (typeof data === 'string' ? data : 'Lỗi xử lý yêu cầu');
        throw new Error(errorMsg);
    }
    return data;
}

// Global Loading / Waiting Popup Overlay
function showLoading(title = 'Đang Kết Nối Hệ Thống', sub = 'Vui lòng chờ trong giây lát...') {
    const modal = document.getElementById('global-loading-modal');
    if (modal) {
        const t = document.getElementById('global-loading-title');
        const s = document.getElementById('global-loading-sub');
        if (t) t.textContent = title;
        if (s) s.textContent = sub;
        modal.style.display = 'flex';
    }
}

function hideLoading() {
    const modal = document.getElementById('global-loading-modal');
    if (modal) modal.style.display = 'none';
}

// Auth Logic with Real Data & Validation
async function executeAuth() {
    clearAuthAlert();
    const usernameInput = document.getElementById('input-username');
    const passwordInput = document.getElementById('input-password');
    const repasswordInput = document.getElementById('input-repassword');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // 1. Validation Checks
    if (!username) {
        usernameInput.classList.add('input-error');
        usernameInput.focus();
        showAuthAlert('Vui lòng nhập tên tài khoản!', 'error');
        return;
    }

    if (username.length < 3) {
        usernameInput.classList.add('input-error');
        usernameInput.focus();
        showAuthAlert('Tên tài khoản quá ngắn (tối thiểu 3 ký tự)!', 'error');
        return;
    }

    if (/\s/.test(username)) {
        usernameInput.classList.add('input-error');
        usernameInput.focus();
        showAuthAlert('Tên tài khoản không được chứa khoảng trắng!', 'error');
        return;
    }

    if (!password) {
        passwordInput.classList.add('input-error');
        passwordInput.focus();
        showAuthAlert('Vui lòng nhập mật khẩu!', 'error');
        return;
    }

    if (password.length < 6) {
        passwordInput.classList.add('input-error');
        passwordInput.focus();
        showAuthAlert('Mật khẩu phải có độ dài từ 6 ký tự trở lên!', 'error');
        return;
    }

    const submitBtn = document.getElementById('form-auth-submit');
    if (submitBtn) submitBtn.disabled = true;

    showLoading(state.authMode === 'register' ? 'Đang Tạo Tài Khoản Mới' : 'Đang Đăng Nhập Hệ Thống', 'Đang kết nối máy chủ, vui lòng chờ...');

    try {
        if (state.authMode === 'register') {
            const repassword = repasswordInput.value.trim();
            if (password !== repassword) {
                repasswordInput.classList.add('input-error');
                repasswordInput.focus();
                showAuthAlert('Mật khẩu xác nhận không khớp! Vui lòng nhập lại.', 'error');
                return;
            }

            await apiCall('/api/auth/register', 'POST', { username, password });
            showToast('Đăng ký tài khoản thành công! Tặng 3.000 chip trải nghiệm.');
            await loginUser(username, password);
        } else {
            await loginUser(username, password);
        }
    } catch (err) {
        showAuthAlert(err.message, 'error');
        shakeModal('auth-modal');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        hideLoading();
    }
}

async function loginUser(username, password) {
    try {
        const res = await apiCall('/api/auth/login', 'POST', { username, password });
        state.token = res.token;
        state.user = {
            id: res.userId,
            username: res.username || username,
            nickname: res.nickname || res.username || username,
            avatar: res.avatar || '👤',
            role: res.role || 'user'
        };
        localStorage.setItem('cardgame_token', res.token);
        localStorage.setItem('cardgame_user', JSON.stringify(state.user));

        closeModal('auth-modal');
        showToast(`Đăng nhập thành công! Chào mừng ${state.user.nickname || state.user.username}.`);
        updateAuthUI();
        await fetchWalletBalance();
    } catch (e) {
        showAuthAlert(e.message, 'error');
        shakeModal('auth-modal');
    }
}

function handleLogout() {
    state.token = '';
    state.user = null;
    state.balance = 0;
    localStorage.removeItem('cardgame_token');
    localStorage.removeItem('cardgame_user');
    updateAuthUI();
    showToast('Đã đăng xuất tài khoản.');
    switchScreen('screen-lobby');
}

async function fetchWalletBalance() {
    if (!state.token) return;
    try {
        const res = await apiCall('/api/wallet/balance', 'GET');
        state.balance = res.balance;
        document.getElementById('header-chip-count').textContent = Number(state.balance).toLocaleString();
        document.getElementById('seat-self-chips').textContent = Number(state.balance).toLocaleString() + ' 🪙';
    } catch (e) { }
}

async function topUpChips(amount = 10000) {
    if (!state.token) {
        setAuthMode('login');
        openModal('auth-modal');
        showAuthAlert('Vui lòng đăng nhập để nạp chip vào ví!', 'warning');
        return;
    }
    audio.playChipSound();
    try {
        const res = await apiCall('/api/wallet/transfer', 'POST', { amount });
        state.balance = res.newBalance;
        document.getElementById('header-chip-count').textContent = Number(state.balance).toLocaleString();
        document.getElementById('seat-self-chips').textContent = Number(state.balance).toLocaleString() + ' 🪙';
        showToast(`Đã nạp thành công ${Number(amount).toLocaleString()} chip (giao dịch ACID)!`);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function updateAuthUI() {
    const authActions = document.getElementById('auth-actions');
    const userBar = document.getElementById('user-profile-bar');
    const adminBtn = document.getElementById('btn-admin-portal');

    if (state.token && state.user) {
        authActions.style.display = 'none';
        userBar.style.display = 'flex';
        
        const isAdmin = state.user.role === 'admin' || state.user.username?.toLowerCase() === 'admin';
        const displayName = state.user.nickname || state.user.username;
        const avatar = state.user.avatar || (isAdmin ? '👑' : '👤');

        const headerAvatar = document.getElementById('header-avatar');
        if (headerAvatar) headerAvatar.textContent = avatar;

        const headerUsername = document.getElementById('header-username');
        if (headerUsername) {
            headerUsername.innerHTML = `${escapeHtml(displayName)} ${isAdmin ? '<span class="role-badge role-admin">ADMIN</span>' : ''}`;
        }

        const seatSelfName = document.getElementById('seat-self-name');
        if (seatSelfName) seatSelfName.textContent = displayName + (isAdmin ? ' 👑 (Admin)' : ' (Bạn)');

        const seatSelfAvatar = document.getElementById('seat-self-avatar');
        if (seatSelfAvatar) seatSelfAvatar.textContent = avatar;

        if (adminBtn) {
            adminBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        }

        if (isAdmin) {
            checkAdminPendingDepositsCount();
        }

        fetchWalletBalance();
    } else {
        authActions.style.display = 'flex';
        userBar.style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';
        const headerAvatar = document.getElementById('header-avatar');
        if (headerAvatar) headerAvatar.textContent = '👤';
        document.getElementById('header-chip-count').textContent = '0';
        document.getElementById('seat-self-name').textContent = 'Bạn (Chưa đăng nhập)';
        document.getElementById('seat-self-chips').textContent = '0 🪙';
    }
}

// ==========================================================================
// QR PAYMENT & DEPOSIT CONTROLLER (DUYỆT NẠP TIỀN)
// ==========================================================================
let currentDepositAmount = 100000;

function openDepositModal() {
    if (!state.token) {
        setAuthMode('login');
        openModal('auth-modal');
        showAuthAlert('Vui lòng đăng nhập tài khoản trước khi nạp chip!', 'warning');
        return;
    }
    updateDepositDisplay(100000);
    const alertBox = document.getElementById('deposit-status-alert');
    if (alertBox) alertBox.style.display = 'none';
    openModal('deposit-modal');
    loadMyDepositHistory();
}

function updateDepositDisplay(amount) {
    currentDepositAmount = amount;
    const formatted = Number(amount).toLocaleString();
    const amountEl = document.getElementById('qr-display-amount');
    const syntaxEl = document.getElementById('qr-display-syntax');
    const confirmBtn = document.getElementById('btn-confirm-deposit');

    if (amountEl) amountEl.textContent = `${formatted} VNĐ`;
    if (syntaxEl) syntaxEl.textContent = `NAP ${state.user?.username || 'player'}`;
    if (confirmBtn) confirmBtn.textContent = `✔ Xác Nhận Đã Chuyển Khoản (+${formatted} Chip)`;
}

function selectDepositDenom(btn) {
    document.querySelectorAll('.denom-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('input-custom-deposit').value = '';
    const amt = parseInt(btn.dataset.amount);
    updateDepositDisplay(amt);
}

function onCustomDepositInput(val) {
    document.querySelectorAll('.denom-btn').forEach(b => b.classList.remove('active'));
    let amt = parseInt(val) || 0;
    if (amt > 0) {
        updateDepositDisplay(amt);
    }
}

async function confirmDepositPayment() {
    if (!state.token) {
        openModal('auth-modal');
        return;
    }
    if (currentDepositAmount < 10000) {
        showToast('Số tiền nạp tối thiểu là 10.000 VNĐ!', 'error');
        return;
    }

    const transferCode = `NAP ${state.user?.username || 'player'}`;
    audio.playChipSound();

    try {
        const res = await apiCall('/api/deposit/request', 'POST', {
            amount: currentDepositAmount,
            transferCode: transferCode
        });

        const alertBox = document.getElementById('deposit-status-alert');
        if (alertBox) {
            alertBox.style.display = 'block';
            alertBox.className = 'deposit-alert-box deposit-alert-pending';
            alertBox.innerHTML = `
                <strong>⏳ LỆNH NẠP ĐÃ ĐƯỢC GỬI THÀNH CÔNG!</strong><br>
                Số tiền: <strong>${Number(currentDepositAmount).toLocaleString()} VNĐ</strong> (${Number(currentDepositAmount).toLocaleString()} Chip)<br>
                Mã giao dịch: <code>${transferCode}</code><br>
                <em>Admin đang kiểm tra tài khoản ngân hàng và sẽ duyệt cộng chip ngay cho bạn!</em>
            `;
        }

        showToast('Đã gửi yêu cầu nạp tiền! Vui lòng chờ Admin duyệt.');
        await loadMyDepositHistory();

        // Refresh admin pending badge if current user is admin
        if (state.user?.role === 'admin') {
            checkAdminPendingDepositsCount();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function loadMyDepositHistory() {
    if (!state.token) return;
    const listEl = document.getElementById('my-deposit-history-list');
    if (!listEl) return;

    try {
        const list = await apiCall('/api/deposit/my-requests', 'GET');
        if (!list || list.length === 0) {
            listEl.innerHTML = '<div style="font-size: 0.75rem; color: #64748b; text-align: center; padding: 6px;">Chưa có yêu cầu nạp nào</div>';
            return;
        }

        listEl.innerHTML = '';
        list.forEach(item => {
            const time = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(item.createdAt).toLocaleDateString();
            let statusBadge = '<span class="status-badge status-pending">⏳ Chờ Duyệt</span>';
            if (item.status === 'Approved') {
                statusBadge = '<span class="status-badge status-approved">✔ Đã Cộng Chip</span>';
            } else if (item.status === 'Rejected') {
                statusBadge = `<span class="status-badge status-rejected" title="${item.rejectReason || ''}">✖ Bị Từ Chối</span>`;
            }

            const div = document.createElement('div');
            div.className = 'my-deposit-item';
            div.innerHTML = `
                <div>
                    <strong style="color: #fbbf24;">+${Number(item.amount).toLocaleString()} đ</strong>
                    <span style="color: #64748b; font-size: 0.7rem; margin-left: 6px;">(${item.transferCode})</span>
                    <div style="font-size: 0.68rem; color: #94a3b8;">${time}</div>
                </div>
                <div>${statusBadge}</div>
            `;
            listEl.appendChild(div);
        });
    } catch (e) {}
}

function copyTransferSyntax() {
    const syntax = `NAP ${state.user?.username || 'player'}`;
    navigator.clipboard.writeText(syntax);
    showToast(`Đã sao chép nội dung chuyển khoản: "${syntax}"`);
}

// ==========================================================================
// PROFESSIONAL ADMIN MANAGEMENT PORTAL CONTROLLER
// ==========================================================================
let currentDepositFilter = 'Pending';
let currentBanTarget = null; // { userId, username }

async function checkAdminPendingDepositsCount() {
    try {
        const stats = await apiCall('/api/admin/stats', 'GET');
        const count = stats.pendingDepositsCount || 0;
        
        const headerBadge = document.getElementById('header-admin-pending-badge');
        if (headerBadge) {
            headerBadge.textContent = count;
            headerBadge.style.display = count > 0 ? 'flex' : 'none';
        }

        const tabBadge = document.getElementById('admin-pending-badge');
        if (tabBadge) {
            tabBadge.textContent = count;
            tabBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }

        const filterCount = document.getElementById('count-pending-filter');
        if (filterCount) filterCount.textContent = count;
    } catch (e) {}
}

async function openAdminPortal() {
    openModal('admin-modal');
    // Default to Overview tab
    switchAdminTab('admin-view-overview');
    await loadAdminDashboard();
}

function switchAdminTab(targetTabId) {
    // Update sidebar nav items
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === targetTabId);
    });
    // Legacy tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === targetTabId);
    });
    // Show correct panel (new: .admin-panel, old: .admin-tab-pane)
    document.querySelectorAll('.admin-panel, .admin-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === targetTabId);
    });

    if (targetTabId === 'admin-view-overview')  loadAdminDashboard();
    else if (targetTabId === 'admin-view-deposits') loadAdminDeposits();
    else if (targetTabId === 'admin-view-users')    loadAdminUsers();
    else if (targetTabId === 'admin-view-tables')   loadAdminTables();
    else if (targetTabId === 'admin-view-logs')     loadAdminLogs();
    else if (targetTabId === 'admin-view-spin')     loadAdminSpinStats();
}

// --- TAB 1: OVERVIEW ---
async function loadAdminDashboard() {
    try {
        const stats = await apiCall('/api/admin/stats', 'GET');
        document.getElementById('admin-stat-users').textContent = stats.totalUsers || 0;
        document.getElementById('admin-stat-chips').textContent = Number(stats.totalChipsInCirculation || 0).toLocaleString();
        document.getElementById('admin-stat-pending').textContent = stats.pendingDepositsCount || 0;
        document.getElementById('admin-stat-banned').textContent = stats.bannedUsersCount || 0;
        document.getElementById('admin-stat-rooms').textContent = stats.activeTables || 0;

        await checkAdminPendingDepositsCount();
    } catch (e) {
        showToast('Lỗi khi tải thông số quản trị: ' + e.message, 'error');
    }
}

// --- TAB 2: DEPOSIT APPROVAL ---
async function loadAdminDeposits() {
    const tbody = document.getElementById('admin-deposits-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 1rem;">Đang tải danh sách lệnh nạp...</td></tr>';

    try {
        const deposits = await apiCall(`/api/admin/deposits?status=${currentDepositFilter}`, 'GET');
        tbody.innerHTML = '';

        if (!deposits || deposits.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 1.5rem;">Không có yêu cầu nạp nào (${currentDepositFilter}).</td></tr>`;
            return;
        }

        deposits.forEach(d => {
            const time = new Date(d.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(d.createdAt).toLocaleDateString();
            let statusBadge = '<span class="status-badge status-pending">⏳ Chờ Duyệt</span>';
            let actionsHtml = '';

            if (d.status === 'Pending') {
                actionsHtml = `
                    <div style="display: flex; gap: 4px;">
                        <button class="btn btn-success btn-chip-action" onclick="adminApproveDeposit('${d.id}', '${d.username}', ${d.amount})">✔ Duyệt Nạp</button>
                        <button class="btn btn-danger btn-chip-action" onclick="adminRejectDeposit('${d.id}', '${d.username}')">✖ Từ Chối</button>
                    </div>
                `;
            } else if (d.status === 'Approved') {
                statusBadge = '<span class="status-badge status-approved">✔ Đã Duyệt</span>';
                actionsHtml = `<span style="font-size: 0.72rem; color: #34d399;">Đã cộng ${Number(d.amount).toLocaleString()} chip</span>`;
            } else {
                statusBadge = '<span class="status-badge status-rejected">✖ Từ Chối</span>';
                actionsHtml = `<span style="font-size: 0.72rem; color: #f87171;" title="${d.rejectReason || ''}">${d.rejectReason || 'Từ chối'}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: #94a3b8; font-size: 0.78rem;">${time}</td>
                <td><strong style="color: #f8fafc;">${d.username}</strong></td>
                <td style="color: #fbbf24; font-weight: 700;">+${Number(d.amount).toLocaleString()} VNĐ</td>
                <td><code style="background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; color: #93c5fd;">${d.transferCode}</code></td>
                <td>${statusBadge}</td>
                <td>${actionsHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        await checkAdminPendingDepositsCount();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f87171; padding: 1rem;">Lỗi: ${e.message}</td></tr>`;
    }
}

window.adminApproveDeposit = async function(depositId, username, amount) {
    const confirmed = await showConfirmDialog({
        title: '✔ Duyệt Lệnh Nạp Chip',
        message: `Xác nhận duyệt nạp <strong>${Number(amount).toLocaleString()} chip</strong> cho người chơi <strong>"${escapeHtml(username)}"</strong>?`,
        confirmText: '✔ Duyệt Nạp',
        cancelText: 'Hủy',
        type: 'success',
        icon: '💳'
    });
    if (!confirmed) return;

    try {
        const res = await apiCall('/api/admin/deposits/approve', 'POST', { depositId });
        audio.playWinSound();
        showToast(res.message);
        await loadAdminDeposits();
        await loadAdminDashboard();
        if (state.user?.username === username) fetchWalletBalance();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.adminRejectDeposit = async function(depositId, username) {
    const reason = await showPromptDialog({
        title: '✖ Từ Chối Lệnh Nạp',
        message: `Nhập lý do từ chối lệnh nạp của người chơi <strong>"${escapeHtml(username)}"</strong>:`,
        defaultValue: 'Không nhận được tiền hoặc sai cú pháp chuyển khoản',
        placeholder: 'Nhập lý do từ chối...',
        confirmText: '✖ Từ Chối Lệnh',
        cancelText: 'Hủy',
        type: 'danger',
        icon: '⚠️'
    });
    if (reason === null) return;

    try {
        const res = await apiCall('/api/admin/deposits/reject', 'POST', { depositId, reason });
        showToast(res.message);
        await loadAdminDeposits();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// --- TAB 3: USER MANAGEMENT & BAN ---
async function loadAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;
    const searchTerm = document.getElementById('admin-search-users')?.value || '';

    try {
        const users = await apiCall(`/api/admin/users?search=${encodeURIComponent(searchTerm)}`, 'GET');
        tbody.innerHTML = '';

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 1.5rem;">Không tìm thấy người chơi nào.</td></tr>';
            return;
        }

        users.forEach(u => {
            let statusBadge = '<span class="status-badge status-active">🟢 Hoạt Động</span>';
            if (u.isBanned) {
                const banExpire = u.bannedUntil ? new Date(u.bannedUntil).toLocaleDateString() : 'Vĩnh viễn';
                statusBadge = `<span class="status-badge status-banned" title="${u.banReason || ''}">🔴 Khóa (${banExpire})</span>`;
            }

            let banActionBtn = '';
            if (!u.isAdmin) {
                if (u.isBanned) {
                    banActionBtn = `<button class="btn btn-success btn-chip-action" onclick="adminUnbanUser('${u.id}', '${u.username}')">🔓 Mở</button>`;
                } else {
                    banActionBtn = `<button class="btn btn-danger btn-chip-action" onclick="openBanModal('${u.id}', '${u.username}')">🚫 Khóa</button>`;
                }
                banActionBtn += `<button class="btn btn-danger btn-chip-action" style="background:#dc2626;border-color:#b91c1c;margin-left:4px;" onclick="adminDeleteUser('${u.id}', '${u.username}')" title="Xóa vĩnh viễn khỏi Database">🗑️ Xóa</button>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:1.3rem;">${escapeHtml(u.avatar || '👤')}</span>
                        <div>
                            <strong style="color: #f8fafc;">${escapeHtml(u.nickname || u.username)}</strong>
                            <div style="font-size:0.75rem;color:#94a3b8;">@${escapeHtml(u.username)}</div>
                        </div>
                        ${u.isAdmin ? '<span class="role-badge role-admin" style="margin-left: 4px;">ADMIN</span>' : ''}
                    </div>
                </td>
                <td style="color: #fbbf24; font-weight: 700;">${Number(u.balance).toLocaleString()} 🪙</td>
                <td>
                    <span class="role-badge ${u.isAdmin ? 'role-admin' : 'role-user'}">${u.isAdmin ? 'Quản Trị Viên' : 'Người Chơi'}</span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn btn-secondary btn-chip-action" onclick="adminAdjustChips('${u.id}', '${u.username}', 50000)">+50K</button>
                        <button class="btn btn-secondary btn-chip-action" onclick="adminAdjustChips('${u.id}', '${u.username}', 200000)">+200K</button>
                        <button class="btn btn-danger btn-chip-action" onclick="adminAdjustChips('${u.id}', '${u.username}', -50000)">-50K</button>
                        <button class="btn btn-primary btn-chip-action" onclick="adminCustomAdjustChips('${u.id}', '${u.username}')">Tùy Chỉnh</button>
                    </div>
                </td>
                <td><div style="display:flex;align-items:center;">${banActionBtn}</div></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f87171; padding: 1rem;">Lỗi: ${e.message}</td></tr>`;
    }
}

window.adminDeleteUser = async function(userId, username) {
    const ok = await showConfirmDialog({
        title: '⚠️ CẢNH BÁO XÓA TÀI KHOẢN',
        message: `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản <strong>"${escapeHtml(username)}"</strong> khỏi cơ sở dữ liệu?<br><br><span style="color:#f87171;font-size:0.85rem;">⚠️ Thao tác này sẽ xóa toàn bộ số dư chip, lịch sử giao dịch và không thể hoàn tác!</span>`,
        confirmText: 'Xóa Vĩnh Viễn',
        cancelText: 'Hủy Bỏ',
        type: 'danger',
        icon: '🗑️'
    });
    if (!ok) return;

    try {
        showLoading('Đang Xóa Tài Khoản', `Đang xóa ${username} vĩnh viễn khỏi database...`);
        const res = await apiCall('/api/admin/delete-user', 'POST', { userId });
        showToast(res.message || 'Đã xóa tài khoản vĩnh viễn khỏi hệ thống!', 'success');
        await loadAdminUsers();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
};

window.adminCleanAllPlayers = async function() {
    const ok = await showConfirmDialog({
        title: '🚨 DỌN DẸP TOÀN BỘ CƠ SỞ DỮ LIỆU',
        message: `Bạn có chắc chắn muốn <strong>XÓA TOÀN BỘ BÀN CHƠI</strong> và <strong>TẤT CẢ NGƯỜI CHƠI</strong> khỏi database?<br><br><span style="color:#f87171;font-size:0.85rem;">⚠️ Chỉ giữ lại tài khoản Super Admin (admin) với 10.000.000 chip. Thao tác này KHÔNG THỂ HOÀN TÁC!</span>`,
        confirmText: '🧹 Dọn Dẹp Ngay',
        cancelText: 'Hủy Bỏ',
        type: 'danger',
        icon: '🚨'
    });
    if (!ok) return;

    try {
        showLoading('Đang Dọn Dẹp Hệ Thống', 'Đang xóa sạch dữ liệu bàn chơi và người chơi...');
        const res = await apiCall('/api/admin/clean-all-players', 'POST');
        showToast(res.message || 'Đã dọn dẹp sạch toàn bộ dữ liệu thành công!', 'success');
        await loadAdminUsers();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
};

window.adminAdjustChips = async function(userId, username, amount) {
    try {
        const res = await apiCall('/api/admin/adjust-balance', 'POST', { userId, amount });
        showToast(res.message);
        await loadAdminUsers();
        await loadAdminDashboard();
        if (state.user?.username === username) fetchWalletBalance();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.adminCustomAdjustChips = async function(userId, username) {
    const input = await showPromptDialog({
        title: '🪙 Điều Chỉnh Số Dư Ví',
        message: `Nhập số chip muốn cộng (+) hoặc trừ (-) cho tài khoản <strong>"${escapeHtml(username)}"</strong>:`,
        defaultValue: '100000',
        placeholder: 'Ví dụ: 50000 hoặc -20000',
        confirmText: 'Xác Nhận',
        cancelText: 'Hủy',
        type: 'warning',
        icon: '🪙'
    });
    if (input === null) return;
    const amount = parseInt(input);
    if (isNaN(amount) || amount === 0) {
        showToast('Vui lòng nhập số chip hợp lệ!', 'error');
        return;
    }
    await window.adminAdjustChips(userId, username, amount);
};

// Ban Modal Functions
window.openBanModal = function(userId, username) {
    currentBanTarget = { userId, username };
    document.getElementById('ban-target-username').textContent = username;
    document.getElementById('ban-duration-select').value = "3";
    document.getElementById('ban-reason-input').value = "Nghi vấn gian lận bài / vi phạm quy định";
    openModal('ban-user-modal');
};

async function executeConfirmBan() {
    if (!currentBanTarget) return;
    const days = parseInt(document.getElementById('ban-duration-select').value);
    const reason = document.getElementById('ban-reason-input').value.trim() || 'Vi phạm quy định hệ thống';

    try {
        const res = await apiCall('/api/admin/ban', 'POST', {
            userId: currentBanTarget.userId,
            days: days,
            reason: reason
        });
        closeModal('ban-user-modal');
        showToast(res.message);
        await loadAdminUsers();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

window.adminUnbanUser = async function(userId, username) {
    const confirmed = await showConfirmDialog({
        title: '🔓 Mở Khóa Tài Khoản',
        message: `Xác nhận mở khóa tài khoản cho người chơi <strong>"${escapeHtml(username)}"</strong>?`,
        confirmText: '🔓 Mở Khóa',
        cancelText: 'Hủy',
        type: 'success',
        icon: '🔓'
    });
    if (!confirmed) return;

    try {
        const res = await apiCall('/api/admin/unban', 'POST', { userId });
        showToast(res.message);
        await loadAdminUsers();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// --- TAB 4: ACTIVE TABLES & KICK ---
async function loadAdminTables() {
    const container = document.getElementById('admin-tables-list');
    if (!container) return;
    container.innerHTML = '<div style="color: #94a3b8; padding: 1rem;">Đang tải danh sách bàn chơi...</div>';

    try {
        const tables = await apiCall('/api/admin/tables', 'GET');
        container.innerHTML = '';

        if (!tables || tables.length === 0) {
            container.innerHTML = '<div style="color: #64748b; padding: 1.5rem; text-align: center; grid-column: 1 / -1;">Hiện không có bàn chơi nào đang mở.</div>';
            return;
        }

        tables.forEach(t => {
            const card = document.createElement('div');
            card.className = 'admin-table-card';

            let playersHtml = '';
            t.players.forEach(p => {
                const isPAdmin = p.username.toLowerCase() === 'admin';
                playersHtml += `
                    <div class="admin-table-player-row">
                        <div>
                            <strong>${p.username}</strong>
                            <span style="color: #fbbf24; margin-left: 6px;">${Number(p.chips).toLocaleString()} 🪙</span>
                            <span style="color: #94a3b8; font-size: 0.7rem; margin-left: 4px;">(Ghế ${p.seatIndex + 1})</span>
                        </div>
                        <div>
                            ${!isPAdmin ? `<button class="btn btn-danger btn-chip-action" onclick="adminKickPlayer('${t.tableId}', '${p.userId}', '${p.username}')">🚨 Kick</button>` : '<span class="role-badge role-admin">ADMIN</span>'}
                        </div>
                    </div>
                `;
            });

            card.innerHTML = `
                <div class="admin-table-card-header">
                    <div>
                        <strong style="color: #fbbf24; font-size: 1rem;">BÀN: ${t.roomCode}</strong>
                        <span style="color: #94a3b8; font-size: 0.75rem; margin-left: 8px;">Cược min: ${Number(t.minBuyIn).toLocaleString()} 🪙</span>
                    </div>
                    <span class="status-badge status-active">${t.playerCount}/${t.maxPlayers} Người</span>
                </div>
                <div class="admin-table-players-list">
                    ${playersHtml || '<div style="color: #64748b; font-size: 0.75rem;">Chưa có người ngồi</div>'}
                </div>
                <button type="button" class="btn btn-secondary btn-block" style="font-size: 0.75rem; padding: 0.35rem;" onclick="adminCloseTable('${t.tableId}')">
                    🛑 Giải Tán Bàn Chơi
                </button>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        container.innerHTML = `<div style="color: #f87171; padding: 1rem;">Lỗi: ${e.message}</div>`;
    }
}

window.adminKickPlayer = async function(tableId, userId, username) {
    const confirmed = await showConfirmDialog({
        title: '🚨 Mời Rời Bàn',
        message: `Xác nhận mời người chơi <strong>"${escapeHtml(username)}"</strong> ra khỏi bàn chơi?`,
        confirmText: '🚨 Kick Ngay',
        cancelText: 'Hủy',
        type: 'danger',
        icon: '🚨'
    });
    if (!confirmed) return;

    try {
        const res = await apiCall('/api/admin/kick-player', 'POST', { tableId, userId });
        showToast(res.message);
        await loadAdminTables();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.adminCloseTable = async function(tableId) {
    const confirmed = await showConfirmDialog({
        title: '🛑 Giải Tán Bàn Chơi',
        message: 'Xác nhận giải tán bàn chơi này? Tất cả người chơi trong phòng sẽ bị mời ra sảnh.',
        confirmText: '🛑 Giải Tán',
        cancelText: 'Hủy',
        type: 'danger',
        icon: '🛑'
    });
    if (!confirmed) return;

    try {
        const res = await apiCall('/api/admin/close-table', 'POST', { tableId });
        showToast(res.message);
        await loadAdminTables();
        await loadAdminDashboard();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// --- TAB 5: AUDIT LOGS ---
async function loadAdminLogs() {
    const tbody = document.getElementById('admin-logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 1rem;">Đang tải nhật ký...</td></tr>';

    try {
        const logs = await apiCall('/api/admin/logs', 'GET');
        tbody.innerHTML = '';

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1.5rem;">Chưa có nhật ký hoạt động nào.</td></tr>';
            return;
        }

        logs.forEach(l => {
            const time = new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(l.createdAt).toLocaleDateString();
            
            let actionBadge = `<span class="role-badge role-user">${l.actionType}</span>`;
            if (l.actionType.includes('APPROVE')) actionBadge = `<span class="status-badge status-approved">✔ DUYỆT NẠP</span>`;
            else if (l.actionType.includes('REJECT')) actionBadge = `<span class="status-badge status-rejected">✖ TỪ CHỐI</span>`;
            else if (l.actionType.includes('BAN')) actionBadge = `<span class="status-badge status-banned">🚫 BAN USER</span>`;
            else if (l.actionType.includes('UNBAN')) actionBadge = `<span class="status-badge status-active">🔓 MỞ KHÓA</span>`;
            else if (l.actionType.includes('KICK')) actionBadge = `<span class="status-badge status-rejected">🚨 KICK BÀN</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: #94a3b8; font-size: 0.78rem;">${time}</td>
                <td><strong style="color: #fbbf24;">${l.adminUsername}</strong></td>
                <td>${actionBadge}</td>
                <td><strong style="color: #f8fafc;">${l.targetUser}</strong></td>
                <td style="color: #cbd5e1; font-size: 0.8rem;">${l.details || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f87171; padding: 1rem;">Lỗi: ${e.message}</td></tr>`;
    }
}

// Screen Switcher
function switchScreen(screenId) {
    audio.playCardSound();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
}

// Modals & Tab Switching
function openModal(modalId) {
    try { clearAuthAlert(); } catch (e) { }
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
}

function setAuthMode(mode) {
    state.authMode = mode;
    clearAuthAlert();
    const tabLogin = document.getElementById('tab-auth-login');
    const tabRegister = document.getElementById('tab-auth-register');
    const groupRepass = document.getElementById('group-repassword');
    const submitBtn = document.getElementById('form-auth-submit');

    if (mode === 'register') {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        groupRepass.style.display = 'block';
        submitBtn.textContent = 'Tạo Tài Khoản Mới';
    } else {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        groupRepass.style.display = 'none';
        submitBtn.textContent = 'Đăng Nhập';
    }
}

// Room & Virtual Table Operations
async function enterGame(gameType, stakePerRound, minBuyIn) {
    if (!state.token) {
        setAuthMode('login');
        openModal('auth-modal');
        showAuthAlert('Vui long dang nhap truoc khi vao ban choi!', 'warning');
        return;
    }

    // Check balance
    if (state.balance < minBuyIn) {
        showToast(`So du khong du! Can toi thieu ${Number(minBuyIn).toLocaleString()} chip de vao ban nay.`, 'error');
        openDepositModal();
        return;
    }

    state.activeGameType = gameType;
    state.stakePerRound = stakePerRound;
    state.minBuyIn = minBuyIn;
    state.stakeUnit = (gameType === 'sam') ? 'la' : 'van';

    const gameTitles = {
        'tala': 'TA LA (PHOM)',
        'poker': 'TEXAS HOLDEM POKER',
        'tienlen': 'TIEN LEN MIEN NAM',
        'sam': 'SAM LOC'
    };
    document.getElementById('table-game-name').textContent = gameTitles[gameType] || gameType.toUpperCase();

    // Format stake label
    const stakeLabel = gameType === 'poker'
        ? `BB ${Number(stakePerRound).toLocaleString()}`
        : `${Number(stakePerRound).toLocaleString()}/${state.stakeUnit}`;
    const stakeEl = document.getElementById('stake-info-tag');
    if (stakeEl) stakeEl.textContent = `⚡ ${stakeLabel}`;

    try {
        const res = await apiCall('/api/room/create', 'POST', {
            maxPlayers: 4,
            minBuyIn: minBuyIn
        });

        state.currentRoom = {
            code: res.roomCode,
            tableId: res.tableId,
            expireTime: Date.now() + 15 * 60 * 1000,
            gameType
        };

        showToast(`Tao phong ${gameTitles[gameType]} thanh cong! Ma moi: ${res.roomCode}`);
        openVirtualTable();
        startRoomCountdown();
        showWaitingOverlay();
        startPlayerPolling();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function joinRoomByCode(code) {
    if (!state.token) {
        setAuthMode('login');
        openModal('auth-modal');
        showAuthAlert('Vui lòng đăng nhập trước khi vào bàn chơi!', 'warning');
        return;
    }

    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        showToast('Mã phòng phải gồm 6 chữ số hợp lệ!', 'error');
        return;
    }

    showLoading('Đang Vào Phòng Chơi', `Đang kết nối vào phòng ${code}...`);

    try {
        const res = await apiCall('/api/room/join', 'POST', { roomCode: code });
        state.currentRoom = {
            code: code,
            tableId: res.tableId,
            expireTime: Date.now() + 15 * 60 * 1000
        };
        showToast(res.message);
        openVirtualTable();
        startRoomCountdown();
        startPlayerPolling();
        addChatMessage('🎮 Hệ thống', 'Bạn đã vào phòng! Đang đồng bộ trạng thái bàn chơi...', 'system');
        const chatPanel = document.getElementById('chat-panel');
        if (chatPanel) chatPanel.style.display = 'flex';
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

// Reset entire table and prevent carrying cards over between rooms
function openVirtualTable() {
    // 1. Wipe all local round state
    state.hand = [];
    state.selectedCards.clear();
    state.discardPile = [];
    state.phoms = [];
    state.trashCards = [];
    state.pot = 0;
    state.pokerCommunity = [];
    state.isMyTurn = false;

    // 2. Clear all table DOM elements immediately
    const handContainer = document.getElementById('player-hand-cards');
    if (handContainer) handContainer.innerHTML = '';

    const phomContainer = document.getElementById('phom-cards-container');
    if (phomContainer) phomContainer.innerHTML = '';

    const phomZone = document.getElementById('phom-zone');
    if (phomZone) phomZone.style.display = 'none';

    const trashBadge = document.getElementById('trash-score-badge');
    if (trashBadge) trashBadge.style.display = 'none';

    const discardArea = document.getElementById('table-discard-cards');
    if (discardArea) discardArea.innerHTML = '<div class="empty-discard-placeholder">Chưa đánh bài</div>';

    const commCards = document.getElementById('community-cards');
    if (commCards) { commCards.innerHTML = ''; commCards.style.display = 'none'; }

    const potEl = document.getElementById('table-pot-amount');
    if (potEl) potEl.textContent = '0';

    const deckCountEl = document.getElementById('deck-remaining-count');
    if (deckCountEl) deckCountEl.textContent = '52';

    const phaseBadge = document.getElementById('table-phase-badge');
    if (phaseBadge) phaseBadge.textContent = 'Chờ chia bài';

    const evalText = document.getElementById('eval-result-text');
    if (evalText) evalText.textContent = 'Bàn mới: Chờ người chơi vào...';

    const turnEl = document.getElementById('table-turn-indicator');
    if (turnEl) turnEl.textContent = '⏳ Đang kết nối bàn chơi...';

    // 3. Switch screen
    switchScreen('screen-table');
    renderOpponentSeats();
    state.playerCount = 1;
    updatePlayerCountUI(1);

    // 4. Show correct action buttons for this game type
    ['tala','poker','tienlen','sam'].forEach(g => {
        const el = document.getElementById(`actions-${g}`);
        if (el) el.style.display = (g === state.activeGameType) ? 'flex' : 'none';
    });
}

// ---- WAITING OVERLAY & PLAYER POLLING ----
function getDealBtnId() {
    const map = { tala: 'btn-deal-hand', poker: 'btn-deal-poker', tienlen: 'btn-deal-tienlen', sam: 'btn-deal-sam' };
    return map[state.activeGameType] || 'btn-deal-hand';
}

function showWaitingOverlay() {
    const overlay = document.getElementById('waiting-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const codeText = document.getElementById('waiting-room-code-text');
        if (codeText && state.currentRoom?.code) codeText.textContent = state.currentRoom.code;
    }
    const dealBtn = document.getElementById(getDealBtnId());
    if (dealBtn) { dealBtn.disabled = true; dealBtn.style.opacity = '0.5'; }
    const ind = document.getElementById('table-turn-indicator');
    if (ind && (!state.tableState || state.tableState.state === 'Waiting')) {
        ind.textContent = '⏳ Chờ người chơi vào bàn...';
    }
    const pb = document.getElementById('table-phase-badge');
    if (pb && (!state.tableState || state.tableState.state === 'Waiting')) {
        pb.textContent = 'Chờ người chơi';
    }
}

function hideWaitingOverlay() {
    const overlay = document.getElementById('waiting-overlay');
    if (overlay) overlay.style.display = 'none';
}

function updatePlayerCountUI(count) {
    const el = document.getElementById('table-player-count');
    if (el) el.textContent = count;

    // Update waiting overlay player list
    const listEl = document.getElementById('waiting-players-list');
    if (listEl) {
        listEl.innerHTML = `<div class="waiting-player-item">😎 ${state.user?.nickname || state.user?.username || 'Bạn'} (Chủ bàn)</div>`;
        for (let i = 1; i < count; i++) {
            listEl.innerHTML += `<div class="waiting-player-item">👤 Người chơi ${i + 1}</div>`;
        }
    }
}

// Realtime Table Synchronization (Polls server every 1.5s)
function startPlayerPolling() {
    if (state.playerPollInterval) clearInterval(state.playerPollInterval);
    syncTableState();
    state.playerPollInterval = setInterval(syncTableState, 1500);
}

async function syncTableState() {
    if (!state.currentRoom?.tableId || !state.token) return;

    try {
        const table = await apiCall(`/api/room/${state.currentRoom.tableId}/state`, 'GET');
        if (!table) return;

        state.tableState = table;
        state.activeGameType = table.gameType;
        state.playerCount = table.players ? table.players.length : 1;
        updatePlayerCountUI(state.playerCount);

        // Update room header
        const gameTitles = {
            'tala': 'TÁ LẢ (PHỎM)',
            'poker': 'TEXAS HOLDEM POKER',
            'tienlen': 'TIẾN LÊN MIỀN NAM',
            'sam': 'SÂM LỐC'
        };
        const gName = document.getElementById('table-game-name');
        if (gName) gName.textContent = gameTitles[table.gameType] || table.gameType.toUpperCase();

        const potEl = document.getElementById('table-pot-amount');
        if (potEl) potEl.textContent = Number(table.pot || 0).toLocaleString();

        const deckCountEl = document.getElementById('deck-remaining-count');
        if (deckCountEl) deckCountEl.textContent = table.deckRemaining ?? 52;

        const phaseBadge = document.getElementById('table-phase-badge');
        if (phaseBadge) {
            if (table.state === 'Waiting') phaseBadge.textContent = 'Chờ chia bài';
            else if (table.gameType === 'poker') phaseBadge.textContent = table.pokerPhase ? table.pokerPhase.toUpperCase() : 'Poker';
            else phaseBadge.textContent = 'Đang chơi';
        }

        // Toggle waiting overlay
        if (state.playerCount >= 2) {
            hideWaitingOverlay();
        } else {
            showWaitingOverlay();
        }

        // Identify self player vs opponents
        const selfPlayer = (table.players && table.players.find(p => p.userId === state.user?.userId)) || (table.players ? table.players[0] : null);
        if (!selfPlayer) return;

        const isMyTurn = (table.currentTurnUserId === selfPlayer.userId && table.state !== 'Waiting' && table.state !== 'Finished' && table.state !== 'Settlement');
        state.isMyTurn = isMyTurn;

        // Turn indicator
        const turnEl = document.getElementById('table-turn-indicator');
        if (turnEl) {
            if (table.state === 'Waiting') {
                turnEl.textContent = state.playerCount < 2 ? '⏳ Chờ người chơi vào bàn...' : '🟢 Bàn sẵn sàng chia bài!';
                turnEl.style.color = '#94a3b8';
            } else if (isMyTurn) {
                turnEl.textContent = '👉 ĐẾN LƯỢT CỦA BẠN!';
                turnEl.style.color = '#fbbf24';
            } else {
                const curPlayer = table.players.find(p => p.userId === table.currentTurnUserId);
                turnEl.textContent = `⏳ Lượt của ${curPlayer ? (curPlayer.nickname || curPlayer.username) : 'đối thủ'}...`;
                turnEl.style.color = '#94a3b8';
            }
        }

        if (table.statusMessage) {
            const evalText = document.getElementById('eval-result-text');
            if (evalText) evalText.textContent = table.statusMessage;
        }

        // Deal Button Management (Strict rule: Only host can deal, only when >= 2 players and not mid-game)
        const dealBtn = document.getElementById(getDealBtnId());
        if (dealBtn) {
            if (selfPlayer.isHost) {
                if (state.playerCount >= 2 && (table.state === 'Waiting' || table.state === 'Settlement' || table.state === 'Finished')) {
                    dealBtn.disabled = false;
                    dealBtn.style.opacity = '1';
                    dealBtn.textContent = '🎴 Chia Bài Mới';
                } else if (state.playerCount < 2) {
                    dealBtn.disabled = true;
                    dealBtn.style.opacity = '0.5';
                    dealBtn.textContent = '⏳ Chờ Đủ 2 Người...';
                } else {
                    dealBtn.disabled = true;
                    dealBtn.style.opacity = '0.5';
                    dealBtn.textContent = '🎮 Đang Trong Ván';
                }
            } else {
                dealBtn.disabled = true;
                dealBtn.style.opacity = '0.5';
                dealBtn.textContent = '⏳ Chờ Chủ Bàn Chia Bài';
            }
        }

        // Render South Seat (Self)
        const selfAvatar = document.getElementById('seat-self-avatar');
        if (selfAvatar) selfAvatar.textContent = selfPlayer.avatar || '😎';
        const selfName = document.getElementById('seat-self-name');
        if (selfName) {
            const isDealer = (table.dealerSeat === selfPlayer.seatIndex);
            selfName.innerHTML = `${escapeHtml(selfPlayer.nickname || selfPlayer.username)} ${selfPlayer.isHost ? '<span style="color:#fbbf24;font-size:0.75rem;">(Chủ bàn)</span>' : ''}${isDealer ? ' <span class="dealer-badge" title="Dealer">D</span>' : ''}`;
        }
        const selfChips = document.getElementById('seat-self-chips');
        if (selfChips) selfChips.textContent = `${Number(selfPlayer.chips).toLocaleString()} 🪙`;

        // Render Opponent Seats (West, North, East)
        renderMultiplayerSeats(table, selfPlayer);

        // Render Discard Pile (With 10px separation for pairs/combos)
        renderTableDiscardPile(table);

        // Render Community Cards (Poker)
        renderCommunityCards(table.communityCards);

        // Sync Hand Cards for Self
        syncSelfHand(selfPlayer.hand, table.state);

    } catch (e) {
        if (e.message && (e.message.includes('không tồn tại') || e.message.includes('giải tán'))) {
            if (state.playerPollInterval) clearInterval(state.playerPollInterval);
            showToast('Bàn chơi đã kết thúc hoặc bị giải tán!', 'warning');
            switchScreen('screen-lobby');
        }
    }
}

// Render Opponent Seats with real player information
function renderMultiplayerSeats(table, selfPlayer) {
    const seatConfigs = [
        { id: 'north', label: 'Ghế Bắc' },
        { id: 'west', label: 'Ghế Tây' },
        { id: 'east', label: 'Ghế Đông' }
    ];

    const opponents = table.players ? table.players.filter(p => p.userId !== selfPlayer.userId) : [];
    const isAdmin = state.user?.role === 'admin' || state.user?.username?.toLowerCase() === 'admin';

    // Map opponents to relative seats
    const seatMap = {};
    if (opponents.length === 1) {
        seatMap['north'] = opponents[0];
    } else if (opponents.length === 2) {
        seatMap['west'] = opponents[0];
        seatMap['east'] = opponents[1];
    } else if (opponents.length >= 3) {
        seatMap['west'] = opponents[0];
        seatMap['north'] = opponents[1];
        seatMap['east'] = opponents[2];
    }

    seatConfigs.forEach(seat => {
        const opp = seatMap[seat.id];
        const avatarEl = document.getElementById(`seat-${seat.id}-avatar`);
        const nameEl = document.getElementById(`seat-${seat.id}-name`);
        const chipsEl = document.getElementById(`seat-${seat.id}-chips`);
        const cardsEl = document.getElementById(`seat-${seat.id}-cards`);
        const kickBtn = document.getElementById(`btn-kick-${seat.id}`);
        const badgeEl = document.getElementById(`badge-${seat.id}`);

        if (opp) {
            if (avatarEl) avatarEl.textContent = opp.avatar || '👤';
            const isDealer = (table.dealerSeat === opp.seatIndex);
            if (nameEl) {
                nameEl.innerHTML = `${escapeHtml(opp.nickname || opp.username)} ${opp.isHost ? '<span style="color:#fbbf24;font-size:0.75rem;">(Chủ bàn)</span>' : ''}${isDealer ? ' <span class="dealer-badge" title="Dealer">D</span>' : ''}`;
                nameEl.onclick = null;
            }
            if (chipsEl) chipsEl.textContent = `${Number(opp.chips).toLocaleString()} 🪙`;

            // Render face-down cards matching opponent's actual card count
            if (cardsEl) {
                cardsEl.innerHTML = '';
                const count = opp.cardCount || 0;
                for (let i = 0; i < count; i++) {
                    const mini = document.createElement('div');
                    mini.className = 'mini-card-back';
                    cardsEl.appendChild(mini);
                }
            }

            // Turn highlight badge
            if (table.currentTurnUserId === opp.userId && table.state !== 'Waiting') {
                if (badgeEl) {
                    badgeEl.style.display = 'block';
                    badgeEl.textContent = '👉 Đang đánh...';
                }
            } else {
                if (badgeEl) badgeEl.style.display = 'none';
            }

            // Admin Kick Button
            if (kickBtn) {
                kickBtn.style.display = isAdmin ? 'inline-block' : 'none';
                kickBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const confirmed = await showConfirmDialog({
                        title: '👑 Kick Đối Thủ (Admin)',
                        message: `Admin xác nhận kick <strong>${opp.nickname || opp.username}</strong> ra khỏi bàn chơi?`,
                        confirmText: '🚨 Kick',
                        cancelText: 'Hủy',
                        type: 'danger',
                        icon: '👑'
                    });
                    if (confirmed) {
                        try {
                            await apiCall('/api/admin/kick-player', 'POST', { tableId: table.tableId, userId: opp.userId });
                            showToast(`Đã kick ${opp.nickname || opp.username} khỏi bàn!`);
                            syncTableState();
                        } catch (err) {
                            showToast(err.message, 'error');
                        }
                    }
                };
            }
        } else {
            // Empty seat - show clickable invitation code
            if (avatarEl) avatarEl.textContent = '👤';
            if (nameEl) {
                nameEl.innerHTML = `<span style="color: #94a3b8; cursor: pointer;" title="Bấm để sao chép mã phòng">Đang chờ (Mã: <strong style="color: #fbbf24">${state.currentRoom?.code || '------'}</strong>)</span>`;
                nameEl.onclick = () => {
                    if (state.currentRoom?.code) {
                        navigator.clipboard.writeText(state.currentRoom.code);
                        showToast(`Đã sao chép mã phòng ${state.currentRoom.code} vào bộ nhớ tạm!`);
                    }
                };
            }
            if (chipsEl) chipsEl.textContent = 'Chờ vào...';
            if (cardsEl) cardsEl.innerHTML = '';
            if (badgeEl) badgeEl.style.display = 'none';
            if (kickBtn) kickBtn.style.display = 'none';
        }
    });
}

// Fallback opponent seats initializer
function renderOpponentSeats() {
    ['north', 'west', 'east'].forEach(id => {
        const nameEl = document.getElementById(`seat-${id}-name`);
        const chipsEl = document.getElementById(`seat-${id}-chips`);
        const cardsEl = document.getElementById(`seat-${id}-cards`);
        if (nameEl) nameEl.innerHTML = `<span style="color: #94a3b8;">Đang chờ (Mã: <strong style="color: #fbbf24">${state.currentRoom?.code || '------'}</strong>)</span>`;
        if (chipsEl) chipsEl.textContent = 'Chờ vào...';
        if (cardsEl) cardsEl.innerHTML = '';
    });
}

// Render Played Cards on Table (Pairs & Combos separated by 10px gap, never overlapping)
function renderTableDiscardPile(table) {
    const area = document.getElementById('table-discard-cards');
    if (!area) return;
    area.innerHTML = '';

    if (!table.discardPile || table.discardPile.length === 0) {
        area.innerHTML = '<div class="empty-discard-placeholder">Chưa đánh bài</div>';
        return;
    }

    // Get the most recent play
    let cardsToSpread = [];
    const lastActivePlayer = table.players ? table.players.find(p => p.lastPlayedCards && p.lastPlayedCards.length > 0) : null;
    if (lastActivePlayer && lastActivePlayer.lastPlayedCards.length > 0) {
        cardsToSpread = lastActivePlayer.lastPlayedCards;
    } else {
        cardsToSpread = table.discardPile.slice(0, 2);
    }

    const spreadContainer = document.createElement('div');
    spreadContainer.className = 'played-cards-spread';
    cardsToSpread.forEach(card => {
        spreadContainer.appendChild(createCardElement(card, false));
    });
    area.appendChild(spreadContainer);
}

// Render Texas Poker Community Cards
function renderCommunityCards(cards) {
    const commCards = document.getElementById('community-cards');
    if (!commCards) return;
    if (!cards || cards.length === 0) {
        commCards.style.display = 'none';
        commCards.innerHTML = '';
        return;
    }
    commCards.style.display = 'flex';
    commCards.innerHTML = '';
    const spread = document.createElement('div');
    spread.className = 'played-cards-spread';
    cards.forEach(c => {
        spread.appendChild(createCardElement(c, false));
    });
    commCards.appendChild(spread);
}

// Synchronize Self Hand from Server
function syncSelfHand(serverHand, currentTableState) {
    if (currentTableState === 'Waiting' || !serverHand || serverHand.length === 0) {
        if (state.hand.length > 0) {
            state.hand = [];
            state.selectedCards.clear();
            renderSimpleHand();
        }
        return;
    }

    const currentRaws = state.hand.map(c => c.rawValue).join(',');
    const serverRaws = serverHand.map(c => c.rawValue).join(',');

    if (currentRaws !== serverRaws) {
        state.hand = [...serverHand];
        state.selectedCards.clear();

        if (state.activeGameType === 'tala') {
            autoEvaluatePhom();
        } else if (state.activeGameType === 'poker') {
            autoEvaluatePoker();
        } else if (state.activeGameType === 'tienlen') {
            sortHandTienLen();
            renderSimpleHand();
        } else if (state.activeGameType === 'sam') {
            sortHandSam();
            renderSimpleHand();
        } else {
            renderSimpleHand();
        }
    }
}

function startRoomCountdown() {
    if (state.roomCountdownInterval) clearInterval(state.roomCountdownInterval);
    const codeElem = document.getElementById('table-room-code-display');
    const timerElem = document.getElementById('table-room-timer-display');

    if (codeElem && state.currentRoom) {
        codeElem.textContent = state.currentRoom.code;
    }

    state.roomCountdownInterval = setInterval(() => {
        if (!state.currentRoom) {
            clearInterval(state.roomCountdownInterval);
            return;
        }
        const remaining = Math.max(0, Math.floor((state.currentRoom.expireTime - Date.now()) / 1000));
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        if (timerElem) {
            timerElem.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        if (remaining <= 0) {
            clearInterval(state.roomCountdownInterval);
            showToast('Mã phòng đã hết hạn 15 phút (Redis TTL)!', 'error');
        }
    }, 1000);
}

// Card Dealing & Real Engine Logic
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function animateOpponentDeal(numOpponents, cardCount) {
    const seats = ['seat-north-cards', 'seat-west-cards', 'seat-east-cards'];
    for (let s = 0; s < Math.min(numOpponents, 3); s++) {
        const container = document.getElementById(seats[s]);
        if (!container) continue;
        container.innerHTML = '';
        for (let c = 0; c < cardCount; c++) {
            const back = document.createElement('div');
            back.className = 'playing-card card-back card-mini card-deal-anim';
            back.style.animationDelay = `${c * 55}ms`;
            container.appendChild(back);
        }
    }
}

function sortHandTienLen() {
    const order = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
    state.hand.sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
}

function sortHandSam() {
    const order = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
    state.hand.sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
}

function checkBaoSam() {
    const ranks = state.hand.map(c => c.rank);
    const allThrees = ranks.every(r => r === '3');
    const allTwos = ranks.every(r => r === '2');
    if (allThrees || allTwos) {
        const label = allThrees ? 'BAO SAM!' : 'BAO LOC!';
        showResultBanner(`🎉 ${label} Ban thang tat ca - nguoi khac tra x3!`, 'win');
        audio.playWinSound();
        document.getElementById('eval-result-text').textContent = `${label} Thang ngay lap tuc! Thu x3 tu tat ca.`;
    } else {
        document.getElementById('eval-result-text').textContent = `Da chia 10 la - ${Number(state.stakePerRound).toLocaleString()} chip/la`;
    }
}

async function dealNewRound() {
    if (state.tableState && !state.tableState.isHost) {
        showToast('⚠️ Chỉ chủ bàn mới có quyền bắt đầu chia bài!', 'warning');
        return;
    }
    if (state.playerCount < 2) {
        showToast('⚠️ Cần ít nhất 2 người chơi trong bàn để chia bài!', 'error');
        showWaitingOverlay();
        return;
    }

    audio.playDealSound();
    showLoading('Đang Bắt Đầu Ván Mới', 'Máy chủ đang xáo bài và chia tuần tự cho từng người chơi...');

    try {
        if (state.currentRoom?.tableId) {
            const res = await apiCall(`/api/room/${state.currentRoom.tableId}/deal`, 'POST');
            showToast(res.message || 'Đã chia bài thành công cho tất cả người chơi!');
            await syncTableState();
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        hideLoading();
    }
}

// Tá Lả: Automatically isolate Phỏm to the left
async function autoEvaluatePhom() {
    const rawValues = state.hand.map(c => c.rawValue);
    try {
        const res = await apiCall('/api/game/evaluate-tala', 'POST', { cards: rawValues });
        state.phoms = res.bestPhoms;
        state.trashCards = res.trashCards;

        const phomZone = document.getElementById('phom-zone');
        const phomContainer = document.getElementById('phom-cards-container');
        const trashBadge = document.getElementById('trash-score-badge');
        const handTitle = document.getElementById('hand-zone-title');
        const evalText = document.getElementById('eval-result-text');

        trashBadge.style.display = 'inline-block';
        trashBadge.textContent = `${res.minTrashScore}đ Rác`;

        if (state.phoms.length > 0) {
            phomZone.style.display = 'flex';
            document.getElementById('phom-count-badge').textContent = `${state.phoms.length} Phỏm`;
            phomContainer.innerHTML = '';

            state.phoms.forEach((phom, pIdx) => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'phom-single-group';
                groupDiv.title = `Phỏm ${pIdx + 1}`;
                phom.forEach(card => {
                    groupDiv.appendChild(createCardElement(card));
                });
                phomContainer.appendChild(groupDiv);
            });

            handTitle.textContent = 'BÀI RÁC (Chưa vào phỏm)';
            evalText.textContent = `Tự động gom ${state.phoms.length} Phỏm - Rác: ${res.minTrashScore}đ`;
            renderCardsList(state.trashCards, document.getElementById('player-hand-cards'));
            audio.playWinSound();
        } else {
            phomZone.style.display = 'none';
            handTitle.textContent = 'BÀI TRÊN TAY (Chưa có phỏm)';
            evalText.textContent = `Chưa có Phỏm - Tổng rác: ${res.minTrashScore}đ`;
            renderCardsList(state.hand, document.getElementById('player-hand-cards'));
        }
    } catch (e) {
        renderSimpleHand();
    }
}

// Texas Poker: Evaluate 7 cards
async function autoEvaluatePoker() {
    const rawValues = state.hand.map(c => c.rawValue);
    const commCards = document.getElementById('community-cards');
    commCards.style.display = 'flex';
    commCards.innerHTML = '';

    // In 7-card poker: 2 hole cards in hand, 5 on board
    const holeCards = state.hand.slice(0, 2);
    const boardCards = state.hand.slice(2);

    boardCards.forEach(card => {
        commCards.appendChild(createCardElement(card));
    });

    renderCardsList(holeCards, document.getElementById('player-hand-cards'));
    document.getElementById('phom-zone').style.display = 'none';
    document.getElementById('hand-zone-title').textContent = 'BÀI TẨY CỦA BẠN (2 Lá)';

    try {
        const res = await apiCall('/api/game/evaluate-poker', 'POST', { cards: rawValues });
        document.getElementById('eval-result-text').textContent = `Poker: ${res.handRank}`;
        showToast(`Tay bài Poker tốt nhất: ${res.handRank}`);
        audio.playWinSound();
    } catch (e) { }
}

function createCardElement(card, isClickable = true) {
    const suitSymbols = { 0: '♠', 1: '♣', 2: '♦', 3: '♥' };
    const suitClasses = { 0: 'card-suit-spade', 1: 'card-suit-club', 2: 'card-suit-diamond', 3: 'card-suit-heart' };
    const rankNames = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

    const rankDisplay = rankNames[card.rank] || card.rank;
    const suitSymbol = suitSymbols[card.suit];
    const suitClass = suitClasses[card.suit];

    const cardEl = document.createElement('div');
    cardEl.className = `playing-card ${suitClass}`;
    cardEl.dataset.rawValue = card.rawValue;

    if (state.selectedCards.has(card.rawValue)) {
        cardEl.classList.add('selected');
    }

    cardEl.innerHTML = `
        <div class="card-top-left">
            <span class="card-rank">${rankDisplay}</span>
            <span class="card-suit-small">${suitSymbol}</span>
        </div>
        <div class="card-center-suit">${suitSymbol}</div>
        <div class="card-top-left" style="transform: rotate(180deg)">
            <span class="card-rank">${rankDisplay}</span>
            <span class="card-suit-small">${suitSymbol}</span>
        </div>
    `;

    if (isClickable) {
        cardEl.addEventListener('click', () => {
            audio.playCardSound();
            if (state.selectedCards.has(card.rawValue)) {
                state.selectedCards.delete(card.rawValue);
                cardEl.classList.remove('selected');
            } else {
                state.selectedCards.add(card.rawValue);
                cardEl.classList.add('selected');
            }
        });
    }

    return cardEl;
}

function renderCardsList(cards, container) {
    container.innerHTML = '';
    cards.forEach(card => {
        container.appendChild(createCardElement(card));
    });
}

function renderSimpleHand() {
    renderCardsList(state.hand, document.getElementById('player-hand-cards'));
    document.getElementById('phom-zone').style.display = 'none';
    document.getElementById('trash-score-badge').style.display = 'none';
    document.getElementById('hand-zone-title').textContent = 'BÀI TRÊN TAY';
}

function sortHand() {
    audio.playCardSound();
    // Sort logic: Rank 3 is lowest, 2 is highest in Tien Len
    state.hand.sort((a, b) => {
        const valA = a.rank === 2 ? 15 : (a.rank === 1 ? 14 : a.rank);
        const valB = b.rank === 2 ? 15 : (b.rank === 1 ? 14 : b.rank);
        if (valA !== valB) return valA - valB;
        return a.suit - b.suit;
    });
    renderSimpleHand();
}

function updateDiscardArea() {
    if (state.tableState) {
        renderTableDiscardPile(state.tableState);
    } else {
        const area = document.getElementById('table-discard-cards');
        if (area) area.innerHTML = '<div class="empty-discard-placeholder">Chưa đánh bài</div>';
    }
}

// Gameplay Actions (Fully Server Synchronized)
async function drawCard() {
    if (!state.isMyTurn) {
        showToast('⚠️ Chưa đến lượt của bạn!', 'warning');
        return;
    }
    audio.playCardSound();
    try {
        if (state.currentRoom?.tableId) {
            const res = await apiCall(`/api/room/${state.currentRoom.tableId}/draw-card`, 'POST');
            showToast(`Bạn vừa bốc lá: ${res.card?.displayName || '1 lá bài'}`);
            await syncTableState();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function playSelectedCard() {
    if (!state.isMyTurn) {
        showToast('⚠️ Chưa đến lượt của bạn!', 'warning');
        return;
    }
    if (state.selectedCards.size === 0) {
        showToast('Vui lòng click chọn ít nhất 1 lá bài để đánh!', 'error');
        return;
    }

    const cardRawValues = Array.from(state.selectedCards);
    audio.playCardSound();

    try {
        if (state.currentRoom?.tableId) {
            const res = await apiCall(`/api/room/${state.currentRoom.tableId}/play-card`, 'POST', { cardRawValues });
            state.selectedCards.clear();
            showToast(res.message || 'Đánh bài thành công!');
            await syncTableState();
        } else {
            // Local fallback
            state.hand = state.hand.filter(card => !state.selectedCards.has(card.rawValue));
            state.selectedCards.clear();
            renderSimpleHand();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function takeCard() {
    if (!state.isMyTurn) {
        showToast('⚠️ Chưa đến lượt của bạn!', 'warning');
        return;
    }
    audio.playCardSound();
    try {
        if (state.currentRoom?.tableId) {
            const res = await apiCall(`/api/room/${state.currentRoom.tableId}/take-card`, 'POST');
            showToast(res.message || 'Ăn bài thành công!');
            await syncTableState();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function showPhomAction() {
    if (!state.isMyTurn) {
        showToast('⚠️ Chưa đến lượt của bạn!', 'warning');
        return;
    }
    if (state.phoms.length === 0) {
        showToast('Bạn chưa có phỏm nào để hạ! Hãy bốc bài hoặc ăn bài.', 'error');
        return;
    }
    audio.playWinSound();
    showToast(`Hạ thành công ${state.phoms.length} phỏm!`);
    const turnEl = document.getElementById('table-turn-indicator');
    if (turnEl) turnEl.textContent = 'Đã hạ phỏm thành công!';
}

async function passTurn() {
    if (!state.isMyTurn) {
        showToast('⚠️ Chưa đến lượt của bạn!', 'warning');
        return;
    }
    audio.playCardSound();
    try {
        if (state.currentRoom?.tableId) {
            const res = await apiCall(`/api/room/${state.currentRoom.tableId}/pass-turn`, 'POST');
            showToast(res.message || 'Bạn đã bỏ lượt!');
            await syncTableState();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function sendPokerAction(action, amount = 0) {
    if (!state.isMyTurn) {
        showToast('⚠️ Chưa đến lượt của bạn!', 'warning');
        return;
    }
    if (!state.currentRoom?.tableId) return;

    try {
        if (action === 'raise') audio.playChipSound();
        else audio.playCardSound();

        const res = await apiCall(`/api/room/${state.currentRoom.tableId}/poker-action`, 'POST', { action, amount });
        showToast(res.message || `Đã thực hiện: ${action.toUpperCase()}`);
        await syncTableState();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function betChips(amount = 500) {
    await sendPokerAction('raise', amount);
}

async function foldCards() {
    await sendPokerAction('fold', 0);
}

async function leaveCurrentTable() {
    if (state.playerPollInterval) {
        clearInterval(state.playerPollInterval);
        state.playerPollInterval = null;
    }
    if (state.roomCountdownInterval) {
        clearInterval(state.roomCountdownInterval);
        state.roomCountdownInterval = null;
    }
    if (state.currentRoom?.tableId) {
        apiCall(`/api/room/${state.currentRoom.tableId}/leave`, 'POST').catch(() => {});
    }
    state.currentRoom = null;
    state.tableState = null;
    state.hand = [];
    state.selectedCards.clear();
    state.discardPile = [];
    state.phoms = [];
    state.trashCards = [];

    const handContainer = document.getElementById('player-hand-cards');
    if (handContainer) handContainer.innerHTML = '';
    const phomContainer = document.getElementById('phom-cards-container');
    if (phomContainer) phomContainer.innerHTML = '';
    const phomZone = document.getElementById('phom-zone');
    if (phomZone) phomZone.style.display = 'none';
    const discardArea = document.getElementById('table-discard-cards');
    if (discardArea) discardArea.innerHTML = '<div class="empty-discard-placeholder">Chưa đánh bài</div>';
    const commCards = document.getElementById('community-cards');
    if (commCards) { commCards.innerHTML = ''; commCards.style.display = 'none'; }

    switchScreen('screen-lobby');
}

// ==========================================================================
// IN-GAME CHAT & EMOJI SYSTEM
// ==========================================================================
function toggleChatPanel() {
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        document.getElementById('chat-input')?.focus();
        scrollChatToBottom();
    }
}

function scrollChatToBottom() {
    const list = document.getElementById('chat-messages-list');
    if (list) list.scrollTop = list.scrollHeight;
}

function addChatMessage(sender, text, type = 'user') {
    const list = document.getElementById('chat-messages-list');
    if (!list) return;

    const div = document.createElement('div');
    if (type === 'system') {
        div.className = 'chat-system-msg';
        div.textContent = text;
    } else {
        div.className = `chat-msg ${type === 'self' ? 'chat-msg-self' : 'chat-msg-other'}`;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `<span class="chat-sender">${sender}</span><span class="chat-bubble">${escapeHtml(text)}</span><span class="chat-time">${time}</span>`;
    }
    list.appendChild(div);
    scrollChatToBottom();
    state.chatMessages.push({ sender, text, type });
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const sender = state.user?.username || 'Bạn';
    addChatMessage(sender, text, 'self');
    input.value = '';
    // Ensure chat is visible
    document.getElementById('chat-panel').style.display = 'flex';
}

function sendEmojiReaction(emoji) {
    const sender = state.user?.username || 'Bạn';
    addChatMessage(sender, emoji, 'self');
    showFloatingEmoji(emoji);
    // Ensure chat panel open
    document.getElementById('chat-panel').style.display = 'flex';
    scrollChatToBottom();
}

function showFloatingEmoji(emoji) {
    const popup = document.getElementById('emoji-float-popup');
    if (!popup) return;
    popup.textContent = emoji;
    popup.style.display = 'block';
    popup.classList.add('emoji-animate');
    setTimeout(() => {
        popup.classList.remove('emoji-animate');
        popup.style.display = 'none';
    }, 1500);
}

// ==========================================================================
// PROFILE MANAGEMENT (HỒ SƠ CÁ NHÂN & ĐỔI MẬT KHẨU)
// ==========================================================================
let selectedProfileAvatar = '👤';

async function openProfileModal() {
    if (!state.token) {
        setAuthMode('login');
        openModal('auth-modal');
        showAuthAlert('Vui lòng đăng nhập để xem và chỉnh sửa hồ sơ!', 'warning');
        return;
    }

    // Reset tabs to first tab
    const tabBtns = document.querySelectorAll('.profile-tab-btn');
    if (tabBtns.length >= 2) {
        tabBtns[0].classList.add('active');
        tabBtns[1].classList.remove('active');
    }
    const pane1 = document.getElementById('profile-tab-info');
    const pane2 = document.getElementById('profile-tab-password');
    if (pane1) pane1.style.display = 'block';
    if (pane2) pane2.style.display = 'none';

    // Reset alerts
    const infoAlert = document.getElementById('profile-info-alert');
    const pwdAlert = document.getElementById('profile-pwd-alert');
    if (infoAlert) { infoAlert.style.display = 'none'; infoAlert.textContent = ''; }
    if (pwdAlert) { pwdAlert.style.display = 'none'; pwdAlert.textContent = ''; }

    // Clear password inputs
    const curPwd = document.getElementById('profile-pwd-current');
    const newPwd = document.getElementById('profile-pwd-new');
    const confPwd = document.getElementById('profile-pwd-confirm');
    if (curPwd) curPwd.value = '';
    if (newPwd) newPwd.value = '';
    if (confPwd) confPwd.value = '';

    openModal('profile-modal');

    try {
        const profile = await apiCall('/api/auth/profile', 'GET');
        
        selectedProfileAvatar = profile.avatar || '👤';
        const nickname = profile.nickname || profile.username;

        // Populate summary card
        const cardAvatar = document.getElementById('profile-card-avatar');
        if (cardAvatar) cardAvatar.textContent = selectedProfileAvatar;

        const cardName = document.getElementById('profile-card-name');
        if (cardName) cardName.textContent = nickname;

        const cardUsername = document.getElementById('profile-card-username');
        if (cardUsername) cardUsername.textContent = `@${profile.username}`;

        const cardRole = document.getElementById('profile-card-role');
        if (cardRole) {
            const isAdmin = profile.role === 'admin' || profile.username?.toLowerCase() === 'admin';
            cardRole.className = `role-badge ${isAdmin ? 'role-admin' : 'role-user'}`;
            cardRole.textContent = isAdmin ? '👑 Quản Trị Viên' : 'Người Chơi';
        }

        const cardChips = document.getElementById('profile-card-chips');
        if (cardChips) cardChips.textContent = `${Number(profile.balance || 0).toLocaleString()} 🪙`;

        const cardDate = document.getElementById('profile-card-date');
        if (cardDate) {
            const dateStr = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('vi-VN') : 'Mới tham gia';
            cardDate.textContent = `Tham gia: ${dateStr}`;
        }

        // Inputs
        const nickInput = document.getElementById('profile-input-nickname');
        if (nickInput) nickInput.value = nickname;

        selectProfileAvatar(selectedProfileAvatar);
    } catch (e) {
        showToast('Không thể tải thông tin hồ sơ: ' + e.message, 'error');
    }
}

function selectProfileAvatar(avatar) {
    selectedProfileAvatar = avatar || '👤';
    const preview = document.getElementById('profile-selected-avatar-preview');
    if (preview) preview.textContent = selectedProfileAvatar;

    const cardAvatar = document.getElementById('profile-card-avatar');
    if (cardAvatar) cardAvatar.textContent = selectedProfileAvatar;

    document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
        if (btn.dataset.avatar === selectedProfileAvatar) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

async function saveUserProfile() {
    const nickInput = document.getElementById('profile-input-nickname');
    const nickname = nickInput ? nickInput.value.trim() : '';

    if (!nickname) {
        showProfileAlert('info', 'Tên hiển thị không được để trống!', 'error');
        if (nickInput) nickInput.focus();
        return;
    }

    try {
        const res = await apiCall('/api/auth/profile/update', 'POST', {
            avatar: selectedProfileAvatar,
            nickname: nickname
        });

        // Update local state
        if (state.user) {
            state.user.avatar = selectedProfileAvatar;
            state.user.nickname = nickname;
            localStorage.setItem('cardgame_user', JSON.stringify(state.user));
        }

        updateAuthUI();
        showToast(res.message || 'Đã lưu thông tin hồ sơ thành công!', 'success');
        closeModal('profile-modal');
    } catch (e) {
        showProfileAlert('info', e.message, 'error');
    }
}

async function saveUserPassword() {
    const curInput = document.getElementById('profile-pwd-current');
    const newInput = document.getElementById('profile-pwd-new');
    const confInput = document.getElementById('profile-pwd-confirm');

    const currentPassword = curInput ? curInput.value.trim() : '';
    const newPassword = newInput ? newInput.value.trim() : '';
    const confirmPassword = confInput ? confInput.value.trim() : '';

    if (!currentPassword) {
        showProfileAlert('pwd', 'Vui lòng nhập mật khẩu hiện tại!', 'error');
        curInput?.focus();
        return;
    }

    if (!newPassword || newPassword.length < 6) {
        showProfileAlert('pwd', 'Mật khẩu mới phải có tối thiểu 6 ký tự!', 'error');
        newInput?.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        showProfileAlert('pwd', 'Xác nhận mật khẩu mới không khớp!', 'error');
        confInput?.focus();
        return;
    }

    try {
        const res = await apiCall('/api/auth/profile/change-password', 'POST', {
            currentPassword,
            newPassword
        });

        showToast(res.message || 'Đã đổi mật khẩu thành công!', 'success');
        if (curInput) curInput.value = '';
        if (newInput) newInput.value = '';
        if (confInput) confInput.value = '';
        closeModal('profile-modal');
    } catch (e) {
        showProfileAlert('pwd', e.message, 'error');
    }
}

function showProfileAlert(tab, message, type = 'error') {
    const alertBox = document.getElementById(tab === 'pwd' ? 'profile-pwd-alert' : 'profile-info-alert');
    if (!alertBox) return;
    alertBox.style.display = 'flex';
    alertBox.className = `auth-alert alert-${type}`;
    alertBox.innerHTML = `<span>${type === 'error' ? '⚠️' : 'ℹ️'}</span> <span>${escapeHtml(message)}</span>`;
}

// Event Bindings
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();

    // Sync latest user profile on startup if logged in
    if (state.token) {
        apiCall('/api/auth/profile', 'GET').then(profile => {
            if (profile && state.user) {
                state.user.avatar = profile.avatar || state.user.avatar || '👤';
                state.user.nickname = profile.nickname || state.user.nickname || state.user.username;
                state.user.role = profile.role || state.user.role;
                localStorage.setItem('cardgame_user', JSON.stringify(state.user));
                updateAuthUI();
            }
        }).catch(() => {});
    }

    // Brand logo home click
    document.getElementById('brand-home-btn')?.addEventListener('click', () => switchScreen('screen-lobby'));

    // Auth modal controls & Tabs
    document.getElementById('btn-open-auth')?.addEventListener('click', () => {
        setAuthMode('login');
        openModal('auth-modal');
    });
    document.getElementById('btn-close-auth')?.addEventListener('click', () => closeModal('auth-modal'));
    document.getElementById('tab-auth-login')?.addEventListener('click', () => setAuthMode('login'));
    document.getElementById('tab-auth-register')?.addEventListener('click', () => setAuthMode('register'));
    document.getElementById('form-auth-submit')?.addEventListener('click', executeAuth);

    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    // Profile Modal triggers & Actions
    document.getElementById('btn-open-profile')?.addEventListener('click', openProfileModal);
    document.getElementById('header-avatar')?.addEventListener('click', () => {
        if (state.token) openProfileModal();
    });
    document.getElementById('header-username')?.addEventListener('click', () => {
        if (state.token) openProfileModal();
    });
    document.getElementById('btn-close-profile')?.addEventListener('click', () => closeModal('profile-modal'));

    // Profile Tabs
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.profile-tab-pane').forEach(p => p.style.display = 'none');
            btn.classList.add('active');
            const targetPane = document.getElementById(btn.dataset.ptab);
            if (targetPane) targetPane.style.display = 'block';
        });
    });

    // Avatar pickers
    document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectProfileAvatar(btn.dataset.avatar);
        });
    });

    // Save profile and password
    document.getElementById('btn-save-profile')?.addEventListener('click', saveUserProfile);
    document.getElementById('btn-save-password')?.addEventListener('click', saveUserPassword);
    
    // QR Deposit modal triggers & history
    document.getElementById('btn-top-up')?.addEventListener('click', openDepositModal);
    document.getElementById('btn-close-deposit')?.addEventListener('click', () => closeModal('deposit-modal'));
    document.getElementById('btn-refresh-my-deposits')?.addEventListener('click', loadMyDepositHistory);
    document.querySelectorAll('.denom-btn').forEach(btn => {
        btn.addEventListener('click', function() { selectDepositDenom(this); });
    });
    document.getElementById('input-custom-deposit')?.addEventListener('input', function() {
        onCustomDepositInput(this.value);
    });
    document.getElementById('btn-confirm-deposit')?.addEventListener('click', confirmDepositPayment);
    document.getElementById('btn-copy-syntax')?.addEventListener('click', copyTransferSyntax);

    // Admin portal modal triggers & Sidebar Nav
    document.getElementById('btn-admin-portal')?.addEventListener('click', openAdminPortal);
    document.getElementById('btn-close-admin')?.addEventListener('click', () => closeModal('admin-modal'));
    document.getElementById('btn-admin-refresh')?.addEventListener('click', () => {
        const activePanel = document.querySelector('.admin-panel.active')?.id || 'admin-view-overview';
        switchAdminTab(activePanel);
    });

    // Sidebar nav items (new admin layout)
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchAdminTab(btn.dataset.tab);
        });
    });

    // Legacy tab-btn support (if any)
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
    });

    document.querySelectorAll('.filter-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Only reset siblings in same parent group
            const parent = btn.closest('.filter-pill-group, .admin-toolbar, [data-filter-group]');
            const siblings = parent ? parent.querySelectorAll('.filter-pill-btn') : document.querySelectorAll('.filter-pill-btn');
            siblings.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btn.dataset.filter !== undefined) {
                currentDepositFilter = btn.dataset.filter;
                loadAdminDeposits();
            }
        });
    });

    document.getElementById('admin-search-users')?.addEventListener('input', () => {
        loadAdminUsers();
    });

    // Admin Clean All Tables and Non-Admin Players
    document.getElementById('btn-admin-clean-all')?.addEventListener('click', () => {
        window.adminCleanAllPlayers();
    });

    // Ban modal events
    document.getElementById('btn-close-ban')?.addEventListener('click', () => closeModal('ban-user-modal'));
    document.getElementById('btn-cancel-ban')?.addEventListener('click', () => closeModal('ban-user-modal'));
    document.getElementById('btn-confirm-ban')?.addEventListener('click', executeConfirmBan);

    // Periodic check for pending deposits if logged in
    setInterval(() => {
        if (state.token && (state.user?.role === 'admin' || state.user?.username?.toLowerCase() === 'admin')) {
            checkAdminPendingDepositsCount();
        }
    }, 10000);

    // Input realtime clear errors
    ['input-username', 'input-password', 'input-repassword'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            document.getElementById(id).classList.remove('input-error');
        });
    });

    // Join room input
    document.getElementById('btn-join-room-submit')?.addEventListener('click', () => {
        const code = document.getElementById('input-join-code').value.trim();
        joinRoomByCode(code);
    });

    // Stake Cards in Lobby - each card has data-game, data-stake, data-min-buyin
    document.querySelectorAll('.stake-play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('[data-game]');
            if (!card) return;
            const game = card.dataset.game;
            const stake = parseInt(card.dataset.stake, 10);
            const minBuyin = parseInt(card.dataset.minBuyin, 10);
            enterGame(game, stake, minBuyin);
        });
    });

    // Brand logo & Back to lobby button -> leave table cleanly
    document.getElementById('brand-home-btn')?.addEventListener('click', leaveCurrentTable);
    document.getElementById('btn-back-to-lobby')?.addEventListener('click', leaveCurrentTable);

    // Deck click to draw
    document.getElementById('deck-pile')?.addEventListener('click', drawCard);

    // Table Action Buttons - Ta La
    document.getElementById('btn-draw-card')?.addEventListener('click', drawCard);
    document.getElementById('btn-play-card')?.addEventListener('click', playSelectedCard);
    document.getElementById('btn-take-card')?.addEventListener('click', takeCard);
    document.getElementById('btn-show-phom')?.addEventListener('click', showPhomAction);
    document.getElementById('btn-sort-cards-tala')?.addEventListener('click', sortHand);
    document.getElementById('btn-deal-hand')?.addEventListener('click', dealNewRound);

    // Poker buttons (Realtime server synchronized)
    document.getElementById('btn-poker-check')?.addEventListener('click', () => sendPokerAction('check'));
    document.getElementById('btn-poker-call')?.addEventListener('click', () => sendPokerAction('call'));
    document.getElementById('btn-poker-raise')?.addEventListener('click', () => sendPokerAction('raise', state.stakePerRound || 2000));
    document.getElementById('btn-poker-allin')?.addEventListener('click', () => sendPokerAction('raise', state.balance));
    document.getElementById('btn-poker-fold')?.addEventListener('click', () => sendPokerAction('fold'));
    document.getElementById('btn-deal-poker')?.addEventListener('click', dealNewRound);

    // Tien Len buttons
    document.getElementById('btn-tl-play')?.addEventListener('click', playSelectedCard);
    document.getElementById('btn-tl-pass')?.addEventListener('click', passTurn);
    document.getElementById('btn-tl-sort')?.addEventListener('click', sortHand);
    document.getElementById('btn-deal-tienlen')?.addEventListener('click', dealNewRound);

    // Sam Loc buttons
    document.getElementById('btn-sam-play')?.addEventListener('click', playSelectedCard);
    document.getElementById('btn-sam-pass')?.addEventListener('click', passTurn);
    document.getElementById('btn-sam-bao')?.addEventListener('click', checkBaoSam);
    document.getElementById('btn-deal-sam')?.addEventListener('click', dealNewRound);

    // Waiting overlay - Copy Room Code
    document.getElementById('btn-copy-room-code')?.addEventListener('click', () => {
        if (state.currentRoom?.code) {
            navigator.clipboard.writeText(state.currentRoom.code);
            showToast(`Đã sao chép mã phòng: ${state.currentRoom.code}`);
        }
    });

    // Chat panel toggle
    document.getElementById('btn-toggle-chat')?.addEventListener('click', toggleChatPanel);
    document.getElementById('btn-close-chat')?.addEventListener('click', () => {
        document.getElementById('chat-panel').style.display = 'none';
    });

    // Chat send button and Enter key
    document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Emoji quick reaction buttons
    document.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sendEmojiReaction(btn.dataset.emoji);
        });
    });

    // Lucky Spin modal triggers & actions
    document.getElementById('btn-lucky-spin')?.addEventListener('click', openLuckySpinModal);
    document.getElementById('btn-close-spin')?.addEventListener('click', () => closeModal('lucky-spin-modal'));
    document.getElementById('btn-do-spin')?.addEventListener('click', handleDoSpin);
    document.getElementById('spin-canvas')?.addEventListener('click', handleDoSpin);

    // Global modal close handlers
    // 1. Any .modal-close-btn automatically closes its parent modal
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });

    // 2. Clicking anywhere on the dark backdrop of any modal closes it
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                if (overlay.id === 'custom-dialog-modal') {
                    closeCustomDialog(null);
                }
            }
        });
    });

    // 3. Pressing ESC key closes any open modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            closeCustomDialog(null);
        }
    });

    // Custom dialog buttons
    document.getElementById('custom-dialog-confirm-btn')?.addEventListener('click', () => {
        const inputGroup = document.getElementById('custom-dialog-input-group');
        const inputEl = document.getElementById('custom-dialog-input');
        const val = (inputGroup && inputGroup.style.display !== 'none') ? inputEl.value : true;
        closeCustomDialog(val);
    });

    document.getElementById('custom-dialog-cancel-btn')?.addEventListener('click', () => {
        const inputGroup = document.getElementById('custom-dialog-input-group');
        const val = (inputGroup && inputGroup.style.display !== 'none') ? null : false;
        closeCustomDialog(val);
    });

    document.getElementById('btn-close-dialog')?.addEventListener('click', () => {
        const inputGroup = document.getElementById('custom-dialog-input-group');
        const val = (inputGroup && inputGroup.style.display !== 'none') ? null : false;
        closeCustomDialog(val);
    });

    document.getElementById('custom-dialog-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('custom-dialog-confirm-btn')?.click();
        }
    });

    // Allow manual player count override for testing (Ctrl+Shift+P)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            state.playerCount = 2;
            updatePlayerCountUI(2);
            hideWaitingOverlay();
            showToast('🔧 Debug: Số người chơi đặt thành 2');
        }
    });
});

// ==========================================================================
// VÒNG QUAY MAY MẮN (LUCKY SPIN - TỐI ĐA 3 LƯỢT / NGÀY / TÀI KHOẢN)
// ==========================================================================

const spinWheel = {
    canvas: null,
    ctx: null,
    currentAngle: 0,
    isSpinning: false,
    prizes: [
        { id: 1, label: '50.000 🪙', short: '50K 👑', value: 50000, color: '#dc2626', textColor: '#ffffff', weight: 2 },
        { id: 2, label: '10.000 🪙', short: '10K ⭐', value: 10000, color: '#f59e0b', textColor: '#0f172a', weight: 8 },
        { id: 3, label: '500 🪙',    short: '500 🍀', value: 500,   color: '#2563eb', textColor: '#ffffff', weight: 25 },
        { id: 4, label: '5.000 🪙',  short: '5K 💎',  value: 5000,  color: '#7c3aed', textColor: '#ffffff', weight: 12 },
        { id: 5, label: 'Mất Lượt 😅', short: '0 🪙',  value: 0,     color: '#334155', textColor: '#94a3b8', weight: 15 },
        { id: 6, label: '2.000 🪙',  short: '2K 🎁',  value: 2000,  color: '#059669', textColor: '#ffffff', weight: 18 },
        { id: 7, label: '100 🪙',    short: '100 🪙', value: 100,   color: '#0284c7', textColor: '#ffffff', weight: 10 },
        { id: 8, label: '1.000 🪙',  short: '1K ✨',  value: 1000,  color: '#db2777', textColor: '#ffffff', weight: 10 }
    ]
};

function getTodaySpinDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getUserSpinStorageKey() {
    const username = state.user?.username || 'khach';
    return `spins_${username}_${getTodaySpinDateKey()}`;
}

function getTodaySpins() {
    try {
        const raw = localStorage.getItem(getUserSpinStorageKey());
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveUserSpinRecord(prize) {
    const list = getTodaySpins();
    const username = state.user?.username || 'Khách';
    const record = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        prize: prize.label,
        value: prize.value,
        username: username,
        date: getTodaySpinDateKey()
    };
    list.unshift(record);
    localStorage.setItem(getUserSpinStorageKey(), JSON.stringify(list));

    // Also persist into global admin spin logs
    try {
        const globalLogs = JSON.parse(localStorage.getItem('admin_spin_logs') || '[]');
        globalLogs.unshift({
            ...record,
            id: 'SPIN-' + Date.now()
        });
        // keep up to 100 entries
        if (globalLogs.length > 100) globalLogs.length = 100;
        localStorage.setItem('admin_spin_logs', JSON.stringify(globalLogs));
    } catch (e) { }
}

function loadSavedSpinConfig() {
    try {
        const custom = localStorage.getItem('spin_prize_config');
        if (custom) {
            const cfg = JSON.parse(custom);
            if (cfg.jackpot) {
                spinWheel.prizes[0].value = cfg.jackpot;
                spinWheel.prizes[0].label = Number(cfg.jackpot).toLocaleString() + ' 🪙';
                spinWheel.prizes[0].short = (cfg.jackpot >= 1000 ? Math.round(cfg.jackpot / 1000) + 'K 👑' : cfg.jackpot + ' 👑');
            }
            if (cfg.first) {
                spinWheel.prizes[1].value = cfg.first;
                spinWheel.prizes[1].label = Number(cfg.first).toLocaleString() + ' 🪙';
                spinWheel.prizes[1].short = (cfg.first >= 1000 ? Math.round(cfg.first / 1000) + 'K ⭐' : cfg.first + ' ⭐');
            }
            if (cfg.second) {
                spinWheel.prizes[3].value = cfg.second;
                spinWheel.prizes[3].label = Number(cfg.second).toLocaleString() + ' 🪙';
                spinWheel.prizes[3].short = (cfg.second >= 1000 ? Math.round(cfg.second / 1000) + 'K 💎' : cfg.second + ' 💎');
            }
            if (cfg.third) {
                spinWheel.prizes[5].value = cfg.third;
                spinWheel.prizes[5].label = Number(cfg.third).toLocaleString() + ' 🪙';
                spinWheel.prizes[5].short = (cfg.third >= 1000 ? Math.round(cfg.third / 1000) + 'K 🎁' : cfg.third + ' 🎁');
            }
            if (cfg.cons) {
                spinWheel.prizes[2].value = cfg.cons;
                spinWheel.prizes[2].label = Number(cfg.cons).toLocaleString() + ' 🪙';
                spinWheel.prizes[2].short = (cfg.cons >= 1000 ? Math.round(cfg.cons / 1000) + 'K 🍀' : cfg.cons + ' 🍀');
            }
        }
    } catch (e) { }
}

function openLuckySpinModal() {
    loadSavedSpinConfig();
    openModal('lucky-spin-modal');
    updateSpinTurnsUI();
    // Immediate and delayed render to guarantee canvas is drawn as modal becomes visible
    initSpinCanvas();
    drawSpinWheel();
    setTimeout(() => {
        initSpinCanvas();
        drawSpinWheel();
    }, 30);
}

function updateSpinTurnsUI() {
    const spins = getTodaySpins();
    const used = spins.length;
    const remaining = Math.max(0, 3 - used);

    const countEl = document.getElementById('spin-turns-count');
    if (countEl) countEl.textContent = remaining;

    const btnSpin = document.getElementById('btn-do-spin');
    if (btnSpin) {
        if (remaining <= 0) {
            btnSpin.disabled = true;
            btnSpin.textContent = '⛔ ĐÃ HẾT 3 LƯỢT HÔM NAY';
            btnSpin.style.opacity = '0.6';
            btnSpin.style.cursor = 'not-allowed';
        } else {
            btnSpin.disabled = false;
            btnSpin.textContent = `🚀 QUAY NGAY! (${remaining}/3 lượt)`;
            btnSpin.style.opacity = '1';
            btnSpin.style.cursor = 'pointer';
        }
    }

    // Render local history
    const historyList = document.getElementById('spin-history-list');
    if (historyList) {
        if (spins.length === 0) {
            historyList.innerHTML = '<div style="font-size:0.75rem;color:#64748b;text-align:center;padding:4px;">Chưa có lượt quay nào hôm nay</div>';
        } else {
            historyList.innerHTML = spins.map(s => `
                <div class="spin-history-item">
                    <span>${s.time}</span>
                    <span class="${s.value > 0 ? 'prize-win' : ''}">${s.value > 0 ? '+' + Number(s.value).toLocaleString() + ' 🪙' : 'Mất lượt'}</span>
                </div>
            `).join('');
        }
    }
}

function initSpinCanvas() {
    spinWheel.canvas = document.getElementById('spin-canvas');
    if (spinWheel.canvas) {
        spinWheel.ctx = spinWheel.canvas.getContext('2d');
    }
}

function drawSpinWheel() {
    initSpinCanvas();
    const canvas = spinWheel.canvas;
    if (!canvas) return;
    const ctx = spinWheel.ctx;
    if (!ctx) return;
    const width = canvas.width || 340;
    const height = canvas.height || 340;
    const cx = width / 2;
    const cy = height / 2;
    const radius = cx - 12;

    ctx.clearRect(0, 0, width, height);

    const numSlices = spinWheel.prizes.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spinWheel.currentAngle);

    // Draw Slices
    for (let i = 0; i < numSlices; i++) {
        const prize = spinWheel.prizes[i];
        const start = i * sliceAngle;
        const end = start + sliceAngle;

        // Wedge
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = prize.color;
        ctx.fill();

        // Edge separator
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label on slice
        ctx.save();
        ctx.rotate(start + sliceAngle / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = prize.textColor;
        ctx.font = 'bold 13px Outfit, sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(prize.short, radius - 20, 5);
        ctx.restore();
    }

    // Outer ring with decorative lights
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.stroke();

    const dotCount = 24;
    for (let d = 0; d < dotCount; d++) {
        const dotAngle = (d / dotCount) * 2 * Math.PI;
        const dx = (radius - 3) * Math.cos(dotAngle);
        const dy = (radius - 3) * Math.sin(dotAngle);
        ctx.beginPath();
        ctx.arc(dx, dy, 3, 0, 2 * Math.PI);
        ctx.fillStyle = d % 2 === 0 ? '#ffffff' : '#fbbf24';
        ctx.fill();
    }

    // Center Hub
    const hubGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 32);
    hubGrad.addColorStop(0, '#fef08a');
    hubGrad.addColorStop(0.6, '#f59e0b');
    hubGrad.addColorStop(1, '#b45309');

    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, 2 * Math.PI);
    ctx.fillStyle = hubGrad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText('QUAY', 0, 0);

    ctx.restore();
}

function handleDoSpin() {
    if (spinWheel.isSpinning) return;

    const spins = getTodaySpins();
    if (spins.length >= 3) {
        showToast('Bạn đã quay đủ 3 lượt tối đa hôm nay! Vui lòng quay lại vào ngày mai.', 'error');
        return;
    }

    spinWheel.isSpinning = true;
    const btnSpin = document.getElementById('btn-do-spin');
    if (btnSpin) {
        btnSpin.disabled = true;
        btnSpin.textContent = '⏳ Đang quay...';
    }

    // Hide previous prize display
    const prizeDisplay = document.getElementById('spin-prize-display');
    if (prizeDisplay) prizeDisplay.style.display = 'none';

    // Pick target prize based on weighted probability
    const prizes = spinWheel.prizes;
    const totalWeight = prizes.reduce((sum, p) => sum + (p.weight || 10), 0);
    let rand = Math.random() * totalWeight;
    let targetIndex = 0;
    for (let i = 0; i < prizes.length; i++) {
        rand -= (prizes[i].weight || 10);
        if (rand <= 0) {
            targetIndex = i;
            break;
        }
    }
    const targetPrize = prizes[targetIndex];

    // Pointer is at the top (-PI/2)
    const numSlices = prizes.length;
    const sliceAngle = (2 * Math.PI) / numSlices;
    
    // Sector i center angle is (i + 0.5) * sliceAngle
    // When wheel rotates by currentAngle, angle at top (-PI/2) maps to wheel angle:
    // (-PI/2 - finalAngle) mod 2PI = (targetIndex + 0.5) * sliceAngle
    const fullSpins = 6 + Math.floor(Math.random() * 3); // 6 to 8 full spins
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.6); // slight offset inside slice
    const targetSectorCenter = (targetIndex + 0.5) * sliceAngle + jitter;
    
    // Calculate final rotation angle
    const targetMod = (-(Math.PI / 2) - targetSectorCenter) % (2 * Math.PI);
    const normalizedTargetMod = targetMod < 0 ? targetMod + 2 * Math.PI : targetMod;
    
    const startAngle = spinWheel.currentAngle % (2 * Math.PI);
    let angleDiff = normalizedTargetMod - startAngle;
    if (angleDiff < 0) angleDiff += 2 * Math.PI;

    const totalAngleToRotate = fullSpins * 2 * Math.PI + angleDiff;
    const duration = 4500; // 4.5 seconds
    const startTime = performance.now();
    const initialAngle = spinWheel.currentAngle;

    let lastTickSlice = -1;

    function animateSpin(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Quintic ease-out curve for dramatic casino slowdown
        const easeOut = 1 - Math.pow(1 - progress, 4);
        spinWheel.currentAngle = initialAngle + totalAngleToRotate * easeOut;

        // Sound tick when passing slices
        const currentSlice = Math.floor(((-Math.PI / 2 - (spinWheel.currentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / sliceAngle);
        if (currentSlice !== lastTickSlice) {
            lastTickSlice = currentSlice;
            soundEffects.playCardClick();
        }

        drawSpinWheel();

        if (progress < 1) {
            requestAnimationFrame(animateSpin);
        } else {
            // Spin completed!
            spinWheel.isSpinning = false;
            spinWheel.currentAngle = initialAngle + totalAngleToRotate;
            drawSpinWheel();

            // Save record
            saveUserSpinRecord(targetPrize);
            updateSpinTurnsUI();

            // Show prize display
            if (prizeDisplay) {
                prizeDisplay.style.display = 'block';
                const prizeText = document.getElementById('spin-prize-text');
                if (prizeText) {
                    if (targetPrize.value > 0) {
                        prizeText.textContent = `+${Number(targetPrize.value).toLocaleString()} 🪙`;
                        prizeText.style.color = '#fbbf24';
                    } else {
                        prizeText.textContent = 'Mất Lượt 😅 Chúc bạn may mắn lần sau!';
                        prizeText.style.color = '#94a3b8';
                    }
                }
            }

            // Award chips if won
            if (targetPrize.value > 0) {
                soundEffects.playWinSound();
                showToast(`🎉 Chúc mừng! Bạn trúng ${Number(targetPrize.value).toLocaleString()} Chip từ Vòng Quay May Mắn!`, 'success');
                
                // Award via API or local wallet state
                if (state.token) {
                    apiCall('/api/wallet/transfer', 'POST', { amount: targetPrize.value })
                        .then(res => {
                            if (res.newBalance !== undefined) {
                                if (state.user && state.user.wallet) state.user.wallet.balance = res.newBalance;
                                updateHeaderUserInfo();
                            }
                        })
                        .catch(() => {
                            // Fallback if backend transfer is mocked
                            if (state.user && state.user.wallet) {
                                state.user.wallet.balance = (state.user.wallet.balance || 0) + targetPrize.value;
                                updateHeaderUserInfo();
                            }
                        });
                } else if (state.user) {
                    if (!state.user.wallet) state.user.wallet = { balance: 0 };
                    state.user.wallet.balance += targetPrize.value;
                    updateHeaderUserInfo();
                }
            } else {
                soundEffects.playLossSound();
            }
        }
    }

    requestAnimationFrame(animateSpin);
}

// ==========================================================================
// ADMIN SPIN MANAGEMENT FUNCTIONS
// ==========================================================================

function loadAdminSpinStats() {
    // Load config into inputs
    try {
        const custom = localStorage.getItem('spin_prize_config');
        if (custom) {
            const cfg = JSON.parse(custom);
            if (cfg.jackpot) document.getElementById('prize-jackpot').value = cfg.jackpot;
            if (cfg.first) document.getElementById('prize-1st').value = cfg.first;
            if (cfg.second) document.getElementById('prize-2nd').value = cfg.second;
            if (cfg.third) document.getElementById('prize-3rd').value = cfg.third;
            if (cfg.cons) document.getElementById('prize-cons').value = cfg.cons;
        }
    } catch (e) { }

    // Load logs
    try {
        const logs = JSON.parse(localStorage.getItem('admin_spin_logs') || '[]');
        const today = getTodaySpinDateKey();
        const todayLogs = logs.filter(l => l.date === today);

        const totalSpins = todayLogs.length;
        const totalChips = todayLogs.reduce((acc, l) => acc + (l.value || 0), 0);
        const uniqueUsers = new Set(todayLogs.map(l => l.username)).size;

        document.getElementById('spin-stat-total').textContent = totalSpins;
        document.getElementById('spin-stat-chips').textContent = Number(totalChips).toLocaleString() + ' 🪙';
        document.getElementById('spin-stat-users').textContent = uniqueUsers;

        const historyEl = document.getElementById('admin-spin-history');
        if (historyEl) {
            if (logs.length === 0) {
                historyEl.innerHTML = '<div style="font-size:0.75rem;color:#64748b;text-align:center;padding:8px;">Chưa có dữ liệu quay nào</div>';
            } else {
                historyEl.innerHTML = logs.slice(0, 15).map(l => `
                    <div class="spin-history-item">
                        <span><strong>${escapeHtml(l.username || 'Khách')}</strong> (${l.time || ''})</span>
                        <span class="${l.value > 0 ? 'prize-win' : ''}">${l.value > 0 ? '+' + Number(l.value).toLocaleString() + ' 🪙' : '0 🪙'}</span>
                    </div>
                `).join('');
            }
        }
    } catch (e) { }
}

function adminSaveSpinConfig() {
    const jackpot = parseInt(document.getElementById('prize-jackpot')?.value) || 50000;
    const first = parseInt(document.getElementById('prize-1st')?.value) || 10000;
    const second = parseInt(document.getElementById('prize-2nd')?.value) || 5000;
    const third = parseInt(document.getElementById('prize-3rd')?.value) || 2000;
    const cons = parseInt(document.getElementById('prize-cons')?.value) || 500;

    const config = { jackpot, first, second, third, cons };
    localStorage.setItem('spin_prize_config', JSON.stringify(config));

    loadSavedSpinConfig();
    drawSpinWheel();
    showToast('✔ Đã lưu cài đặt giải thưởng vòng quay may mắn!', 'success');
}
