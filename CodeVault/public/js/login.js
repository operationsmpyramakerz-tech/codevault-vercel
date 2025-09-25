// CodeVault/public/js/login.js
(function () {
  const form = document.querySelector("form") || document.getElementById("login-form");
  const userEl = document.getElementById("username");
  const passEl = document.getElementById("password");
  const btn = document.getElementById("signin-btn") || document.querySelector("button[type=submit]");
  const toast = (msg, type) => {
    const el = document.getElementById("toast") || document.createElement("div");
    el.id = "toast";
    el.textContent = msg;
    el.style.cssText = "position:fixed;bottom:20px;right:20px;padding:10px 14px;border-radius:8px;background:" + (type === "error" ? "#d33" : "#2a2") + ";color:#fff;z-index:9999";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };

  async function submitLogin(e) {
    e && e.preventDefault();
    btn && (btn.disabled = true, btn.classList.add("loading"));
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 12000);

    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: userEl?.value || "", password: passEl?.value || "" }),
        signal: controller.signal
      });
      clearTimeout(to);

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        toast(data.error || resp.statusText || "Login failed", "error");
        return;
      }
      window.location.assign("/dashboard");
    } catch (err) {
      clearTimeout(to);
      toast(err.name === "AbortError" ? "Login timed out" : "Network error", "error");
    } finally {
      btn && (btn.disabled = false, btn.classList.remove("loading"));
    }
  }

  if (form) form.addEventListener("submit", submitLogin);
  if (btn && !form) btn.addEventListener("click", submitLogin);
})();