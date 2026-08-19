/**
 * Smart Habit Tracking System - Vanilla JS Frontend Application
 * System Analysis & Design (SAD) Course MVP
 * Features Login Homepage, User-Scoped Habit Tracking & Habit Management
 */

document.addEventListener('DOMContentLoaded', () => {
    // Views
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');

    // Auth Elements
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const authAlert = document.getElementById('auth-alert');

    // Header User Badge Elements
    const userBadge = document.getElementById('user-badge');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email');
    const btnLogout = document.getElementById('btn-logout');

    // Dashboard Form Elements
    const formAddHabit = document.getElementById('add-habit-form');
    const inputHabitName = document.getElementById('habit-name');
    const inputReminderTime = document.getElementById('reminder-time');
    const formErrorMsg = document.getElementById('form-error-msg');
    
    // Matrix Elements
    const tableHeaderRow = document.getElementById('table-header-row');
    const habitTableBody = document.getElementById('habit-table-body');
    
    // Metric Elements
    const metricTotalHabits = document.getElementById('metric-total-habits');
    const metricCompletionRate = document.getElementById('metric-completion-rate');
    const metricProgressFill = document.getElementById('metric-progress-fill');
    const metricBestStreak = document.getElementById('metric-best-streak');
    const metricBestStreakName = document.getElementById('metric-best-streak-name');
    const metricTodayCount = document.getElementById('metric-today-count');

    // State Variables
    let currentUser = null;
    let currentPast7Days = [];
    let habitsData = [];
    let pollingMetricsInterval = null;

    // Init App
    init();

    function init() {
        // Check for saved session in localStorage
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                currentUser = JSON.parse(savedUser);
                showDashboard();
            } catch (e) {
                localStorage.removeItem('currentUser');
                showAuth();
            }
        } else {
            showAuth();
        }

        // Auth Event Listeners
        tabLogin.addEventListener('click', () => switchAuthTab('login'));
        tabRegister.addEventListener('click', () => switchAuthTab('register'));
        formLogin.addEventListener('submit', handleLogin);
        formRegister.addEventListener('submit', handleRegister);
        btnLogout.addEventListener('click', handleLogout);

        // Dashboard Event Listeners
        formAddHabit.addEventListener('submit', handleAddHabit);
    }

    // ==========================================
    // AUTHENTICATION & VIEW MANAGEMENT
    // ==========================================

    function switchAuthTab(tab) {
        hideAuthAlert();
        if (tab === 'login') {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            formLogin.classList.remove('hidden');
            formRegister.classList.add('hidden');
        } else {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            formRegister.classList.remove('hidden');
            formLogin.classList.add('hidden');
        }
    }

    function showAuthAlert(msg, type = 'error') {
        authAlert.textContent = msg;
        authAlert.className = `auth-alert ${type === 'error' ? 'auth-alert-error' : 'auth-alert-success'}`;
        authAlert.classList.remove('hidden');
    }

    function hideAuthAlert() {
        authAlert.classList.add('hidden');
    }

    /**
     * Handle User Login
     */
    async function handleLogin(e) {
        e.preventDefault();
        hideAuthAlert();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const result = await res.json();
            if (result.success && result.user) {
                currentUser = result.user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                showDashboard();
            } else {
                showAuthAlert(result.error || 'Login failed. Please check credentials.');
            }
        } catch (err) {
            console.error('Login error:', err);
            showAuthAlert('Unable to connect to server.');
        }
    }

    /**
     * Handle User Registration
     */
    async function handleRegister(e) {
        e.preventDefault();
        hideAuthAlert();

        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });

            const result = await res.json();
            if (result.success && result.user) {
                currentUser = result.user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                showDashboard();
            } else {
                showAuthAlert(result.error || 'Registration failed.');
            }
        } catch (err) {
            console.error('Registration error:', err);
            showAuthAlert('Unable to connect to server.');
        }
    }

    /**
     * Handle User Logout
     */
    function handleLogout() {
        currentUser = null;
        localStorage.removeItem('currentUser');
        showAuth();
    }

    function showAuth() {
        authView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        userBadge.classList.add('hidden');

        if (pollingMetricsInterval) clearInterval(pollingMetricsInterval);
    }

    function showDashboard() {
        authView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        userBadge.classList.remove('hidden');

        if (currentUser) {
            userName.textContent = currentUser.name;
            userEmail.textContent = currentUser.email;
            const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            userAvatar.textContent = initials || 'U';
        }

        fetchDashboardData();

        if (pollingMetricsInterval) clearInterval(pollingMetricsInterval);
        pollingMetricsInterval = setInterval(fetchDashboardData, 10000);
    }

    // ==========================================
    // DASHBOARD & HABIT MANAGEMENT (USER SCOPED)
    // ==========================================

    /**
     * Fetch real-time dashboard data joining habits, streaks, and logs
     */
    async function fetchDashboardData() {
        if (!currentUser) return;

        try {
            const res = await fetch(`/api/dashboard?user_id=${currentUser.user_id}`);
            const result = await res.json();

            if (!result.success) {
                console.error('Failed to load dashboard:', result.error);
                return;
            }

            const { past7Days, metrics, habits } = result.data;
            currentPast7Days = past7Days;
            habitsData = habits;

            updateMetricsUI(metrics);
            renderTableHeader(past7Days);
            renderHabitGrid(habits, past7Days);

        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        }
    }

    /**
     * Update summary metric cards
     */
    function updateMetricsUI(metrics) {
        metricTotalHabits.textContent = metrics.totalHabits;
        metricCompletionRate.textContent = `${metrics.completionRate}%`;
        metricProgressFill.style.width = `${metrics.completionRate}%`;

        metricBestStreak.innerHTML = `${metrics.bestActiveStreak.current_streak} <span class="unit">days</span>`;
        metricBestStreakName.textContent = metrics.bestActiveStreak.habit_name !== 'N/A'
            ? `Habit: "${metrics.bestActiveStreak.habit_name}"`
            : 'No active habits';

        metricTodayCount.textContent = `${metrics.todayCompletedCount}/${metrics.totalHabits}`;
    }

    /**
     * Render matrix table headers with date formatting
     */
    function renderTableHeader(past7Days) {
        const dateCols = tableHeaderRow.querySelectorAll('.col-date-header');
        dateCols.forEach(col => col.remove());

        past7Days.forEach(dateStr => {
            const th = document.createElement('th');
            th.className = 'col-date-header';

            const dateObj = new Date(dateStr + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = dateObj.getDate();

            th.innerHTML = `
                <span class="date-day">${dayName}</span>
                <span class="date-num">${dayNum}</span>
            `;
            tableHeaderRow.appendChild(th);
        });
    }

    /**
     * Render matrix table rows strictly following actual logged status:
     * - completed -> ✓
     * - incomplete -> ✕
     * - unmarked -> ·
     */
    function renderHabitGrid(habits, past7Days) {
        if (!habits || habits.length === 0) {
            habitTableBody.innerHTML = `
                <tr>
                    <td colspan="${3 + past7Days.length}" class="empty-state">
                        No habits configured yet. Create a habit above to start tracking!
                    </td>
                </tr>
            `;
            return;
        }

        habitTableBody.innerHTML = '';

        habits.forEach(habit => {
            const tr = document.createElement('tr');

            // 1. Habit Details Cell
            const tdInfo = document.createElement('td');
            tdInfo.className = 'col-habit';
            tdInfo.innerHTML = `
                <div class="habit-info-cell">
                    <div class="habit-title-row">
                        <span class="habit-name-text">${escapeHtml(habit.habit_name)}</span>
                        <span class="time-badge" title="Scheduled Reminder Time">⏰ ${habit.reminder_time}</span>
                    </div>
                </div>
            `;
            tr.appendChild(tdInfo);

            // 2. Streaks Cell
            const tdStreak = document.createElement('td');
            tdStreak.className = 'col-streak';
            tdStreak.innerHTML = `
                <div class="streak-badges">
                    <span class="badge-streak badge-current-streak" title="Current Active Streak">
                        🔥 ${habit.current_streak}d current
                    </span>
                    <span class="badge-streak badge-longest-streak" title="All-Time Longest Streak">
                        🏆 ${habit.longest_streak}d max
                    </span>
                </div>
            `;
            tr.appendChild(tdStreak);

            // 3. Action Delete Cell
            const tdAction = document.createElement('td');
            tdAction.className = 'col-action cell-action';
            
            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-action-delete';
            btnDelete.innerHTML = '🗑 Delete';
            btnDelete.title = `Delete habit "${habit.habit_name}"`;
            btnDelete.addEventListener('click', () => handleDeleteHabit(habit.habit_id, habit.habit_name));
            
            tdAction.appendChild(btnDelete);
            tr.appendChild(tdAction);

            // 4. Past 7 Days Cells with Toggle Buttons
            habit.weekly_logs.forEach(logItem => {
                const tdDay = document.createElement('td');
                tdDay.className = 'cell-day';

                const btnToggle = document.createElement('button');
                btnToggle.className = `btn-toggle-day status-${logItem.status}`;
                
                if (logItem.status === 'completed') {
                    btnToggle.innerHTML = '✓';
                    btnToggle.title = `${logItem.date}: Completed (Click to set Incomplete)`;
                } else if (logItem.status === 'incomplete') {
                    btnToggle.innerHTML = '✕';
                    btnToggle.title = `${logItem.date}: Incomplete (Click to Unmark)`;
                } else {
                    btnToggle.innerHTML = '·';
                    btnToggle.title = `${logItem.date}: Pending (Click to set Completed)`;
                }

                btnToggle.addEventListener('click', () => handleToggleStatus(habit.habit_id, logItem.date, logItem.status));

                tdDay.appendChild(btnToggle);
                tr.appendChild(tdDay);
            });

            habitTableBody.appendChild(tr);
        });
    }

    /**
     * Toggle status handler: unmarked -> completed -> incomplete -> unmarked
     */
    async function handleToggleStatus(habitId, dateStr, currentStatus) {
        let nextStatus = 'completed';
        if (currentStatus === 'completed') {
            nextStatus = 'incomplete';
        } else if (currentStatus === 'incomplete') {
            nextStatus = 'unmarked';
        } else {
            nextStatus = 'completed';
        }

        try {
            const res = await fetch(`/api/habits/${habitId}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, status: nextStatus })
            });

            const result = await res.json();
            if (result.success) {
                await fetchDashboardData();
            } else {
                alert(`Error updating log: ${result.error}`);
            }
        } catch (err) {
            console.error('Error toggling status:', err);
        }
    }

    /**
     * Create new habit submit handler for currentUser
     */
    async function handleAddHabit(e) {
        e.preventDefault();
        formErrorMsg.classList.add('hidden');

        if (!currentUser) return;

        const habit_name = inputHabitName.value.trim();
        const reminder_time = inputReminderTime.value;

        if (!habit_name) return;

        try {
            const res = await fetch('/api/habits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    habit_name, 
                    reminder_time,
                    user_id: currentUser.user_id 
                })
            });

            const result = await res.json();

            if (result.success) {
                inputHabitName.value = '';
                await fetchDashboardData();
            } else {
                formErrorMsg.textContent = result.error || result.details || 'Failed to create habit.';
                formErrorMsg.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Error adding habit:', err);
            formErrorMsg.textContent = 'Server connection error.';
            formErrorMsg.classList.remove('hidden');
        }
    }

    /**
     * Delete habit handler
     */
    async function handleDeleteHabit(habitId, habitName) {
        if (!confirm(`Are you sure you want to delete the habit "${habitName}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/habits/${habitId}`, { method: 'DELETE' });
            const result = await res.json();

            if (result.success) {
                await fetchDashboardData();
            } else {
                alert(`Failed to delete habit: ${result.error}`);
            }
        } catch (err) {
            console.error('Error deleting habit:', err);
        }
    }

    /**
     * Helper: Sanitize text for HTML rendering
     */
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
