const $ = (id) => document.getElementById(id);
let espBase = "http://192.168.4.1";
let pollTimer = null;
let lastData = { bpm: null, spo2: null, napas: null, suhu: null };
let isDemo = false;
let toastTimer;

$("footerYear").textContent = new Date().getFullYear();
if ($("registrationYear")) $("registrationYear").textContent = new Date().getFullYear();
const birthDateInput = $("participantBirthDate"); if (birthDateInput) birthDateInput.max = new Date().toISOString().slice(0,10);

// Data peserta disimpan sementara oleh ESP32 selama perangkat menyala.
let participantSession = null;
$("identityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("participantName").value.trim();
  const sex = $("participantSex").value;
  const birthDate = $("participantBirthDate").value;
  const weightKg = Number($("participantWeight").value);
  const heightCm = Number($("participantHeight").value);
  if (!name || !sex || !birthDate || !Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
    toast("Lengkapi semua data peserta dengan benar."); return;
  }
  if (!$("dataConsent").checked) { toast("Mohon setujui keterangan penggunaan data sesi."); return; }
  participantSession = { name, gender: sex, birthDate, weightKg, heightCm, startedAt: new Date().toISOString() };
  try {
    const response = await fetch(`${espBase}/api/participant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(participantSession) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    toast("Data peserta berhasil dikirim ke ESP32.");
  } catch (err) {
    toast("Data diisi, tetapi ESP32 belum menerima. Pastikan HP terhubung ke hotspot SIEW.");
  }
  $("registrationScreen").hidden = true; $("dashboardApp").hidden = false;
  $("participantChip").textContent = "Peserta: " + name;
  window.scrollTo({ top: 0, behavior: "smooth" }); startPolling();
});
$("changeParticipant").addEventListener("click", () => {
  participantSession = null;
  $("registrationScreen").hidden = false;
  $("dashboardApp").hidden = true;
  $("identityForm").reset();
  window.scrollTo({ top: 0, behavior: "smooth" });
});


function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
}
function setProcess(title, message, loading = false) {
  $("processTitle").textContent = title;
  $("processMessage").textContent = message;
  $("processSpinner").classList.toggle("loading", loading);
}
function setConnection(connected, text) {
  $("connectionPill").classList.toggle("connected", connected);
  $("connectionText").textContent = text;
}
function setMetric(id, value, hintId, hint) {
  $(id).textContent = value === null || value === undefined ? "—" : value;
  $(hintId).textContent = hint;
}
function updateResult(status, description, kind = "waiting") {
  const state = $("resultState");
  state.className = "result-state " + kind;
  $("resultTitle").textContent = status;
  $("resultDescription").textContent = description;
  $("resultIcon").textContent = kind === "safe" ? "✓" : kind === "warning" ? "!" : kind === "error" ? "×" : "…";
}
function refreshMetrics(data) {
  if (data.bpm !== undefined) lastData.bpm = Number.isFinite(Number(data.bpm)) ? Number(data.bpm) : null;
  if (data.spo2 !== undefined) lastData.spo2 = Number.isFinite(Number(data.spo2)) ? Number(data.spo2) : null;
  if (data.napas !== undefined || data.frekuensi !== undefined || data.respiratory_rate !== undefined) {
    const n = data.napas ?? data.frekuensi ?? data.respiratory_rate;
    lastData.napas = Number.isFinite(Number(n)) ? Number(n) : null;
  }
  if (data.suhu !== undefined || data.temperature !== undefined) {
    const t = data.suhu ?? data.temperature;
    lastData.suhu = Number.isFinite(Number(t)) ? Number(t) : null;
  }
  setMetric("bpmValue", lastData.bpm, "bpmHint", lastData.bpm === null ? "Menunggu ESP32" : "Data diterima dari ESP32");
  setMetric("spo2Value", lastData.spo2, "spo2Hint", lastData.spo2 === null ? "Menunggu ESP32" : "Data diterima dari ESP32");
  setMetric("respValue", lastData.napas, "respHint", lastData.napas === null ? "Menunggu ESP32" : "Data diterima dari ESP32");
  setMetric("tempValue", lastData.suhu === null ? null : Number(lastData.suhu).toFixed(1), "tempHint", lastData.suhu === null ? "Diisi melalui formulir" : "Input suhu tersimpan");
  const count = [lastData.bpm, lastData.spo2, lastData.napas, lastData.suhu].filter(v => v !== null && Number.isFinite(v)).length;
  $("dataCount").textContent = `${count} dari 4`;
  $("progressFill").style.width = `${count * 25}%`;
  $("updatedLabel").textContent = count ? "Data diperbarui" : "Menunggu data";
}
function normalizeStatus(data) {
  // Prefer status calculated by ESP32; browser does not replace the device's classification.
  const status = String(data.statusSIEW ?? data.status_siew ?? data.status ?? "").toUpperCase();
  if (status.includes("TIDAK LENGKAP") || status.includes("MENUNGGU")) {
    updateResult(status || "DATA TIDAK LENGKAP", "Pastikan semua parameter telah terbaca dengan valid.", "waiting");
  } else if (status.includes("EVALUASI") || status.includes("WASPADA")) {
    updateResult(status, "Ada parameter yang memerlukan perhatian lebih lanjut. Ini bukan diagnosis.", "warning");
  } else if (status.includes("ACUAN") || status.includes("AMAN")) {
    updateResult(status.includes("AMAN") ? "DALAM RENTANG ACUAN" : status, "Parameter berada dalam rentang acuan yang digunakan pada prototipe.", "safe");
  } else if (status) {
    updateResult(status, "Status diterima dari ESP32.", "waiting");
  }
}
async function pollStatus() {
  try {
    const response = await fetch(`${espBase}/api/data`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    refreshMetrics(data);
    normalizeStatus(data);
    setConnection(true, "ESP32 terhubung");
  } catch (err) {
    setConnection(false, "ESP32 belum terhubung");
  }
}
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollStatus();
  pollTimer = setInterval(pollStatus, 2500);
}
$("connectionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  let value = $("espAddress").value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) {
    toast("Alamat harus berupa URL, contoh: http://192.168.4.1");
    return;
  }
  espBase = value;
  isDemo = false;
  setProcess("Mencoba menghubungkan", "Memeriksa endpoint /api/data ESP32...", true);
  startPolling();
  setTimeout(() => {
    if (!$("connectionPill").classList.contains("connected")) {
      setProcess("Belum tersambung", "Periksa alamat IP, jaringan Wi-Fi, dan endpoint /api/data.", false);
    } else {
      setProcess("Perangkat terhubung", "Data akan diperbarui secara berkala.", false);
    }
  }, 1600);
});
$("temperatureForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const temperature = Number($("temperatureInput").value);
  if (!Number.isFinite(temperature) || temperature < 25 || temperature > 45) {
    toast("Masukkan suhu yang valid antara 25–45 °C.");
    return;
  }
  lastData.suhu = temperature;
  refreshMetrics({ suhu: temperature });
  updateResult("MEMPROSES DATA", "Suhu dikirim. Menunggu ESP32 mengolah semua parameter.", "waiting");
  setProcess("Memproses data, mohon tunggu...", "Mengirim suhu ke ESP32 dan menunggu hasil skrining.", true);
  $("submitTemp").disabled = true;
  $("submitTemp").style.opacity = ".65";
  try {
    const response = await fetch(`${espBase}/api/temperature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temperature })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setProcess("Suhu terkirim", "ESP32 menerima suhu. Menunggu hasil skrining...", false);
    toast("Suhu berhasil dikirim ke ESP32.");
    await pollStatus();
  } catch (error) {
    // Keep the entered value visible but do not pretend it was received by the device.
    setProcess("Input suhu tersimpan di halaman", "ESP32 belum dapat dihubungi. Nilai belum dipastikan diterima perangkat.", false);
    toast("Belum dapat mengirim ke ESP32. Periksa koneksi dan endpoint /api/temperature.");
  } finally {
    $("submitTemp").disabled = false;
    $("submitTemp").style.opacity = "1";
  }
});
$("demoButton").addEventListener("click", () => {
  isDemo = true;
  if (pollTimer) clearInterval(pollTimer);
  const temp = Number($("temperatureInput").value);
  const demo = {
    bpm: 80,
    spo2: 98,
    napas: 16,
    suhu: Number.isFinite(temp) && temp >= 25 && temp <= 45 ? temp : 36.8
  };
  $("temperatureInput").value = demo.suhu.toFixed(1);
  refreshMetrics(demo);
  updateResult("SIMULASI DEMO", "Contoh tampilan saja. Hasil ini bukan data sensor dan tidak dihitung sebagai diagnosis.", "waiting");
  setProcess("Mode demo aktif", "Nilai contoh ditampilkan. Tekan Hubungkan untuk kembali mencoba ESP32.", false);
  setConnection(false, "Mode demo");
  toast("Mode demo aktif — data ini hanya simulasi.");
});
setConnection(false, "ESP32 belum terhubung");
updateResult("MENUNGGU DATA", "Hubungkan ESP32 dan masukkan suhu untuk melihat proses skrining.", "waiting");
