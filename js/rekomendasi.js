const OPSI = { genre: [], platform: [], pemain: [], mode: [] };
let GAYA_OPSI = [];

const MASTER_TABLES = {
  genre: "master_genre", platform: "master_platform",
  pemain: "master_jumlah_pemain", mode: "master_mode_main",
};

async function loadMasterOpsi() {
  const [genre, platform, pemain, mode, gaya] = await Promise.all([
    supabase.from("master_genre").select("*").order("urutan"),
    supabase.from("master_platform").select("*").order("urutan"),
    supabase.from("master_jumlah_pemain").select("*").order("urutan"),
    supabase.from("master_mode_main").select("*").order("urutan"),
    supabase.from("master_gaya").select("*").order("urutan"),
  ]);
  const toPairs = (res) => (res.data || []).map(r => [r.kode, r.label]);
  OPSI.genre = toPairs(genre);
  OPSI.platform = toPairs(platform);
  OPSI.pemain = toPairs(pemain);
  OPSI.mode = toPairs(mode);
  GAYA_OPSI = toPairs(gaya);
}

let ALL_GAMES = [];
const filterState = { search: "", genre: [], platform: [], pemain: [], mode: [], gaya: [], tahunMin: null, tahunMaks: null, rating: "", sort: "relevan" };

const params = new URLSearchParams(location.search);
function setMode(mode) {
  document.querySelectorAll("#mode-tabs .tab-pill").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  document.getElementById("panel-cari").style.display = mode === "cari" ? "block" : "none";
  document.getElementById("panel-kuis").style.display = mode === "kuis" ? "block" : "none";
  document.getElementById("panel-hof").style.display = mode === "hof" ? "block" : "none";
  const resultShown = document.getElementById("quiz-result").style.display !== "none";
  document.getElementById("quiz-restart").style.display = (mode === "kuis" && resultShown) ? "inline-flex" : "none";
  if (mode === "hof") renderHof();
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  history.replaceState(null, "", url);
}
document.getElementById("mode-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-pill");
  if (btn) setMode(btn.dataset.mode);
});
setMode(params.get("mode") === "kuis" ? "kuis" : params.get("mode") === "hof" ? "hof" : "cari");
if (params.get("q")) { filterState.search = params.get("q"); document.getElementById("f-search").value = params.get("q"); }

(async function init() {
  const [{ data, error }] = await Promise.all([
    supabase.from("games").select("*"),
    loadMasterOpsi(),
  ]);
  if (error || !data) {
    document.getElementById("cari-grid").innerHTML = `<div class="empty-state">Gagal memuat data game.</div>`;
    return;
  }
  ALL_GAMES = data;
  buildFilterChips();
  buildQuizOptions();
  siapkanFitur();
  applyFilters();
})();

const LIKES_KEY = "dh2_liked_games";
function getLikedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(LIKES_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveLikedSet(set) {
  try { localStorage.setItem(LIKES_KEY, JSON.stringify([...set])); } catch { /* localStorage tidak tersedia, abaikan */ }
}
let LIKED = getLikedSet();

async function toggleLike(id, btn) {
  if (btn) btn.disabled = true;
  const sudah = LIKED.has(id);
  const game = ALL_GAMES.find(g => g.id === id);
  try {
    const { data, error } = await supabase.rpc(sudah ? "batal_sukai_game" : "sukai_game", { p_id: id });
    if (error) throw error;
    if (sudah) LIKED.delete(id); else LIKED.add(id);
    saveLikedSet(LIKED);
    if (game) game.likes_count = typeof data === "number" ? data : (game.likes_count || 0) + (sudah ? -1 : 1);
    document.querySelectorAll(`[data-like="${id}"]`).forEach(b => {
      b.setAttribute("aria-pressed", String(!sudah));
      b.querySelector(".like-count").textContent = game ? game.likes_count : "";
      b.querySelector(".like-label").textContent = sudah ? "Sukai game ini" : "Disukai";
    });
    if (document.getElementById("panel-hof").style.display !== "none") renderHof();
  } catch (err) {
    toast("Gagal menyimpan suka, coba lagi.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function likeButtonHtml(g) {
  const sudah = LIKED.has(g.id);
  return `<button class="btn btn-outline btn-sm btn-block like-btn" type="button" data-like="${g.id}" aria-pressed="${sudah}">
    <span class="heart" aria-hidden="true"></span>
    <span class="like-label">${sudah ? "Disukai" : "Sukai game ini"}</span>
    <span class="like-count" title="Jumlah suka">${g.likes_count || 0}</span>
  </button>`;
}
function attachLikeHandlers(scope) {
  scope.querySelectorAll("[data-like]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleLike(btn.dataset.like, btn); });
  });
}

function renderHof() {
  const list = document.getElementById("hof-list");
  const top = [...ALL_GAMES].filter(g => (g.likes_count || 0) > 0).sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 10);
  if (!top.length) {
    list.innerHTML = `<div class="empty-state">Belum ada game yang disukai. Klik ikon hati di kartu game buat mulai Hall of Fame.</div>`;
    return;
  }
  list.innerHTML = top.map((g, i) => {
    const initial = (g.judul || "?").trim().charAt(0).toUpperCase();
    return `
    <div class="hof-row is-clickable" data-detail="${g.id}" role="button" tabindex="0">
      <div class="hof-rank">${i + 1}</div>
      <div class="hof-thumb${g.gambar_url ? " has-img" : ""}" data-initial="${escapeHtml(initial)}" style="${g.gambar_url ? `background-image:url('${g.gambar_url}');` : ""}"></div>
      <div class="hof-info">
        <h3>${escapeHtml(g.judul)}</h3>
        <span>${(g.genre || []).slice(0, 3).join(", ") || "Game"}${g.tahun_rilis ? ` · ${g.tahun_rilis}` : ""}</span>
      </div>
      <div class="hof-likes">❤ ${g.likes_count || 0}</div>
    </div>`;
  }).join("");
}

function buildQuizOptions() {
  const fill = (key, list) => {
    const el = document.querySelector(`.quiz-options[data-key="${key}"]`);
    if (!el) return;
    el.innerHTML = list.map(([val, label]) => `<button class="quiz-opt" data-value="${escapeHtml(val)}">${escapeHtml(label)}</button>`).join("");
  };
  fill("jumlah_pemain", OPSI.pemain);
  fill("genre", OPSI.genre);
  fill("gaya", GAYA_OPSI);
  fill("mode_main", OPSI.mode);
  fill("platform", OPSI.platform);
}

function buildFilterChips() {
  const build = (containerId, list, key) => {
    const el = document.getElementById(containerId);
    el.innerHTML = list.map(([val, label]) => `<button class="tab-pill" data-value="${val}" aria-pressed="false">${escapeHtml(label)}</button>`).join("");
    el.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-pill");
      if (!btn) return;
      const pressed = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", String(!pressed));
      filterState[key] = [...el.querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.value);
      applyFilters();
    });
  };
  build("f-genre", OPSI.genre, "genre");
  build("f-platform", OPSI.platform, "platform");
  build("f-pemain", OPSI.pemain, "pemain");
  build("f-mode", OPSI.mode, "mode");
  build("f-gaya", GAYA_OPSI, "gaya");
}

let searchDebounce;
document.getElementById("f-search").addEventListener("input", (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { filterState.search = e.target.value.trim().toLowerCase(); applyFilters(); }, 200);
});

let tahunDebounce;
function bacaTahun(el) {
  const v = el.value.trim();
  return /^\d{4}$/.test(v) ? Number(v) : null;
}
function terapkanTahun() {
  let min = bacaTahun(document.getElementById("f-tahun-min"));
  let maks = bacaTahun(document.getElementById("f-tahun-maks"));
  if (min != null && maks != null && min > maks) [min, maks] = [maks, min];
  filterState.tahunMin = min;
  filterState.tahunMaks = maks;
  applyFilters();
}
["f-tahun-min", "f-tahun-maks"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener("input", () => { clearTimeout(tahunDebounce); tahunDebounce = setTimeout(terapkanTahun, 250); });
  el.addEventListener("change", terapkanTahun);
});
document.getElementById("f-rating").addEventListener("change", (e) => { filterState.rating = e.target.value; applyFilters(); });
document.getElementById("f-sort").addEventListener("change", (e) => { filterState.sort = e.target.value; applyFilters(); });

document.getElementById("f-reset").addEventListener("click", () => {
  filterState.search = ""; filterState.genre = []; filterState.platform = [];
  filterState.pemain = []; filterState.mode = []; filterState.gaya = []; filterState.tahunMin = null; filterState.tahunMaks = null;
  filterState.rating = ""; filterState.sort = "relevan";
  document.getElementById("f-search").value = "";
  document.getElementById("f-tahun-min").value = "";
  document.getElementById("f-tahun-maks").value = "";
  document.getElementById("f-rating").value = "";
  document.getElementById("f-sort").value = "relevan";
  ["f-rating", "f-sort"].forEach(id => document.getElementById(id).dispatchEvent(new Event("sync")));
  document.querySelectorAll("#panel-cari .tab-pill").forEach(b => b.setAttribute("aria-pressed", "false"));
  applyFilters();
});

function cocokArray(gameArr, pilihan) {
  if (!pilihan.length) return true;
  return pilihan.some(p => (gameArr || []).includes(p));
}

function preferensiAktifCari() {
  return filterState.genre.length > 0 || filterState.pemain.length > 0 || filterState.mode.length > 0 || filterState.gaya.length > 0;
}
function skorCari(g) {
  if (!preferensiAktifCari() || !ALL_KEYS.length) return null;
  const userVector = ALL_KEYS.map(k =>
    filterState.genre.includes(k) || filterState.pemain.includes(k) || filterState.gaya.includes(k) || filterState.mode.includes(k) ? 1 : 0
  );
  return cosine(userVector, vektorGame(g));
}

const PREF_KEY = "dh2_pref_context";
function simpanKonteksPreferensi(sumber, pref, topGameId, topSkor) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      sumber,
      genre: pref.genre || [], pemain: pref.pemain || [], gaya: pref.gaya || [], mode: pref.mode || [],
      topGameId, topSkor, waktu: Date.now(),
    }));
  } catch {}
}

function applyFilters() {
  let hasil = ALL_GAMES.filter(g => {
    if (filterState.search) {
      const teks = `${g.judul} ${g.developer || ""} ${g.publisher || ""}`.toLowerCase();
      if (!teks.includes(filterState.search)) return false;
    }
    if (!cocokArray(g.genre, filterState.genre)) return false;
    if (!cocokArray(g.platform, filterState.platform)) return false;
    if (!cocokArray(g.jumlah_pemain, filterState.pemain)) return false;
    if (!cocokArray(g.mode_main, filterState.mode)) return false;
    if (!cocokArray(g.gaya, filterState.gaya)) return false;
    if (filterState.tahunMin && (!g.tahun_rilis || g.tahun_rilis < filterState.tahunMin)) return false;
    if (filterState.tahunMaks && (!g.tahun_rilis || g.tahun_rilis > filterState.tahunMaks)) return false;
    if (filterState.rating && g.rating_usia !== filterState.rating) return false;
    return true;
  });

  const skor = new Map(hasil.map(g => [g.id, skorCari(g)]));
  const relevansi = (g) => skor.get(g.id) ?? -1;

  if (filterState.sort === "relevan") hasil.sort((a, b) => relevansi(b) - relevansi(a) || (b.likes_count || 0) - (a.likes_count || 0));
  else if (filterState.sort === "populer") hasil.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0) || relevansi(b) - relevansi(a));
  else if (filterState.sort === "terbaru") hasil.sort((a, b) => (b.tahun_rilis || 0) - (a.tahun_rilis || 0) || relevansi(b) - relevansi(a));
  else if (filterState.sort === "az") hasil.sort((a, b) => a.judul.localeCompare(b.judul));

  if (preferensiAktifCari() && hasil.length) {
    const top = hasil.reduce((best, g) => (skor.get(g.id) ?? -1) > (skor.get(best.id) ?? -1) ? g : best, hasil[0]);
    simpanKonteksPreferensi("cari", filterState, top.id, skor.get(top.id) ?? 0);
  }

  renderCariGrid(hasil, skor);
}

function renderCariGrid(list, skor) {
  document.getElementById("f-count").textContent = `${list.length} game ditemukan`;
  const grid = document.getElementById("cari-grid");
  if (!list.length) { grid.innerHTML = `<div class="empty-state">Tidak ada game yang cocok dengan filter ini.</div>`; return; }
  grid.innerHTML = list.map(g => gameCardHtml(g, skor ? skor.get(g.id) : skorCari(g))).join("");
  attachPilihHandlers(grid);
}

function gameCardHtml(g, skor) {
  const initial = (g.judul || "?").trim().charAt(0).toUpperCase();
  return `
    <div class="card game-detail-card is-clickable" data-detail="${g.id}" role="button" tabindex="0" aria-label="Lihat detail ${escapeHtml(g.judul)}">
      <div class="game-thumb${g.gambar_url ? " has-img" : ""}" data-initial="${escapeHtml(initial)}" style="${g.gambar_url ? `background-image:url('${g.gambar_url}');` : ""}">
        ${skor != null ? `<span class="match-badge" style="position:absolute;top:var(--sp-3);left:var(--sp-3);">${Math.round(skor * 100)}% cocok</span>` : ""}
      </div>
      <div class="game-body">
        <h3>${escapeHtml(g.judul)}</h3>
        <p>${escapeHtml(g.deskripsi || "")}</p>
        <div class="game-meta">
          ${g.tahun_rilis ? `<span class="meta-chip">${g.tahun_rilis}</span>` : ""}
          ${g.rating_usia ? `<span class="meta-chip">${escapeHtml(g.rating_usia)}</span>` : ""}
          ${(g.genre || []).map(x => `<span class="meta-chip">${escapeHtml(x)}</span>`).join("")}
        </div>
        <div class="game-meta" style="margin-top:var(--sp-2);">
          ${(g.platform || []).map(x => `<span class="meta-chip meta-chip-outline">${escapeHtml(x)}</span>`).join("")}
        </div>
        <div style="margin-top:var(--sp-4);">${likeButtonHtml(g)}</div>
      </div>
    </div>`;
}

function attachPilihHandlers(scope) {
  attachLikeHandlers(scope);
}

let FITUR = { genre: [], pemain: [], gaya: [], mode: [] };
let ALL_KEYS = [];

function siapkanFitur() {
  FITUR = {
    genre: OPSI.genre.map(o => o[0]),
    pemain: OPSI.pemain.map(o => o[0]),
    gaya: GAYA_OPSI.map(o => o[0]),
    mode: OPSI.mode.map(o => o[0]),
  };
  ALL_KEYS = [...FITUR.genre, ...FITUR.pemain, ...FITUR.gaya, ...FITUR.mode];
}

function vektorGame(game) {
  const set = new Set([...(game.genre || []), ...(game.jumlah_pemain || []), ...(game.gaya || []), ...(game.mode_main || [])]);
  return ALL_KEYS.map(k => set.has(k) ? 1 : 0);
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const quizState = { step: 1, jawaban: { jumlah_pemain: [], genre: [], gaya: [], mode_main: [], platform: [] } };
const STEPS = 5;
const MULTI_KEYS = new Set(["genre", "gaya", "mode_main", "platform"]);

document.querySelectorAll("#panel-kuis .quiz-options").forEach(group => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".quiz-opt");
    if (!btn) return;
    const key = group.dataset.key;
    const val = btn.dataset.value;
    if (MULTI_KEYS.has(key)) {
      btn.setAttribute("aria-pressed", btn.getAttribute("aria-pressed") === "true" ? "false" : "true");
      quizState.jawaban[key] = [...group.querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.value);
    } else {
      group.querySelectorAll(".quiz-opt").forEach(b => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      quizState.jawaban[key] = [val];
    }
  });
});

function goStep(n) {
  quizState.step = n;
  document.querySelectorAll("#panel-kuis .quiz-step").forEach(s => s.classList.toggle("active", Number(s.dataset.step) === n));
  document.getElementById("quiz-bar").style.width = `${(n / STEPS) * 100}%`;
  document.getElementById("quiz-back").disabled = n === 1;
  document.getElementById("quiz-next").textContent = n === STEPS ? "Lihat rekomendasi" : "Lanjut";
}
document.getElementById("quiz-back").addEventListener("click", () => goStep(Math.max(1, quizState.step - 1)));
document.getElementById("quiz-next").addEventListener("click", () => {
  if (quizState.step < STEPS) { goStep(quizState.step + 1); return; }
  tampilkanRekomendasiKuis();
});
document.getElementById("quiz-restart").addEventListener("click", () => {
  quizState.jawaban = { jumlah_pemain: [], genre: [], gaya: [], mode_main: [], platform: [] };
  document.querySelectorAll("#panel-kuis .quiz-opt").forEach(b => b.setAttribute("aria-pressed", "false"));
  document.getElementById("quiz-area").style.display = "block";
  document.getElementById("quiz-result").style.display = "none";
  document.getElementById("quiz-restart").style.display = "none";
  goStep(1);
});

function tampilkanRekomendasiKuis() {
  const { jumlah_pemain, genre, gaya, mode_main, platform } = quizState.jawaban;
  const userVector = ALL_KEYS.map(k =>
    genre.includes(k) || jumlah_pemain.includes(k) || gaya.includes(k) || mode_main.includes(k) ? 1 : 0
  );

  let kandidat = ALL_GAMES.filter(g => !platform.length || cocokArray(g.platform, platform));
  if (!kandidat.length) kandidat = ALL_GAMES;

  const diberiSkor = kandidat.map(g => ({ game: g, skor: cosine(userVector, vektorGame(g)) }));
  diberiSkor.sort((a, b) => b.skor - a.skor || (b.game.likes_count || 0) - (a.game.likes_count || 0));
  const top = diberiSkor.slice(0, 6);

  if (top.length) {
    simpanKonteksPreferensi("kuis", { genre, pemain: jumlah_pemain, gaya, mode: mode_main }, top[0].game.id, top[0].skor);
  }

  document.getElementById("quiz-area").style.display = "none";
  const resultBox = document.getElementById("quiz-result");
  resultBox.style.display = "block";
  document.getElementById("quiz-restart").style.display = "inline-flex";
  document.getElementById("quiz-result-note").textContent =
    "Diurutkan pakai content-based filtering: mencocokkan fitur tiap game (genre, jumlah pemain, gaya, mode main) dengan jawaban kamu.";

  document.getElementById("result-grid").innerHTML = top.map(({ game, skor }) => {
    const initial = (game.judul || "?").trim().charAt(0).toUpperCase();
    return `
    <div class="card game-detail-card is-clickable" data-detail="${game.id}" role="button" tabindex="0" aria-label="Lihat detail ${escapeHtml(game.judul)}">
      <div class="game-thumb${game.gambar_url ? " has-img" : ""}" data-initial="${escapeHtml(initial)}" style="${game.gambar_url ? `background-image:url('${game.gambar_url}');` : ""}">
        <span class="match-badge" style="position:absolute;top:var(--sp-3);left:var(--sp-3);">${Math.round(skor * 100)}% cocok</span>
      </div>
      <div class="game-body">
        <h3>${escapeHtml(game.judul)}</h3>
        <p>${escapeHtml(game.deskripsi || "")}</p>
        <div class="game-meta">
          ${game.tahun_rilis ? `<span class="meta-chip">${game.tahun_rilis}</span>` : ""}
          ${(game.platform || []).slice(0, 3).map(x => `<span class="meta-chip meta-chip-outline">${escapeHtml(x)}</span>`).join("")}
        </div>
        <div style="margin-top:var(--sp-4);">${likeButtonHtml(game)}</div>
      </div>
    </div>`;
  }).join("");
  attachPilihHandlers(resultBox);
}


const labelDari = (list, kode) => (list.find(([k]) => k === kode) || [, kode])[1];

function youtubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else { const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?]+)/); if (m) id = m[2]; }
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

const gmScrim = document.getElementById("gm-scrim");
const gmBox = document.getElementById("gm");
let gmLastFocus = null;

function bukaDetail(id) {
  const g = ALL_GAMES.find(x => x.id === id);
  if (!g) return;
  gmLastFocus = document.activeElement;
  const vid = youtubeId(g.trailer_url);
  const initial = (g.judul || "?").trim().charAt(0).toUpperCase();
  const chips = (arr, list, outline) => (arr || []).map(k => `<span class="meta-chip${outline ? " meta-chip-outline" : ""}">${escapeHtml(labelDari(list, k))}</span>`).join("");
  const baris = (label, val) => val ? `<div class="gm-fact"><span>${label}</span><strong>${escapeHtml(String(val))}</strong></div>` : "";

  const media = vid
    ? `<div class="gm-video"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?rel=0" title="Trailer ${escapeHtml(g.judul)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : `<div class="gm-video gm-video-empty${g.gambar_url ? " has-img" : ""}" data-initial="${escapeHtml(initial)}" style="${g.gambar_url ? `background-image:url('${g.gambar_url}');` : ""}">${g.trailer_url ? "" : `<span>Trailer belum tersedia</span>`}</div>`;

  gmBox.innerHTML = `
    <button class="gm-close" type="button" aria-label="Tutup">×</button>
    ${media}
    <div class="gm-body">
      <h2 id="gm-title">${escapeHtml(g.judul)}</h2>
      <div class="game-meta" style="margin-bottom:var(--sp-5);">
        ${g.tahun_rilis ? `<span class="meta-chip">${g.tahun_rilis}</span>` : ""}
        ${g.rating_usia ? `<span class="meta-chip">${escapeHtml(g.rating_usia)}</span>` : ""}
      </div>
      <p class="gm-desc">${escapeHtml(g.deskripsi || "Belum ada deskripsi.")}</p>

      <div class="gm-section"><div class="sidebar-section-head">Genre</div><div class="game-meta">${chips(g.genre, OPSI.genre) || "-"}</div></div>
      <div class="gm-section"><div class="sidebar-section-head">Perangkat</div><div class="game-meta">${chips(g.platform, OPSI.platform, true) || "-"}</div></div>
      <div class="gm-section"><div class="sidebar-section-head">Jumlah pemain</div><div class="game-meta">${chips(g.jumlah_pemain, OPSI.pemain) || "-"}</div></div>
      <div class="gm-section"><div class="sidebar-section-head">Mode main</div><div class="game-meta">${chips(g.mode_main, OPSI.mode) || "-"}</div></div>
      <div class="gm-section"><div class="sidebar-section-head">Suasana</div><div class="game-meta">${chips(g.gaya, GAYA_OPSI) || "-"}</div></div>

      <div class="gm-facts">${baris("Developer", g.developer)}${baris("Publisher", g.publisher)}</div>
      <div style="margin-top:var(--sp-6);">${likeButtonHtml(g)}</div>
    </div>`;
  attachLikeHandlers(gmBox);
  gmBox.scrollTop = 0;
  gmScrim.classList.add("open");
  gmScrim.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  gmBox.focus();
}

function tutupDetail() {
  if (!gmScrim.classList.contains("open")) return;
  gmScrim.classList.remove("open");
  gmScrim.setAttribute("aria-hidden", "true");
  gmBox.innerHTML = "";
  document.body.style.overflow = "";
  if (gmLastFocus && gmLastFocus.focus) gmLastFocus.focus();
}

document.addEventListener("click", (e) => {
  if (gmScrim.classList.contains("open")) {
    if (e.target === gmScrim || e.target.closest(".gm-close")) tutupDetail();
    return;
  }
  const card = e.target.closest("[data-detail]");
  if (!card || e.target.closest("button, a")) return;
  bukaDetail(card.dataset.detail);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { tutupDetail(); return; }
  if ((e.key === "Enter" || e.key === " ") && !gmScrim.classList.contains("open")) {
    const card = e.target.closest && e.target.closest("[data-detail]");
    if (card && card === e.target) { e.preventDefault(); bukaDetail(card.dataset.detail); }
  }
});
