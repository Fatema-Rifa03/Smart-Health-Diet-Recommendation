/* ==========================================================================
   Smart Health & Diet Recommendation System - Admin Panel Module (Backend-Connected)
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:5000/api';

  // Helper for authenticated admin API requests
  async function adminFetch(endpoint, options = {}) {
    const token = localStorage.getItem('shd_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    try {
      const response = await fetch(API_BASE + endpoint, {
        ...options,
        headers
      });

      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('shd_token');
        localStorage.removeItem('shd_current_user');
        window.location.href = '../auth/login.html';
        return null;
      }

      if (response.status === 403) {
        window.SHD_Admin.showNotification('Access denied: Admin privileges required.', 'danger');
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
     2. USER MANAGEMENT PAGE
     ========================================================================== */
  async function initUsersPage() {
    await fetchAndRenderUsers();

    // Search and Filter Listeners
    const searchInput = document.getElementById('userSearchInput');
    const statusSelect = document.getElementById('userStatusFilter');

    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderUsers());
    if (statusSelect) statusSelect.addEventListener('change', () => filterAndRenderUsers());

    // Add User Form Submission
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
      addUserForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
          name: document.getElementById('addUserName').value,
          email: document.getElementById('addUserEmail').value,
          age: parseInt(document.getElementById('addUserAge').value) || 25,
          gender: document.getElementById('addUserGender').value,
          height: parseFloat(document.getElementById('addUserHeight').value) || 170,
          weight: parseFloat(document.getElementById('addUserWeight').value) || 70,
          targetWeight: parseFloat(document.getElementById('addUserTargetWeight').value) || 65,
          goal: document.getElementById('addUserGoal').value,
          dailyCalorieLimit: parseInt(document.getElementById('addUserCalorieLimit').value) || 2000
        };

        const res = await adminFetch('/admin/users', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.closeModal('addUserModal');
          addUserForm.reset();
          await fetchAndRenderUsers();
          SHD_Admin.showNotification(`User account for ${payload.name} created successfully!`, 'success');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to create user account.', 'danger');
        }
      });
    }

    // Edit User Form Submission
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
      editUserForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const userId = document.getElementById('editUserId').value;
        const payload = {
          name: document.getElementById('editUserName').value,
          email: document.getElementById('editUserEmail').value,
          age: parseInt(document.getElementById('editUserAge').value),
          gender: document.getElementById('editUserGender').value,
          height: parseFloat(document.getElementById('editUserHeight').value),
          weight: parseFloat(document.getElementById('editUserWeight').value),
          targetWeight: parseFloat(document.getElementById('editUserTargetWeight').value),
          goal: document.getElementById('editUserGoal').value,
          dailyCalorieLimit: parseInt(document.getElementById('editUserCalorieLimit').value)
        };

        const res = await adminFetch(`/admin/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Admin.closeModal('editUserModal');
          await fetchAndRenderUsers();
          SHD_Admin.showNotification(`Updated profile for ${payload.name}`, 'info');
        } else {
          SHD_Admin.showNotification(res?.message || 'Failed to update user profile.', 'danger');
        }
      });
    }
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
        (u, idx) => `
      <tr>
        <td class="font-bold">#USR-00${idx + 1}</td>
        <td>
          <strong>${u.name || 'User'}</strong>
          <span class="text-xs text-muted block">${u.email}</span>
        </td>
        <td>${u.age ? u.age + ' yrs' : 'N/A'} / ${u.gender ? (u.gender.charAt(0).toUpperCase() + u.gender.slice(1)) : 'N/A'}</td>
        <td>${u.height || 165} cm | ${u.weight || 65} kg</td>
        <td><span class="badge badge-primary">${u.goal || 'General Health'}</span></td>
        <td>
          <span class="badge ${(u.status || '').toLowerCase() === 'inactive' ? 'badge-danger' : 'badge-success'}">
            ${u.status || 'Active'}
          </span>
        </td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="window.SHD_Admin.openEditUserModal('${u.id}')">Edit</button>
            <button class="btn btn-outline btn-sm ${(u.status || '').toLowerCase() === 'inactive' ? 'text-success' : 'text-warning'}" onclick="window.SHD_Admin.toggleUserStatus('${u.id}')">
              ${(u.status || '').toLowerCase() === 'inactive' ? 'Activate' : 'Deactivate'}
            </button>
            <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.deleteUser('${u.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `
      )
      .join('');
  }

  // Global Attached Action Handlers for User Page
  window.SHD_Admin.openEditUserModal = function (id) {
    const user = cachedUsers.find(u => String(u.id) === String(id));
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editUserEmail').value = user.email;
    document.getElementById('editUserAge').value = user.age || 24;
    document.getElementById('editUserGender').value = user.gender ? (user.gender.charAt(0).toUpperCase() + user.gender.slice(1).toLowerCase()) : 'Female';
    document.getElementById('editUserHeight').value = user.height || 165;
    document.getElementById('editUserWeight').value = user.weight || 64.5;
    document.getElementById('editUserTargetWeight').value = user.targetWeight || 60.0;
    document.getElementById('editUserGoal').value = user.goal || 'Weight Loss & Healthy Living';
    document.getElementById('editUserCalorieLimit').value = user.dailyCalorieLimit || 2000;

    SHD_Admin.openModal('editUserModal');
  };

  window.SHD_Admin.toggleUserStatus = async function (id) {
    const res = await adminFetch(`/admin/users/${id}/status`, { method: 'PATCH' });
    if (res && res.success) {
      await fetchAndRenderUsers();
      SHD_Admin.showNotification(res.message || 'User status updated successfully.', 'info');
    } else {
      SHD_Admin.showNotification('Failed to change user status.', 'danger');
    }
  };

  window.SHD_Admin.deleteUser = async function (id) {
    if (confirm('Are you sure you want to permanently delete this user account?')) {
      const res = await adminFetch(`/admin/users/${id}`, { method: 'DELETE' });
      if (res && res.success) {
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
                <button class="btn btn-outline btn-sm" onclick="window.SHD_Admin.viewDietitianDetails('${d.id}')">Details</button>
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
      const res = await adminFetch(`/admin/dietitians/${id}/suspend`, { method: 'PATCH' });
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
})();
