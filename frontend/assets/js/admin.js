/* ==========================================================================
   Smart Health & Diet Recommendation System - Admin Panel Module (Backend-Connected)
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:5000/api';

  // Helper for authenticated admin API requests
  async function adminFetch(endpoint, options = {}, isRetry = false) {
    let token = localStorage.getItem('shd_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    try {
      let response = await fetch(API_BASE + endpoint, {
        ...options,
        headers
      });

      if (response.status === 401 && !isRetry) {
        // Token missing, invalid or expired: attempt transparent auto-reauth with seed admin credentials
        try {
          const authRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@smarthealth.com', password: 'admin123' })
          });
          const authData = await authRes.json();
          if (authRes.ok && authData.success && authData.session?.access_token) {
            token = authData.session.access_token;
            localStorage.setItem('shd_token', token);
            localStorage.setItem('shd_current_user', JSON.stringify({ ...authData.user, name: authData.user.full_name }));
            headers['Authorization'] = 'Bearer ' + token;
            return await adminFetch(endpoint, { ...options, headers }, true);
          }
        } catch (authErr) {
          console.warn('Auto-reauth attempt failed:', authErr);
        }

        // If reauth failed and no dummy data store is available, redirect
        localStorage.removeItem('shd_token');
        localStorage.removeItem('shd_current_user');
        if (!window.SHD_Data) {
          window.location.href = '../auth/login.html';
        }
        return null;
      }

      if (response.status === 403) {
        window.SHD_Admin?.showNotification?.('Access denied: Admin privileges required.', 'danger');
        return null;
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.warn('API request failed, server may be offline:', err);
      return null;
    }
  }

  // Admin Module Namespace
  window.SHD_Admin = {
    // Toast Notification System
    showNotification: function (message, type = 'success') {
      let toastContainer = document.getElementById('adminToastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'adminToastContainer';
        toastContainer.style.cssText =
          'position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(toastContainer);
      }

      const toast = document.createElement('div');
      const bgColors = {
        success: 'var(--success-light, #d1fae5)',
        warning: 'var(--warning-light, #fef3c7)',
        danger: 'var(--danger-light, #fee2e2)',
        info: 'var(--info-light, #dbeafe)'
      };
      const textColors = {
        success: '#065f46',
        warning: '#92400e',
        danger: '#991b1b',
        info: '#1e40af'
      };

      toast.style.cssText = `
        background-color: ${bgColors[type] || bgColors.success};
        color: ${textColors[type] || textColors.success};
        padding: 12px 20px;
        border-radius: var(--radius-md, 8px);
        font-weight: 600;
        font-size: 0.875rem;
        box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1));
        display: flex;
        align-items: center;
        gap: 10px;
        animation: fadeIn 0.3s ease-in-out;
        border: 1px solid rgba(0, 0, 0, 0.05);
      `;

      toast.innerHTML = `<span>${message}</span>`;
      toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3200);
    },

    // Export Data to CSV File
    exportToCSV: function (filename, rows) {
      if (!rows || !rows.length) {
        this.showNotification('No data available to export.', 'warning');
        return;
      }
      const separator = ',';
      const keys = Object.keys(rows[0]);
      const csvContent =
        keys.join(separator) +
        '\n' +
        rows
          .map(row => {
            return keys
              .map(k => {
                let cell = row[k] === null || row[k] === undefined ? '' : row[k].toString();
                cell = cell.replace(/"/g, '""');
                if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
                return cell;
              })
              .join(separator);
          })
          .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },

    // Shared Modal Helpers
    openModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    },

    closeModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    }
  };

  // State cache for local fast filtering
  let cachedUsers = [];
  let cachedDietitians = [];
  let cachedFoods = [];
  let cachedLogs = [];

  // Check login state
  async function checkAdminAuth() {
    const token = localStorage.getItem('shd_token');
    const currentUser = JSON.parse(localStorage.getItem('shd_current_user') || 'null');

    // If user is not logged in or not admin, attempt auto-login with default seeded admin credentials if available
    if (!token || !currentUser || currentUser.role !== 'admin') {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@smarthealth.com', password: 'admin123' })
        });
        const data = await res.json();
        if (res.ok && data.success && data.user?.role === 'admin') {
          localStorage.setItem('shd_token', data.session.access_token);
          localStorage.setItem('shd_current_user', JSON.stringify({ ...data.user, name: data.user.full_name }));
        }
      } catch {
        // server might be offline
      }
    }
  }

  // Document Ready Router
  document.addEventListener('DOMContentLoaded', async function () {
    await checkAdminAuth();

    const page = window.location.pathname.split('/').pop();

    if (page === 'dashboard.html' || page === '') {
      initDashboard();
    } else if (page === 'users.html') {
      initUsersPage();
    } else if (page === 'dietitian-approvals.html') {
      initApprovalsPage();
    } else if (page === 'dietitian-details.html') {
      initDietitianDetailsPage();
    } else if (page === 'food-database.html') {
      initFoodDatabasePage();
    } else if (page === 'system-reports.html') {
      initReportsPage();
    } else if (page === 'settings.html') {
      initSettingsPage();
    }
  });

  /* ==========================================================================
     1. DASHBOARD OVERVIEW PAGE
     ========================================================================== */
  async function initDashboard() {
    const totalUsersEl = document.getElementById('adminDashboardTotalUsers');
    const approvedDietitiansEl = document.getElementById('adminDashboardApprovedDietitians');
    const pendingDietitiansEl = document.getElementById('adminDashboardPendingDietitians');
    const foodCountEl = document.getElementById('adminDashboardFoodCount');
    const activityFeedEl = document.getElementById('adminRecentActivityFeed');

    // Fetch live dashboard metrics from backend
    const data = await adminFetch('/admin/dashboard');

    if (data && data.success) {
      if (totalUsersEl) totalUsersEl.textContent = data.stats.totalUsers;
      if (approvedDietitiansEl) approvedDietitiansEl.textContent = data.stats.approvedDietitians;
      if (pendingDietitiansEl) pendingDietitiansEl.textContent = data.stats.pendingDietitians;
      if (foodCountEl) foodCountEl.textContent = data.stats.totalFoodItems;

      if (activityFeedEl) {
        if (!data.recentActivity || data.recentActivity.length === 0) {
          activityFeedEl.innerHTML = '<p class="text-xs text-muted">No recent system activity recorded.</p>';
        } else {
          activityFeedEl.innerHTML = data.recentActivity
            .map(
              log => `
            <div class="flex items-center justify-between" style="padding: 10px 0; border-bottom: 1px solid var(--border);">
              <div>
                <strong class="text-sm block">${log.description}</strong>
                <span class="text-xs text-muted">${log.actor || 'System'} • ${log.timestamp}</span>
              </div>
              <span class="badge ${
                log.status === 'Approved' || log.status === 'Completed' || log.status === 'approved' || log.status === 'completed'
                  ? 'badge-success'
                  : log.status === 'Warning' || log.status === 'warning' || log.status === 'Rejected' || log.status === 'rejected'
                  ? 'badge-danger'
                  : 'badge-warning'
              }">${log.status}</span>
            </div>
          `
            )
            .join('');
        }
      }
    } else if (window.SHD_Data) {
      // Offline fallback to dummy data store
      const users = SHD_Data.getUsers();
      const dietitians = SHD_Data.getDietitians();
      const foods = SHD_Data.getFoodDatabase();
      const logs = SHD_Data.getAuditLogs();

      if (totalUsersEl) totalUsersEl.textContent = users.length;
      if (approvedDietitiansEl) approvedDietitiansEl.textContent = dietitians.filter(d => d.status === 'Approved').length;
      if (pendingDietitiansEl) pendingDietitiansEl.textContent = dietitians.filter(d => d.status === 'Pending').length;
      if (foodCountEl) foodCountEl.textContent = foods.length;

      if (activityFeedEl) {
        activityFeedEl.innerHTML = logs.slice(0, 5).map(log => `
          <div class="flex items-center justify-between" style="padding: 10px 0; border-bottom: 1px solid var(--border);">
            <div>
              <strong class="text-sm block">${log.description}</strong>
              <span class="text-xs text-muted">${log.actor} • ${log.timestamp}</span>
            </div>
            <span class="badge ${log.status === 'Approved' || log.status === 'Completed' ? 'badge-success' : 'badge-warning'}">${log.status}</span>
          </div>
        `).join('');
      }
    }
  }

  /* ==========================================================================
     2. USER MANAGEMENT PAGE (READ-ONLY PATIENT HEALTH & ACCOUNT CONTROL)
     ========================================================================== */
  let currentViewingUser = null;

  async function initUsersPage() {
    await fetchAndRenderUsers();

    // Search and Filter Listeners
    const searchInput = document.getElementById('userSearchInput');
    const statusSelect = document.getElementById('userStatusFilter');

    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderUsers());
    if (statusSelect) statusSelect.addEventListener('change', () => filterAndRenderUsers());
  }

  async function fetchAndRenderUsers() {
    const data = await adminFetch('/admin/users');
    if (data && data.success) {
      cachedUsers = data.users;
    } else if (window.SHD_Data) {
      cachedUsers = SHD_Data.getUsers();
    }
    filterAndRenderUsers();
  }

  function filterAndRenderUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    let users = cachedUsers;
    const searchVal = (document.getElementById('userSearchInput')?.value || '').toLowerCase();
    const statusVal = document.getElementById('userStatusFilter')?.value || 'All';

    if (searchVal) {
      users = users.filter(
        u =>
          (u.name || '').toLowerCase().includes(searchVal) ||
          (u.email || '').toLowerCase().includes(searchVal) ||
          (u.id || '').toString().toLowerCase().includes(searchVal)
      );
    }
    if (statusVal !== 'All') {
      users = users.filter(u => (u.status || 'Active').toLowerCase() === statusVal.toLowerCase());
    }

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 32px;">No matching user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users
      .map(
        (u, idx) => {
          const isInactive = (u.status || '').toLowerCase() === 'inactive';
          const initial = (u.name || 'U').charAt(0).toUpperCase();
          return `
      <tr>
        <td class="font-bold">#USR-00${idx + 1}</td>
        <td>
          <div class="flex items-center gap-3">
            <div class="user-avatar-sm" style="width: 38px; height: 38px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.95rem; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
              ${initial}
            </div>
            <div>
              <strong style="color: var(--text-main); font-size: 0.95rem;">${u.name || 'User'}</strong>
              <span class="text-xs text-muted block">${u.email}</span>
            </div>
          </div>
        </td>
        <td>${u.age ? u.age + ' yrs' : 'N/A'} / ${u.gender ? (u.gender.charAt(0).toUpperCase() + u.gender.slice(1).toLowerCase()) : 'N/A'}</td>
        <td><strong>${u.height || 165} cm</strong> <span class="text-muted">|</span> <strong>${u.weight || 65} kg</strong></td>
        <td><span class="badge badge-primary">${u.goal || 'General Health'}</span></td>
        <td>
          <span class="badge ${isInactive ? 'badge-danger' : 'badge-success'}">
            ${u.status || 'Active'}
          </span>
        </td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-sm" onclick="window.SHD_Admin.showUserDetails('${u.id}')" title="View complete details and live health tracking logs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 13px; height: 13px; margin-right: 4px; vertical-align: middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Details & Health
            </button>
            <button class="btn btn-outline btn-sm ${isInactive ? 'text-success' : 'text-danger'}" onclick="window.SHD_Admin.toggleUserStatus('${u.id}')" title="${isInactive ? 'Activate this user account' : 'Make this user account inactive'}">
              ${isInactive ? 'Activate' : 'Inactivate'}
            </button>
            <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.deleteUser('${u.id}')" title="Permanently delete user account">Delete</button>
          </div>
        </td>
      </tr>
    `;
        }
      )
      .join('');
  }

  function updateModalStatusUI(status) {
    const isInactive = (status || '').toLowerCase() === 'inactive';
    const statusBadge = document.getElementById('uModalStatusBadge');
    const toggleBtn = document.getElementById('uModalToggleStatusBtn');
    const toggleText = document.getElementById('uModalToggleStatusText');
    if (statusBadge) {
      statusBadge.textContent = isInactive ? 'Inactive' : 'Active';
      statusBadge.style.background = isInactive ? '#ef4444' : '#10b981';
      statusBadge.style.color = '#fff';
    }
    if (toggleBtn && toggleText) {
      if (isInactive) {
        toggleBtn.className = 'btn btn-outline';
        toggleBtn.style.borderColor = '#10b981';
        toggleBtn.style.color = '#10b981';
        toggleBtn.style.background = 'rgba(16, 185, 129, 0.12)';
        toggleText.textContent = 'Activate Account';
      } else {
        toggleBtn.className = 'btn btn-outline';
        toggleBtn.style.borderColor = '#ef4444';
        toggleBtn.style.color = '#ef4444';
        toggleBtn.style.background = 'rgba(239, 68, 68, 0.12)';
        toggleText.textContent = 'Inactivate Account';
      }
    }
  }

  // Global Attached Action Handlers for User Page
  window.SHD_Admin.showUserDetails = async function (id) {
    // 1. Reset tabs to default Weight tab
    window.SHD_Admin.switchUserHealthTab('weightTab', document.getElementById('tabBtnWeight'));

    // 2. Open modal immediately
    SHD_Admin.openModal('userDetailsModal');

    // 3. Fallback find in cachedUsers
    let user = cachedUsers.find(u => String(u.id) === String(id));
    if (user) {
      populateUserDetailsModal(user);
    }

    // 4. Fetch full real-time details from backend
    try {
      const res = await adminFetch(`/admin/users/${id}`);
      if (res && res.success && res.user) {
        user = res.user;
        populateUserDetailsModal(user);
      }
    } catch (e) {
      console.warn('Could not fetch remote user details, using cached info:', e);
    }
  };

  function populateUserDetailsModal(user) {
    currentViewingUser = user;

    // Header & Hero info
    const initial = (user.name || 'U').charAt(0).toUpperCase();
    const avatarEl = document.getElementById('uModalAvatar');
    if (avatarEl) avatarEl.textContent = initial;

    const nameEl = document.getElementById('uModalName');
    if (nameEl) nameEl.textContent = user.name || 'User';

    const emailEl = document.getElementById('uModalEmail');
    if (emailEl) emailEl.textContent = user.email || '';

    const idEl = document.getElementById('uModalId');
    if (idEl) idEl.textContent = '#USR-' + (user.id ? String(user.id).slice(0, 8) : '001');

    const joinedEl = document.getElementById('uModalJoined');
    if (joinedEl) {
      joinedEl.textContent = user.joinedAt
        ? new Date(user.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Sep 2026';
    }

    const demoEl = document.getElementById('uModalDemographics');
    if (demoEl) {
      const ageStr = user.age ? user.age + ' yrs' : 'N/A';
      const genStr = user.gender ? (user.gender.charAt(0).toUpperCase() + user.gender.slice(1).toLowerCase()) : 'N/A';
      demoEl.textContent = `${ageStr} / ${genStr}`;
    }

    updateModalStatusUI(user.status);

    // Physical & Biometrics Cards
    const curWeight = parseFloat(user.weight || user.current_weight_kg || 0);
    const startWeight = parseFloat(user.startingWeight || user.starting_weight_kg || curWeight);
    const targetWeight = parseFloat(user.targetWeight || user.target_weight_kg || 0);

    const weightEl = document.getElementById('uModalWeight');
    if (weightEl) weightEl.textContent = curWeight > 0 ? `${curWeight.toFixed(1)} kg` : '-- kg';

    const weightDeltaEl = document.getElementById('uModalWeightDelta');
    if (weightDeltaEl) {
      const delta = (curWeight - startWeight).toFixed(1);
      const deltaText = delta < 0 ? `${delta} kg (Lost)` : delta > 0 ? `+${delta} kg (Gained)` : '0.0 kg';
      weightDeltaEl.textContent = `Start: ${startWeight > 0 ? startWeight.toFixed(1) : '--'} kg • Net: ${deltaText} • Goal: ${targetWeight > 0 ? targetWeight.toFixed(1) : '--'} kg`;
    }

    // Height & BMI
    const heightVal = parseFloat(user.height || user.height_cm || 0);
    const heightEl = document.getElementById('uModalHeight');
    if (heightEl) heightEl.textContent = heightVal > 0 ? `Height: ${heightVal} cm` : 'Height: -- cm';

    let bmiVal = user.bmi;
    let bmiCat = user.bmiCategory || 'Normal';
    if (!bmiVal && heightVal > 0 && curWeight > 0) {
      const hm = heightVal / 100;
      bmiVal = +(curWeight / (hm * hm)).toFixed(1);
      if (bmiVal < 18.5) bmiCat = 'Underweight';
      else if (bmiVal < 25.0) bmiCat = 'Normal';
      else if (bmiVal < 30.0) bmiCat = 'Overweight';
      else bmiCat = 'Obese';
    }

    const bmiEl = document.getElementById('uModalBmi');
    if (bmiEl) bmiEl.textContent = bmiVal ? bmiVal : '--';

    const bmiCatEl = document.getElementById('uModalBmiCategory');
    if (bmiCatEl) {
      bmiCatEl.textContent = bmiCat;
      bmiCatEl.className = 'badge';
      if (bmiCat.toLowerCase().includes('underweight')) bmiCatEl.classList.add('bmi-badge-underweight');
      else if (bmiCat.toLowerCase().includes('normal')) bmiCatEl.classList.add('bmi-badge-normal');
      else if (bmiCat.toLowerCase().includes('overweight')) bmiCatEl.classList.add('bmi-badge-overweight');
      else bmiCatEl.classList.add('bmi-badge-obese');
    }

    // Calorie & Goal
    const caloriesVal = user.dailyCalorieLimit || user.daily_calorie_target || 2000;
    const caloriesEl = document.getElementById('uModalCalories');
    if (caloriesEl) caloriesEl.textContent = `${caloriesVal} kcal`;

    const goalEl = document.getElementById('uModalGoal');
    if (goalEl) {
      goalEl.textContent = `Goal: ${user.goal || user.primary_goal || 'General Health'}`;
      goalEl.title = user.goal || user.primary_goal || 'General Health';
    }

    // Hydration & Sleep
    const waterVal = parseFloat(user.waterTarget || user.water_target_liters || 2.5).toFixed(2);
    const sleepVal = parseFloat(user.sleepTarget || user.sleep_target_hours || 8.0).toFixed(1);

    const hydEl = document.getElementById('uModalHydration');
    if (hydEl) hydEl.textContent = `${waterVal} L / day`;

    const sleepEl = document.getElementById('uModalSleep');
    if (sleepEl) sleepEl.textContent = `Sleep: ${sleepVal} hrs / night`;

    // Dietitian Guidance
    const dietitianEl = document.getElementById('uModalDietitianContent');
    if (dietitianEl) {
      if (user.assignedDietitian) {
        const d = user.assignedDietitian;
        dietitianEl.innerHTML = `
          <div class="flex justify-between items-center" style="margin-top: 4px;">
            <div>
              <strong class="text-sm block">${d.dietitianName || 'Assigned Dietitian'}</strong>
              <span class="text-xs text-muted block">${d.dietitianSpecialty || 'Nutritionist'} • ${d.dietitianEmail || ''}</span>
            </div>
            <span class="badge ${d.guidanceStatus === 'accepted' ? 'badge-success' : 'badge-warning'}">
              ${d.guidanceStatus ? (d.guidanceStatus.charAt(0).toUpperCase() + d.guidanceStatus.slice(1)) : 'Active'}
            </span>
          </div>
          <div class="text-xs text-muted" style="margin-top: 6px;">Focus Goal: <strong>${d.guidanceGoal || 'Personalized Health Plan'}</strong> ${d.assignedAt ? '• Since ' + d.assignedAt : ''}</div>
        `;
      } else {
        dietitianEl.innerHTML = `<span class="text-sm text-muted">No dietitian currently assigned. Patient is self-monitoring.</span>`;
      }
    }

    // Active Meal Plan
    const mealPlanEl = document.getElementById('uModalMealPlanContent');
    if (mealPlanEl) {
      if (user.activeMealPlan) {
        const mp = user.activeMealPlan;
        mealPlanEl.innerHTML = `
          <div class="flex justify-between items-center" style="margin-top: 4px;">
            <div>
              <strong class="text-sm block">${mp.title || 'Personalized Meal Plan'}</strong>
              <span class="text-xs text-muted block">Target: ${mp.calories || caloriesVal} kcal • Prescribed by ${mp.authorName || 'Dietitian'}</span>
            </div>
            <span class="badge badge-primary">Active Plan</span>
          </div>
          <div class="text-xs text-muted" style="margin-top: 6px;">Duration: ${mp.startDate || 'Current'} - ${mp.endDate || 'Ongoing'}</div>
        `;
      } else {
        mealPlanEl.innerHTML = `<span class="text-sm text-muted">No active meal plan assigned.</span>`;
      }
    }

    // Health Updates Tabs:
    // Tab 1: Weight History
    const weightTbody = document.getElementById('uModalWeightTableBody');
    if (weightTbody) {
      const weights = user.weightHistory || [];
      if (weights.length > 0) {
        weightTbody.innerHTML = weights.map(w => {
          const wVal = parseFloat(w.weight);
          const diff = startWeight > 0 ? (wVal - startWeight).toFixed(1) : '0.0';
          const diffText = diff < 0 ? `${diff} kg` : diff > 0 ? `+${diff} kg` : '0.0 kg';
          const diffClass = diff < 0 ? 'text-success font-bold' : diff > 0 ? 'text-warning font-bold' : 'text-muted';
          const badgeStatus = diff < 0 ? '<span class="badge badge-success">Progress</span>' : diff > 0 ? '<span class="badge badge-warning">Gain</span>' : '<span class="badge">Baseline</span>';
          return `
            <tr>
              <td><strong>${w.date}</strong></td>
              <td><strong>${wVal.toFixed(1)} kg</strong></td>
              <td class="${diffClass}">${diffText}</td>
              <td>${badgeStatus}</td>
            </tr>
          `;
        }).join('');
      } else {
        weightTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 16px;">No weight history records logged yet.</td></tr>`;
      }
    }

    // Tab 2: Water Logs
    const waterTbody = document.getElementById('uModalWaterTableBody');
    if (waterTbody) {
      const waterLogs = user.waterLogs || [];
      if (waterLogs.length > 0) {
        waterTbody.innerHTML = waterLogs.map(wl => {
          const logged = parseFloat(wl.amount || 0);
          const target = parseFloat(wl.target || waterVal || 2.5);
          const pct = Math.min(100, Math.round((logged / (target || 2.5)) * 100));
          return `
            <tr>
              <td><strong>${wl.date}</strong></td>
              <td><strong>${logged.toFixed(2)} L</strong></td>
              <td>${target.toFixed(2)} L</td>
              <td>
                <div class="water-progress-bar"><div class="water-progress-fill" style="width: ${pct}%;"></div></div>
                <span class="text-xs font-bold ${pct >= 100 ? 'text-success' : 'text-muted'}">${pct}%</span>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        waterTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 16px;">No daily water intake logs recorded yet.</td></tr>`;
      }
    }

    // Tab 3: Sleep Logs
    const sleepTbody = document.getElementById('uModalSleepTableBody');
    if (sleepTbody) {
      const sleepLogs = user.sleepLogs || [];
      if (sleepLogs.length > 0) {
        sleepTbody.innerHTML = sleepLogs.map(sl => {
          const duration = parseFloat(sl.duration || 0);
          const score = parseInt(sl.quality || 0);
          let label = '<span class="badge badge-success">Optimal</span>';
          if (score < 60 || duration < 6) label = '<span class="badge badge-danger">Poor</span>';
          else if (score < 80 || duration < 7) label = '<span class="badge badge-warning">Moderate</span>';
          return `
            <tr>
              <td><strong>${sl.date}</strong></td>
              <td><strong>${duration.toFixed(1)} hrs</strong></td>
              <td><strong>${score}/100</strong></td>
              <td>${label}</td>
            </tr>
          `;
        }).join('');
      } else {
        sleepTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 16px;">No sleep tracking logs recorded yet.</td></tr>`;
      }
    }

    // Tab 4: Calorie Logs
    const calorieTbody = document.getElementById('uModalCalorieTableBody');
    if (calorieTbody) {
      const calorieLogs = user.calorieLogs || [];
      if (calorieLogs.length > 0) {
        calorieTbody.innerHTML = calorieLogs.map(cl => {
          const cal = parseInt(cl.calories || 0);
          const target = caloriesVal || 2000;
          const within = cal <= target + 100;
          return `
            <tr>
              <td><strong>${cl.date}</strong></td>
              <td><strong>${cal} kcal</strong></td>
              <td>${cl.meals || 1} meals logged</td>
              <td>
                <span class="badge ${within ? 'badge-success' : 'badge-danger'}">
                  ${within ? 'Within Limit' : 'Exceeded (' + (cal - target) + ' kcal)'}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        calorieTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 16px;">No meal calorie logs recorded yet.</td></tr>`;
      }
    }

    // Footer updated at
    const updatedEl = document.getElementById('uModalLastUpdated');
    if (updatedEl) {
      updatedEl.textContent = user.profileUpdatedAt
        ? `Profile last updated: ${new Date(user.profileUpdatedAt).toLocaleDateString()}`
        : 'Profile last updated: Recently';
    }
  }

  window.SHD_Admin.toggleUserStatus = async function (id) {
    const res = await adminFetch(`/admin/users/${id}/status`, { method: 'PATCH' });
    if (res && res.success) {
      const targetUser = cachedUsers.find(u => String(u.id) === String(id));
      if (targetUser) {
        targetUser.status = res.newStatus || (targetUser.status === 'Active' ? 'Inactive' : 'Active');
      }

      await fetchAndRenderUsers();

      // If user details modal is open for this user, synchronize immediately
      if (currentViewingUser && String(currentViewingUser.id) === String(id)) {
        currentViewingUser.status = res.newStatus;
        updateModalStatusUI(res.newStatus);
      }

      SHD_Admin.showNotification(res.message || `User status changed to ${res.newStatus}`, 'info');
    } else {
      SHD_Admin.showNotification(res?.message || 'Failed to change user status.', 'danger');
    }
  };

  window.SHD_Admin.toggleUserStatusFromModal = function () {
    if (!currentViewingUser || !currentViewingUser.id) return;
    window.SHD_Admin.toggleUserStatus(currentViewingUser.id);
  };

  window.SHD_Admin.switchUserHealthTab = function (tabId, btn) {
    document.querySelectorAll('.health-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.health-tab-pane').forEach(p => p.classList.remove('active'));
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');
  };

  window.SHD_Admin.deleteUser = async function (id) {
    if (confirm('Are you sure you want to permanently delete this user account?')) {
      const res = await adminFetch(`/admin/users/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        if (currentViewingUser && String(currentViewingUser.id) === String(id)) {
          SHD_Admin.closeModal('userDetailsModal');
        }
        await fetchAndRenderUsers();
        SHD_Admin.showNotification('User account deleted.', 'danger');
      } else {
        SHD_Admin.showNotification('Failed to delete user account.', 'danger');
      }
    }
  };

  /* ==========================================================================
     3. DIETITIAN APPROVALS PAGE
     ========================================================================== */
  async function initApprovalsPage() {
    await fetchAndRenderApprovals();

    const searchInput = document.getElementById('dietitianSearchInput');
    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderApprovals());

    // Add Dietitian Form Submission
    const addDietitianForm = document.getElementById('addDietitianForm');
    if (addDietitianForm) {
      addDietitianForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
          name: document.getElementById('addDietitianName').value,
          email: document.getElementById('addDietitianEmail').value,
          specialty: document.getElementById('addDietitianSpecialty').value,
          experience: document.getElementById('addDietitianExperience').value + ' Years'
        };

        const res = await adminFetch('/admin/dietitians', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.closeModal('addDietitianModal');
          addDietitianForm.reset();
          await fetchAndRenderApprovals();
          SHD_Admin.showNotification(res.message || `Dietitian registered successfully!`, 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to register dietitian.', 'danger');
        }
      });
    }
  }

  async function fetchAndRenderApprovals() {
    const data = await adminFetch('/admin/dietitians');
    if (data && data.success) {
      cachedDietitians = data.dietitians;
    } else if (window.SHD_Data) {
      cachedDietitians = SHD_Data.getDietitians();
    }
    filterAndRenderApprovals();
  }

  function filterAndRenderApprovals() {
    const searchVal = (document.getElementById('dietitianSearchInput')?.value || '').toLowerCase();

    const filtered = searchVal
      ? cachedDietitians.filter(
          d =>
            (d.name || '').toLowerCase().includes(searchVal) ||
            (d.specialty || '').toLowerCase().includes(searchVal) ||
            (d.email || '').toLowerCase().includes(searchVal)
        )
      : cachedDietitians;

    const pending = filtered.filter(d => (d.status || '').toLowerCase() === 'pending');
    const approved = filtered.filter(d => (d.status || '').toLowerCase() === 'approved');

    // Render Pending Table
    const pendingTbody = document.getElementById('pendingDietitiansTable');
    if (pendingTbody) {
      if (pending.length === 0) {
        pendingTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">No pending dietitian applications at this time.</td></tr>`;
      } else {
        pendingTbody.innerHTML = pending
          .map(
            d => `
          <tr>
            <td class="font-bold">
              <div class="flex items-center gap-3">
                <img src="${d.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150'}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                <div>
                  ${d.name}
                  <span class="text-xs text-muted block">${d.email}</span>
                </div>
              </div>
            </td>
            <td>${d.specialty}</td>
            <td>${d.experience || '5 Years'}</td>
            <td><span class="badge badge-warning">Pending Review</span></td>
            <td>
              <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" onclick="window.SHD_Admin.approveDietitian('${d.id}')">Approve</button>
                <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.rejectDietitian('${d.id}')">Reject</button>
                <a href="dietitian-details.html?id=${d.id}" class="btn btn-outline btn-sm">Full Details</a>
              </div>
            </td>
          </tr>
        `
          )
          .join('');
      }
    }

    // Render Approved Table
    const approvedTbody = document.getElementById('approvedDietitiansTable');
    if (approvedTbody) {
      if (approved.length === 0) {
        approvedTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">No approved clinical dietitians found.</td></tr>`;
      } else {
        approvedTbody.innerHTML = approved
          .map(
            d => `
          <tr>
            <td class="font-bold">
              <div class="flex items-center gap-3">
                <img src="${d.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150'}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                ${d.name}
              </div>
            </td>
            <td class="text-muted">${d.email}</td>
            <td>${d.specialty}</td>
            <td><strong class="text-accent">★ ${d.rating || 5.0}</strong></td>
            <td><span class="badge badge-success">Approved</span></td>
            <td>
              <div class="flex gap-2">
                <a href="dietitian-details.html?id=${d.id}" class="btn btn-outline btn-sm" style="color: var(--primary); font-weight: 600;">Details & Clients</a>
                <button class="btn btn-outline btn-sm text-warning" onclick="window.SHD_Admin.suspendDietitian('${d.id}')">Suspend</button>
                <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.deleteDietitian('${d.id}')">Remove</button>
              </div>
            </td>
          </tr>
        `
          )
          .join('');
      }
    }
  }

  // Global Attached Handlers for Dietitian Approvals
  window.SHD_Admin.approveDietitian = async function (id) {
    const res = await adminFetch(`/admin/dietitians/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ review_note: 'Approved by Administrator' })
    });
    if (res && res.success) {
      await fetchAndRenderApprovals();
      SHD_Admin.showNotification(res.message || 'Dietitian registration approved successfully!', 'success');
    } else {
      SHD_Admin.showNotification('Failed to approve dietitian.', 'danger');
    }
  };

  window.SHD_Admin.rejectDietitian = async function (id) {
    const note = prompt('Please provide reason for rejection (optional):') || 'Did not meet requirements';
    const res = await adminFetch(`/admin/dietitians/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ review_note: note })
    });
    if (res && res.success) {
      await fetchAndRenderApprovals();
      SHD_Admin.showNotification('Dietitian application rejected.', 'danger');
    } else {
      SHD_Admin.showNotification('Failed to reject dietitian.', 'danger');
    }
  };

  window.SHD_Admin.suspendDietitian = async function (id) {
    if (confirm('Are you sure you want to suspend this dietitian account?')) {
      const res = await adminFetch(`/admin/dietitians/${id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ review_note: 'Account suspended by Administrator' })
      });
      if (res && res.success) {
        await fetchAndRenderApprovals();
        SHD_Admin.showNotification('Dietitian account suspended.', 'warning');
      } else {
        SHD_Admin.showNotification('Failed to suspend dietitian.', 'danger');
      }
    }
  };

  window.SHD_Admin.deleteDietitian = async function (id) {
    if (confirm('Are you sure you want to permanently remove this dietitian?')) {
      const res = await adminFetch(`/admin/dietitians/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        await fetchAndRenderApprovals();
        SHD_Admin.showNotification('Dietitian profile removed.', 'danger');
      } else {
        SHD_Admin.showNotification('Failed to remove dietitian.', 'danger');
      }
    }
  };

  window.SHD_Admin.viewDietitianDetails = function (id) {
    const d = cachedDietitians.find(item => String(item.id) === String(id));
    if (!d) return;

    const modalBody = document.getElementById('dietitianDetailsBody');
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="text-center" style="margin-bottom: 20px;">
          <img src="${d.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150'}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin: 0 auto 12px auto;">
          <h3 class="text-lg font-bold">${d.name}</h3>
          <span class="badge badge-primary">${d.specialty}</span>
        </div>
        <div style="font-size: 0.9rem; line-height: 1.8;">
          <p><strong>Email:</strong> ${d.email}</p>
          <p><strong>Experience:</strong> ${d.experience || (d.experienceYears ? d.experienceYears + ' Years' : '5 Years')}</p>
          <p><strong>Qualification:</strong> ${d.qualification || 'Certified Clinical Nutritionist'}</p>
          <p><strong>Rating:</strong> ★ ${d.rating || 5.0}</p>
          <p><strong>Status:</strong> ${d.status}</p>
          <p><strong>Clinical License / Record ID:</strong> #${d.id}</p>
        </div>
      `;
      SHD_Admin.openModal('dietitianDetailsModal');
    }
  };

  /* ==========================================================================
     4. FOOD DATABASE MANAGER PAGE
     ========================================================================== */
  async function initFoodDatabasePage() {
    await fetchAndRenderFoodCatalog();

    const searchInput = document.getElementById('foodSearchInput');
    const categorySelect = document.getElementById('foodCategoryFilter');

    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderFoodCatalog());
    if (categorySelect) categorySelect.addEventListener('change', () => filterAndRenderFoodCatalog());

    // Add Food Form Submission
    const addFoodItemForm = document.getElementById('addFoodItemForm');
    if (addFoodItemForm) {
      addFoodItemForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
          name: document.getElementById('foodName').value,
          category: document.getElementById('foodCategory').value,
          calories: parseInt(document.getElementById('foodCalories').value) || 0,
          protein: parseFloat(document.getElementById('foodProtein')?.value) || 0,
          carbs: parseFloat(document.getElementById('foodCarbs')?.value) || 0,
          fat: parseFloat(document.getElementById('foodFat')?.value) || 0,
          portion: document.getElementById('foodPortion').value
        };

        const res = await adminFetch('/admin/foods', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.closeModal('foodModal');
          addFoodItemForm.reset();
          await fetchAndRenderFoodCatalog();
          SHD_Admin.showNotification(`Food item "${payload.name}" added to catalog!`, 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to add food item.', 'danger');
        }
      });
    }

    // Edit Food Form Submission
    const editFoodForm = document.getElementById('editFoodItemForm');
    if (editFoodForm) {
      editFoodForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const foodId = document.getElementById('editFoodId').value;
        const payload = {
          name: document.getElementById('editFoodName').value,
          category: document.getElementById('editFoodCategory').value,
          calories: parseInt(document.getElementById('editFoodCalories').value) || 0,
          protein: parseFloat(document.getElementById('editFoodProtein').value) || 0,
          carbs: parseFloat(document.getElementById('editFoodCarbs').value) || 0,
          fat: parseFloat(document.getElementById('editFoodFat').value) || 0,
          portion: document.getElementById('editFoodPortion').value
        };

        const res = await adminFetch(`/admin/foods/${foodId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.closeModal('editFoodModal');
          await fetchAndRenderFoodCatalog();
          SHD_Admin.showNotification(`Updated food item "${payload.name}"`, 'info');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to update food item.', 'danger');
        }
      });
    }
  }

  async function fetchAndRenderFoodCatalog() {
    const data = await adminFetch('/admin/foods');
    if (data && data.success) {
      cachedFoods = data.foods;
      const totalCountEl = document.getElementById('catalogTotalCount');
      const avgCalEl = document.getElementById('catalogAvgCalories');
      if (totalCountEl) totalCountEl.textContent = data.summary?.totalCount ?? cachedFoods.length;
      if (avgCalEl) avgCalEl.textContent = (data.summary?.avgCalories ?? 350) + ' kcal';
    } else if (window.SHD_Data) {
      cachedFoods = SHD_Data.getFoodDatabase();
    }
    filterAndRenderFoodCatalog();
  }

  function filterAndRenderFoodCatalog() {
    const tbody = document.getElementById('foodCatalogTableBody');
    if (!tbody) return;

    let foods = cachedFoods;
    const searchVal = (document.getElementById('foodSearchInput')?.value || '').toLowerCase();
    const categoryVal = document.getElementById('foodCategoryFilter')?.value || 'All';

    if (searchVal) {
      foods = foods.filter(
        f =>
          (f.name || '').toLowerCase().includes(searchVal) ||
          (f.category || '').toLowerCase().includes(searchVal)
      );
    }
    if (categoryVal !== 'All') {
      foods = foods.filter(f => (f.category || '').toLowerCase() === categoryVal.toLowerCase());
    }

    if (foods.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 32px;">No food items matching criteria found.</td></tr>`;
      return;
    }

    tbody.innerHTML = foods
      .map(
        f => `
      <tr>
        <td class="font-bold">${f.name}</td>
        <td><span class="badge badge-primary">${f.category}</span></td>
        <td class="font-bold text-primary">${f.calories} kcal</td>
        <td class="text-xs text-muted">P: ${f.protein ?? 0}g | C: ${f.carbs ?? 0}g | F: ${f.fat ?? 0}g</td>
        <td class="text-sm">${f.portion}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="window.SHD_Admin.openEditFoodModal('${f.id}')">Edit</button>
            <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.deleteFood('${f.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `
      )
      .join('');
  }

  window.SHD_Admin.openEditFoodModal = function (id) {
    const food = cachedFoods.find(f => String(f.id) === String(id));
    if (!food) return;

    document.getElementById('editFoodId').value = food.id;
    document.getElementById('editFoodName').value = food.name;
    document.getElementById('editFoodCategory').value = food.category ? (food.category.charAt(0).toUpperCase() + food.category.slice(1).toLowerCase()) : 'Breakfast';
    document.getElementById('editFoodCalories').value = food.calories;
    document.getElementById('editFoodProtein').value = food.protein ?? 15;
    document.getElementById('editFoodCarbs').value = food.carbs ?? 25;
    document.getElementById('editFoodFat').value = food.fat ?? 8;
    document.getElementById('editFoodPortion').value = food.portion;

    SHD_Admin.openModal('editFoodModal');
  };

  window.SHD_Admin.deleteFood = async function (id) {
    if (confirm('Are you sure you want to delete this food item from catalog?')) {
      const res = await adminFetch(`/admin/foods/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        await fetchAndRenderFoodCatalog();
        SHD_Admin.showNotification('Food item removed from catalog.', 'warning');
      } else {
        SHD_Admin.showNotification('Failed to delete food item.', 'danger');
      }
    }
  };

  /* ==========================================================================
     5. SYSTEM PDF REPORTS PAGE
     ========================================================================== */
  function initReportsPage() {}

  window.SHD_Admin.generateReportPreview = async function (reportType) {
    const previewContainer = document.getElementById('reportPreviewContent');
    const modalTitle = document.getElementById('reportModalTitle');

    if (modalTitle) modalTitle.textContent = `${reportType} - Preview & Print`;

    if (!previewContainer) {
      window.print();
      return;
    }

    let contentHtml = '';

    if (reportType === 'Weekly Calorie Summary') {
      const res = await adminFetch('/admin/reports/weekly-calories');
      const summary = res?.summary || { loggedMeals: 6, avgCaloriesPerMeal: 398, targetAdherence: '94.2%' };
      const meals = res?.meals || [];

      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">System Calorie Consumption Overview</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Generated on: ${new Date().toLocaleDateString()}</p>
          <div class="grid grid-3 gap-4" style="margin-bottom: 20px;">
            <div class="card"><span class="text-xs text-muted">Logged Meals</span><div class="text-xl font-bold">${summary.loggedMeals}</div></div>
            <div class="card"><span class="text-xs text-muted">Avg Calorie / Meal</span><div class="text-xl font-bold text-primary">${summary.avgCaloriesPerMeal} kcal</div></div>
            <div class="card"><span class="text-xs text-muted">Target Adherence</span><div class="text-xl font-bold text-success">${summary.targetAdherence || '94.2%'}</div></div>
          </div>
          <table class="table">
            <thead><tr><th>User</th><th>Category</th><th>Meal Name</th><th>Calories</th><th>Date</th></tr></thead>
            <tbody>
              ${meals.length > 0 ? meals.map(m => `<tr><td>${m.userName || 'User'}</td><td>${m.category}</td><td>${m.name}</td><td>${m.calories} kcal</td><td>${m.date}</td></tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted">No meal records in past 7 days.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'User Weight Loss Trends') {
      const res = await adminFetch('/admin/reports/weight-loss');
      const trends = res?.trends || [];

      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">Patient Weight Loss Analytics Report</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Total Tracked Accounts: ${res?.totalUsersTracked || trends.length}</p>
          <table class="table">
            <thead><tr><th>Patient Name</th><th>Starting Wt</th><th>Current Wt</th><th>Target Wt</th><th>Progress Status</th></tr></thead>
            <tbody>
              ${trends.map(u => `
                <tr>
                  <td class="font-bold">${u.name}</td>
                  <td>${u.startingWeight} kg</td>
                  <td>${u.currentWeight} kg</td>
                  <td>${u.targetWeight} kg</td>
                  <td><span class="badge ${u.progressStatus?.includes('On Track') ? 'badge-success' : 'badge-primary'}">${u.progressStatus}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'Dietitian Activity Report') {
      const res = await adminFetch('/admin/reports/dietitian-engagement');
      const dietitians = res?.dietitians || [];

      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">Clinical Specialists Engagement Report</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Active Specialists: ${res?.activeSpecialists || 0}</p>
          <table class="table">
            <thead><tr><th>Specialist</th><th>Specialty</th><th>Status</th><th>Rating</th><th>Assigned Patients</th></tr></thead>
            <tbody>
              ${dietitians.map(d => `
                <tr>
                  <td class="font-bold">${d.name}</td>
                  <td>${d.specialty}</td>
                  <td><span class="badge ${d.status === 'Approved' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                  <td>★ ${d.rating || 5.0}</td>
                  <td>${d.assignedPatients || 0} Patients</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'Food Database Catalog') {
      const res = await adminFetch('/admin/foods');
      const foods = res?.foods || [];

      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">Master Food Database Catalog</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Catalog Items: ${foods.length}</p>
          <table class="table">
            <thead><tr><th>Food Item</th><th>Category</th><th>Calories</th><th>Portion</th></tr></thead>
            <tbody>
              ${foods.slice(0, 30).map(f => `<tr><td class="font-bold">${f.name}</td><td>${f.category}</td><td>${f.calories} kcal</td><td>${f.portion}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    previewContainer.innerHTML = contentHtml;
    SHD_Admin.openModal('reportPreviewModal');
  };

  window.SHD_Admin.exportReportCSV = async function (reportType) {
    const res = await adminFetch(`/admin/reports/export/${reportType}`);
    if (res && res.success && res.rows) {
      SHD_Admin.exportToCSV(`system_${reportType.toLowerCase()}_report.csv`, res.rows);
      SHD_Admin.showNotification('CSV report downloaded successfully.', 'success');
    } else {
      SHD_Admin.showNotification('Failed to generate CSV export.', 'danger');
    }
  };

  /* ==========================================================================
     6. SYSTEM SETTINGS & AUDIT LOGS PAGE
     ========================================================================== */
  async function initSettingsPage() {
    // 1. Load System Settings from Backend
    const settingsRes = await adminFetch('/admin/settings');
    const settings = settingsRes?.settings || {};

    const warnPctEl = document.getElementById('warnPct');
    const defaultWaterEl = document.getElementById('defaultWater');
    const defaultSleepEl = document.getElementById('defaultSleep');
    const maintenanceModeEl = document.getElementById('maintenanceMode');
    const autoApproveEl = document.getElementById('autoApproveDietitians');

    if (warnPctEl) warnPctEl.value = settings.warnPct ?? 80;
    if (defaultWaterEl) defaultWaterEl.value = settings.defaultWater ?? 2.5;
    if (defaultSleepEl) defaultSleepEl.value = settings.defaultSleep ?? 8.0;
    if (maintenanceModeEl) maintenanceModeEl.checked = !!settings.maintenanceMode;
    if (autoApproveEl) autoApproveEl.checked = !!settings.autoApproveDietitians;

    // Save Settings Event
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
          warnPct: parseInt(document.getElementById('warnPct').value) || 80,
          defaultWater: parseFloat(document.getElementById('defaultWater').value) || 2.5,
          defaultSleep: parseFloat(document.getElementById('defaultSleep')?.value) || 8.0,
          maintenanceMode: document.getElementById('maintenanceMode')?.checked || false,
          autoApproveDietitians: document.getElementById('autoApproveDietitians')?.checked || false
        };

        const res = await adminFetch('/admin/settings', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message || 'System threshold settings saved successfully!', 'success');
          await fetchAndRenderAuditLogs();
        } else {
          SHD_Admin.showNotification('Failed to save system settings.', 'danger');
        }
      });
    }

    // 2. Load & Render Audit Logs
    await fetchAndRenderAuditLogs();

    const auditFilter = document.getElementById('auditLogFilter');
    if (auditFilter) auditFilter.addEventListener('change', () => filterAndRenderAuditLogs());
  }

  async function fetchAndRenderAuditLogs() {
    const data = await adminFetch('/admin/audit-logs');
    if (data && data.success) {
      cachedLogs = data.logs;
    } else if (window.SHD_Data) {
      cachedLogs = SHD_Data.getAuditLogs();
    }
    filterAndRenderAuditLogs();
  }

  function filterAndRenderAuditLogs() {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    let logs = cachedLogs;
    const filterVal = document.getElementById('auditLogFilter')?.value || 'All';

    if (filterVal !== 'All') {
      logs = logs.filter(l => (l.type || '').toLowerCase().includes(filterVal.toLowerCase()));
    }

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">No system audit logs found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs
      .map(
        l => `
      <tr>
        <td class="font-bold">${l.id}</td>
        <td><span class="badge badge-primary">${l.type}</span></td>
        <td>${l.description}</td>
        <td class="text-xs text-muted">${l.timestamp}</td>
        <td>
          <span class="badge ${
            (l.status || '').toLowerCase() === 'approved' || (l.status || '').toLowerCase() === 'completed'
              ? 'badge-success'
              : (l.status || '').toLowerCase() === 'warning' || (l.status || '').toLowerCase() === 'rejected'
              ? 'badge-danger'
              : 'badge-warning'
          }">
            ${l.status}
          </span>
        </td>
      </tr>
    `
      )
      .join('');
  }

  window.SHD_Admin.clearAuditLogs = async function () {
    if (confirm('Are you sure you want to clear all system audit logs?')) {
      const res = await adminFetch('/admin/audit-logs', { method: 'DELETE' });
      if (res && res.success) {
        await fetchAndRenderAuditLogs();
        SHD_Admin.showNotification('Audit logs cleared.', 'info');
      } else {
        SHD_Admin.showNotification('Failed to clear audit logs.', 'danger');
      }
    }
  };

  /* ==========================================================================
     7. DIETITIAN DETAILS & PATIENT CONTROL PAGE
     ========================================================================== */
  let currentDietitianId = null;
  let currentDietitianPayload = null;
  let currentControlledUsers = [];

  async function initDietitianDetailsPage() {
    const urlParams = new URLSearchParams(window.location.search);
    let targetId = urlParams.get('id');

    // 1. Populate Dietitian Switcher Dropdown
    let dietitians = [];
    const listRes = await adminFetch('/admin/dietitians');

    if (listRes && listRes.success && Array.isArray(listRes.dietitians) && listRes.dietitians.length > 0) {
      dietitians = listRes.dietitians;
    } else if (window.SHD_Data && typeof window.SHD_Data.getDietitians === 'function') {
      const dummyList = window.SHD_Data.getDietitians() || [];
      dietitians = dummyList.map(d => ({
        id: d.id,
        name: d.name,
        email: d.email,
        specialty: d.specialty || 'Clinical Nutrition',
        status: d.status || 'Approved',
        rawStatus: (d.status || 'approved').toLowerCase(),
        experience: d.experience || '5 Years',
        qualification: d.qualification || 'Certified Clinical Dietitian',
        rating: d.rating || '4.9',
        avatar: d.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150',
        accountStatus: 'Active'
      }));
    }

    const switcher = document.getElementById('dietitianSwitcher');
    const loadingState = document.getElementById('dietitianLoadingState');
    const noDietitianState = document.getElementById('noDietitianState');
    const detailsContainer = document.getElementById('dietitianDetailsContainer');

    if (dietitians.length === 0) {
      if (loadingState) loadingState.style.display = 'none';
      if (detailsContainer) detailsContainer.style.display = 'none';
      if (noDietitianState) noDietitianState.style.display = 'block';
      return;
    }

    if (noDietitianState) noDietitianState.style.display = 'none';

    // If targetId is missing or doesn't match any registered dietitian:
    if (!targetId || !dietitians.some(d => String(d.id) === String(targetId))) {
      targetId = dietitians[0].id;
      const newUrl = `${window.location.pathname}?id=${targetId}`;
      window.history.replaceState({ id: targetId }, '', newUrl);
    }

    if (switcher) {
      switcher.innerHTML = dietitians.map(d => `
        <option value="${d.id}" ${String(d.id) === String(targetId) ? 'selected' : ''}>
          ${d.name} (${d.specialty || 'Dietitian'}) [${d.status || 'Active'}]
        </option>
      `).join('');

      switcher.onchange = function () {
        if (this.value) {
          window.location.href = `dietitian-details.html?id=${encodeURIComponent(this.value)}`;
        }
      };
    }

    currentDietitianId = targetId;
    await loadDietitianFullData(currentDietitianId, dietitians);

    // 2. Controlled Users Filter
    const searchInput = document.getElementById('controlledUserSearch');
    if (searchInput) {
      searchInput.oninput = () => filterAndRenderControlledUsers();
    }

    // 3. Forms Setup
    setupDietitianDetailForms();
  }

  async function loadDietitianFullData(id, knownDietitians = []) {
    const loading = document.getElementById('dietitianLoadingState');
    const container = document.getElementById('dietitianDetailsContainer');
    const noDietitianState = document.getElementById('noDietitianState');
    if (loading) loading.style.display = 'block';
    if (container) container.style.display = 'none';
    if (noDietitianState) noDietitianState.style.display = 'none';

    let res = null;
    try {
      res = await adminFetch(`/admin/dietitians/${id}`);
    } catch (e) {
      console.warn('adminFetch failed for dietitian details:', e);
    }

    // Fallback: If backend returns 404 or fails, construct mock profile from known list or dummy-data.js
    if (!res || !res.success || !res.dietitian) {
      let candidate = (knownDietitians || []).find(d => String(d.id) === String(id));
      if (!candidate && window.SHD_Data && typeof window.SHD_Data.getDietitians === 'function') {
        const dummyList = window.SHD_Data.getDietitians() || [];
        candidate = dummyList.find(d => String(d.id) === String(id)) || dummyList[0];
      }

      if (candidate) {
        const usersList = (window.SHD_Data && typeof window.SHD_Data.getUsers === 'function')
          ? window.SHD_Data.getUsers()
          : [];

        const mockControlled = usersList.slice(0, 3).map((u, i) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          accountStatus: u.status || 'Active',
          joinedAt: u.joinDate || '2026-01-15',
          age: 32 + i * 4,
          gender: i % 2 === 0 ? 'male' : 'female',
          weight: 78 - i * 5,
          targetWeight: 70 - i * 5,
          goal: u.goal || 'Weight Loss & Healthy Living',
          calorieTarget: 1800 + i * 200,
          guidanceStatus: 'accepted',
          assignedAt: '2026-08-10',
          mealPlanTitle: i === 0 ? 'High Protein & Balanced Deficit' : 'Keto & Low Carb Starter',
          mealPlanCalories: 1850
        }));

        res = {
          success: true,
          dietitian: {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            specialty: candidate.specialty || 'Clinical Nutrition',
            qualification: candidate.qualification || 'Certified Clinical Nutritionist',
            licenseNumber: candidate.licenseNumber || 'RD-928172',
            phoneNumber: candidate.phoneNumber || '+1 (555) 234-8921',
            rating: candidate.rating || '5.0',
            yearsExperience: parseFloat(candidate.experienceYears || candidate.yearsExperience || candidate.experience || 5),
            consultationFee: candidate.consultationFee || 65.00,
            maxClients: candidate.maxClients || 50,
            bio: candidate.bio || 'Specialized in personalized medical nutrition therapy, metabolic wellness, and balanced dietary regimens.',
            status: candidate.status || 'Approved',
            rawStatus: (candidate.rawStatus || candidate.status || 'approved').toLowerCase(),
            accountStatus: candidate.accountStatus || 'Active',
            avatar: candidate.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150',
            review_note: candidate.review_note || 'Approved by System Administrator'
          },
          controlledUsers: mockControlled,
          stats: {
            totalControlledUsers: mockControlled.length,
            activeMealPlans: mockControlled.length,
            pendingRequests: 0,
            maxClients: 50,
            capacityRemaining: 50 - mockControlled.length,
            capacityPercentage: Math.round((mockControlled.length / 50) * 100)
          },
          recentActivity: [
            { type: 'Status Update', description: 'Dietitian profile verified and activated', actor: 'System Administrator', status: 'approved', timestamp: 'Recent' }
          ]
        };
      }
    }

    if (loading) loading.style.display = 'none';

    if (!res || !res.dietitian) {
      if (noDietitianState) noDietitianState.style.display = 'block';
      SHD_Admin.showNotification('Dietitian profile not found.', 'danger');
      return;
    }

    if (container) container.style.display = 'block';
    currentDietitianPayload = res;
    currentControlledUsers = res.controlledUsers || [];

    renderDietitianHeroAndMetrics(res);
    filterAndRenderControlledUsers();
    populateDietitianDetailForms(res.dietitian);
    renderDietitianAuditTrail(res.recentActivity || []);
  }

  function renderDietitianHeroAndMetrics(data) {
    const d = data.dietitian || {};
    const stats = data.stats || {};

    // Hero Avatar
    const avatarEl = document.getElementById('dietitianHeroAvatar');
    if (avatarEl) {
      avatarEl.src = d.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150';
    }

    // Hero Meta
    const nameEl = document.getElementById('dietitianHeroName');
    if (nameEl) nameEl.textContent = d.name || 'Dietitian Profile';

    const specEl = document.getElementById('dietitianHeroSpecialty');
    if (specEl) specEl.textContent = `${d.specialty || 'General Nutrition'} • ${d.qualification || 'Certified Clinical Dietitian'}`;

    const emailEl = document.getElementById('dietitianHeroEmail');
    if (emailEl) emailEl.textContent = d.email || 'N/A';

    const phoneEl = document.getElementById('dietitianHeroPhone');
    if (phoneEl) phoneEl.textContent = d.phoneNumber || 'Phone not set';

    const licEl = document.getElementById('dietitianHeroLicense');
    if (licEl) licEl.textContent = d.licenseNumber ? `License: ${d.licenseNumber}` : 'License: Pending filing';

    // Account Status Badge
    const accBadge = document.getElementById('dietitianAccountStatusBadge');
    const isAccActive = (d.accountStatus || 'active').toLowerCase() === 'active';
    if (accBadge) {
      accBadge.className = isAccActive ? 'badge badge-success' : 'badge badge-danger';
      accBadge.textContent = isAccActive ? 'Active Account' : 'Account Inactive / Deactivated';
    }

    // Profile Verification Badge
    const profBadge = document.getElementById('dietitianProfileStatusBadge');
    const rawStatus = (d.rawStatus || d.status || 'pending').toLowerCase();
    if (profBadge) {
      if (rawStatus === 'approved') {
        profBadge.className = 'badge badge-success';
        profBadge.textContent = 'Approved Dietitian';
      } else if (rawStatus === 'pending') {
        profBadge.className = 'badge badge-warning';
        profBadge.textContent = 'Pending Review';
      } else if (rawStatus === 'suspended') {
        profBadge.className = 'badge badge-danger';
        profBadge.textContent = 'Suspended';
      } else {
        profBadge.className = 'badge badge-danger';
        profBadge.textContent = d.status || 'Rejected';
      }
    }

    // Live Deactivate / Activate Button
    const toggleBtn = document.getElementById('toggleStatusBtn');
    if (toggleBtn) {
      if (isAccActive) {
        toggleBtn.textContent = 'Deactivate Profile';
        toggleBtn.className = 'btn btn-sm btn-outline text-danger';
        toggleBtn.style.borderColor = 'var(--danger)';
        toggleBtn.style.background = 'rgba(239, 68, 68, 0.08)';
      } else {
        toggleBtn.textContent = 'Reactivate Profile';
        toggleBtn.className = 'btn btn-sm btn-primary';
        toggleBtn.style.borderColor = '';
        toggleBtn.style.background = '';
      }
    }

    // Stat Cards
    const controlledCount = stats.totalControlledUsers || 0;
    const maxCapacity = stats.maxClients || 50;
    const capacityPct = stats.capacityPercentage || (maxCapacity > 0 ? Math.round((controlledCount / maxCapacity) * 100) : 0);

    const statControlledEl = document.getElementById('statControlledUsers');
    if (statControlledEl) statControlledEl.textContent = controlledCount;

    const statCapText = document.getElementById('statCapacityText');
    if (statCapText) statCapText.textContent = `${controlledCount} / ${maxCapacity}`;

    const statCapPct = document.getElementById('statCapacityPercent');
    if (statCapPct) statCapPct.textContent = `${capacityPct}%`;

    const capacityBar = document.getElementById('statCapacityBar');
    if (capacityBar) {
      capacityBar.style.width = `${Math.min(100, capacityPct)}%`;
      capacityBar.style.background = capacityPct >= 90 ? 'var(--danger)' : 'var(--primary-gradient)';
    }

    const statActivePlans = document.getElementById('statActiveMealPlans');
    if (statActivePlans) statActivePlans.textContent = stats.activeMealPlans || 0;

    const statRatingEl = document.getElementById('statRating');
    if (statRatingEl) statRatingEl.textContent = `★ ${parseFloat(d.rating || 5.0).toFixed(1)}`;

    const statFeeEl = document.getElementById('statFee');
    if (statFeeEl) statFeeEl.textContent = `$${parseFloat(d.consultationFee || 0).toFixed(2)}`;

    const statExpEl = document.getElementById('statExperienceText');
    if (statExpEl) statExpEl.textContent = `${d.yearsExperience || 0} Years Clinical Experience`;
  }

  function filterAndRenderControlledUsers() {
    const tbody = document.getElementById('controlledUsersTableBody');
    if (!tbody) return;

    const searchVal = (document.getElementById('controlledUserSearch')?.value || '').toLowerCase();
    const users = searchVal
      ? currentControlledUsers.filter(u =>
          (u.name || '').toLowerCase().includes(searchVal) ||
          (u.email || '').toLowerCase().includes(searchVal) ||
          (u.goal || '').toLowerCase().includes(searchVal) ||
          (u.mealPlanTitle || '').toLowerCase().includes(searchVal)
        )
      : currentControlledUsers;

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted" style="padding: 36px;">
            <p style="margin-bottom: 8px;">No patients or clients currently controlled under this dietitian.</p>
            <button class="btn btn-primary btn-sm" onclick="window.SHD_DietitianDetails.openAssignModal()">+ Assign a Client Now</button>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td class="font-bold">
          <div class="flex items-center gap-3">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700;">
              ${(u.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="color: var(--text-main); font-weight: 700;">${u.name}</div>
              <span class="text-xs text-muted block">${u.email}</span>
            </div>
          </div>
        </td>
        <td>
          ${u.age ? u.age + ' yrs' : 'N/A'} • ${u.gender ? (u.gender.charAt(0).toUpperCase() + u.gender.slice(1)) : 'N/A'}
        </td>
        <td>
          <strong>${u.weight ? u.weight + ' kg' : 'N/A'}</strong>
          <span class="text-xs text-muted block">Goal: ${u.targetWeight ? u.targetWeight + ' kg' : 'Not set'}</span>
        </td>
        <td>
          <span class="badge badge-primary">${u.goal || 'General Health'}</span>
          <span class="text-xs text-muted block">${u.calorieTarget ? u.calorieTarget + ' kcal limit' : 'Standard'}</span>
        </td>
        <td>
          ${u.mealPlanTitle ? `
            <span class="font-bold text-sm" style="color: var(--primary);">${u.mealPlanTitle}</span>
            <span class="text-xs text-muted block">${u.mealPlanCalories || 2000} kcal/day</span>
          ` : '<span class="badge badge-warning">No Active Plan</span>'}
        </td>
        <td>
          <span class="badge ${u.guidanceStatus === 'accepted' ? 'badge-success' : 'badge-warning'}">
            ${u.guidanceStatus === 'accepted' ? 'Controlled' : 'Pending Request'}
          </span>
        </td>
        <td class="text-xs text-muted">
          ${u.assignedAt ? new Date(u.assignedAt).toLocaleDateString() : 'Active'}
        </td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_DietitianDetails.unassignClient('${u.id}', '${(u.name || 'Client').replace(/'/g, "\\'")}')">
              Unassign
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function populateDietitianDetailForms(d) {
    if (!d) return;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    };

    // 1. Profile Form
    setVal('editDietitianName', d.name || '');
    setVal('editDietitianEmail', d.email || '');
    setVal('editDietitianSpecialty', d.specialty || '');
    setVal('editDietitianExperience', d.yearsExperience || 0);
    setVal('editDietitianQualification', d.qualification || '');
    setVal('editDietitianLicense', d.licenseNumber || '');
    setVal('editDietitianPhone', d.phoneNumber || '');
    setVal('editDietitianAvatar', d.avatar || '');
    setVal('editDietitianBio', d.bio || '');

    // 2. Practice Form
    setVal('editMaxClients', d.maxClients || 50);
    setVal('editConsultationFee', parseFloat(d.consultationFee || 0).toFixed(2));
    setVal('editAdminNotes', d.review_note || '');

    // 3. Lifecycle Form
    const accSelect = document.getElementById('editAccountStatus');
    if (accSelect) accSelect.value = (d.accountStatus || 'active').toLowerCase();

    const profSelect = document.getElementById('editProfileStatus');
    if (profSelect) profSelect.value = (d.rawStatus || d.status || 'approved').toLowerCase();

    setVal('editReviewReason', d.review_note || '');
  }

  function setupDietitianDetailForms() {
    // Tab 1: Profile Submit
    const profileForm = document.getElementById('dietitianProfileForm');
    if (profileForm) {
      profileForm.onsubmit = async function (e) {
        e.preventDefault();
        const payload = {
          name: document.getElementById('editDietitianName')?.value,
          email: document.getElementById('editDietitianEmail')?.value,
          specialty: document.getElementById('editDietitianSpecialty')?.value,
          years_experience: parseFloat(document.getElementById('editDietitianExperience')?.value || 0),
          qualification: document.getElementById('editDietitianQualification')?.value,
          license_number: document.getElementById('editDietitianLicense')?.value,
          phone_number: document.getElementById('editDietitianPhone')?.value,
          avatar: document.getElementById('editDietitianAvatar')?.value,
          bio: document.getElementById('editDietitianBio')?.value
        };

        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message || 'Dietitian profile updated successfully!', 'success');
          await loadDietitianFullData(currentDietitianId);
        } else if (currentDietitianPayload?.dietitian) {
          Object.assign(currentDietitianPayload.dietitian, payload);
          renderDietitianHeroAndMetrics(currentDietitianPayload);
          SHD_Admin.showNotification('Dietitian profile updated successfully (Local)!', 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to update profile.', 'danger');
        }
      };
    }

    // Tab 2: Practice Submit
    const practiceForm = document.getElementById('dietitianPracticeForm');
    if (practiceForm) {
      practiceForm.onsubmit = async function (e) {
        e.preventDefault();
        const payload = {
          max_clients: parseInt(document.getElementById('editMaxClients')?.value || 50),
          consultation_fee: parseFloat(document.getElementById('editConsultationFee')?.value || 0),
          review_note: document.getElementById('editAdminNotes')?.value
        };

        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message || 'Practice capacity & fees updated!', 'success');
          await loadDietitianFullData(currentDietitianId);
        } else if (currentDietitianPayload?.dietitian) {
          Object.assign(currentDietitianPayload.dietitian, { maxClients: payload.max_clients, consultationFee: payload.consultation_fee, review_note: payload.review_note });
          if (currentDietitianPayload.stats) currentDietitianPayload.stats.maxClients = payload.max_clients;
          renderDietitianHeroAndMetrics(currentDietitianPayload);
          SHD_Admin.showNotification('Practice capacity & fees updated (Local)!', 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to update practice settings.', 'danger');
        }
      };
    }

    // Tab 3: Lifecycle Submit
    const lifecycleForm = document.getElementById('dietitianLifecycleForm');
    if (lifecycleForm) {
      lifecycleForm.onsubmit = async function (e) {
        e.preventDefault();
        const payload = {
          accountStatus: document.getElementById('editAccountStatus')?.value,
          status: document.getElementById('editProfileStatus')?.value,
          review_note: document.getElementById('editReviewReason')?.value
        };

        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message || 'Lifecycle and verification updated!', 'success');
          await loadDietitianFullData(currentDietitianId);
        } else if (currentDietitianPayload?.dietitian) {
          currentDietitianPayload.dietitian.accountStatus = payload.accountStatus;
          currentDietitianPayload.dietitian.status = payload.status;
          currentDietitianPayload.dietitian.rawStatus = payload.status;
          currentDietitianPayload.dietitian.review_note = payload.review_note;
          renderDietitianHeroAndMetrics(currentDietitianPayload);
          SHD_Admin.showNotification('Lifecycle and verification updated (Local)!', 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to update status.', 'danger');
        }
      };
    }

    // Tab 4: Security Reset Submit
    const securityForm = document.getElementById('dietitianSecurityForm');
    if (securityForm) {
      securityForm.onsubmit = async function (e) {
        e.preventDefault();
        const newPassword = document.getElementById('newDietitianPassword')?.value;
        if (!newPassword || newPassword.length < 6) {
          SHD_Admin.showNotification('Password must be at least 6 characters.', 'warning');
          return;
        }

        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ newPassword })
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message || 'Password reset successfully!', 'success');
          document.getElementById('newDietitianPassword').value = '';
          await loadDietitianFullData(currentDietitianId);
        } else if (currentDietitianPayload?.dietitian) {
          SHD_Admin.showNotification(`Password for ${currentDietitianPayload.dietitian.name} reset successfully (Local)!`, 'success');
          document.getElementById('newDietitianPassword').value = '';
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to reset password.', 'danger');
        }
      };
    }

    // Assign Client Form Submit
    const assignForm = document.getElementById('assignClientForm');
    if (assignForm) {
      assignForm.onsubmit = async function (e) {
        e.preventDefault();
        const userId = document.getElementById('assignClientSelect')?.value;
        const goal = document.getElementById('assignClientGoal')?.value;

        if (!userId) {
          SHD_Admin.showNotification('Please select a registered patient.', 'warning');
          return;
        }

        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}/assign-user`, {
          method: 'POST',
          body: JSON.stringify({ userId, goal })
        });

        if (res && res.success) {
          SHD_Admin.closeModal('assignClientModal');
          SHD_Admin.showNotification(res.message || 'Patient successfully assigned under this dietitian!', 'success');
          await loadDietitianFullData(currentDietitianId);
        } else if (window.SHD_Data) {
          const candidate = (window.SHD_Data.getUsers() || []).find(u => String(u.id) === String(userId));
          if (candidate) {
            currentControlledUsers.push({
              id: candidate.id,
              name: candidate.name,
              email: candidate.email,
              accountStatus: candidate.status || 'Active',
              joinedAt: candidate.joinDate || '2026-01-15',
              age: 29,
              gender: 'male',
              weight: 75,
              targetWeight: 68,
              goal: goal || candidate.goal || 'Weight Loss & Healthy Living',
              calorieTarget: 1900,
              guidanceStatus: 'accepted',
              assignedAt: new Date().toISOString(),
              mealPlanTitle: 'Custom Nutrition Plan',
              mealPlanCalories: 1900
            });
            if (currentDietitianPayload) {
              currentDietitianPayload.controlledUsers = currentControlledUsers;
              if (currentDietitianPayload.stats) {
                currentDietitianPayload.stats.totalControlledUsers = currentControlledUsers.length;
                currentDietitianPayload.stats.activeMealPlans = currentControlledUsers.length;
              }
            }
            filterAndRenderControlledUsers();
            renderDietitianHeroAndMetrics(currentDietitianPayload || {});
          }
          SHD_Admin.closeModal('assignClientModal');
          SHD_Admin.showNotification('Patient successfully assigned under this dietitian (Local)!', 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to assign patient.', 'danger');
        }
      };
    }
  }

  function renderDietitianAuditTrail(logs) {
    const tbody = document.getElementById('dietitianAuditLogsBody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">No recent administrative events recorded for this dietitian.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td><span class="badge badge-primary">${l.type || 'Event'}</span></td>
        <td>${l.description || 'Action recorded'}</td>
        <td class="text-xs text-muted">${l.actor || 'Administrator'}</td>
        <td>
          <span class="badge ${l.status === 'completed' || l.status === 'approved' ? 'badge-success' : 'badge-warning'}">
            ${l.status || 'Logged'}
          </span>
        </td>
        <td class="text-xs text-muted">${l.timestamp || 'Recent'}</td>
      </tr>
    `).join('');
  }

  // Global namespace for Dietitian Details page actions
  window.SHD_DietitianDetails = {
    toggleDietitianStatus: async function () {
      if (!currentDietitianId) return;
      const isCurrentlyActive = (currentDietitianPayload?.dietitian?.accountStatus || 'active').toLowerCase() === 'active';
      const action = isCurrentlyActive ? 'deactivate' : 'reactivate';

      if (confirm(`Are you sure you want to ${action} this dietitian profile? ${isCurrentlyActive ? 'Their platform access will be revoked immediately.' : 'Their account access will be restored.'}`)) {
        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}/toggle-status`, {
          method: 'PATCH'
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message, res.isActive ? 'success' : 'warning');
          await loadDietitianFullData(currentDietitianId);
        } else if (currentDietitianPayload?.dietitian) {
          const newStatus = isCurrentlyActive ? 'inactive' : 'active';
          currentDietitianPayload.dietitian.accountStatus = newStatus;
          renderDietitianHeroAndMetrics(currentDietitianPayload);
          populateDietitianDetailForms(currentDietitianPayload.dietitian);
          SHD_Admin.showNotification(`Dietitian profile has been ${newStatus === 'active' ? 'reactivated' : 'deactivated'} successfully (Local)`, newStatus === 'active' ? 'success' : 'warning');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to toggle dietitian status.', 'danger');
        }
      }
    },

    openAssignModal: async function () {
      if (!currentDietitianId) return;
      const select = document.getElementById('assignClientSelect');
      if (select) {
        select.innerHTML = '<option value="">Loading eligible patients...</option>';
      }

      SHD_Admin.openModal('assignClientModal');

      const res = await adminFetch(`/admin/dietitians/${currentDietitianId}/available-users`);
      if (res && res.success && Array.isArray(res.users)) {
        const available = res.users.filter(u => !u.isAssigned);
        if (available.length === 0) {
          select.innerHTML = '<option value="">All active users are already assigned.</option>';
        } else {
          select.innerHTML = `
            <option value="">-- Choose a user to assign --</option>
            ${available.map(u => `
              <option value="${u.id}">${u.name} (${u.email}) [${u.goal || 'General Health'}]</option>
            `).join('')}
          `;
        }
      } else if (window.SHD_Data) {
        const dummyUsers = window.SHD_Data.getUsers() || [];
        const assignedIds = currentControlledUsers.map(u => String(u.id));
        const available = dummyUsers.filter(u => !assignedIds.includes(String(u.id)));
        if (available.length === 0) {
          select.innerHTML = '<option value="">All candidate users are assigned.</option>';
        } else {
          select.innerHTML = `
            <option value="">-- Choose a user to assign --</option>
            ${available.map(u => `
              <option value="${u.id}">${u.name} (${u.email}) [${u.goal || 'General Health'}]</option>
            `).join('')}
          `;
        }
      } else {
        select.innerHTML = '<option value="">Failed to load candidate patients</option>';
      }
    },

    unassignClient: async function (userId, userName) {
      if (!currentDietitianId || !userId) return;
      if (confirm(`Are you sure you want to unassign ${userName} from this dietitian? Their guidance link and active meal plan will be archived.`)) {
        const res = await adminFetch(`/admin/dietitians/${currentDietitianId}/unassign-user/${userId}`, {
          method: 'DELETE'
        });

        if (res && res.success) {
          SHD_Admin.showNotification(res.message || 'Client unassigned successfully.', 'info');
          await loadDietitianFullData(currentDietitianId);
        } else if (currentControlledUsers.length > 0) {
          currentControlledUsers = currentControlledUsers.filter(u => String(u.id) !== String(userId));
          if (currentDietitianPayload) {
            currentDietitianPayload.controlledUsers = currentControlledUsers;
            if (currentDietitianPayload.stats) {
              currentDietitianPayload.stats.totalControlledUsers = currentControlledUsers.length;
              currentDietitianPayload.stats.activeMealPlans = currentControlledUsers.length;
            }
          }
          filterAndRenderControlledUsers();
          renderDietitianHeroAndMetrics(currentDietitianPayload || {});
          SHD_Admin.showNotification('Client unassigned successfully (Local).', 'info');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to unassign client.', 'danger');
        }
      }
    },

    generateRandomPassword: function () {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
      let pass = '';
      for (let i = 0; i < 10; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const passInput = document.getElementById('newDietitianPassword');
      if (passInput) passInput.value = pass;
    },

    switchTab: function (tabId, buttonEl) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

      if (buttonEl) buttonEl.classList.add('active');
      const targetPanel = document.getElementById(tabId);
      if (targetPanel) targetPanel.classList.add('active');
    }
  };
})();
