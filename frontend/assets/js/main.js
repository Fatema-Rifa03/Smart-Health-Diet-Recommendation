/* ==========================================================================
   Smart Health & Diet Recommendation System - Main Navigation & Helper Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  const currentUser = JSON.parse(localStorage.getItem('shd_current_user') || 'null');
  if (currentUser) {
    const displayName = currentUser.full_name || currentUser.name || currentUser.email;
    document.querySelectorAll('.user-profile-menu .font-bold.text-sm').forEach(element => {
      element.textContent = displayName;
    });
  }

  // Keep navigation state and mobile behavior consistent across dashboard pages.
  const currentPath = window.location.pathname.split('/').pop();
  const sidebarLinks = document.querySelectorAll('.sidebar-link');

  sidebarLinks.forEach(link => {
    const href = link.getAttribute('href');
    const isSignOutLink = link.classList.contains('text-danger');
    const isActive = !isSignOutLink && (href === currentPath || (currentPath === '' && href === 'dashboard.html'));
    link.classList.toggle('active', isActive);
  });

  const sidebar = document.querySelector('.sidebar');
  const mainWrapper = document.querySelector('.main-wrapper');

  if (sidebar && mainWrapper) {
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'mobile-menu-button';
    menuButton.setAttribute('aria-label', 'Open navigation menu');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.innerHTML = '<span></span><span></span><span></span>';

    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-label', 'Close navigation menu');

    const header = mainWrapper.querySelector('.top-header');
    if (header) header.prepend(menuButton);
    document.body.appendChild(overlay);

    const setMenuState = isOpen => {
      sidebar.classList.toggle('mobile-open', isOpen);
      overlay.classList.toggle('visible', isOpen);
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    };

    menuButton.addEventListener('click', () => setMenuState(!sidebar.classList.contains('mobile-open')));
    overlay.addEventListener('click', () => setMenuState(false));
    sidebarLinks.forEach(link => link.addEventListener('click', () => setMenuState(false)));
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) setMenuState(false);
    });
  }

  // Global UI helper object
  window.SHD_UI = {
    apiBase: 'http://localhost:5000/api',
    getToken: function () {
      return localStorage.getItem('shd_token');
    },
    request: async function (path, options = {}) {
      const headers = { ...(options.headers || {}) };
      const token = this.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
      const response = await fetch(this.apiBase + path, { ...options, headers });
      let data = {};
      try { data = await response.json(); } catch { /* Empty response such as 204. */ }
      if (response.status === 401) {
        this.clearSession();
        window.location.href = '../auth/login.html';
        throw new Error(data.message || 'Your session has expired');
      }
      if (!response.ok) throw new Error(data.message || 'Request failed');
      return data;
    },
    clearSession: function () {
      localStorage.removeItem('shd_token');
      localStorage.removeItem('shd_current_user');
      document.cookie = 'shd_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    },
    openModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    },
    closeModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    },
    logout: async function () {
      try {
        await fetch('http://localhost:5000/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('shd_token')
          }
        });
      } catch (e) {
        console.error("Logout request failed", e);
      }
      this.clearSession();
      window.location.href = '../auth/login.html';
    }
  };

  document.querySelectorAll('a.text-danger[href*="login.html"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      window.SHD_UI.logout();
    });
  });
});
