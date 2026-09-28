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

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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

    // If unverified, show prominent banner across main portal pages
    const page = window.location.pathname.split('/').pop();
    if (['dashboard.html', '', 'patients.html', 'guidance-requests.html', 'meal-builder.html'].includes(page)) {
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
          tbody.innerHTML = patients.slice(0, 5).map(u => {
            let badge = '';
            if (u.adherenceStatus === 'extra_reported') {
              badge = `<span class="badge badge-warning">⚠ Extra Food (+${u.todayExtraCalories} kcal)</span>`;
            } else if (u.adherenceStatus === 'exceeded') {
              badge = `<span class="badge badge-danger">✕ Exceeded Plan</span>`;
            } else if (u.todayLogsCount > 0) {
              badge = `<span class="badge badge-success">✓ On Track</span>`;
            } else {
              badge = `<span class="badge badge-secondary">No Logs Today</span>`;
            }
            const consumed = u.todayTotalCalories || 0;
            const target = u.targetCalories || 2000;

            return `
              <tr>
                <td class="font-bold">
                  ${escapeHtml(u.name)}
                  <span class="text-xs text-muted block">${escapeHtml(u.email)}</span>
                </td>
                <td>${u.age ? u.age + ' yrs' : 'N/A'} / ${escapeHtml(u.gender || 'N/A')}</td>
                <td>${badge}</td>
                <td><span class="badge badge-primary">${escapeHtml(u.goal || 'General Health')}</span></td>
                <td>
                  <strong style="color: ${consumed > target ? '#b91c1c' : 'var(--primary)'};">${consumed.toLocaleString()}</strong> / ${target.toLocaleString()} kcal
                </td>
                <td>
                  <a href="patients.html" class="btn btn-outline btn-sm">Review Logs</a>
                </td>
              </tr>
            `;
          }).join('');
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

    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 32px;">Loading patient records...</td></tr>`;

    const res = await dietitianFetch('/dietitian/patients');
    cachedPatients = res?.patients || [];

    const isApproved = res?.verified === true || (currentProfile?.status || '').toLowerCase() === 'approved';

    if (!isApproved) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 48px 24px;">
            <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 14px;">
              <div style="width: 56px; height: 56px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: bold;">!</div>
              <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main, #1e293b); margin: 0;">Profile Verification Required</h3>
              <p style="color: var(--text-muted, #64748b); font-size: 0.925rem; line-height: 1.5; margin: 0;">
                Your account is currently <strong>${escapeHtml((res?.status || currentProfile?.status || 'pending').toUpperCase())}</strong>. 
                Patients cannot be assigned to you until an administrator reviews and approves your clinical credentials.
              </p>
              <a href="profile.html" class="btn btn-primary btn-sm" style="margin-top: 6px;">
                Complete & Request Verification &rarr;
              </a>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    if (cachedPatients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 48px 24px;">
            <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 14px;">
              <div style="width: 56px; height: 56px; border-radius: 50%; background: #ecfdf5; color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 26px;">✓</div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main, #1e293b); margin: 0;">No Assigned Patients Yet</h3>
              <p style="color: var(--text-muted, #64748b); font-size: 0.925rem; line-height: 1.5; margin: 0;">
                Your profile is verified and active in the directory! When patients submit guidance requests and you accept them, they will appear in this directory.
              </p>
              <a href="guidance-requests.html" class="btn btn-outline btn-sm" style="margin-top: 6px;">
                View Incoming Guidance Requests
              </a>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = cachedPatients.map(u => {
      const isExtra = u.extraLogsCount > 0 || u.todayExtraCalories > 0;
      let badgeHtml = '';
      if (u.adherenceStatus === 'extra_reported') {
        badgeHtml = `<span class="badge badge-warning" style="font-weight: 700;">⚠ Extra Food (+${u.todayExtraCalories} kcal)</span>`;
      } else if (u.adherenceStatus === 'exceeded') {
        badgeHtml = `<span class="badge badge-danger" style="font-weight: 700;">✕ Exceeded Plan</span>`;
      } else if (u.todayLogsCount > 0) {
        badgeHtml = `<span class="badge badge-success" style="font-weight: 700;">✓ Maintaining Diet</span>`;
      } else {
        badgeHtml = `<span class="badge badge-secondary">No Logs Today</span>`;
      }

      const consumed = u.todayTotalCalories || 0;
      const target = u.targetCalories || 2000;

      return `
        <tr>
          <td>
            <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(u.name)}</strong>
            <span class="text-xs text-muted block">${escapeHtml(u.email)}</span>
            <span class="text-xs font-semibold" style="color: var(--primary);">BMI: ${u.bmi || 'N/A'}</span>
          </td>
          <td>${u.age ? u.age + ' yrs' : 'N/A'} / ${escapeHtml(u.gender || 'N/A')}</td>
          <td>
            <strong>${escapeHtml(u.activePlanTitle || 'No Active Plan')}</strong>
            <span class="text-xs text-muted block">Target: ${target} kcal/day</span>
          </td>
          <td>
            ${badgeHtml}
            ${isExtra ? `<div style="font-size: 0.75rem; color: #b45309; margin-top: 4px;">${u.extraLogsCount} off-plan item(s) logged</div>` : ''}
          </td>
          <td>
            <strong style="font-size: 1rem; color: ${consumed > target ? '#b91c1c' : 'var(--primary)'};">${consumed.toLocaleString()}</strong>
            <span class="text-xs text-muted"> / ${target.toLocaleString()} kcal</span>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
              Regular: ${u.todayRegularCalories || 0} | Extra: ${u.todayExtraCalories || 0}
            </div>
          </td>
          <td>
            <div class="flex gap-2" style="flex-wrap: wrap;">
              <button onclick="SHD_Dietitian.openPatientAdherenceModal('${u.id}')" class="btn btn-primary btn-sm" style="font-size: 0.78rem; padding: 4px 10px;">
                Review Logs &amp; Status
              </button>
              <a href="meal-builder.html?patient=${encodeURIComponent(u.name)}&calorieTarget=${target}" class="btn btn-outline btn-sm" style="font-size: 0.78rem; padding: 4px 10px;">
                Adjust Plan
              </a>
              ${u.conversationId ? `<a href="chat.html?conv=${u.conversationId}" class="btn btn-outline btn-sm" style="font-size: 0.78rem; padding: 4px 8px;">Chat</a>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openPatientAdherenceModal(patientId) {
    const modal = document.getElementById('patientAdherenceModal');
    if (!modal) return;
    modal.classList.add('active');

    const nameEl = document.getElementById('adhModalPatientName');
    const metaEl = document.getElementById('adhModalPatientMeta');
    const badgeEl = document.getElementById('adhModalStatusBadge');
    const calsEl = document.getElementById('adhModalCalories');
    const extraEl = document.getElementById('adhModalExtra');
    const extraList = document.getElementById('adhExtraLogsList');
    const extraBadge = document.getElementById('adhExtraCountBadge');
    const prescribedList = document.getElementById('adhPrescribedList');
    const historyTbody = document.getElementById('adhHistoryTableBody');
    const adjustBtn = document.getElementById('adhAdjustPlanBtn');

    nameEl.textContent = 'Loading patient details...';
    extraList.innerHTML = '<div class="text-muted text-xs">Loading logs...</div>';
    prescribedList.innerHTML = '<div class="text-muted text-xs">Loading plan...</div>';

    const res = await dietitianFetch(`/dietitian/patients/${patientId}/adherence`);
    if (!res || !res.success) {
      alert('Failed to load patient adherence data.');
      closeAdherenceModal();
      return;
    }

    const { patient, activePlan, todayLogs, recentLogs } = res;

    nameEl.textContent = `${patient.full_name || 'Patient'} - Diet Adherence Review`;
    metaEl.textContent = `${patient.email || ''} | Age: ${patient.age || 'N/A'} | Goal: ${patient.primary_goal || 'Nutrition'} | Calorie Target: ${activePlan?.target_calories || patient.daily_calorie_target || 2000} kcal`;

    let regularCals = 0;
    let extraCals = 0;
    const extraEntries = [];

    todayLogs.forEach(m => {
      const cal = parseInt(m.calories, 10) || 0;
      if (m.is_extra) {
        extraCals += cal;
        extraEntries.push(m);
      } else {
        regularCals += cal;
      }
    });
    const totalCals = regularCals + extraCals;
    const targetCals = activePlan?.target_calories || patient.daily_calorie_target || 2000;

    calsEl.textContent = `${totalCals.toLocaleString()} / ${targetCals.toLocaleString()} kcal`;
    extraEl.textContent = `${extraCals.toLocaleString()} kcal`;

    if (extraEntries.length > 0) {
      badgeEl.className = 'badge badge-warning';
      badgeEl.textContent = `⚠ Extra Food Reported (+${extraCals} kcal)`;
    } else if (totalCals > targetCals + 50) {
      badgeEl.className = 'badge badge-danger';
      badgeEl.textContent = `✕ Calorie Limit Exceeded`;
    } else if (todayLogs.length > 0) {
      badgeEl.className = 'badge badge-success';
      badgeEl.textContent = `✓ Maintaining Diet Plan`;
    } else {
      badgeEl.className = 'badge badge-secondary';
      badgeEl.textContent = `No Logs Today`;
    }

    // Extra entries with patient notes
    extraBadge.textContent = `${extraEntries.length} entries`;
    if (extraEntries.length === 0) {
      extraList.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-sm); padding: 12px; color: #166534; font-size: 0.85rem;">
          ✓ No extra or off-plan foods reported by patient today. The patient is following the prescribed regimen.
        </div>
      `;
    } else {
      extraList.innerHTML = extraEntries.map(e => `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 12px;">
          <div class="flex justify-between items-center">
            <strong>${escapeHtml(e.meal_name)} (${e.category})</strong>
            <span class="badge badge-warning" style="font-weight: 700;">+${e.calories} kcal</span>
          </div>
          <div style="margin-top: 6px; font-size: 0.85rem; color: #92400e; background: #fef3c7; padding: 6px 10px; border-radius: 4px; border-left: 3px solid #d97706;">
            <strong>Patient Reason Note:</strong> "${escapeHtml(e.notes || 'No explanation note provided')}"
          </div>
          <div class="text-xs text-muted" style="margin-top: 4px;">Logged at: ${new Date(e.logged_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
        </div>
      `).join('');
    }

    // Prescribed items
    if (!activePlan || !activePlan.items || activePlan.items.length === 0) {
      prescribedList.innerHTML = `<div class="text-muted text-xs">No active meal plan assigned to this patient.</div>`;
    } else {
      prescribedList.innerHTML = activePlan.items.map(item => {
        const eatenMatch = todayLogs.find(l => !l.is_extra && l.category === item.category);
        return `
          <div class="flex justify-between items-center" style="background: var(--bg-page); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); font-size: 0.85rem;">
            <div>
              <span class="badge badge-primary" style="margin-right: 6px; font-size: 0.7rem;">${item.category}</span>
              <strong>${escapeHtml(item.recommendation)}</strong>
            </div>
            <div>
              ${eatenMatch ? `<span class="badge badge-success">✓ Eaten</span>` : `<span class="badge badge-secondary" style="opacity: 0.8;">Pending</span>`}
            </div>
          </div>
        `;
      }).join('');
    }

    // History table
    if (!recentLogs || recentLogs.length === 0) {
      historyTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 16px;">No meal log history recorded in the past 7 days.</td></tr>`;
    } else {
      historyTbody.innerHTML = recentLogs.map(l => `
        <tr>
          <td>${new Date(l.logged_for).toLocaleDateString([], {month:'short', day:'numeric'})}</td>
          <td><span class="badge ${l.is_extra ? 'badge-warning' : 'badge-primary'}" style="font-size: 0.7rem;">${l.category}</span></td>
          <td class="font-bold">${escapeHtml(l.meal_name)}</td>
          <td>${l.calories} kcal</td>
          <td>
            ${l.is_extra ? `<span style="color: #b45309; font-size: 0.75rem;">Extra: "${escapeHtml(l.notes || '')}"</span>` : `<span class="text-muted" style="font-size: 0.75rem;">Prescribed Plan</span>`}
          </td>
        </tr>
      `).join('');
    }

    // Setup adjust plan button
    adjustBtn.href = `meal-builder.html?patientId=${patient.id}&patient=${encodeURIComponent(patient.full_name)}&calorieTarget=${targetCals}&extraNotes=${encodeURIComponent(extraEntries.map(e => e.meal_name + ': ' + (e.notes || '')).join(' | '))}`;
  }

  function closeAdherenceModal() {
    const modal = document.getElementById('patientAdherenceModal');
    if (modal) modal.classList.remove('active');
  }

  window.SHD_Dietitian.openPatientAdherenceModal = openPatientAdherenceModal;
  window.SHD_Dietitian.closeAdherenceModal = closeAdherenceModal;
  window.openPatientAdherenceModal = openPatientAdherenceModal;
  window.closeAdherenceModal = closeAdherenceModal;

  /* ==========================================================================
     4. GUIDANCE REQUESTS PAGE
     ========================================================================== */
  async function initGuidanceRequestsPage() {
    await fetchAndRenderGuidanceRequests();
  }

  async function fetchAndRenderGuidanceRequests() {
    const res = await dietitianFetch('/dietitian/guidance-requests');
    cachedRequests = res?.requests || [];

    const isApproved = res?.verified === true || (currentProfile?.status || '').toLowerCase() === 'approved';

    const pendingCountEl = document.getElementById('pendingCount');
    const pending = cachedRequests.filter(r => (r.status || '').toLowerCase() === 'pending');
    if (pendingCountEl) pendingCountEl.textContent = `${pending.length} pending`;

    const tbody = document.getElementById('requestsTable');
    if (!tbody) return;

    if (!isApproved) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 48px 24px;">
            <div style="max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 12px;">
              <div style="width: 52px; height: 52px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold;">!</div>
              <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main, #1e293b); margin: 0;">Verification Required</h3>
              <p style="color: var(--text-muted, #64748b); font-size: 0.9rem; line-height: 1.5; margin: 0;">
                Patients cannot discover or send guidance requests to your profile until your clinical credentials are confirmed by an administrator.
              </p>
              <a href="profile.html" class="btn btn-primary btn-sm" style="margin-top: 6px;">
                Complete & Submit Credentials &rarr;
              </a>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    if (cachedRequests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 32px;">No guidance requests received from patients yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedRequests.map(r => {
      const isPending = (r.status || '').toLowerCase() === 'pending';
      const isAccepted = (r.status || '').toLowerCase() === 'accepted';
      return `
        <tr>
          <td class="font-bold">${escapeHtml(r.userName || 'Patient')}<span class="text-xs text-muted block">${escapeHtml(r.userEmail || '')}</span></td>
          <td>${escapeHtml(r.goal || 'Personal nutrition consultation')}</td>
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
  /* ==========================================================================
     5. MEAL BUILDER PAGE (Advanced Food Catalog & Custom Builder)
     ========================================================================== */
  async function initMealBuilderPage() {
    const form = document.getElementById('builderForm');
    if (!form) return;

    let allStoredFoods = [];
    const selectedMealItems = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: []
    };

    // Set default dates (Today to +7 days)
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    if (startDateInput && !startDateInput.value) {
      const today = new Date();
      startDateInput.value = today.toISOString().split('T')[0];
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (endDateInput) endDateInput.value = nextWeek.toISOString().split('T')[0];
    }

    // 1. Load Assigned Patients
    const selectPatient = document.getElementById('selectPatient');
    const patientHint = document.getElementById('patientMetaHint');
    let patientsList = [];

    if (selectPatient) {
      const res = await dietitianFetch('/dietitian/patients');
      patientsList = res?.patients || [];

      if (patientsList.length > 0) {
        selectPatient.innerHTML = `
          <option value="">-- Choose Assigned Patient --</option>
          ${patientsList.map(p => `
            <option value="${p.id}" data-goal="${escapeHtml(p.goal || '')}" data-cal="${p.dailyCalorieLimit || 2000}" data-weight="${p.weight || ''}">
              ${escapeHtml(p.name)} (${escapeHtml(p.goal || 'General Health')})
            </option>
          `).join('')}
        `;
      } else {
        selectPatient.innerHTML = `<option value="">-- No assigned patients available (Verification Required) --</option>`;
      }

      // Check query params for patient, calorieTarget, and extraNotes
      const urlParams = new URLSearchParams(window.location.search);
      const patientParam = urlParams.get('patient');
      const patientIdParam = urlParams.get('patientId');
      const extraNotesParam = urlParams.get('extraNotes');
      const calorieTargetParam = urlParams.get('calorieTarget');

      if ((patientParam || patientIdParam) && selectPatient) {
        for (let i = 0; i < selectPatient.options.length; i++) {
          const opt = selectPatient.options[i];
          if ((patientIdParam && opt.value === patientIdParam) || 
              (patientParam && opt.text.toLowerCase().includes(patientParam.toLowerCase()))) {
            selectPatient.selectedIndex = i;
            break;
          }
        }
      }

      if (calorieTargetParam) {
        const calInput = document.getElementById('targetCalories');
        if (calInput) calInput.value = calorieTargetParam;
      }

      if (extraNotesParam) {
        let noteAlert = document.getElementById('adherenceAdjustmentAlert');
        if (!noteAlert) {
          noteAlert = document.createElement('div');
          noteAlert.id = 'adherenceAdjustmentAlert';
          noteAlert.className = 'alert alert-warning';
          noteAlert.style.marginBottom = '20px';
          form.prepend(noteAlert);
        }
        noteAlert.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 1.25rem;">⚠️</span>
            <div>
              <strong>Patient Deviation / Extra Eating Reported:</strong>
              <div style="font-style: italic; margin-top: 4px; color: #92400e;">"${decodeURIComponent(extraNotesParam)}"</div>
              <div class="text-xs text-muted" style="margin-top: 4px;">Adjust meal portions, calories, or add satisfying snacks to keep patient adherence high.</div>
            </div>
          </div>
        `;
      }

      function updatePatientMeta() {
        const opt = selectPatient.selectedOptions[0];
        if (opt && opt.value) {
          const goal = opt.dataset.goal || 'General Nutrition';
          const cal = opt.dataset.cal || '2000';
          const weight = opt.dataset.weight ? `${opt.dataset.weight} kg` : 'N/A';
          if (patientHint) {
            patientHint.innerHTML = `<strong>Selected:</strong> ${escapeHtml(opt.text.split('(')[0])} &bull; Goal: <strong>${escapeHtml(goal)}</strong> &bull; Weight: <strong>${weight}</strong> &bull; Daily Target: <strong>${cal} kcal</strong>`;
          }
          const targetCalInput = document.getElementById('targetCalories');
          if (targetCalInput && (!targetCalInput.value || targetCalInput.value === '2000')) {
            targetCalInput.value = cal;
          }
        } else if (patientHint) {
          patientHint.textContent = 'Select an assigned patient to auto-sync their target calories and health goal.';
        }
      }

      selectPatient.addEventListener('change', updatePatientMeta);
      updatePatientMeta();
    }

    // 2. Load Plan Titles & Clinical Protocols from DB
    const planTitleSelect = document.getElementById('planTitleSelect');
    const customTitleWrap = document.getElementById('customTitleWrap');
    const customPlanTitle = document.getElementById('customPlanTitle');
    const btnToggleCustom = document.getElementById('btnToggleCustomTitle');

    if (planTitleSelect) {
      const titlesRes = await dietitianFetch('/dietitian/plan-titles');
      const titles = titlesRes?.titles || [];
      const templates = titlesRes?.templates || [];

      if (titles.length > 0) {
        planTitleSelect.innerHTML = `
          <option value="">-- Select a Plan Title from Database --</option>
          <optgroup label="Clinical Regimens & Goal Protocols">
            ${titles.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
          </optgroup>
          <option value="__custom__">✨ Custom Plan Title (Write your own)...</option>
        `;
      }

      planTitleSelect.addEventListener('change', function () {
        if (this.value === '__custom__') {
          if (customTitleWrap) {
            customTitleWrap.style.display = 'block';
            if (customPlanTitle) customPlanTitle.focus();
          }
        } else {
          if (customTitleWrap && (!customPlanTitle || !customPlanTitle.value)) {
            customTitleWrap.style.display = 'none';
          }
          // Check if template has default calories
          const matched = templates.find(t => t.title === this.value);
          if (matched && matched.defaultCalories) {
            const calInput = document.getElementById('targetCalories');
            if (calInput) calInput.value = matched.defaultCalories;
          }
        }
      });
    }

    if (btnToggleCustom && customTitleWrap) {
      btnToggleCustom.addEventListener('click', function () {
        const isHidden = customTitleWrap.style.display === 'none' || customTitleWrap.style.display === '';
        customTitleWrap.style.display = isHidden ? 'block' : 'none';
        if (isHidden && customPlanTitle) {
          customPlanTitle.focus();
          if (planTitleSelect) planTitleSelect.value = '__custom__';
        }
      });
    }

    // 3. Load Food Catalog from Database
    const categories = ['breakfast', 'lunch', 'dinner', 'snacks'];
    const foodsRes = await dietitianFetch('/dietitian/foods');
    allStoredFoods = foodsRes?.foods || [];

    categories.forEach(cat => {
      const picker = document.getElementById(`foodPicker_${cat}`);
      if (!picker) return;

      const catFoods = allStoredFoods.filter(f => f.category === cat);
      const otherFoods = allStoredFoods.filter(f => f.category !== cat);

      picker.innerHTML = `
        <option value="">-- Choose Stored Food from Database (${cat.toUpperCase()}) --</option>
        <optgroup label="Standard ${cat.toUpperCase()} Database Catalog (${catFoods.length} items)">
          ${catFoods.map(f => `
            <option value="${f.id}" data-name="${escapeHtml(f.name)}" data-cal="${f.calories}" data-p="${f.protein}" data-c="${f.carbs}" data-f="${f.fat}" data-portion="${escapeHtml(f.portion)}">
              ${escapeHtml(f.name)} - ${escapeHtml(f.portion)} (${f.calories} kcal | P:${f.protein}g, C:${f.carbs}g, F:${f.fat}g)
            </option>
          `).join('')}
        </optgroup>
        <optgroup label="Other Available Database Foods (${otherFoods.length} items)">
          ${otherFoods.map(f => `
            <option value="${f.id}" data-name="${escapeHtml(f.name)}" data-cal="${f.calories}" data-p="${f.protein}" data-c="${f.carbs}" data-f="${f.fat}" data-portion="${escapeHtml(f.portion)}">
              ${escapeHtml(f.name)} [${f.category}] - ${escapeHtml(f.portion)} (${f.calories} kcal)
            </option>
          `).join('')}
        </optgroup>
      `;
    });

    // 4. Meal Scope Selector (All vs Specific Meal Category)
    const mealScopeSelect = document.getElementById('mealScopeSelect');
    const scopePillTabs = document.getElementById('scopePillTabs');

    function applyMealScope(scope) {
      if (mealScopeSelect) mealScopeSelect.value = scope;

      if (scopePillTabs) {
        scopePillTabs.querySelectorAll('.scope-tab-pill').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.scope === scope);
        });
      }

      categories.forEach(cat => {
        const card = document.getElementById(`categoryCard_${cat}`);
        if (!card) return;
        if (scope === 'all' || scope === cat) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }

    if (mealScopeSelect) {
      mealScopeSelect.addEventListener('change', function () {
        applyMealScope(this.value);
      });
    }

    if (scopePillTabs) {
      scopePillTabs.addEventListener('click', function (e) {
        const btn = e.target.closest('.scope-tab-pill');
        if (btn && btn.dataset.scope) {
          applyMealScope(btn.dataset.scope);
        }
      });
    }

    // 5. Render & Calculate Category Food Items
    function renderCategoryItems(cat) {
      const listEl = document.getElementById(`itemsList_${cat}`);
      const items = selectedMealItems[cat] || [];

      if (!listEl) return;

      if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-meal-state">No ${cat} items selected yet. Choose from database foods above or add a custom recommendation.</div>`;
      } else {
        listEl.innerHTML = items.map((item, idx) => `
          <div class="food-item-chip">
            <div class="food-item-info">
              <div class="food-item-title">${escapeHtml(item.name)} ${item.custom ? '<span class="badge badge-warning" style="font-size: 0.65rem; padding: 2px 6px;">Custom</span>' : ''}</div>
              <div class="food-item-meta">
                <span class="macro-pill cal" style="font-size: 0.75rem;">${item.calories} kcal</span>
                ${item.portion ? `<span>Portion: ${escapeHtml(item.portion)}</span>` : ''}
                ${item.protein ? `<span class="macro-pill protein" style="font-size: 0.7rem;">P: ${item.protein}g</span>` : ''}
                ${item.carbs ? `<span class="macro-pill carbs" style="font-size: 0.7rem;">C: ${item.carbs}g</span>` : ''}
                ${item.fat ? `<span class="macro-pill fat" style="font-size: 0.7rem;">F: ${item.fat}g</span>` : ''}
              </div>
            </div>
            <button type="button" class="food-item-remove" data-cat="${cat}" data-idx="${idx}" title="Remove item">&times;</button>
          </div>
        `).join('');
      }

      // Update Category Badges
      let catCals = 0, catP = 0, catC = 0, catF = 0;
      items.forEach(it => {
        catCals += Number(it.calories) || 0;
        catP += Number(it.protein) || 0;
        catC += Number(it.carbs) || 0;
        catF += Number(it.fat) || 0;
      });

      const calBadge = document.getElementById(`calBadge_${cat}`);
      const protBadge = document.getElementById(`protBadge_${cat}`);
      const carbBadge = document.getElementById(`carbBadge_${cat}`);
      const fatBadge = document.getElementById(`fatBadge_${cat}`);

      if (calBadge) calBadge.textContent = `${catCals} kcal`;
      if (protBadge) protBadge.textContent = `P: ${catP.toFixed(1)}g`;
      if (carbBadge) carbBadge.textContent = `C: ${catC.toFixed(1)}g`;
      if (fatBadge) fatBadge.textContent = `F: ${catF.toFixed(1)}g`;

      // Update Grand Total Plan Nutrition
      updateGrandTotals();
    }

    function updateGrandTotals() {
      let totalCals = 0, totalP = 0, totalC = 0, totalF = 0;

      categories.forEach(cat => {
        (selectedMealItems[cat] || []).forEach(it => {
          totalCals += Number(it.calories) || 0;
          totalP += Number(it.protein) || 0;
          totalC += Number(it.carbs) || 0;
          totalF += Number(it.fat) || 0;
        });
      });

      const totalCalsEl = document.getElementById('summaryTotalCals');
      const totalProtEl = document.getElementById('summaryTotalProtein');
      const totalCarbsEl = document.getElementById('summaryTotalCarbs');
      const totalFatEl = document.getElementById('summaryTotalFat');
      const syncBtn = document.getElementById('btnSyncTargetCals');

      if (totalCalsEl) totalCalsEl.textContent = `${totalCals.toLocaleString()} kcal`;
      if (totalProtEl) totalProtEl.textContent = `${totalP.toFixed(1)}g`;
      if (totalCarbsEl) totalCarbsEl.textContent = `${totalC.toFixed(1)}g`;
      if (totalFatEl) totalFatEl.textContent = `${totalF.toFixed(1)}g`;
      if (syncBtn) syncBtn.textContent = `⚡ Sync Target Calories with Plan Total (${totalCals} kcal)`;
    }

    // 6. Handle Adding Food Items from Database
    document.querySelectorAll('.btn-add-food').forEach(btn => {
      btn.addEventListener('click', function () {
        const cat = this.dataset.category;
        const picker = document.getElementById(`foodPicker_${cat}`);
        if (!picker || !picker.value) {
          SHD_Dietitian.showNotification(`Please select a food item from the ${cat} list first.`, 'warning');
          return;
        }

        const opt = picker.selectedOptions[0];
        const food = {
          id: picker.value,
          name: opt.dataset.name || opt.text,
          portion: opt.dataset.portion || '',
          calories: parseInt(opt.dataset.cal) || 0,
          protein: parseFloat(opt.dataset.p) || 0,
          carbs: parseFloat(opt.dataset.c) || 0,
          fat: parseFloat(opt.dataset.f) || 0,
          custom: false
        };

        selectedMealItems[cat].push(food);
        picker.selectedIndex = 0; // reset selector
        renderCategoryItems(cat);
        SHD_Dietitian.showNotification(`Added "${food.name}" to ${cat}.`, 'success');
      });
    });

    // 7. Handle Custom Food Builder Toggle & Add
    document.querySelectorAll('.btn-toggle-custom').forEach(btn => {
      btn.addEventListener('click', function () {
        const cat = this.dataset.category;
        const box = document.getElementById(`customBox_${cat}`);
        if (box) {
          box.classList.toggle('open');
          if (box.classList.contains('open')) {
            const input = box.querySelector('.custom-food-name');
            if (input) input.focus();
          }
        }
      });
    });

    document.querySelectorAll('.btn-cancel-custom').forEach(btn => {
      btn.addEventListener('click', function () {
        const cat = this.dataset.category;
        const box = document.getElementById(`customBox_${cat}`);
        if (box) box.classList.remove('open');
      });
    });

    document.querySelectorAll('.btn-save-custom').forEach(btn => {
      btn.addEventListener('click', function () {
        const cat = this.dataset.category;
        const box = document.getElementById(`customBox_${cat}`);
        if (!box) return;

        const nameInput = box.querySelector('.custom-food-name');
        const calInput = box.querySelector('.custom-food-cals');
        const portionInput = box.querySelector('.custom-food-portion');

        const name = (nameInput?.value || '').trim();
        const cals = parseInt(calInput?.value) || 0;
        const portion = (portionInput?.value || '').trim();

        if (!name) {
          SHD_Dietitian.showNotification('Please enter a name for the custom food or dish.', 'warning');
          return;
        }

        selectedMealItems[cat].push({
          name,
          calories: cals,
          portion,
          protein: 0,
          carbs: 0,
          fat: 0,
          custom: true
        });

        // Clear and close
        if (nameInput) nameInput.value = '';
        if (calInput) calInput.value = '';
        if (portionInput) portionInput.value = '';
        box.classList.remove('open');

        renderCategoryItems(cat);
        SHD_Dietitian.showNotification(`Added custom item "${name}" to ${cat}.`, 'success');
      });
    });

    // 8. Handle Removing Food Items (Event Delegation)
    document.addEventListener('click', function (e) {
      const rmBtn = e.target.closest('.food-item-remove');
      if (rmBtn && rmBtn.dataset.cat && rmBtn.dataset.idx !== undefined) {
        const cat = rmBtn.dataset.cat;
        const idx = parseInt(rmBtn.dataset.idx);
        if (selectedMealItems[cat] && selectedMealItems[cat][idx] !== undefined) {
          const removed = selectedMealItems[cat].splice(idx, 1)[0];
          renderCategoryItems(cat);
          SHD_Dietitian.showNotification(`Removed "${removed.name}".`, 'info');
        }
      }
    });

    // 9. Sync Target Calories Button
    const syncBtn = document.getElementById('btnSyncTargetCals');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        let totalCals = 0;
        categories.forEach(cat => {
          (selectedMealItems[cat] || []).forEach(it => {
            totalCals += Number(it.calories) || 0;
          });
        });
        const targetCalInput = document.getElementById('targetCalories');
        if (targetCalInput) {
          targetCalInput.value = totalCals > 0 ? totalCals : 2000;
          SHD_Dietitian.showNotification(`Target daily calories synchronized to plan total (${targetCalInput.value} kcal)!`, 'success');
        }
      });
    }

    // 10. Form Submission
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const patientId = selectPatient?.value;
      if (!patientId) {
        SHD_Dietitian.showNotification('Please select an assigned patient.', 'danger');
        return;
      }

      // Determine Plan Title
      let resolvedTitle = '';
      if (customTitleWrap && customTitleWrap.style.display !== 'none' && customPlanTitle?.value.trim()) {
        resolvedTitle = customPlanTitle.value.trim();
      } else if (planTitleSelect && planTitleSelect.value && planTitleSelect.value !== '__custom__') {
        resolvedTitle = planTitleSelect.value;
      } else if (customPlanTitle?.value.trim()) {
        resolvedTitle = customPlanTitle.value.trim();
      }

      if (!resolvedTitle) {
        SHD_Dietitian.showNotification('Please select a plan title or enter a custom title.', 'danger');
        if (planTitleSelect) planTitleSelect.focus();
        return;
      }

      const targetCalories = parseInt(document.getElementById('targetCalories')?.value) || 2000;
      const startDate = document.getElementById('startDate')?.value || null;
      const endDate = document.getElementById('endDate')?.value || null;

      // Compile items array
      const items = [];
      categories.forEach(cat => {
        (selectedMealItems[cat] || []).forEach((item, idx) => {
          let recText = item.name;
          if (item.portion) recText += ` (${item.portion})`;
          recText += ` [${item.calories} kcal`;
          if (item.protein || item.carbs || item.fat) {
            recText += `, P:${item.protein}g, C:${item.carbs}g, F:${item.fat}g`;
          }
          recText += `]`;

          items.push({
            category: cat,
            recommendation: recText,
            sort_order: idx
          });
        });
      });

      if (items.length === 0) {
        SHD_Dietitian.showNotification('Please add at least one food item or recommendation before publishing.', 'warning');
        return;
      }

      const submitBtn = document.getElementById('submitMealPlanBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing Meal Plan...';
      }

      const payload = {
        patient_id: patientId,
        title: resolvedTitle,
        target_calories: targetCalories,
        start_date: startDate,
        end_date: endDate,
        items
      };

      const res = await dietitianFetch('/dietitian/meal-plans', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish & Assign Meal Plan →';
      }

      if (res && res.success) {
        SHD_Dietitian.showNotification(res.message || 'Meal plan created and assigned successfully!', 'success');
        // Reset selections
        categories.forEach(cat => {
          selectedMealItems[cat] = [];
          renderCategoryItems(cat);
        });
        if (customPlanTitle) customPlanTitle.value = '';
        if (customTitleWrap) customTitleWrap.style.display = 'none';
        if (planTitleSelect) planTitleSelect.selectedIndex = 0;
      } else {
        SHD_Dietitian.showNotification(res?.message || 'Failed to publish meal plan.', 'danger');
      }
    });

    // Initial render of empty state
    categories.forEach(cat => renderCategoryItems(cat));
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
