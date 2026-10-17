// Inicio de sesión de FRIOTEKA (Firebase Authentication, usuario y contraseña).
// Cada app llama a requireLogin(app) antes de usar la base de datos.
// La sesión queda guardada en el celular: se entra una sola vez.
// Para cerrar sesión en un celular: abrir la app con ?salir al final de la dirección.
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const DOMINIO = "@frioteka.app";

export async function requireLogin(app, opts = {}) {
  const auth = getAuth(app);
  const color = opts.color || "#B40000";
  const titulo = opts.titulo || "FRIOTEKA";

  if (/[?&]salir\b/.test(location.search)) {
    try { await signOut(auth); } catch (e) {}
    history.replaceState(null, "", location.pathname);
  }

  const user = await new Promise(r => { const off = onAuthStateChanged(auth, u => { off(); r(u); }); });
  if (user) { window.FRIO_USUARIO = user.email.replace(DOMINIO, ""); return user; }

  mostrarPantalla(auth, color, titulo);
  return new Promise(() => {}); // la página se recarga al entrar
}

function mostrarPantalla(auth, color, titulo) {
  const w = document.createElement("div");
  w.id = "frio-login";
  w.innerHTML = `
<style>
#frio-login{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;
  background:#f6f6f4;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1b1b}
#frio-login form{width:100%;max-width:320px;display:flex;flex-direction:column;gap:12px}
#frio-login h1{margin:0 0 4px;font-size:26px;font-weight:800;color:${color};text-align:center;letter-spacing:.5px}
#frio-login p{margin:0 0 12px;font-size:14px;color:#666;text-align:center}
#frio-login label{font-size:13px;font-weight:600;color:#444}
#frio-login input{width:100%;box-sizing:border-box;margin-top:4px;padding:14px;font-size:16px;border:1.5px solid #d4d4d0;border-radius:12px;background:#fff;color:#1b1b1b}
#frio-login input:focus{outline:none;border-color:${color}}
#frio-login button{margin-top:6px;padding:15px;font-size:16px;font-weight:700;border:none;border-radius:12px;background:${color};color:#fff;cursor:pointer}
#frio-login button:disabled{opacity:.6}
#frio-login .err{min-height:18px;font-size:14px;color:#b3261e;text-align:center}
@media (prefers-color-scheme:dark){#frio-login{background:#151515;color:#eee}#frio-login p,#frio-login label{color:#aaa}
  #frio-login input{background:#222;border-color:#444;color:#eee}}
</style>
<form autocomplete="on">
  <h1>${titulo}</h1>
  <p>Ingresá con tu usuario. Se pide una sola vez en este celular.</p>
  <label>Usuario<input name="u" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
  <label>Contraseña<input name="p" type="password" autocomplete="current-password" required></label>
  <button type="submit">Entrar</button>
  <div class="err" role="alert"></div>
</form>`;
  (document.body || document.documentElement).appendChild(w);
  const f = w.querySelector("form"), err = w.querySelector(".err"), btn = w.querySelector("button");
  f.u.focus();
  f.addEventListener("submit", async ev => {
    ev.preventDefault();
    let u = f.u.value.trim().toLowerCase();
    if (!u.includes("@")) u += DOMINIO;
    btn.disabled = true; err.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, u, f.p.value);
      location.reload();
    } catch (e) {
      const c = e && e.code || "";
      err.textContent =
        c.includes("network") ? "Sin conexión a internet. Probá de nuevo." :
        c.includes("too-many") ? "Demasiados intentos. Esperá unos minutos." :
        c.includes("disabled") ? "Este usuario está dado de baja." :
        c.includes("operation-not-allowed") || c.includes("configuration") ? "El inicio de sesión todavía no está activado en Firebase." :
        "Usuario o contraseña incorrectos.";
      btn.disabled = false;
    }
  });
}
