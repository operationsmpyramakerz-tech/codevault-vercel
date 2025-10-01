document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('loginForm');
  const errorMessage = document.getElementById('error-message');
  const loginBtn = loginForm.querySelector('.login-btn');

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
  }

  function hideError() {
    errorMessage.style.display = 'none';
  }

  function setLoading(loading) {
    if (loading) {
      loginBtn.classList.add('loading');
      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing In...';
    } else {
      loginBtn.classList.remove('loading');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    hideError();
    setLoading(true);

    const formData = new FormData(loginForm);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Save username locally
        try { localStorage.setItem('username', String(username || '')); } catch {}

        // اختار أول صفحة مسموح بيها من السيرفر
        let redirectUrl = '/account';
        if (Array.isArray(result.allowedPages) && result.allowedPages.length > 0) {
          const first = result.allowedPages[0];
          if (first === 'Current Orders') redirectUrl = '/orders';
          else if (first === 'Requested Orders') redirectUrl = '/orders/requested';
          else if (first === 'Assigned Schools Requested Orders') redirectUrl = '/orders/assigned';
          else if (first === 'Create New Order') redirectUrl = '/orders/new';
          else if (first === 'Stocktaking') redirectUrl = '/stocktaking';
          else if (first === 'Funds') redirectUrl = '/funds';
        }

        // ✅ Redirect
        window.location.href = redirectUrl;

      } else {
        showError(result.error || 'Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('username').addEventListener('input', hideError);
  document.getElementById('password').addEventListener('input', hideError);

  // Toggle show/hide password
  const pwdInput = document.getElementById('password');
  const toggleBtn = document.getElementById('togglePassword');
  if (toggleBtn && pwdInput) {
    const eye = toggleBtn.querySelector('.icon-eye');
    const eyeOff = toggleBtn.querySelector('.icon-eye-off');

    toggleBtn.addEventListener('click', () => {
      const show = pwdInput.getAttribute('type') === 'password';
      pwdInput.setAttribute('type', show ? 'text' : 'password');
      toggleBtn.setAttribute('aria-pressed', String(show));
      if (eye && eyeOff) {
        eye.style.display = show ? 'none' : '';
        eyeOff.style.display = show ? '' : 'none';
      }
    });
  }
});