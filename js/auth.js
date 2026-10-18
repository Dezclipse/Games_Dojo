const formLogin = document.getElementById("form-login");

function nextUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("next") || "rekomendasi.html";
}

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) location.href = nextUrl();
})();

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("li-err");
  errBox.classList.remove("show");
  const email = document.getElementById("li-email").value.trim();
  const password = document.getElementById("li-pass").value;
  const btn = e.submitter; btn.disabled = true; btn.textContent = "Memproses…";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Masuk";
  if (error) { errBox.textContent = friendlyError(error); errBox.classList.add("show"); return; }
  location.href = nextUrl();
});
