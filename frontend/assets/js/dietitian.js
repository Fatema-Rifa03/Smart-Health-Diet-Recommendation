/* ==========================================================================
   Smart Health & Diet Recommendation System - Dietitian Portal Module
   ========================================================================== */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:5000/api';

  // Helper for authenticated dietitian API requests
  async function dietitianFetch(endpoint, options = {}) {
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
        localStorage.removeItem('shd_token');
        localStorage.removeItem('shd_current_user');
        window.location.href = '../auth/login.html';
        return null;
      }

      if (response.status === 403) {
        window.SHD_Dietitian.showNotification('Access denied: Dietitian account required.', 'danger');
        return null;
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.warn('Dietitian API error:', err);
      return null;
    }
  }

  window.SHD_Dietitian = {
    // Toast Notification System
    showNotification: function (message, type = 'success') {
      let toastContainer = document.getElementById('dietitianToastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'dietitianToastContainer';
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
      }, 3500);
    }
  };

  // State cache
  let currentProfile = null;
  let cachedPatients = [];
  let cachedRequests = [];

  // Check auth and auto-sync header info
  async function checkDietitianAuth() {
    const token = localStorage.getItem('shd_token');
    const currentUser = JSON.parse(localStorage.getItem('shd_current_user') || 'null');

    // If no token or not dietitian, check if dummy account exists or prompt login
    if (!token || !currentUser || currentUser.role !== 'dietitian') {
      // If no token, attempt auto-login for seeded Dr. Sarah Jenkins for demo convenience
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'sarah.j@smarthealth.com', password: 'dietitian123' })
        });
        const data = await res.json();
        if (res.ok && data.success && data.user?.role === 'dietitian') {
          localStorage.setItem('shd_token', data.session.access_token);
          localStorage.setItem('shd_current_user', JSON.stringify({ ...data.user, name: data.user.full_name }));
        }
      } catch {
        // offline
      }
    }

    // Fetch live profile to sync verification status across all pages
    const profRes = await dietitianFetch('/dietitian/profile');
    if (profRes && profRes.success) {
      currentProfile = profRes.profile;
      updateHeaderProfileUI(currentProfile);
    } else {
      const u = JSON.parse(localStorage.getItem('shd_current_user') || 'null');
      if (u) {
        updateHeaderProfileUI({
          name: u.name || u.full_name || 'Dietitian Specialist',
          status: 'pending',
          avatarUrl: '../assets/images/images.jpeg'
        });
      }
    }
  }

  function updateHeaderProfileUI(profile) {
    if (!profile) return;

    // Update name
    document.querySelectorAll('.user-profile-menu .font-bold.text-sm').forEach(el => {
      el.textContent = profile.name;
    });

    // Update avatar
    if (profile.avatarUrl) {
      document.querySelectorAll('.user-profile-menu .user-avatar').forEach(el => {
        el.src = profile.avatarUrl;
      });
    }

    // Update status badge in header
    const statusBadges = document.querySelectorAll('.user-profile-menu .badge');
    const isApproved = (profile.status || '').toLowerCase() === 'approved';

    statusBadges.forEach(el => {
      el.className = `badge ${isApproved ? 'badge-success' : 'badge-warning'}`;
      el.textContent = isApproved ? 'Approved Specialist' : 'Pending Verification';
    });

    // If on dashboard and pending verification, show prominent banner
    const page = window.location.pathname.split('/').pop();
    if (page === 'dashboard.html' || page === '') {
      renderVerificationBanner(profile);
    }
  }

  function renderVerificationBanner(profile) {
    let banner = document.getElementById('dietitianVerificationAlertBanner');
    const mainContent = document.querySelector('.dashboard-content');
    if (!mainContent) return;

    const status = (profile.status || '').toLowerCase();

    if (status === 'approved') {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'dietitianVerificationAlertBanner';
      mainContent.prepend(banner);
    }

    if (status === 'pending') {
      banner.innerHTML = `
        <div style="background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1px solid #f59e0b; border-radius: var(--radius-md, 8px); padding: 18px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: #f59e0b; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: bold;">!</div>
            <div>
              <strong style="color: #92400e; font-size: 1rem; display: block;">Profile Verification Pending Administrator Review</strong>
              <p style="color: #78350f; font-size: 0.875rem; margin: 4px 0 0 0;">
                Your account is currently waiting for admin approval. Once approved, patients will be able to discover your profile in the dietitian directory.
              </p>
            </div>
          </div>
          <a href="profile.html" class="btn btn-primary btn-sm" style="background: #d97706; border-color: #d97706; white-space: nowrap;">
            Complete / Review Profile Credentials &rarr;
          </a>
        </div>
      `;
    } else if (status === 'rejected') {
      banner.innerHTML = `
        <div style="background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #ef4444; border-radius: var(--radius-md, 8px); padding: 18px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: #ef4444; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: bold;">&times;</div>
            <div>
              <strong style="color: #991b1b; font-size: 1rem; display: block;">Verification Application Needs Attention</strong>
              <p style="color: #b91c1c; font-size: 0.875rem; margin: 4px 0 0 0;">
                Admin Note: ${profile.reviewNote || 'Please update your clinical qualifications and resubmit.'}
              </p>
            </div>
          </div>
          <a href="profile.html" class="btn btn-primary btn-sm" style="background: #dc2626; border-color: #dc2626; white-space: nowrap;">
            Update & Re-Submit Profile &rarr;
          </a>
        </div>
      `;
    }
  }

  // Document Ready Router
  document.addEventListener('DOMContentLoaded', async function () {
    await checkDietitianAuth();

    const page = window.location.pathname.split('/').pop();

    if (page === 'dashboard.html' || page === '') {
      initDietitianDashboard();
    } else if (page === 'profile.html') {
      initProfilePage();
    } else if (page === 'patients.html') {
      initPatientsPage();
    } else if (page === 'guidance-requests.html') {
      initGuidanceRequestsPage();
    } else if (page === 'meal-builder.html') {
      initMealBuilderPage();
    } else if (page === 'recipe-upload.html') {
      initRecipeUploadPage();
    } else if (page === 'chat.html') {
      initChatPage();
    }
  });

  /* ==========================================================================
     1. DASHBOARD PAGE
     ========================================================================== */
  async function initDietitianDashboard() {
    const data = await dietitianFetch('/dietitian/dashboard');
    const tbody = document.getElementById('dietitianDashboardPatients');

    if (data && data.success) {
      // Update counters if present
      const statValues = document.querySelectorAll('.stat-card .stat-value');
      if (statValues.length >= 3) {
        statValues[0].textContent = data.stats.assignedPatients ?? 0;
        statValues[1].textContent = data.stats.pendingRequests ?? 0;
        statValues[2].textContent = data.stats.activeConsultations ?? 0;
      }

      // Render recent requests / patients
      if (tbody) {
        const patientsRes = await dietitianFetch('/dietitian/patients');
        const patients = patientsRes?.patients || [];

        if (patients.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">No assigned patient health records yet.</td></tr>`;
        } else {
          tbody.innerHTML = patients.slice(0, 5).map(u => `
            <tr>
              <td class="font-bold">${u.name}<span class="text-xs text-muted block">${u.email}</span></td>
              <td>${u.age ? u.age + ' yrs' : 'N/A'} / ${u.gender || 'N/A'}</td>
              <td><strong>${u.weight} kg</strong> (${u.height || 170} cm)</td>
              <td><span class="badge badge-primary">${u.goal || 'General Health'}</span></td>
              <td class="font-bold text-primary">${u.dailyCalorieLimit || 2000} kcal/day</td>
              <td>
                <a href="meal-builder.html?patient=${encodeURIComponent(u.name)}" class="btn btn-outline btn-sm">Assign Plan</a>
              </td>
            </tr>
          `).join('');
        }
      }
    }
  }

  /* ==========================================================================
     2. PROFILE & VERIFICATION PAGE
     ========================================================================== */
  async function initProfilePage() {
    const profRes = await dietitianFetch('/dietitian/profile');
    if (!profRes || !profRes.success) return;

    const p = profRes.profile;
    currentProfile = p;

    // Populate Form Inputs
    const nameEl = document.getElementById('dietitianName');
    const emailEl = document.getElementById('dietitianEmail');
    const specialtyEl = document.getElementById('dietitianSpecialty');
    const experienceEl = document.getElementById('dietitianExperience');
    const qualificationEl = document.getElementById('dietitianQualification');
    const avatarEl = document.getElementById('dietitianAvatar');
    const licenseEl = document.getElementById('dietitianLicense');

    if (nameEl) nameEl.value = p.name || '';
    if (emailEl) emailEl.value = p.email || '';
    if (specialtyEl) specialtyEl.value = p.specialty || '';
    if (experienceEl) experienceEl.value = p.yearsExperience || 0;
    if (qualificationEl) qualificationEl.value = p.qualification || '';
    if (avatarEl) avatarEl.value = p.avatarUrl || '';
    if (licenseEl) licenseEl.value = `LIC-REG-${p.id ? p.id.slice(0, 8).toUpperCase() : 'MED8829'}`;

    // Render Status Card
    renderProfileStatusCard(p);

    // Save Profile Form Submission
    const profileForm = document.getElementById('dietitianProfileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
          full_name: document.getElementById('dietitianName').value,
          specialty: document.getElementById('dietitianSpecialty').value,
          years_experience: parseFloat(document.getElementById('dietitianExperience').value) || 0,
          qualification: document.getElementById('dietitianQualification').value,
          avatar_url: document.getElementById('dietitianAvatar').value
        };

        const res = await dietitianFetch('/dietitian/profile', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Dietitian.showNotification('Profile details updated successfully!', 'success');
          // Update local state and header
          currentProfile = { ...currentProfile, ...payload, name: payload.full_name };
          updateHeaderProfileUI(currentProfile);
        } else {
          SHD_Dietitian.showNotification(res?.message || 'Failed to update profile.', 'danger');
        }
      });
    }

    // Submit for Verification Button
    const verifyBtn = document.getElementById('requestVerificationBtn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', async function () {
        const payload = {
          specialty: document.getElementById('dietitianSpecialty').value,
          years_experience: parseFloat(document.getElementById('dietitianExperience').value) || 0,
          qualification: document.getElementById('dietitianQualification').value,
          avatar_url: document.getElementById('dietitianAvatar').value
        };

        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Submitting Request...';

        const res = await dietitianFetch('/dietitian/request-verification', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Request Profile Verification';

        if (res && res.success) {
          currentProfile.status = res.status;
          renderProfileStatusCard(currentProfile);
          updateHeaderProfileUI(currentProfile);
          SHD_Dietitian.showNotification(res.message, 'success');
        } else {
          SHD_Dietitian.showNotification(res?.message || 'Failed to submit verification request.', 'danger');
        }
      });
    }
  }

  function renderProfileStatusCard(p) {
    const statusContainer = document.getElementById('profileStatusDisplay');
    if (!statusContainer) return;

    const status = (p.status || '').toLowerCase();

    if (status === 'approved') {
      statusContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1px solid #10b981; border-radius: var(--radius-md, 8px); padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: #10b981; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">✓</div>
            <div>
              <strong style="color: #065f46; font-size: 1.05rem; display: block;">Verified & Approved Clinical Specialist</strong>
              <span style="color: #047857; font-size: 0.875rem;">Your credentials are confirmed. Your profile is active and publicly visible to patients in the dietitian directory.</span>
            </div>
          </div>
          <span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 14px;">Active in Patient Directory</span>
        </div>
      `;
    } else if (status === 'rejected') {
      statusContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #ef4444; border-radius: var(--radius-md, 8px); padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: #ef4444; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">✕</div>
            <div>
              <strong style="color: #991b1b; font-size: 1.05rem; display: block;">Application Requires Correction</strong>
              <span style="color: #b91c1c; font-size: 0.875rem;">Note: ${p.reviewNote || 'Qualifications need additional clinical documentation.'}</span>
            </div>
          </div>
          <span class="badge badge-danger" style="font-size: 0.85rem; padding: 6px 14px;">Status: Rejected</span>
        </div>
      `;
    } else {
      statusContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, #fffbeb, #fef3c7); border: 1px solid #f59e0b; border-radius: var(--radius-md, 8px); padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: #f59e0b; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">⏳</div>
            <div>
              <strong style="color: #92400e; font-size: 1.05rem; display: block;">Verification In Progress (Pending Admin Review)</strong>
              <span style="color: #78350f; font-size: 0.875rem;">Your credentials have been submitted. An administrator must approve your application before patients can search and send guidance requests to your account.</span>
            </div>
          </div>
          <span class="badge badge-warning" style="font-size: 0.85rem; padding: 6px 14px;">Awaiting Review</span>
        </div>
      `;
    }
  }

  /* ==========================================================================
     3. PATIENT RECORDS PAGE
     ========================================================================== */
  async function initPatientsPage() {
    const tbody = document.getElementById('patientsTableBody');
    if (!tbody) return;

    const res = await dietitianFetch('/dietitian/patients');
    cachedPatients = res?.patients || [];

    if (cachedPatients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 32px;">No patient health records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedPatients.map(u => `
      <tr>
        <td class="font-bold">${u.name}<span class="text-xs text-muted block">${u.email}</span></td>
        <td>${u.age ? u.age + ' yrs' : 'N/A'} / ${u.gender || 'N/A'}</td>
        <td>${u.height || 170} cm | <strong>${u.weight || 70} kg</strong></td>
        <td><span class="badge badge-success">BMI: ${u.bmi || '23.4'}</span></td>
        <td><span class="badge badge-primary">${u.goal || 'General Nutrition'}</span></td>
        <td>
          <a href="meal-builder.html?patient=${encodeURIComponent(u.name)}" class="btn btn-primary btn-sm">Build Plan</a>
          <a href="chat.html?patient=${u.id}" class="btn btn-outline btn-sm">Chat</a>
        </td>
      </tr>
    `).join('');
  }

  /* ==========================================================================
     4. GUIDANCE REQUESTS PAGE
     ========================================================================== */
  async function initGuidanceRequestsPage() {
    await fetchAndRenderGuidanceRequests();
  }

  async function fetchAndRenderGuidanceRequests() {
    const res = await dietitianFetch('/dietitian/guidance-requests');
    cachedRequests = res?.requests || [];

    const pendingCountEl = document.getElementById('pendingCount');
    const pending = cachedRequests.filter(r => (r.status || '').toLowerCase() === 'pending');
    if (pendingCountEl) pendingCountEl.textContent = `${pending.length} pending`;

    const tbody = document.getElementById('requestsTable');
    if (!tbody) return;

    if (cachedRequests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">No guidance requests received from patients yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedRequests.map(r => {
      const isPending = (r.status || '').toLowerCase() === 'pending';
      const isAccepted = (r.status || '').toLowerCase() === 'accepted';
      return `
        <tr>
          <td class="font-bold">${r.userName || 'Patient'}<span class="text-xs text-muted block">${r.userEmail || ''}</span></td>
          <td>${r.goal || 'Personal nutrition consultation'}</td>
          <td>${r.formattedDate || new Date(r.createdAt).toLocaleDateString()}</td>
          <td>
            <span class="badge ${isAccepted ? 'badge-success' : isPending ? 'badge-warning' : 'badge-danger'}">
              ${r.status}
            </span>
          </td>
          <td>
            ${
              isPending
                ? `<div class="flex gap-2">
                     <button class="btn btn-primary btn-sm" onclick="window.SHD_Dietitian.handleRequest('${r.id}', 'accepted')">Accept</button>
                     <button class="btn btn-outline btn-sm text-danger" onclick="window.SHD_Dietitian.handleRequest('${r.id}', 'rejected')">Reject</button>
                   </div>`
                : `<span class="text-muted text-sm">${isAccepted ? 'Assigned' : 'Declined'}</span>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  window.SHD_Dietitian.handleRequest = async function (id, status) {
    const res = await dietitianFetch(`/dietitian/guidance-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    if (res && res.success) {
      SHD_Dietitian.showNotification(res.message, 'success');
      await fetchAndRenderGuidanceRequests();
    } else {
      SHD_Dietitian.showNotification(res?.message || 'Failed to update request', 'danger');
    }
  };

  /* ==========================================================================
     5. MEAL BUILDER PAGE
     ========================================================================== */
  async function initMealBuilderPage() {
    const selectPatient = document.getElementById('selectPatient');
    if (selectPatient) {
      const res = await dietitianFetch('/dietitian/patients');
      const patients = res?.patients || [];

      if (patients.length > 0) {
        selectPatient.innerHTML = patients.map(p => `
          <option value="${p.id}">${p.name} (Goal: ${p.goal})</option>
        `).join('');
      }

      // Check if patient was passed in query parameter
      const urlParams = new URLSearchParams(window.location.search);
      const patientParam = urlParams.get('patient');
      if (patientParam && selectPatient) {
        for (let i = 0; i < selectPatient.options.length; i++) {
          if (selectPatient.options[i].text.includes(patientParam)) {
            selectPatient.selectedIndex = i;
            break;
          }
        }
      }
    }

    const form = document.getElementById('builderForm');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const patientId = document.getElementById('selectPatient')?.value;
        const title = document.getElementById('planTitle')?.value;
        const calories = parseInt(document.getElementById('targetCalories')?.value) || 2000;
        const breakfast = document.getElementById('breakfast')?.value;
        const lunch = document.getElementById('lunch')?.value;
        const dinner = document.getElementById('dinner')?.value;

        const payload = {
          patient_id: patientId,
          title,
          target_calories: calories,
          breakfast,
          lunch,
          dinner
        };

        const res = await dietitianFetch('/dietitian/meal-plans', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Dietitian.showNotification(res.message, 'success');
          form.reset();
        } else {
          SHD_Dietitian.showNotification(res?.message || 'Failed to publish meal plan', 'danger');
        }
      });
    }
  }

  /* ==========================================================================
     6. RECIPE UPLOAD PAGE
     ========================================================================== */
  function initRecipeUploadPage() {
    const form = document.getElementById('recipeForm');
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const payload = {
          title: document.getElementById('title')?.value,
          category: document.getElementById('category')?.value,
          calories: parseInt(document.getElementById('calories')?.value) || 350,
          prepTime: document.getElementById('prepTime')?.value,
          image: document.getElementById('image')?.value
        };

        const res = await dietitianFetch('/dietitian/recipes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          SHD_Dietitian.showNotification(res.message, 'success');
          form.reset();
        } else {
          SHD_Dietitian.showNotification(res?.message || 'Failed to upload recipe', 'danger');
        }
      });
    }
  }

  /* ==========================================================================
     7. INBOX & CHAT PAGE
     ========================================================================== */
  async function initChatPage() {
    // Connect live chat conversations
    const convRes = await dietitianFetch('/user/conversations');
    const conversations = convRes?.conversations || [];

    const chatList = document.querySelector('.chat-list');
    const stream = document.getElementById('dietitianInboxStream');
    const form = document.getElementById('dietitianInboxForm');
    const input = document.getElementById('dietitianInboxInput');

    let activeConversationId = conversations[0]?.id || null;

    if (chatList && conversations.length > 0) {
      chatList.innerHTML = `
        <div style="padding: 16px; border-bottom: 1px solid var(--border);">
          <span class="text-xs font-bold uppercase text-muted tracking-wider">Active Patient Conversations</span>
        </div>
        ${conversations.map((c, idx) => `
          <div class="chat-user-item ${idx === 0 ? 'active' : ''}" data-conv="${c.id}" style="cursor: pointer; padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px;">
            <img src="../assets/images/images.jpeg" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;">
            <div>
              <strong style="display: block; font-size: 0.9rem;">${c.patient_name}</strong>
              <span class="text-xs text-muted">Patient Consultation</span>
            </div>
          </div>
        `).join('')}
      `;

      // Click to switch conversation
      chatList.querySelectorAll('.chat-user-item').forEach(item => {
        item.addEventListener('click', () => {
          chatList.querySelectorAll('.chat-user-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          activeConversationId = item.getAttribute('data-conv');
          loadMessages(activeConversationId);
        });
      });
    }

    async function loadMessages(convId) {
      if (!convId || !stream) return;
      const res = await dietitianFetch(`/user/conversations/${convId}/messages`);
      const messages = res?.messages || [];

      stream.innerHTML = messages.map(m => {
        const isMe = m.sender_id === currentProfile?.id;
        return `
          <div class="message-bubble ${isMe ? 'message-sent' : 'message-received'}">
            <span class="text-xs font-bold block" style="margin-bottom: 4px; opacity: 0.8;">${m.sender_name}</span>
            <p>${m.message_text}</p>
          </div>
        `;
      }).join('');
      stream.scrollTop = stream.scrollHeight;
    }

    if (activeConversationId) {
      loadMessages(activeConversationId);
    }

    if (form && input) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || !activeConversationId) return;

        const res = await dietitianFetch(`/user/conversations/${activeConversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message_text: text })
        });

        if (res && res.success) {
          input.value = '';
          loadMessages(activeConversationId);
        }
      });
    }
  }

})();
