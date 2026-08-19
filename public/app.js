/**
 * Smart Habit Tracking System - Vanilla JS Frontend Application
 * System Analysis & Design (SAD) Course MVP
 * Features Login Homepage, Dark Mode, Gamification, Badges, Category Filters, Priority, Subtasks, Trend Chart, Historical Back Data Navigation & CSV Export
 */

document.addEventListener('DOMContentLoaded', () => {
    // Views
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');

    // Header & Theme Elements
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const themeToggleText = document.getElementById('theme-toggle-text');
    const userBadge = document.getElementById('user-badge');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email');
    const btnOpenProfile = document.getElementById('btn-open-profile');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnLogout = document.getElementById('btn-logout');

    // Auth Elements
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const authAlert = document.getElementById('auth-alert');

    // Dashboard Form Elements
    const formAddHabit = document.getElementById('add-habit-form');
    const inputHabitName = document.getElementById('habit-name');
    const selectHabitCategory = document.getElementById('habit-category');
    const selectHabitPriority = document.getElementById('habit-priority');
    const selectHabitTargetDays = document.getElementById('habit-target-days');
    const inputReminderTime = document.getElementById('reminder-time');
    const inputHabitSubtasks = document.getElementById('habit-subtasks');
    const formErrorMsg = document.getElementById('form-error-msg');
    
    // Matrix, Date Navigation & Category Filter Elements
    const tableHeaderRow = document.getElementById('table-header-row');
    const habitTableBody = document.getElementById('habit-table-body');
    const categoryFiltersContainer = document.getElementById('category-filters');
    const trendBarsContainer = document.getElementById('trend-bars-container');
    const btnPrevWeek = document.getElementById('btn-prev-week');
    const btnTodayWeek = document.getElementById('btn-today-week');
    const btnNextWeek = document.getElementById('btn-next-week');
    
    // Metric & Gamification Elements
    const metricTotalHabits = document.getElementById('metric-total-habits');
    const metricCompletionRate = document.getElementById('metric-completion-rate');
    const metricProgressFill = document.getElementById('metric-progress-fill');
    const metricBestStreak = document.getElementById('metric-best-streak');
    const metricBestStreakName = document.getElementById('metric-best-streak-name');
    const metricTodayCount = document.getElementById('metric-today-count');

    const userLevelBadge = document.getElementById('user-level-badge');
    const userXpText = document.getElementById('user-xp-text');
    const xpProgressFill = document.getElementById('xp-progress-fill');
    const badgesContainer = document.getElementById('badges-container');

    // Profile Modal Elements
    const profileModal = document.getElementById('profile-modal');
    const btnCloseProfileModal = document.getElementById('btn-close-profile-modal');
    const profileForm = document.getElementById('profile-form');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePassword = document.getElementById('profile-password');
    const profileAlert = document.getElementById('profile-alert');

    // State Variables
    let currentUser = null;
    let currentPast7Days = [];
    let habitsData = [];
    let activeCategoryFilter = 'All';
    let dateOffsetDays = 0; // 0 = current week ending today, 7 = 1 week ago, 14 = 2 weeks ago...
    let pollingMetricsInterval = null;

    // Init App
    init();

    function init() {
        initTheme();

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

        // Header & Theme Event Listeners
        btnThemeToggle.addEventListener('click', toggleTheme);
        btnOpenProfile.addEventListener('click', openProfileModal);
        btnCloseProfileModal.addEventListener('click', closeProfileModal);
        profileForm.addEventListener('submit', handleProfileUpdate);

        // Date Navigation Event Listeners for Historical Back Data
        btnPrevWeek.addEventListener('click', () => {
            dateOffsetDays += 7;
            fetchDashboardData();
        });

        btnTodayWeek.addEventListener('click', () => {
            dateOffsetDays = 0;
            fetchDashboardData();
        });

        btnNextWeek.addEventListener('click', () => {
            dateOffsetDays = Math.max(0, dateOffsetDays - 7);
            fetchDashboardData();
        });

        // Auth Event Listeners
        tabLogin.addEventListener('click', () => switchAuthTab('login'));
        tabRegister.addEventListener('click', () => switchAuthTab('register'));
        formLogin.addEventListener('submit', handleLogin);
        formRegister.addEventListener('submit', handleRegister);
        btnLogout.addEventListener('click', handleLogout);
        btnExportCsv.addEventListener('click', handleExportCsv);

        // Dashboard Event Listeners
        formAddHabit.addEventListener('submit', handleAddHabit);
        setupCategoryFilters();
    }

    // ==========================================
    // THEME MANAGEMENT (DARK / LIGHT MODE)
    // ==========================================

    function initTheme() {
        const savedTheme = localStorage.getItem('appTheme') || 'light';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            themeToggleText.textContent = 'Light Mode';
        } else {
            document.body.classList.remove('dark-theme');
            themeToggleText.textContent = 'Dark Mode';
        }
    }

    function toggleTheme() {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
        themeToggleText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    }

    // ==========================================
    // AUTHENTICATION & PROFILE MANAGEMENT
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

        updateUserHeader();
        fetchDashboardData();

        if (pollingMetricsInterval) clearInterval(pollingMetricsInterval);
        pollingMetricsInterval = setInterval(fetchDashboardData, 10000);
    }

    function updateUserHeader() {
        if (currentUser) {
            userName.textContent = currentUser.name;
            userEmail.textContent = currentUser.email;
            const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            userAvatar.textContent = initials || 'U';
        }
    }

    function openProfileModal() {
        if (!currentUser) return;
        profileName.value = currentUser.name;
        profileEmail.value = currentUser.email;
        profilePassword.value = '';
        profileAlert.classList.add('hidden');
        profileModal.classList.remove('hidden');
    }

    function closeProfileModal() {
        profileModal.classList.add('hidden');
    }

    async function handleProfileUpdate(e) {
        e.preventDefault();
        profileAlert.classList.add('hidden');

        const name = profileName.value.trim();
        const email = profileEmail.value.trim();
        const password = profilePassword.value.trim();

        try {
            const res = await fetch('/api/auth/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUser.user_id,
                    name,
                    email,
                    password: password || undefined
                })
            });

            const result = await res.json();
            if (result.success && result.user) {
                currentUser = result.user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                updateUserHeader();
                closeProfileModal();
                await fetchDashboardData();
            } else {
                profileAlert.textContent = result.error || 'Failed to update profile.';
                profileAlert.className = 'auth-alert auth-alert-error';
                profileAlert.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Profile update error:', err);
            profileAlert.textContent = 'Server error updating profile.';
            profileAlert.className = 'auth-alert auth-alert-error';
            profileAlert.classList.remove('hidden');
        }
    }

    function handleExportCsv() {
        if (!currentUser) return;
        window.location.href = `/api/export/csv?user_id=${currentUser.user_id}`;
    }

    // ==========================================
    // CATEGORY FILTERS
    // ==========================================

    function setupCategoryFilters() {
        const pills = categoryFiltersContainer.querySelectorAll('.cat-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                activeCategoryFilter = pill.getAttribute('data-category');
                renderHabitGrid(habitsData, currentPast7Days);
            });
        });
    }

    // ==========================================
    // DASHBOARD & ANALYTICS RENDERERS
    // ==========================================

    async function fetchDashboardData() {
        if (!currentUser) return;

        try {
            const res = await fetch(`/api/dashboard?user_id=${currentUser.user_id}&offset=${dateOffsetDays}`);
            const result = await res.json();

            if (!result.success) {
                console.error('Failed to load dashboard:', result.error);
                return;
            }

            const { past7Days, metrics, weeklyTrend, gamification, habits } = result.data;
            currentPast7Days = past7Days;
            habitsData = habits;

            // Enable/disable next week button if at current week
            if (btnNextWeek) {
                btnNextWeek.style.opacity = (dateOffsetDays === 0) ? '0.4' : '1';
            }

            updateMetricsUI(metrics);
            renderWeeklyTrend(weeklyTrend);
            renderGamificationUI(gamification);
            renderTableHeader(past7Days);
            renderHabitGrid(habits, past7Days);

        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        }
    }

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

    function renderWeeklyTrend(weeklyTrend) {
        if (!weeklyTrend || !trendBarsContainer) return;

        trendBarsContainer.innerHTML = '';
        weeklyTrend.forEach(item => {
            const col = document.createElement('div');
            col.className = 'trend-bar-col';
            col.title = `${item.date} (${item.dayName}): ${item.completedCount}/${item.totalHabits} completed (${item.completionRate}%)`;

            col.innerHTML = `
                <span class="trend-bar-rate">${item.completionRate}%</span>
                <div class="trend-bar-wrapper">
                    <div class="trend-bar-fill" style="height: ${item.completionRate}%;"></div>
                </div>
                <span class="trend-bar-date">${item.dayName}</span>
            `;
            trendBarsContainer.appendChild(col);
        });
    }

    function renderGamificationUI(gamification) {
        if (!gamification) return;

        userLevelBadge.textContent = `Level ${gamification.level} Achiever`;
        userXpText.textContent = `${gamification.xpCurrent} / ${gamification.xpNeeded} XP (${gamification.points} Total XP)`;
        
        const xpPercent = Math.min(100, Math.max(0, (gamification.xpCurrent / gamification.xpNeeded) * 100));
        xpProgressFill.style.width = `${xpPercent}%`;

        if (gamification.badges && badgesContainer) {
            badgesContainer.innerHTML = '';
            gamification.badges.forEach(b => {
                const div = document.createElement('div');
                div.className = `badge-card ${b.unlocked ? 'unlocked' : ''}`;
                div.title = b.unlocked ? `Unlocked: ${b.description}` : `Locked: ${b.description}`;
                div.innerHTML = `
                    <div class="badge-icon">${b.icon}</div>
                    <div class="badge-info">
                        <span class="badge-name">${escapeHtml(b.title)}</span>
                        <span class="badge-desc">${escapeHtml(b.description)}</span>
                    </div>
                `;
                badgesContainer.appendChild(div);
            });
        }
    }

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

    function renderHabitGrid(habits, past7Days) {
        const filteredHabits = (activeCategoryFilter === 'All')
            ? habits
            : habits.filter(h => (h.category || 'General') === activeCategoryFilter);

        if (!filteredHabits || filteredHabits.length === 0) {
            habitTableBody.innerHTML = `
                <tr>
                    <td colspan="${5 + past7Days.length}" class="empty-state">
                        ${habits.length === 0 ? 'No habits configured yet. Create a habit above!' : `No habits found in category "${activeCategoryFilter}".`}
                    </td>
                </tr>
            `;
            return;
        }

        habitTableBody.innerHTML = '';

        filteredHabits.forEach(habit => {
            const tr = document.createElement('tr');

            // 1. Habit Details Cell & Subtasks Checklist
            const tdInfo = document.createElement('td');
            tdInfo.className = 'col-habit';

            let subtasksHtml = '';
            if (habit.subtasks && habit.subtasks.trim()) {
                const items = habit.subtasks.split(',').map(s => s.trim()).filter(Boolean);
                if (items.length > 0) {
                    subtasksHtml = `
                        <div class="subtasks-list" title="Sub-tasks checklist">
                            ${items.map(i => `<span class="subtask-item">☐ ${escapeHtml(i)}</span>`).join('')}
                        </div>
                    `;
                }
            }

            tdInfo.innerHTML = `
                <div class="habit-info-cell">
                    <div class="habit-title-row">
                        <span class="habit-name-text">${escapeHtml(habit.habit_name)}</span>
                        <span class="time-badge" title="Scheduled Reminder Time">⏰ ${habit.reminder_time}</span>
                    </div>
                    ${subtasksHtml}
                </div>
            `;
            tr.appendChild(tdInfo);

            // 2. Priority Cell
            const tdPriority = document.createElement('td');
            tdPriority.className = 'col-priority';
            const priorityClass = `badge-priority-${(habit.priority || 'Medium').toLowerCase()}`;
            const priorityIcon = habit.priority === 'High' ? '🔥' : (habit.priority === 'Low' ? '🍃' : '⚡');
            tdPriority.innerHTML = `<span class="badge-priority ${priorityClass}">${priorityIcon} ${habit.priority || 'Medium'}</span>`;
            tr.appendChild(tdPriority);

            // 3. Category Tag Cell
            const tdCategory = document.createElement('td');
            tdCategory.className = 'col-category';
            tdCategory.innerHTML = `<span class="tag-category">${escapeHtml(habit.category || 'General')}</span>`;
            tr.appendChild(tdCategory);

            // 4. Streaks Cell
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

            // 5. Action Delete Cell
            const tdAction = document.createElement('td');
            tdAction.className = 'col-action cell-action';
            
            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-action-delete';
            btnDelete.innerHTML = '🗑 Delete';
            btnDelete.title = `Delete habit "${habit.habit_name}"`;
            btnDelete.addEventListener('click', () => handleDeleteHabit(habit.habit_id, habit.habit_name));
            
            tdAction.appendChild(btnDelete);
            tr.appendChild(tdAction);

            // 6. Past 7 Days Cells with Instant Toggle Buttons
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

                btnToggle.addEventListener('click', () => {
                    let nextStatus = 'completed';
                    if (logItem.status === 'completed') {
                        nextStatus = 'incomplete';
                    } else if (logItem.status === 'incomplete') {
                        nextStatus = 'unmarked';
                    } else {
                        nextStatus = 'completed';
                    }
                    saveStatusLog(habit.habit_id, logItem.date, nextStatus, null);
                });

                tdDay.appendChild(btnToggle);
                tr.appendChild(tdDay);
            });

            habitTableBody.appendChild(tr);
        });
    }

    async function saveStatusLog(habitId, dateStr, status, notes) {
        try {
            const res = await fetch(`/api/habits/${habitId}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, status, notes })
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

    async function handleAddHabit(e) {
        e.preventDefault();
        formErrorMsg.classList.add('hidden');

        if (!currentUser) return;

        const habit_name = inputHabitName.value.trim();
        const category = selectHabitCategory.value;
        const priority = selectHabitPriority.value;
        const target_days = selectHabitTargetDays.value;
        const reminder_time = inputReminderTime.value;
        const subtasks = inputHabitSubtasks.value.trim();

        if (!habit_name) return;

        try {
            const res = await fetch('/api/habits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    habit_name, 
                    reminder_time,
                    category,
                    priority,
                    target_days,
                    subtasks,
                    user_id: currentUser.user_id 
                })
            });

            const result = await res.json();

            if (result.success) {
                inputHabitName.value = '';
                inputHabitSubtasks.value = '';
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
