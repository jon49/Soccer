(() => {
  const doc = document;
  const params = new URLSearchParams(location.search);

  // idb-keyval-compatible store: same dbName/storeName so the service worker
  // can read tokens written here.
  function idb(mode, f) {
    return new Promise((resolve, reject) => {
      let req = indexedDB.open("keyval-store", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("keyval");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        let db = req.result;
        let tx = db.transaction("keyval", mode);
        let result = f(tx.objectStore("keyval"));
        tx.oncomplete = () => (db.close(), resolve(result.result));
        tx.onerror = tx.onabort = () => reject(tx.error);
      };
    });
  }
  const idbGet = (key) => idb("readonly", (store) => store.get(key));
  const idbSet = (key, value) => idb("readwrite", (store) => store.put(value, key));

  // /login?logout: end the session on the server and forget it here.
  async function logout() {
    try {
      let refresh_token = await idbGet("refresh_token");
      if (refresh_token) {
        await fetch("/api/auth/v1/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token }),
        });
      }
    } catch (err) {
      console.error(err);
    }
    await Promise.all([
      idbSet("auth_token", null),
      idbSet("refresh_token", null),
      idbSet("csrf_token", null),
      idbSet("loggedIn", false),
    ]).catch(() => {});
    location.href = "/web/?loggedOut=true";
  }
  if (location.pathname.startsWith("/login") && params.has("logout")) {
    logout();
  }

  // The reset link's code. TrailBase emails use `password_reset_code`; accept
  // legacy `?token=` for old reset emails still in inboxes.
  let resetForm = doc.querySelector("form[action$='/reset_password/update']");
  let resetCode = params.get("password_reset_code") || params.get("token");
  if (resetForm && resetCode) {
    resetForm.password_reset_code.value = resetCode;
    resetForm.hidden = false;
    doc.getElementById("no-token")?.remove();
  }

  // Register and reset: the two passwords must match.
  doc.addEventListener("change", (e) => {
    let form = e.target.form;
    if (!form?.password_repeat || !e.target.name.includes("assword")) return;
    form.password_repeat.setCustomValidity(
      form.password.value === form.password_repeat.value ? "" : "Passwords do not match.",
    );
  });

  async function saveTokens({ auth_token, refresh_token, csrf_token }) {
    await Promise.all(
      [
        auth_token != null && idbSet("auth_token", auth_token),
        refresh_token != null && idbSet("refresh_token", refresh_token),
        csrf_token != null && idbSet("csrf_token", csrf_token),
        idbSet("loggedIn", true),
      ].filter(Boolean),
    );
  }

  function formToJson(form) {
    let obj = {};
    new FormData(form).forEach((v, k) => (obj[k] = v));
    return obj;
  }

  doc.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const action = form.action;
    const payload = formToJson(form);

    let response;
    try {
      response = await fetch(action, {
        method: form.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      writeMessage("Network error. Please try again.");
      return;
    }

    let data;
    if (response.headers.get("content-type")?.includes("application/json")) {
      try {
        data = await response.json();
      } catch {}
    }

    if (!response.ok) {
      writeMessage(data?.message || data?.error || friendlyStatus(response.status));
      return;
    }

    if (action.includes("/api/auth/v1/login")) {
      if (data?.auth_token) await saveTokens(data);
      // e.g. /login?return=/web/join/?code=... from an invite link. Only
      // in-app paths, so the param can't send anyone off-site.
      let back = params.get("return");
      location.href = back?.startsWith("/web/") ? back : "/web/?login=success";
      return;
    }

    if (action.includes("/api/auth/v1/register")) {
      // TrailBase requires email verification before login works. Don't
      // attempt auto-login — direct the user to check their email.
      writeMessage("Registration received. Check your email for a verification link, then log in.");
      return;
    }

    if (action.includes("/api/auth/v1/reset_password/update")) {
      // Logging the user in after a reset requires their email; just send
      // them to /login.
      location.href = "/login";
      return;
    }

    if (action.includes("/api/auth/v1/reset_password/request")) {
      writeMessage("If that email is registered, a reset link will be sent.");
      return;
    }
  });

  function getHtml(text) {
    const template = doc.createElement("template");
    template.innerHTML = text.trim();
    return template.content;
  }

  function friendlyStatus(status) {
    if (status === 429) return "Too many attempts. Please wait a minute and try again.";
    if (status >= 500) {
      return "The server is temporarily unavailable. Please try again in a moment.";
    }
    return `Something went wrong (error ${status}). Please try again.`;
  }

  function writeMessage(msg) {
    let message = getHtml(`<p class="message">${msg}</p>`);
    doc.querySelector("main").prepend(message);
  }
})();
