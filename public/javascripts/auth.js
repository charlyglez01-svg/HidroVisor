// ============================================================
// auth.js — Lógica de autenticación del cliente
// Maneja: modal login/signup, sesión y navbar user badge
// ============================================================

(function () {
  'use strict';

  //  Estado interno 
  let currentUser = null;

  //  Referencias DOM 
  const modal      = document.getElementById('authModal');
  const tabsWrap   = modal?.querySelector('.auth-tabs');
  const tabs       = modal?.querySelectorAll('.auth-tab');
  const formLogin  = document.getElementById('authFormLogin');
  const formSignup = document.getElementById('authFormSignup');
  const msgBox     = document.getElementById('authMsg');

  const btnLogin = document.getElementById('btnLogin');
  const ubadge   = document.getElementById('ubadge');
  const uav      = document.getElementById('uav');
  const uname    = document.getElementById('uname');

  // Cambio de modo login <-> signup 
  function switchMode(mode) {
    if (!tabsWrap) return;
    tabsWrap.dataset.active = mode;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.authMode === mode));
    formLogin.style.display  = mode === 'login'  ? '' : 'none';
    formSignup.style.display = mode === 'signup' ? '' : 'none';
    hideMsg();
  }

  tabs?.forEach(t => t.addEventListener('click', () => switchMode(t.dataset.authMode)));

  modal?.querySelectorAll('.auth-switch-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      switchMode(a.dataset.switchTo);
    });
  });

  // Mensajes dentro del modal 
  function showMsg(texto, tipo = 'error') {
    if (!msgBox) return;
    msgBox.textContent = texto;
    msgBox.className = `auth-msg show ${tipo}`;
  }
  function hideMsg() {
    if (msgBox) msgBox.className = 'auth-msg';
  }

  //  Estado de carga del formulario
  function setLoading(form, loading) {
    const btn    = form.querySelector('.auth-submit-btn');
    const inputs = form.querySelectorAll('input');
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
    inputs.forEach(i => i.disabled = loading);
  }

  //  Cerrar y resetear el modal
  function closeAndReset() {
    if (!modal) return;
    const m = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
    m.hide();
    setTimeout(() => {
      formLogin.reset();
      formSignup.reset();
      hideMsg();
      switchMode('login');
    }, 400);
  }

  //  Actualizar la navbar con los datos del usuario 
  function renderUser(user) {
    currentUser = user;

    // Avisa al HTML de que el usuario ha entrado
    document.body.classList.toggle('user-logged-in', !!user);

    if (user) {
      if (btnLogin) btnLogin.style.display = 'none';
      if (ubadge)   ubadge.classList.add('logged');
      if (uname)    uname.textContent = user.nombre || user.email.split('@')[0];
      if (uav) {
        // Inicial del nombre para el avatar circular
        uav.textContent = (user.nombre || user.email || 'U').trim().charAt(0).toUpperCase();
      }
    } else {
      if (btnLogin) btnLogin.style.display = '';
      if (ubadge)   ubadge.classList.remove('logged', 'open');
    }
  }

  //  Verificar sesión activa al cargar
  async function checkSession() {
    try {
      const res  = await fetch('/auth/me', { credentials: 'same-origin' });
      const json = await res.json();
      renderUser(json.ok ? json.user : null);
    } catch {
      renderUser(null);
    }
  }

  //  Submit LOGIN
  formLogin?.addEventListener('submit', async e => {
    e.preventDefault();
    hideMsg();

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      showMsg('Introduce email y contraseña');
      return;
    }

    setLoading(formLogin, true);
    try {
      const res  = await fetch('/auth/login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify({ email, password })
      });
      const json = await res.json();

      if (!json.ok) {
        showMsg(json.msg || 'Credenciales incorrectas');
        return; 
      }

      showMsg('✓ Sesión iniciada', 'success');
      renderUser(json.user);
      setTimeout(closeAndReset, 700);
      if (typeof showNotif === 'function') showNotif(`👋 Hola, ${json.user.nombre}`);

    } catch (err) {
      console.error('[auth] Error en login:', err);
      showMsg('No se pudo conectar con el servidor');
    } finally {
      setLoading(formLogin, false);
    }
  });

  //  Submit REGISTRO
  formSignup?.addEventListener('submit', async e => {
    e.preventDefault();
    hideMsg();

    const nombre    = document.getElementById('signupNombre').value.trim();
    const email     = document.getElementById('signupEmail').value.trim();
    const password  = document.getElementById('signupPassword').value;
    const password2 = document.getElementById('signupPassword2').value;

    if (!nombre || !email || !password) { showMsg('Completa todos los campos'); return; }
    if (password.length < 8)            { showMsg('La contraseña debe tener al menos 8 caracteres'); return; }
    if (password !== password2)         { showMsg('Las contraseñas no coinciden'); return; }

    setLoading(formSignup, true);
    try {
      const res  = await fetch('/auth/registro', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify({ nombre, email, password, password2 })
      });
      const json = await res.json();

      if (!json.ok) {
        showMsg(json.msg || 'No se pudo crear la cuenta');
        return;
      }

      showMsg('✓ Cuenta creada correctamente', 'success');
      renderUser(json.user);
      setTimeout(closeAndReset, 900);
      if (typeof showNotif === 'function') showNotif(`👋 Bienvenido, ${json.user.nombre}`);

    } catch (err) {
      console.error('[auth] Error en registro:', err);
      showMsg('No se pudo conectar con el servidor');
    } finally {
      setLoading(formSignup, false);
    }
  });

  //  Logout
  async function logout() {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {}
    
    renderUser(null);
    if (typeof showNotif === 'function') showNotif('Sesión cerrada 👍🏻');
    
    // Al cerrar sesión, si estamos en una sección protegida, volvemos a inicio
    const rutasProtegidas = ['estadisticas', 'noticias', 'mapas'];
    const seccionActiva = document.querySelector('.section-page.active')?.id.replace('sec', '').toLowerCase();
    
    if (seccionActiva && rutasProtegidas.includes(seccionActiva)) {
        window.goToSection('inicio');
    }
  }

  //  Menú desplegable del avatar 
  ubadge?.querySelector('.user-info')?.addEventListener('click', e => {
    e.stopPropagation();
    ubadge.classList.toggle('open');
  });
  
  document.addEventListener('click', e => {
    if (ubadge && !ubadge.contains(e.target)) ubadge.classList.remove('open');
  });

  //  API pública
  window.HV_Auth = {
    getUser:  () => currentUser,
    isLogged: () => !!currentUser,
    logout
  };

  // Aliases de compatibilidad
  window.doLogin  = () => {
      const modalInstance = new bootstrap.Modal(modal);
      modalInstance.show();
  };
  
  window.doLogout = logout;

  // Enlazamos el botón del HTML directamente con la función logout si existe
  const btnLogout = document.getElementById('btnLogout');
  if(btnLogout) {
      btnLogout.addEventListener('click', (e) => {
          e.preventDefault();
          logout();
      });
  }

  // Init
  document.addEventListener('DOMContentLoaded', checkSession);

})();