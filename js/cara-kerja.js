const PREF_KEY = "dh2_pref_context";
const LABEL_SUMBER = { kuis: "jawaban kuis kamu", cari: "filter yang kamu pilih" };

function fiturSet(g) {
  return new Set([...(g.genre || []), ...(g.jumlah_pemain || []), ...(g.gaya || []), ...(g.mode_main || [])]);
}

function bacaKonteksPreferensi() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    if (!ctx || !ctx.topGameId) return null;
    return ctx;
  } catch {
    return null;
  }
}

(async function muatContoh() {
  const loadingEl = document.getElementById("contoh-loading");
  const areaEl = document.getElementById("contoh-area");
  const judulEl = document.getElementById("contoh-judul");
  const eyebrowEl = document.getElementById("contoh-eyebrow");

  const masterRes = await Promise.all([
    supabase.from("master_genre").select("kode,label").order("urutan"),
    supabase.from("master_jumlah_pemain").select("kode,label").order("urutan"),
    supabase.from("master_gaya").select("kode,label").order("urutan"),
    supabase.from("master_mode_main").select("kode,label").order("urutan"),
  ]);
  const master = {
    genre: masterRes[0].data || [], pemain: masterRes[1].data || [],
    gaya: masterRes[2].data || [], mode: masterRes[3].data || [],
  };
  const ALL_KEYS = [
    ...master.genre.map(o => o.kode), ...master.pemain.map(o => o.kode),
    ...master.gaya.map(o => o.kode), ...master.mode.map(o => o.kode),
  ];
  const LABEL = {};
  [...master.genre, ...master.pemain, ...master.gaya, ...master.mode].forEach(o => { LABEL[o.kode] = o.label; });

  if (!ALL_KEYS.length) {
    loadingEl.textContent = "Belum ada data master game, jadi belum bisa dibikin contoh hitungan.";
    return;
  }

  const konteks = bacaKonteksPreferensi();
  let prefVektor, prefArr, game, sumberNote, judulPref;

  if (konteks) {
    const { data: g } = await supabase.from("games").select("*").eq("id", konteks.topGameId).maybeSingle();
    if (g) {
      game = g;
      prefArr = { genre: konteks.genre || [], pemain: konteks.pemain || [], gaya: konteks.gaya || [], mode: konteks.mode || [] };
      sumberNote = LABEL_SUMBER[konteks.sumber] || "preferensi kamu";
      judulPref = "Preferensi kamu";
    }
  }

  if (!game) {
    const { data: games } = await supabase.from("games").select("*").order("likes_count", { ascending: false }).limit(1);
    if (!games || !games.length) {
      loadingEl.textContent = "Belum ada data game, jadi belum bisa dibikin contoh hitungan.";
      return;
    }
    game = games[0];
    prefArr = {
      genre: master.genre[0] ? [master.genre[0].kode] : [],
      pemain: master.pemain[0] ? [master.pemain[0].kode] : [],
      gaya: master.gaya[0] ? [master.gaya[0].kode] : [],
      mode: master.mode[0] ? [master.mode[0].kode] : [],
    };
    sumberNote = "contoh ilustrasi (kamu belum jawab kuis atau pakai filter)";
    judulPref = "Preferensi contoh";
    eyebrowEl.textContent = "Contoh ilustrasi";
    judulEl.textContent = "Contoh hitungan (belum ada preferensi kamu)";
  } else {
    eyebrowEl.textContent = "Hitungan dari kunjungan kamu barusan";
    judulEl.textContent = `Kenapa "${game.judul}" direkomendasikan buat kamu`;
  }

  const prefSet = new Set([...prefArr.genre, ...prefArr.pemain, ...prefArr.gaya, ...prefArr.mode]);
  prefVektor = ALL_KEYS.map(k => prefSet.has(k) ? 1 : 0);
  const gameSet = fiturSet(game);
  const gameVektor = ALL_KEYS.map(k => gameSet.has(k) ? 1 : 0);

  const idxRelevan = ALL_KEYS.map((k, i) => i).filter(i => prefVektor[i] || gameVektor[i]);
  let dot = 0, na = 0, nb = 0;
  const perSuku = [];
  const fiturSama = [];
  for (let i = 0; i < ALL_KEYS.length; i++) {
    dot += prefVektor[i] * gameVektor[i];
    na += prefVektor[i] * prefVektor[i];
    nb += gameVektor[i] * gameVektor[i];
    if (prefVektor[i] && gameVektor[i]) { perSuku.push("(1x1)"); fiturSama.push(LABEL[ALL_KEYS[i]] || ALL_KEYS[i]); }
  }
  const magA = Math.sqrt(na), magB = Math.sqrt(nb);
  const cosineScore = (na === 0 || nb === 0) ? 0 : dot / (magA * magB);
  const persen = Math.round(cosineScore * 100);

  const baris = (judul, vec) => `
    <tr>
      <td style="font-weight:600;color:var(--text);white-space:nowrap;">${escapeHtml(judul)}</td>
      ${idxRelevan.map(i => `<td class="${vec[i] ? "on" : "off"}">${vec[i]}</td>`).join("")}
    </tr>`;

  const penjelasanFitur = fiturSama.length
    ? `Game ini direkomendasikan karena punya fitur yang sama dengan ${escapeHtml(sumberNote)}: ${fiturSama.map(escapeHtml).join(", ")}.`
    : `Belum ada fitur yang sama sekali sama dengan ${escapeHtml(sumberNote)}, jadi skornya rendah.`;

  const htmlString = `
    <div class="contoh-game-head">
      <span class="meta-chip">${escapeHtml(judulPref)}</span>
      <span style="color:var(--text-dim);">vs</span>
      <span class="meta-chip">${escapeHtml(game.judul)}</span>
    </div>
    <p style="margin-top:0;">
      Baris "${escapeHtml(judulPref)}" di bawah dibangun dari ${escapeHtml(sumberNote)}. Baris
      "${escapeHtml(game.judul)}" diambil langsung dari tabel <code>games</code>. Kolom yang
      ditampilkan cuma fitur yang dipunyai minimal salah satu dari keduanya, dari total
      ${ALL_KEYS.length} fitur yang ada di seluruh data master.
    </p>
    <div class="vector-table-wrap">
      <table>
        <thead><tr><th>Baris</th>${idxRelevan.map(i => `<th>${escapeHtml(LABEL[ALL_KEYS[i]] || ALL_KEYS[i])}</th>`).join("")}</tr></thead>
        <tbody>${baris(judulPref, prefVektor)}${baris(game.judul, gameVektor)}</tbody>
      </table>
    </div>

    <div class="calc-steps">
      <h3 style="margin-top:0;">Hitungan cosine similarity-nya</h3>
      <p>1. Dot product, kalikan tiap pasangan angka yang sejajar lalu jumlahkan semuanya
        (termasuk kolom yang tidak ditampilkan di tabel, karena nilainya 0x0 atau 0x1 sama
        dengan 0, tidak menambah apa-apa):</p>
      <div class="formula-box">A . B = ${perSuku.length ? perSuku.join(" + ") + ` = ${dot}` : `0 (tidak ada fitur yang sama-sama dimiliki) = ${dot}`}</div>

      <p style="margin-top:var(--sp-4);">2. Magnitude (panjang) tiap vektor, akar dari jumlah kuadrat elemennya:</p>
      <div class="formula-box">||A|| = akar(${na}) = ${magA.toFixed(3)}, ||B|| = akar(${nb}) = ${magB.toFixed(3)}</div>

      <p style="margin-top:var(--sp-4);">3. Masukkan ke rumus cosine similarity:</p>
      <div class="formula-box">cosine(A, B) = ${dot} / (${magA.toFixed(3)} x ${magB.toFixed(3)})</div>

      <p style="margin-top:var(--sp-4);">4. Hasil akhir cosine similarity-nya:</p>
      <div class="formula-box"><b style="color:var(--primary);">cosine similarity = ${cosineScore.toFixed(4)}</b></div>

      <div class="calc-result">
        <div>
          <div style="color:var(--text-dim);font-size:var(--fs-sm);text-transform:uppercase;letter-spacing:.4px;">Cosine similarity</div>
          <div style="font-family:var(--font-display);font-weight:700;font-size:var(--fs-md);color:var(--text);">${cosineScore.toFixed(4)}</div>
        </div>
        <span class="big-pct">${persen}%</span>
        <span style="color:var(--text-dim);">
          dibulatkan dari cosine similarity di atas, angka diatas menunjukkan tingkat kecocokan antara
          ${escapeHtml(judulPref.toLowerCase())} dengan game
          <b style="color:var(--text);">${escapeHtml(game.judul)}</b>.
        </span>
      </div>
    </div>
    <p>${penjelasanFitur}</p>
    ${!konteks ? `<p style="font-size:var(--fs-sm);">Ini masih contoh ilustrasi. Jawab kuis atau pilih filter di <a href="rekomendasi.html">halaman rekomendasi</a>, lalu balik ke sini buat lihat hitungan yang beneran dari preferensi kamu sendiri.</p>` : ""}
  `;
  areaEl.innerHTML = htmlString;
  loadingEl.style.display = "none";
  areaEl.style.display = "block";
})();
