function toast(msg, type = "info") {
  const region = document.getElementById("toast-region");
  if (!region) return alert(msg);
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "err" : type === "ok" ? "ok" : ""}`;
  el.textContent = msg;
  region.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (msg.includes("Invalid login")) return "Email atau kata sandi salah.";
  if (msg.includes("already registered")) return "Email sudah terdaftar. Coba masuk.";
  return msg;
}

async function renderAccountNav() {
  const slot = document.getElementById("nav-account");
  if (!slot) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    slot.innerHTML = `<a href="login.html" class="btn btn-outline btn-sm">Masuk</a>`;
    return;
  }
  const { data: profile } = await supabase
    .from("profiles").select("nama, role").eq("id", session.user.id).maybeSingle();
  const nama = profile?.nama || session.user.email.split("@")[0];
  slot.innerHTML = `
    ${profile?.role === "admin" ? `<a href="admin.html" class="btn btn-outline btn-sm">Dashboard</a>` : ""}
    <span style="font-size:14px;color:var(--text-dim)">Hai, ${escapeHtml(nama)}</span>
    <button class="btn btn-outline btn-sm" id="btn-logout">Keluar</button>
  `;
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatRupiah(n) {
  return "Rp" + Math.round(n || 0).toLocaleString("id-ID");
}

function formatJam(dateStr) {
  return new Date(dateStr).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatTanggalJam(dateStr) {
  return new Date(dateStr).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function requireLogin(redirectTo) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.href = `login.html?next=${encodeURIComponent(redirectTo || location.pathname)}`;
    return null;
  }
  return session;
}

function enhanceSelect(select) {
  if (select.dataset.dd) return;
  select.dataset.dd = "1";
  const chevron = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>';
  const wrap = document.createElement("div");
  wrap.className = "dd";
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.tabIndex = -1;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dd-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const label = document.getElementById(select.id + "-label") || document.querySelector(`label[for="${select.id}"]`);
  if (label) trigger.setAttribute("aria-label", label.textContent.trim());
  trigger.innerHTML = `<span class="dd-value"></span><span class="dd-chevron">${chevron}</span>`;
  const menu = document.createElement("ul");
  menu.className = "dd-menu";
  menu.setAttribute("role", "listbox");
  wrap.append(trigger, menu);

  const opts = [...select.options];
  menu.innerHTML = opts.map((o, i) => `<li class="dd-option" role="option" data-i="${i}">${escapeHtml(o.textContent)}</li>`).join("");
  const items = [...menu.children];
  let active = -1;

  function sync() {
    const cur = select.selectedIndex;
    const valEl = trigger.querySelector(".dd-value");
    valEl.textContent = opts[cur] ? opts[cur].textContent : "";
    valEl.classList.toggle("placeholder", !select.value);
    items.forEach((li, i) => li.setAttribute("aria-selected", String(i === cur)));
  }
  function setActive(i) {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((li, j) => li.classList.toggle("active", j === active));
    items[active].scrollIntoView({ block: "nearest" });
  }
  function open() {
    const r = wrap.getBoundingClientRect();
    wrap.classList.toggle("up", window.innerHeight - r.bottom < 300 && r.top > 300);
    wrap.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    setActive(select.selectedIndex);
  }
  function close() { wrap.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); }
  function pick(i) {
    if (select.selectedIndex !== i) { select.selectedIndex = i; select.dispatchEvent(new Event("change", { bubbles: true })); }
    sync(); close(); trigger.focus();
  }

  trigger.addEventListener("click", () => wrap.classList.contains("open") ? close() : open());
  menu.addEventListener("click", (e) => { const li = e.target.closest(".dd-option"); if (li) pick(Number(li.dataset.i)); });
  menu.addEventListener("mousemove", (e) => { const li = e.target.closest(".dd-option"); if (li) setActive(Number(li.dataset.i)); });
  trigger.addEventListener("keydown", (e) => {
    const isOpen = wrap.classList.contains("open");
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      if (!isOpen) { open(); return; }
      if (e.key === "ArrowDown") setActive(active + 1);
      else if (e.key === "ArrowUp") setActive(active - 1);
      else pick(active);
    } else if (e.key === "Escape" && isOpen) { e.preventDefault(); close(); }
    else if (e.key === "Tab") close();
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });
  select.addEventListener("sync", sync);
  select.addEventListener("change", sync);
  sync();
}
document.addEventListener("DOMContentLoaded", () => document.querySelectorAll("select.js-dd").forEach(enhanceSelect));

document.addEventListener("DOMContentLoaded", renderAccountNav);
