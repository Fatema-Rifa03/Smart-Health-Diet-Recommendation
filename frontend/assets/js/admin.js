/* ==========================================================================
   Smart Health & Diet Recommendation System - Admin Panel Module
   ========================================================================== */

(function () {
  'use strict';

  // Admin Module Namespace
  window.SHD_Admin = {
    
    // Toast Notification System
    showNotification: function (message, type = 'success') {
      let toastContainer = document.getElementById('adminToastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'adminToastContainer';
        toastContainer.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(toastContainer);
      }

      const toast = document.createElement('div');
      const bgColors = {
        success: 'var(--success-light)',
        warning: 'var(--warning-light)',
        danger: 'var(--danger-light)',
        info: 'var(--info-light)'
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
        border-radius: var(--radius-md);
        font-weight: 600;
        font-size: 0.875rem;
        box-shadow: var(--shadow-lg);
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
      }, 3000);
    },

    // Export Data to CSV File
    exportToCSV: function (filename, rows) {
      if (!rows || !rows.length) return;
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

  // Document Ready Router
  document.addEventListener('DOMContentLoaded', function () {
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
     1. DASHBOARD OVERVIEW PAGE LOGIC
     ========================================================================== */
  function initDashboard() {
    const users = SHD_Data.getUsers();
    const dietitians = SHD_Data.getDietitians();
    const foods = SHD_Data.getFoodDatabase();
    const logs = SHD_Data.getAuditLogs();

    // Stats Counter
    const totalUsersEl = document.getElementById('adminDashboardTotalUsers');
    const approvedDietitiansEl = document.getElementById('adminDashboardApprovedDietitians');
    const pendingDietitiansEl = document.getElementById('adminDashboardPendingDietitians');
    const foodCountEl = document.getElementById('adminDashboardFoodCount');

    if (totalUsersEl) totalUsersEl.textContent = users.length;
    if (approvedDietitiansEl) approvedDietitiansEl.textContent = dietitians.filter(d => d.status === 'Approved').length;
    if (pendingDietitiansEl) pendingDietitiansEl.textContent = dietitians.filter(d => d.status === 'Pending').length;
    if (foodCountEl) foodCountEl.textContent = foods.length;

    // Activity Feed Render
    const activityFeedEl = document.getElementById('adminRecentActivityFeed');
    if (activityFeedEl) {
      const recentLogs = logs.slice(0, 5);
      if (recentLogs.length === 0) {
        activityFeedEl.innerHTML = '<p class="text-xs text-muted">No recent system activity recorded.</p>';
      } else {
        activityFeedEl.innerHTML = recentLogs.map(log => `
          <div class="flex items-center justify-between" style="padding: 10px 0; border-bottom: 1px solid var(--border);">
            <div>
              <strong class="text-sm block">${log.description}</strong>
              <span class="text-xs text-muted">${log.actor} • ${log.timestamp}</span>
            </div>
            <span class="badge ${log.status === 'Approved' || log.status === 'Completed' ? 'badge-success' : log.status === 'Warning' ? 'badge-danger' : 'badge-warning'}">${log.status}</span>
          </div>
        `).join('');
      }
    }
  }

  /* ==========================================================================
     2. USER MANAGEMENT PAGE LOGIC
     ========================================================================== */
  function initUsersPage() {
    renderUsers();

    // Search and Filter Listeners
    const searchInput = document.getElementById('userSearchInput');
    const statusSelect = document.getElementById('userStatusFilter');

    if (searchInput) {
      searchInput.addEventListener('input', () => renderUsers());
    }
    if (statusSelect) {
      statusSelect.addEventListener('change', () => renderUsers());
    }

    // Add User Form Submission
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
      addUserForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const newUser = {
          name: document.getElementById('addUserName').value,
          email: document.getElementById('addUserEmail').value,
          age: parseInt(document.getElementById('addUserAge').value) || 25,
          gender: document.getElementById('addUserGender').value,
          height: parseFloat(document.getElementById('addUserHeight').value) || 170,
          weight: parseFloat(document.getElementById('addUserWeight').value) || 70,
          targetWeight: parseFloat(document.getElementById('addUserTargetWeight').value) || 65,
          goal: document.getElementById('addUserGoal').value,
          dailyCalorieLimit: parseInt(document.getElementById('addUserCalorieLimit').value) || 2000,
          role: 'user',
          status: 'Active'
        };

        SHD_Data.addUser(newUser);
        SHD_Admin.closeModal('addUserModal');
        addUserForm.reset();
        renderUsers();
        SHD_Admin.showNotification(`User account for ${newUser.name} created successfully!`, 'success');
      });
    }

    // Edit User Form Submission
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
      editUserForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const userId = document.getElementById('editUserId').value;
        const updatedData = {
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

        SHD_Data.updateUser(userId, updatedData);
        SHD_Admin.closeModal('editUserModal');
        renderUsers();
        SHD_Admin.showNotification(`Updated profile for ${updatedData.name}`, 'info');
      });
    }
  }

  function renderUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;

    let users = SHD_Data.getUsers();
    const searchVal = (document.getElementById('userSearchInput')?.value || '').toLowerCase();
    const statusVal = document.getElementById('userStatusFilter')?.value || 'All';

    // Apply Filter
    if (searchVal) {
      users = users.filter(u => u.name.toLowerCase().includes(searchVal) || u.email.toLowerCase().includes(searchVal) || u.id.toLowerCase().includes(searchVal));
    }
    if (statusVal !== 'All') {
      users = users.filter(u => (u.status || 'Active') === statusVal);
    }

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 32px;">No matching user accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map((u, idx) => `
      <tr>
        <td class="font-bold">#USR-00${idx + 1}</td>
        <td>
          <strong>${u.name}</strong>
          <span class="text-xs text-muted block">${u.email}</span>
        </td>
        <td>${u.age || 24} yrs / ${u.gender || 'Female'}</td>
        <td>${u.height || 165} cm | ${u.weight || 64.5} kg</td>
        <td><span class="badge badge-primary">${u.goal || 'General Health'}</span></td>
        <td>
          <span class="badge ${u.status === 'Inactive' ? 'badge-danger' : 'badge-success'}">
            ${u.status || 'Active'}
          </span>
        </td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="window.SHD_Admin.openEditUserModal('${u.id}')">Edit</button>
            <button class="btn btn-outline btn-sm ${u.status === 'Inactive' ? 'text-success' : 'text-warning'}" onclick="window.SHD_Admin.toggleUserStatus('${u.id}')">
              ${u.status === 'Inactive' ? 'Activate' : 'Deactivate'}
            </button>
            <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.deleteUser('${u.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // Global Attached Action Handlers for User Page
  window.SHD_Admin.openEditUserModal = function (id) {
    const user = SHD_Data.getUsers().find(u => u.id === id);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name;
    document.getElementById('editUserEmail').value = user.email;
    document.getElementById('editUserAge').value = user.age || 24;
    document.getElementById('editUserGender').value = user.gender || 'Female';
    document.getElementById('editUserHeight').value = user.height || 165;
    document.getElementById('editUserWeight').value = user.weight || 64.5;
    document.getElementById('editUserTargetWeight').value = user.targetWeight || 60.0;
    document.getElementById('editUserGoal').value = user.goal || 'Weight Loss';
    document.getElementById('editUserCalorieLimit').value = user.dailyCalorieLimit || 2000;

    SHD_Admin.openModal('editUserModal');
  };

  window.SHD_Admin.toggleUserStatus = function (id) {
    SHD_Data.toggleUserStatus(id);
    renderUsers();
    SHD_Admin.showNotification('User status updated successfully.', 'info');
  };

  window.SHD_Admin.deleteUser = function (id) {
    if (confirm('Are you sure you want to permanently delete this user account?')) {
      SHD_Data.deleteUser(id);
      renderUsers();
      SHD_Admin.showNotification('User account deleted.', 'danger');
    }
  };


  /* ==========================================================================
     3. DIETITIAN APPROVALS PAGE LOGIC
     ========================================================================== */
  function initApprovalsPage() {
    renderApprovalsPage();

    const searchInput = document.getElementById('dietitianSearchInput');
    if (searchInput) searchInput.addEventListener('input', () => renderApprovalsPage());

    // Add Dietitian Form Submission
    const addDietitianForm = document.getElementById('addDietitianForm');
    if (addDietitianForm) {
      addDietitianForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const newDietitian = {
          name: document.getElementById('addDietitianName').value,
          email: document.getElementById('addDietitianEmail').value,
          specialty: document.getElementById('addDietitianSpecialty').value,
          experience: document.getElementById('addDietitianExperience').value + ' Years',
          status: 'Pending',
          rating: 5.0
        };

        SHD_Data.addDietitian(newDietitian);
        SHD_Admin.closeModal('addDietitianModal');
        addDietitianForm.reset();
        renderApprovalsPage();
        SHD_Admin.showNotification(`Application submitted for ${newDietitian.name}!`, 'success');
      });
    }
  }

  function renderApprovalsPage() {
    const dietitians = SHD_Data.getDietitians();
    const searchVal = (document.getElementById('dietitianSearchInput')?.value || '').toLowerCase();

    const filtered = searchVal
      ? dietitians.filter(d => d.name.toLowerCase().includes(searchVal) || d.specialty.toLowerCase().includes(searchVal) || d.email.toLowerCase().includes(searchVal))
      : dietitians;

    const pending = filtered.filter(d => d.status === 'Pending');
    const approved = filtered.filter(d => d.status === 'Approved');
    const otherStatus = filtered.filter(d => d.status === 'Rejected' || d.status === 'Suspended');

    // Render Pending Table
    const pendingTbody = document.getElementById('pendingDietitiansTable');
    if (pendingTbody) {
      if (pending.length === 0) {
        pendingTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">No pending dietitian applications at this time.</td></tr>`;
      } else {
        pendingTbody.innerHTML = pending.map(d => `
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
        `).join('');
      }
    }

    // Render Approved Table
    const approvedTbody = document.getElementById('approvedDietitiansTable');
    if (approvedTbody) {
      if (approved.length === 0) {
        approvedTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">No approved clinical dietitians found.</td></tr>`;
      } else {
        approvedTbody.innerHTML = approved.map(d => `
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
        `).join('');
      }
    }
  }

  // Global Attached Handlers for Dietitian Approvals
  window.SHD_Admin.approveDietitian = function (id) {
    SHD_Data.approveDietitian(id);
    renderApprovalsPage();
    SHD_Admin.showNotification('Dietitian registration approved successfully!', 'success');
  };

  window.SHD_Admin.rejectDietitian = function (id) {
    SHD_Data.rejectDietitian(id);
    renderApprovalsPage();
    SHD_Admin.showNotification('Dietitian application rejected.', 'danger');
  };

  window.SHD_Admin.suspendDietitian = function (id) {
    SHD_Data.suspendDietitian(id);
    renderApprovalsPage();
    SHD_Admin.showNotification('Dietitian account suspended.', 'warning');
  };

  window.SHD_Admin.deleteDietitian = function (id) {
    if (confirm('Are you sure you want to remove this dietitian?')) {
      SHD_Data.deleteDietitian(id);
      renderApprovalsPage();
      SHD_Admin.showNotification('Dietitian removed.', 'danger');
    }
  };

  window.SHD_Admin.viewDietitianDetails = function (id) {
    const d = SHD_Data.getDietitians().find(item => item.id === id);
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
          <p><strong>Experience:</strong> ${d.experience || '5 Years'}</p>
          <p><strong>Rating:</strong> ★ ${d.rating || 5.0}</p>
          <p><strong>Status:</strong> ${d.status}</p>
          <p><strong>Clinical License:</strong> #MED-REG-${Math.floor(100000 + Math.random() * 900000)}</p>
        </div>
      `;
      SHD_Admin.openModal('dietitianDetailsModal');
    }
  };


  /* ==========================================================================
     4. FOOD DATABASE MANAGER PAGE LOGIC
     ========================================================================== */
  function initFoodDatabasePage() {
    renderFoodCatalog();

    const searchInput = document.getElementById('foodSearchInput');
    const categorySelect = document.getElementById('foodCategoryFilter');

    if (searchInput) searchInput.addEventListener('input', () => renderFoodCatalog());
    if (categorySelect) categorySelect.addEventListener('change', () => renderFoodCatalog());

    // Add Food Form Submission
    const addFoodItemForm = document.getElementById('addFoodItemForm');
    if (addFoodItemForm) {
      addFoodItemForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const newFood = {
          name: document.getElementById('foodName').value,
          category: document.getElementById('foodCategory').value,
          calories: parseInt(document.getElementById('foodCalories').value) || 0,
          protein: parseInt(document.getElementById('foodProtein')?.value) || 15,
          carbs: parseInt(document.getElementById('foodCarbs')?.value) || 25,
          fat: parseInt(document.getElementById('foodFat')?.value) || 8,
          portion: document.getElementById('foodPortion').value
        };

        SHD_Data.addFood(newFood);
        SHD_Admin.closeModal('foodModal');
        addFoodItemForm.reset();
        renderFoodCatalog();
        SHD_Admin.showNotification(`Food item "${newFood.name}" added to catalog!`, 'success');
      });
    }

    // Edit Food Form Submission
    const editFoodForm = document.getElementById('editFoodItemForm');
    if (editFoodForm) {
      editFoodForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const foodId = document.getElementById('editFoodId').value;
        const updatedFields = {
          name: document.getElementById('editFoodName').value,
          category: document.getElementById('editFoodCategory').value,
          calories: parseInt(document.getElementById('editFoodCalories').value) || 0,
          protein: parseInt(document.getElementById('editFoodProtein').value) || 0,
          carbs: parseInt(document.getElementById('editFoodCarbs').value) || 0,
          fat: parseInt(document.getElementById('editFoodFat').value) || 0,
          portion: document.getElementById('editFoodPortion').value
        };

        SHD_Data.updateFood(foodId, updatedFields);
        SHD_Admin.closeModal('editFoodModal');
        renderFoodCatalog();
        SHD_Admin.showNotification(`Updated food item "${updatedFields.name}"`, 'info');
      });
    }
  }

  function renderFoodCatalog() {
    const tbody = document.getElementById('foodCatalogTableBody');
    if (!tbody) return;

    let foods = SHD_Data.getFoodDatabase();
    const searchVal = (document.getElementById('foodSearchInput')?.value || '').toLowerCase();
    const categoryVal = document.getElementById('foodCategoryFilter')?.value || 'All';

    if (searchVal) {
      foods = foods.filter(f => f.name.toLowerCase().includes(searchVal) || f.category.toLowerCase().includes(searchVal));
    }
    if (categoryVal !== 'All') {
      foods = foods.filter(f => f.category === categoryVal);
    }

    // Update Summary Stats Header if present
    const totalCountEl = document.getElementById('catalogTotalCount');
    const avgCalEl = document.getElementById('catalogAvgCalories');
    if (totalCountEl) totalCountEl.textContent = foods.length;
    if (avgCalEl && foods.length > 0) {
      const avg = Math.round(foods.reduce((acc, f) => acc + (f.calories || 0), 0) / foods.length);
      avgCalEl.textContent = avg + ' kcal';
    }

    if (foods.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 32px;">No food items matching criteria found.</td></tr>`;
      return;
    }

    tbody.innerHTML = foods.map((f, idx) => `
      <tr>
        <td class="font-bold">${f.name}</td>
        <td><span class="badge badge-primary">${f.category}</span></td>
        <td class="font-bold text-primary">${f.calories} kcal</td>
        <td class="text-xs text-muted">P: ${f.protein || 15}g | C: ${f.carbs || 25}g | F: ${f.fat || 8}g</td>
        <td class="text-sm">${f.portion}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" onclick="window.SHD_Admin.openEditFoodModal('${f.id}')">Edit</button>
            <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Admin.deleteFood('${f.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  window.SHD_Admin.openEditFoodModal = function (id) {
    const food = SHD_Data.getFoodDatabase().find(f => f.id === id);
    if (!food) return;

    document.getElementById('editFoodId').value = food.id;
    document.getElementById('editFoodName').value = food.name;
    document.getElementById('editFoodCategory').value = food.category;
    document.getElementById('editFoodCalories').value = food.calories;
    document.getElementById('editFoodProtein').value = food.protein || 15;
    document.getElementById('editFoodCarbs').value = food.carbs || 25;
    document.getElementById('editFoodFat').value = food.fat || 8;
    document.getElementById('editFoodPortion').value = food.portion;

    SHD_Admin.openModal('editFoodModal');
  };

  window.SHD_Admin.deleteFood = function (id) {
    if (confirm('Are you sure you want to delete this food item from catalog?')) {
      SHD_Data.deleteFood(id);
      renderFoodCatalog();
      SHD_Admin.showNotification('Food item removed from catalog.', 'warning');
    }
  };


  /* ==========================================================================
     5. SYSTEM PDF REPORTS PAGE LOGIC
     ========================================================================== */
  function initReportsPage() {
    // Buttons in system-reports.html call printReport() or generateReportPreview()
  }

  window.SHD_Admin.generateReportPreview = function (reportType) {
    const previewContainer = document.getElementById('reportPreviewContent');
    const modalTitle = document.getElementById('reportModalTitle');

    if (modalTitle) modalTitle.textContent = `${reportType} - Preview & Print`;

    if (!previewContainer) {
      window.print();
      return;
    }

    const users = SHD_Data.getUsers();
    const dietitians = SHD_Data.getDietitians();
    const foods = SHD_Data.getFoodDatabase();
    const meals = SHD_Data.getLoggedMeals();

    let contentHtml = '';

    if (reportType === 'Weekly Calorie Summary') {
      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">System Calorie Consumption Overview</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Generated on: ${new Date().toLocaleDateString()}</p>
          <div class="grid grid-3 gap-4" style="margin-bottom: 20px;">
            <div class="card"><span class="text-xs text-muted">Logged Meals</span><div class="text-xl font-bold">${meals.length}</div></div>
            <div class="card"><span class="text-xs text-muted">Avg Calorie / Meal</span><div class="text-xl font-bold text-primary">336 kcal</div></div>
            <div class="card"><span class="text-xs text-muted">Target Adherence</span><div class="text-xl font-bold text-success">94.2%</div></div>
          </div>
          <table class="table">
            <thead><tr><th>User</th><th>Category</th><th>Meal Name</th><th>Calories</th><th>Time</th></tr></thead>
            <tbody>
              ${meals.map(m => `<tr><td>${m.userId}</td><td>${m.category}</td><td>${m.name}</td><td>${m.calories} kcal</td><td>${m.loggedAt}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'User Weight Loss Trends') {
      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">Patient Weight Loss Analytics Report</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Total Tracked Accounts: ${users.length}</p>
          <table class="table">
            <thead><tr><th>Patient Name</th><th>Starting Wt</th><th>Current Wt</th><th>Target Wt</th><th>Progress Status</th></tr></thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td class="font-bold">${u.name}</td>
                  <td>67.5 kg</td>
                  <td>${u.weight} kg</td>
                  <td>${u.targetWeight} kg</td>
                  <td><span class="badge badge-success">On Track (-3.0 kg)</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (reportType === 'Dietitian Activity Report') {
      contentHtml = `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: #fafafa;">
          <h4 class="font-bold text-lg" style="margin-bottom: 8px;">Clinical Specialists Engagement Report</h4>
          <p class="text-xs text-muted" style="margin-bottom: 16px;">Active Specialists: ${dietitians.filter(d => d.status === 'Approved').length}</p>
          <table class="table">
            <thead><tr><th>Specialist</th><th>Specialty</th><th>Status</th><th>Rating</th><th>Assigned Patients</th></tr></thead>
            <tbody>
              ${dietitians.map(d => `
                <tr>
                  <td class="font-bold">${d.name}</td>
                  <td>${d.specialty}</td>
                  <td><span class="badge ${d.status === 'Approved' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                  <td>★ ${d.rating || 5.0}</td>
                  <td>${Math.floor(10 + Math.random() * 25)} Patients</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      contentHtml = `
        <div style="padding: 16px;">
          <h4 class="font-bold text-lg">${reportType} Summary</h4>
          <p class="text-muted text-sm" style="margin-top: 10px;">Full PDF details ready for document output.</p>
        </div>
      `;
    }

    previewContainer.innerHTML = contentHtml;
    SHD_Admin.openModal('reportPreviewModal');
  };

  window.SHD_Admin.exportReportCSV = function (reportType) {
    if (reportType === 'Users') {
      SHD_Admin.exportToCSV('system_users_report.csv', SHD_Data.getUsers());
    } else if (reportType === 'FoodCatalog') {
      SHD_Admin.exportToCSV('food_catalog_report.csv', SHD_Data.getFoodDatabase());
    } else if (reportType === 'AuditLogs') {
      SHD_Admin.exportToCSV('system_audit_logs.csv', SHD_Data.getAuditLogs());
    } else {
      SHD_Admin.exportToCSV('system_report.csv', SHD_Data.getLoggedMeals());
    }
    SHD_Admin.showNotification('CSV report downloaded successfully.', 'success');
  };


  /* ==========================================================================
     6. SYSTEM SETTINGS & AUDIT LOGS PAGE LOGIC
     ========================================================================== */
  function initSettingsPage() {
    const settings = SHD_Data.getSettings();

    // Populate Settings Form Inputs
    const warnPctEl = document.getElementById('warnPct');
    const defaultWaterEl = document.getElementById('defaultWater');
    const defaultSleepEl = document.getElementById('defaultSleep');
    const maintenanceModeEl = document.getElementById('maintenanceMode');
    const autoApproveEl = document.getElementById('autoApproveDietitians');

    if (warnPctEl) warnPctEl.value = settings.warnPct || 80;
    if (defaultWaterEl) defaultWaterEl.value = settings.defaultWater || 2.5;
    if (defaultSleepEl) defaultSleepEl.value = settings.defaultSleep || 8.0;
    if (maintenanceModeEl) maintenanceModeEl.checked = !!settings.maintenanceMode;
    if (autoApproveEl) autoApproveEl.checked = !!settings.autoApproveDietitians;

    // Save Settings Event
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const updatedSettings = {
          warnPct: parseInt(document.getElementById('warnPct').value) || 80,
          defaultWater: parseFloat(document.getElementById('defaultWater').value) || 2.5,
          defaultSleep: parseFloat(document.getElementById('defaultSleep')?.value) || 8.0,
          maintenanceMode: document.getElementById('maintenanceMode')?.checked || false,
          autoApproveDietitians: document.getElementById('autoApproveDietitians')?.checked || false
        };

        SHD_Data.saveSettings(updatedSettings);
        SHD_Admin.showNotification('System threshold settings saved successfully!', 'success');
      });
    }

    renderAuditLogs();

    const auditFilter = document.getElementById('auditLogFilter');
    if (auditFilter) auditFilter.addEventListener('change', () => renderAuditLogs());
  }

  function renderAuditLogs() {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    let logs = SHD_Data.getAuditLogs();
    const filterVal = document.getElementById('auditLogFilter')?.value || 'All';

    if (filterVal !== 'All') {
      logs = logs.filter(l => l.type === filterVal);
    }

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">No system audit logs found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td class="font-bold">${l.id}</td>
        <td><span class="badge badge-primary">${l.type}</span></td>
        <td>${l.description}</td>
        <td class="text-xs text-muted">${l.timestamp}</td>
        <td>
          <span class="badge ${l.status === 'Approved' || l.status === 'Completed' ? 'badge-success' : l.status === 'Warning' || l.status === 'Rejected' ? 'badge-danger' : 'badge-warning'}">
            ${l.status}
          </span>
        </td>
      </tr>
    `).join('');
  }

  window.SHD_Admin.clearAuditLogs = function () {
    if (confirm('Are you sure you want to clear all system audit logs?')) {
      SHD_Data.clearAuditLogs();
      renderAuditLogs();
      SHD_Admin.showNotification('Audit logs cleared.', 'info');
    }
  };

})();
