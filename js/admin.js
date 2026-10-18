(async function guard() {
  try {
    const { data: { session }, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;
    if (!session) return showGuard("Halaman ini khusus admin. <a href=\"login.html\">Masuk</a> dengan akun admin.");

    const { data: profile, error: profErr } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (profErr) throw profErr;
    if (profile?.role !== "admin") return showGuard("Akun ini belum punya akses admin. Hubungi pemilik project untuk dijadikan admin.");

    document.getElementById("admin-body").style.display = "block";
    initSidebar();
    await loadMasterData();
    loadGame();
    loadAllMasterTables();
  } catch (err) {
    showGuard(
      "Tidak bisa terhubung ke Supabase. Periksa <code>js/supabaseClient.js</code> " +
      "(pastikan SUPABASE_URL dan SUPABASE_ANON_KEY sudah diisi dengan benar) dan pastikan " +
      "<code>supabase/schema.sql</code> sudah dijalankan.<br><br><small>" + friendlyError(err) + "</small>"
    );
  }
})();

function showGuard(message) {
  const guard = document.getElementById("admin-guard");
  if (message) guard.innerHTML = message;
  guard.style.display = "block";
}

function initSidebar() {
  document.querySelectorAll(".admin-side a[data-panel]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".admin-side a[data-panel]").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`panel-${a.dataset.panel}`).classList.add("active");
    });
  });
}

const MASTER_TABLES = {
  platform: "master_platform",
  genre: "master_genre",
  jumlah_pemain: "master_jumlah_pemain",
  mode_main: "master_mode_main",
  gaya: "master_gaya",
};
const MASTER = { platform: [], genre: [], jumlah_pemain: [], mode_main: [], gaya: [] };

async function loadMasterData() {
  await Promise.all(Object.entries(MASTER_TABLES).map(async ([key, table]) => {
    const { data } = await supabase.from(table).select("*").order("urutan");
    MASTER[key] = data || [];
  }));
}

function loadAllMasterTables() {
  Object.keys(MASTER_TABLES).forEach(loadMasterTable);
}

async function loadMasterTable(key) {
  const table = MASTER_TABLES[key];
  const { data, error } = await supabase.from(table).select("*").order("urutan");
  MASTER[key] = data || [];
  const body = document.getElementById(`master-${key}-body`);
  if (error || !data?.length) { body.innerHTML = `<tr><td colspan="4">Belum ada data.</td></tr>`; return; }
  body.innerHTML = data.map(m => `
    <tr>
      <td>${escapeHtml(m.kode)}</td>
      <td>${escapeHtml(m.label)}</td>
      <td>${m.urutan}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${m.id}">Ubah</button>
        <button class="btn btn-danger btn-sm" data-hapus="${m.id}">Hapus</button>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => formMaster(key, data.find(m => m.id === btn.dataset.edit))));
  body.querySelectorAll("[data-hapus]").forEach(btn => btn.addEventListener("click", () => hapusBaris(table, btn.dataset.hapus, () => loadMasterTable(key))));
}

document.querySelectorAll("[data-master-add]").forEach(btn => {
  btn.addEventListener("click", () => formMaster(btn.dataset.masterAdd));
});

function formMaster(key, row) {
  const table = MASTER_TABLES[key];
  openModal(row ? "Ubah data master" : "Tambah data master", [
    { key: "kode", label: "Kode (dipakai sistem, tanpa spasi disarankan)", type: "text", value: row?.kode, required: true },
    { key: "label", label: "Label (tampil ke user)", type: "text", value: row?.label, required: true },
    { key: "urutan", label: "Urutan tampil", type: "number", value: row?.urutan ?? (MASTER[key]?.length ?? 0) + 1 },
  ], async (vals) => {
    const payload = { kode: vals.kode.trim(), label: vals.label.trim(), urutan: Number(vals.urutan) || 0 };
    const q = row ? supabase.from(table).update(payload).eq("id", row.id) : supabase.from(table).insert(payload);
    const { error } = await q;
    if (error) throw error;
    await loadMasterData();
    loadMasterTable(key);
  });
}

let GAME_ROWS = [];

async function loadGame() {
  const { data, error } = await supabase.from("games").select("*").order("judul");
  GAME_ROWS = data || [];
  if (error) { document.getElementById("game-body").innerHTML = `<tr><td colspan="6">Gagal memuat game.</td></tr>`; return; }
  renderGameBody(GAME_ROWS);
}

function renderGameBody(rows) {
  const body = document.getElementById("game-body");
  if (!rows.length) { body.innerHTML = `<tr><td colspan="6">Tidak ada game yang cocok.</td></tr>`; return; }
  body.innerHTML = rows.map(g => `
    <tr>
      <td>${escapeHtml(g.judul)}</td>
      <td>${(g.platform || []).join(", ")}</td>
      <td>${(g.genre || []).join(", ")}</td>
      <td>${g.tahun_rilis ?? "-"}</td>
      <td>${g.likes_count || 0}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${g.id}">Ubah</button>
        <button class="btn btn-danger btn-sm" data-hapus="${g.id}">Hapus</button>
      </td>
    </tr>
  `).join("");
  body.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => formGame(GAME_ROWS.find(g => g.id === btn.dataset.edit))));
  body.querySelectorAll("[data-hapus]").forEach(btn => btn.addEventListener("click", () => hapusBaris("games", btn.dataset.hapus, loadGame)));
}

document.getElementById("game-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return renderGameBody(GAME_ROWS);
  renderGameBody(GAME_ROWS.filter(g =>
    (g.judul || "").toLowerCase().includes(q) ||
    (g.developer || "").toLowerCase().includes(q) ||
    (g.publisher || "").toLowerCase().includes(q)
  ));
});

document.getElementById("btn-add-game").addEventListener("click", () => formGame());

function formGame(row) {
  openModal(row ? "Ubah game" : "Tambah game", [
    { key: "judul", label: "Judul", type: "text", value: row?.judul, required: true },
    { key: "deskripsi", label: "Deskripsi", type: "textarea", value: row?.deskripsi },
    { key: "gambar_url", label: "URL gambar (opsional)", type: "text", value: row?.gambar_url },
    { key: "trailer_url", label: "Link trailer YouTube (opsional)", type: "text", value: row?.trailer_url },
    { key: "tahun_rilis", label: "Tahun rilis", type: "number", value: row?.tahun_rilis ?? new Date().getFullYear() },
    { key: "rating_usia", label: "Rating usia", type: "select", options: ["Semua Umur", "7+", "13+", "16+", "18+"], value: row?.rating_usia || "Semua Umur" },
    { key: "developer", label: "Developer", type: "text", value: row?.developer },
    { key: "publisher", label: "Publisher", type: "text", value: row?.publisher },
    { key: "platform", label: "Perangkat", type: "checkbox-group", options: MASTER.platform, value: row?.platform || ["PS5"] },
    { key: "genre", label: "Genre", type: "checkbox-group", options: MASTER.genre, value: row?.genre || [] },
    { key: "jumlah_pemain", label: "Jumlah pemain", type: "checkbox-group", options: MASTER.jumlah_pemain, value: row?.jumlah_pemain || [] },
    { key: "mode_main", label: "Mode main", type: "checkbox-group", options: MASTER.mode_main, value: row?.mode_main || [] },
    { key: "gaya", label: "Gaya untuk kuis", type: "checkbox-group", options: MASTER.gaya, value: row?.gaya || [] },
  ], async (vals) => {
    const payload = {
      judul: vals.judul, deskripsi: vals.deskripsi, gambar_url: vals.gambar_url,
      trailer_url: (vals.trailer_url || "").trim() || null,
      tahun_rilis: vals.tahun_rilis ? Number(vals.tahun_rilis) : null,
      rating_usia: vals.rating_usia, developer: vals.developer, publisher: vals.publisher,
      platform: vals.platform, genre: vals.genre,
      jumlah_pemain: vals.jumlah_pemain, mode_main: vals.mode_main, gaya: vals.gaya,
    };
    const q = row ? supabase.from("games").update(payload).eq("id", row.id) : supabase.from("games").insert(payload);
    const { error } = await q;
    if (error) throw error;
    loadGame();
  });
}

async function hapusBaris(table, id, reload) {
  if (!confirm("Hapus data ini? Tidak bisa dibatalkan.")) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return toast(friendlyError(error), "error");
  toast("Terhapus.", "ok");
  reload();
}

const scrim = document.getElementById("modal-scrim");
const modalForm = document.getElementById("modal-form");
document.getElementById("modal-close").addEventListener("click", closeModal);
scrim.addEventListener("click", (e) => { if (e.target === scrim) closeModal(); });
function closeModal() { scrim.classList.remove("open"); }

function openModal(title, fields, onSubmit) {
  document.getElementById("modal-title").textContent = title;
  modalForm.innerHTML = fields.map(f => {
    if (f.type === "select") {
      return `<div class="field"><label>${f.label}</label>
        <select name="${f.key}">${f.options.map(o => `<option value="${o}" ${o === f.value ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
    }
    if (f.type === "textarea") {
      return `<div class="field"><label>${f.label}</label><textarea name="${f.key}">${escapeHtml(f.value || "")}</textarea></div>`;
    }
    if (f.type === "checkbox") {
      return `<label class="radio-pill" style="margin-bottom:16px;"><input type="checkbox" name="${f.key}" ${f.value ? "checked" : ""}> ${f.label}</label>`;
    }
    if (f.type === "checkbox-group") {
      const picked = new Set(f.value || []);
      const opts = f.options?.length ? f.options : [];
      return `<div class="field"><label>${f.label}</label>
        ${opts.length > 6 ? `<input type="text" class="pill-search" data-filter-for="${f.key}" placeholder="Cari ${escapeHtml(f.label.toLowerCase())}..." style="margin-bottom:var(--sp-2);">` : ""}
        <div class="tab-pills pill-scroll" data-group="${f.key}">
          ${opts.length ? opts.map(o => `<button type="button" class="tab-pill" data-value="${escapeHtml(o.kode)}" data-label="${escapeHtml(o.label.toLowerCase())}" aria-pressed="${picked.has(o.kode)}">${escapeHtml(o.label)}</button>`).join("") : `<span style="color:var(--text-dim);font-size:var(--fs-sm);">Belum ada data master, tambah dulu lewat menu "Data master".</span>`}
        </div></div>`;
    }
    if (f.type === "image") {
      return `<div class="field"><label>${f.label}</label>
        ${f.value ? `<img src="${escapeHtml(f.value)}" alt="" style="max-height:120px;border-radius:var(--radius-s);margin-bottom:var(--sp-2);display:block;">` : ""}
        <input type="file" name="${f.key}__file" accept="image/*" data-preview-for="${f.key}">
        <input type="text" name="${f.key}" value="${escapeHtml(f.value || "")}" placeholder="atau tempel URL gambar" style="margin-top:var(--sp-2);">
      </div>`;
    }
    return `<div class="field"><label>${f.label}</label>
      <input type="${f.type}" name="${f.key}" value="${escapeHtml(String(f.value ?? ""))}" ${f.required ? "required" : ""}></div>`;
  }).join("") + `<div class="field-error" id="modal-err"></div><button class="btn btn-primary btn-block" type="submit">Simpan</button>`;

  modalForm.querySelectorAll('[data-group] .tab-pill').forEach(btn => {
    btn.addEventListener("click", () => {
      btn.setAttribute("aria-pressed", btn.getAttribute("aria-pressed") !== "true");
    });
  });

  modalForm.querySelectorAll(".pill-search").forEach(input => {
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const group = modalForm.querySelector(`[data-group="${input.dataset.filterFor}"]`);
      group.querySelectorAll(".tab-pill").forEach(btn => {
        btn.style.display = !q || btn.dataset.label.includes(q) ? "" : "none";
      });
    });
  });

  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const vals = {};
    fields.forEach(f => {
      if (f.type === "checkbox-group") {
        const group = modalForm.querySelector(`[data-group="${f.key}"]`);
        vals[f.key] = [...group.querySelectorAll('.tab-pill[aria-pressed="true"]')].map(b => b.dataset.value);
        return;
      }
      if (f.type === "image") {
        const fileEl = modalForm.querySelector(`[name="${f.key}__file"]`);
        const urlEl = modalForm.querySelector(`[name="${f.key}"]`);
        vals[f.key] = urlEl.value.trim();
        vals[`${f.key}__file`] = fileEl.files[0] || null;
        return;
      }
      const el = modalForm.querySelector(`[name="${f.key}"]`);
      vals[f.key] = f.type === "checkbox" ? el.checked : el.value;
    });
    const btn = e.submitter; btn.disabled = true; btn.textContent = "Menyimpan…";
    try {
      await onSubmit(vals);
      closeModal();
      toast("Tersimpan.", "ok");
    } catch (err) {
      document.getElementById("modal-err").textContent = friendlyError(err);
      document.getElementById("modal-err").classList.add("show");
    }
    btn.disabled = false; btn.textContent = "Simpan";
  };

  scrim.classList.add("open");
}
