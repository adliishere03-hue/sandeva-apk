/* ========= GLOBAL STATE ========= */
let DO_TOKEN = "";
let DROPLETS_CACHE = [];
let META = {
  regions: [],
  sizes: [],
  images: []
};
let SELECTED_DROPLET_ID = null;

/* ========= UTIL: TOKEN ========= */
function loadTokenFromStorage() {
  const saved = localStorage.getItem("do_token");
  if (saved) {
    DO_TOKEN = saved;
    const tokenInput = document.getElementById("token");
    if (tokenInput) tokenInput.value = DO_TOKEN;
  }
}

function setToken(token) {
  DO_TOKEN = token.trim();
  const remember = document.getElementById("remember-token");
  if (remember && remember.checked && DO_TOKEN) {
    localStorage.setItem("do_token", DO_TOKEN);
  } else {
    localStorage.removeItem("do_token");
  }
}

function getTokenOrThrow() {
  if (!DO_TOKEN) {
    throw new Error("Token belum diisi / disimpan.");
  }
  return DO_TOKEN;
}

/* ========= UTIL: CALL DIGITALOCEAN ========= */
async function callDO(path, { method = "GET", body = null } = {}) {
  const token = getTokenOrThrow();

  const headers = {
    "Authorization": "Bearer " + token
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch("https://api.digitalocean.com/v2" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  let json = {};
  try {
    json = await res.json();
  } catch (e) {
    // ignore
  }

  if (!res.ok) {
    const msg = json.message || json.id || (res.status + " " + res.statusText);
    throw new Error(msg);
  }

  return json;
}

/* ========= BACKGROUND PARALLAX & PARTICLES ========= */
function initParallax() {
  document.addEventListener("mousemove", e => {
    const layers = document.querySelectorAll(".layer");
    layers.forEach(layer => {
      const depth = parseFloat(layer.getAttribute("data-depth") || "10");
      const x = (window.innerWidth / 2 - e.pageX) / depth;
      const y = (window.innerHeight / 2 - e.pageY) / depth;
      layer.style.transform = `translateX(${x}px) translateY(${y}px)`;
    });
  });
}

function initParticles() {
  const container = document.getElementById("particles");
  if (!container) return;
  const count = 45;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    resetParticle(p, true);
    container.appendChild(p);
  }

  function resetParticle(el, init = false) {
    el.style.left = Math.random() * 100 + "vw";
    el.style.animationDuration = (5 + Math.random() * 8) + "s";
    if (!init) {
      el.style.top = "100vh";
    } else {
      el.style.top = Math.random() * 100 + "vh";
    }
  }

  container.addEventListener("animationend", e => {
    if (e.target.classList.contains("particle")) {
      resetParticle(e.target);
    }
  }, true);
}

/* ========= UI HELPERS ========= */
function setStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("ok", "err");
  if (type) el.classList.add(type);
}

function prettyJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

/* ========= ACCOUNT ========= */
async function loadAccount() {
  const infoEl = document.getElementById("account-info");
  const rawEl = document.getElementById("account-raw");
  try {
    if (infoEl) infoEl.textContent = "Loading account...";
    const data = await callDO("/account");
    const acc = data.account || {};
    if (infoEl) {
      infoEl.innerHTML = `
        <div><strong>Email:</strong> ${acc.email || "-"}</div>
        <div><strong>Status:</strong> ${acc.status || "-"}</div>
        <div><strong>Droplet Limit:</strong> ${acc.droplet_limit ?? "-"}</div>
        <div><strong>UUID:</strong> <span style="opacity:.8">${acc.uuid || "-"}</span></div>
      `;
    }
    if (rawEl) rawEl.textContent = prettyJson(data);
  } catch (e) {
    if (infoEl) infoEl.textContent = "Gagal load account: " + e.message;
    if (rawEl) rawEl.textContent = "Error: " + e.message;
  }
}

/* ========= META (REGIONS, SIZES, IMAGES) ========= */
function buildOsAndVersionSelectors() {
  const osSel = document.getElementById("os-select");
  const verSel = document.getElementById("version-select");
  if (!osSel || !verSel) return;

  const distros = Array.from(
    new Set(
      (META.images || [])
        .map(img => img.distribution)
        .filter(Boolean)
    )
  ).sort();

  if (!distros.length) {
    osSel.innerHTML = `<option value="">Tidak ada data OS dari API</option>`;
    verSel.innerHTML = `<option value="">Tidak ada data Version</option>`;
    return;
  }

  osSel.innerHTML =
    `<option value="">-- Pilih OS --</option>` +
    distros.map(d => `<option value="${d}">${d}</option>`).join("");

  function updateVersions() {
    const distro = osSel.value;
    if (!distro) {
      verSel.innerHTML = `<option value="">Pilih OS dulu...</option>`;
      return;
    }
    const imgs = META.images.filter(img => img.distribution === distro);
    if (!imgs.length) {
      verSel.innerHTML = `<option value="">Tidak ada Version untuk OS ini</option>`;
      return;
    }
    verSel.innerHTML = imgs.map(img => {
      const slug = img.slug || img.id;
      const label = img.name || slug;
      return `<option value="${slug}">${label}</option>`;
    }).join("");
  }

  osSel.onchange = updateVersions;

  // auto pilih OS pertama
  osSel.value = distros[0];
  updateVersions();
}

async function loadMetaForCreate() {
  const regionSel = document.getElementById("region");
  const sizeSel = document.getElementById("size");

  const fallbackIfError = () => {
    if (regionSel && regionSel.options.length <= 1) {
      regionSel.innerHTML = `
        <option value="">-- Pilih Region --</option>
        <option value="sgp1">sgp1 - Singapore</option>
        <option value="nyc3">nyc3 - New York</option>
        <option value="ams3">ams3 - Amsterdam</option>
      `;
    }
    if (sizeSel && sizeSel.options.length <= 1) {
      sizeSel.innerHTML = `
        <option value="">-- Pilih CPU --</option>
        <option value="s-1vcpu-1gb">s-1vcpu-1gb (1GB / 1vCPU)</option>
        <option value="s-1vcpu-2gb">s-1vcpu-2gb (2GB / 1vCPU)</option>
        <option value="s-2vcpu-2gb">s-2vcpu-2gb (2GB / 2vCPU)</option>
        <option value="s-2vcpu-4gb">s-2vcpu-4gb (4GB / 2vCPU)</option>
      `;
    }

    const osSel = document.getElementById("os-select");
    const verSel = document.getElementById("version-select");
    if (osSel && verSel) {
      osSel.innerHTML = `
        <option value="">-- Pilih OS --</option>
        <option value="Ubuntu">Ubuntu</option>
        <option value="Debian">Debian</option>
      `;
      verSel.innerHTML = `<option value="">Pilih OS dulu...</option>`;
    }
  };

  try {
    const [regionsRes, sizesRes, imagesRes] = await Promise.all([
      callDO("/regions"),
      callDO("/sizes"),
      callDO("/images?type=distribution&per_page=100")
    ]);

    META.regions = regionsRes.regions || [];
    META.sizes = sizesRes.sizes || [];
    META.images = imagesRes.images || [];

    if (regionSel) {
      regionSel.innerHTML =
        `<option value="">-- Pilih Region --</option>` +
        META.regions.map(r =>
          `<option value="${r.slug}">${r.slug} - ${r.name}</option>`
        ).join("");
    }

    if (sizeSel) {
      sizeSel.innerHTML =
        `<option value="">-- Pilih CPU --</option>` +
        META.sizes.map(s =>
          `<option value="${s.slug}">${s.slug} (${s.memory}MB / ${s.vcpus}vCPU)</option>`
        ).join("");
    }

    buildOsAndVersionSelectors();
  } catch (e) {
    console.warn("Gagal load meta:", e);
    fallbackIfError();
  }

  // load SSH keys
  loadSshKeys().catch(err => console.warn("Gagal load ssh keys:", err));
}

/* ========= LOAD SSH KEYS ========= */
async function loadSshKeys() {
  const select = document.getElementById("ssh-select");
  if (!select) return;

  select.innerHTML = `<option value="">Loading SSH keys...</option>`;

  try {
    const data = await callDO("/account/keys");
    const keys = data.ssh_keys || [];

    if (!keys.length) {
      select.innerHTML = `<option value="">(Tidak ada SSH key di akun DO kamu)</option>`;
      return;
    }

    select.innerHTML = keys.map(k =>
      `<option value="${k.id}">${k.name} (${k.fingerprint})</option>`
    ).join("");
  } catch (e) {
    select.innerHTML = `<option value="">Gagal load SSH keys: ${e.message}</option>`;
  }
}

/* ========= AUTH METHOD VISIBILITY ========= */
function updateAuthVisibility() {
  const method = document.querySelector('input[name="auth-method"]:checked')?.value || "ssh";
  const sshBox = document.getElementById("auth-ssh");
  const passBox = document.getElementById("auth-password");

  if (sshBox) sshBox.style.display = method === "ssh" ? "block" : "none";
  if (passBox) passBox.style.display = method === "password" ? "block" : "none";
}

/* ========= CREATE DROPLET ========= */
async function handleCreateDroplet() {
  const nameEl = document.getElementById("droplet-name");
  const regionEl = document.getElementById("region");
  const sizeEl = document.getElementById("size");
  const osSel = document.getElementById("os-select");
  const verSel = document.getElementById("version-select");
  const tagsEl = document.getElementById("tags");
  const statusEl = document.getElementById("create-status");

  if (!nameEl || !regionEl || !sizeEl || !osSel || !verSel) return;

  const name = nameEl.value.trim() || ("sandeva-" + Date.now());
  const region = regionEl.value;
  const size = sizeEl.value;
  const os = osSel.value;
  const image = verSel.value;

  if (!region) {
    setStatus(statusEl, "Pilih Region dulu.", "err");
    return;
  }
  if (!os) {
    setStatus(statusEl, "Pilih OS dulu.", "err");
    return;
  }
  if (!image) {
    setStatus(statusEl, "Pilih Version dulu.", "err");
    return;
  }
  if (!size) {
    setStatus(statusEl, "Pilih CPU Options dulu.", "err");
    return;
  }

  const tags = (tagsEl.value || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const method = document.querySelector('input[name="auth-method"]:checked')?.value || "ssh";

  const body = {
    name,
    region,
    size,
    image,
    tags: tags.length ? tags : ["sandeva-panel"],
  };

  if (method === "ssh") {
    const sshSelect = document.getElementById("ssh-select");
    const sshKeys = sshSelect
      ? Array.from(sshSelect.selectedOptions)
        .map(o => o.value)
        .filter(Boolean)
      : [];

    if (!sshKeys.length) {
      setStatus(statusEl, "Metode SSH dipilih, tapi nggak ada SSH key yang dicentang.", "err");
      return;
    }
    body.ssh_keys = sshKeys;
  } else if (method === "password") {
    const passEl = document.getElementById("root-password");
    const pwd = passEl?.value || "";

    if (pwd.length < 8) {
      setStatus(statusEl, "Password root minimal 8 karakter.", "err");
      return;
    }

    const userData = `#cloud-config
chpasswd:
  list: |
    root:${pwd}
  expire: False
ssh_pwauth: True
`;
    body.user_data = userData;
  }

  setStatus(statusEl, "Membuat droplet...", null);

  try {
    const json = await callDO("/droplets", { method: "POST", body });
    setStatus(
      statusEl,
      `✅ Droplet dibuat! ID: ${json.droplet?.id || "unknown"}`,
      "ok"
    );
    await loadDroplets();
  } catch (e) {
    setStatus(statusEl, "❌ Gagal create: " + e.message, "err");
  }
}

/* ========= LOAD DROPLETS ========= */
async function loadDroplets() {
  const tbody = document.querySelector("#droplet-table tbody");
  const emptyEl = document.getElementById("droplets-empty");
  const statusEl = document.getElementById("droplet-status");

  if (!tbody) return;

  tbody.innerHTML = "";
  if (emptyEl) emptyEl.textContent = "Loading droplets...";

  try {
    const data = await callDO("/droplets?per_page=50");
    const droplets = data.droplets || [];
    DROPLETS_CACHE = droplets;

    if (!droplets.length) {
      if (emptyEl) emptyEl.textContent = "Tidak ada droplet.";
      return;
    } else if (emptyEl) {
      emptyEl.textContent = "";
    }

    droplets.forEach(d => {
      const tr = document.createElement("tr");
      tr.dataset.id = String(d.id);

      const ip = (d.networks?.v4 || []).find(n => n.type === "public")?.ip_address || "-";

      tr.innerHTML = `
        <td>${d.id}</td>
        <td>${d.name}</td>
        <td>${d.region?.slug || "-"}</td>
        <td>${d.status}</td>
        <td>${ip}</td>
      `;

      tr.addEventListener("click", () => {
        document
          .querySelectorAll("#droplet-table tbody tr")
          .forEach(row => row.classList.remove("selected"));
        tr.classList.add("selected");
        showDropletDetail(d.id);
      });

      tbody.appendChild(tr);
    });

    setStatus(statusEl, `Loaded ${droplets.length} droplet(s).`, "ok");
  } catch (e) {
    if (emptyEl) emptyEl.textContent = "Gagal load droplets: " + e.message;
    setStatus(statusEl, "❌ " + e.message, "err");
  }
}

function getDropletById(id) {
  return DROPLETS_CACHE.find(d => String(d.id) === String(id));
}

/* ========= DROPLET DETAIL & ACTIONS ========= */
function showDropletDetail(id) {
  const detailEl = document.getElementById("droplet-detail-content");
  if (!detailEl) return;
  const d = getDropletById(id);
  SELECTED_DROPLET_ID = id;

  if (!d) {
    detailEl.textContent = "Droplet tidak ditemukan di cache.";
    return;
  }

  const ipPublic = (d.networks?.v4 || []).find(n => n.type === "public")?.ip_address || "-";
  const ipPrivate = (d.networks?.v4 || []).find(n => n.type === "private")?.ip_address || "-";

  detailEl.innerHTML = `
    <div class="detail-row"><strong>${d.name}</strong> (#${d.id})</div>
    <div class="detail-row"><span>Region:</span> <strong>${d.region?.slug || "-"}</strong></div>
    <div class="detail-row"><span>Status:</span> <strong>${d.status}</strong></div>
    <div classdetail-row"><span>Public IP:</span> <strong>${ipPublic}</strong></div>
    <div class="detail-row"><span>Private IP:</span> <strong>${ipPrivate}</strong></div>
    <div class="detail-row"><span>Image:</span> <strong>${d.image?.slug || d.image?.id || "-"}</strong></div>
    <div class="detail-row"><span>Size:</span> <strong>${d.size_slug}</strong></div>
    <div class="detail-row"><span>Created at:</span> <strong>${d.created_at}</strong></div>
    <hr style="border-color:rgba(60,120,190,0.7);margin:8px 0;">
    <div class="detail-row">
      <span><strong>Power & Basic:</strong></span>
      <div class="action-group">
        <button class="action-btn" data-act="power_on">Power ON</button>
        <button class="action-btn" data-act="power_off">Power OFF (hard)</button>
        <button class="action-btn" data-act="shutdown">Shutdown (soft)</button>
        <button class="action-btn" data-act="reboot">Reboot</button>
        <button class="action-btn" data-act="power_cycle">Power Cycle</button>
      </div>
    </div>
    <div class="detail-row">
      <span><strong>Maintenance:</strong></span>
      <div class="action-group">
        <button class="action-btn" data-act="password_reset">Reset Password</button>
        <button class="action-btn" data-act="snapshot">Snapshot</button>
      </div>
      <div class="inline-form" style="margin-top:4px;">
        <input id="snapshot-name" type="text" placeholder="Nama snapshot (opsional)">
        <button class="action-btn" data-act="snapshot-go">Ambil Snapshot</button>
      </div>
    </div>
    <div class="detail-row">
      <span><strong>Rename:</strong></span>
      <div class="inline-form">
        <input id="rename-name" type="text" placeholder="Nama baru">
        <button class="action-btn" data-act="rename-go">Rename</button>
      </div>
    </div>
    <div class="detail-row">
      <span><strong>Resize:</strong></span>
      <div class="inline-form">
        <select id="resize-size"></select>
        <button class="action-btn" data-act="resize-go">Resize</button>
      </div>
      <small class="muted">Droplet harus dalam keadaan <strong>off</strong> untuk resize disk permanen.</small>
    </div>
    <div class="detail-row">
      <span><strong>Danger Zone:</strong></span>
      <div class="action-group">
        <button class="action-btn danger" data-act="destroy">Destroy Droplet</button>
      </div>
    </div>
  `;

  const resizeSel = document.getElementById("resize-size");
  if (resizeSel) {
    resizeSel.innerHTML = META.sizes.map(s =>
      `<option value="${s.slug}" ${s.slug === d.size_slug ? "selected" : ""}>
        ${s.slug} (${s.memory}MB / ${s.vcpus}vCPU)
      </option>`
    ).join("") || `<option value="${d.size_slug}">${d.size_slug}</option>`;
  }

  detailEl.querySelectorAll(".action-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      handleDropletAction(act, d.id);
    });
  });
}

async function dropletActionApi(id, type, extra = {}) {
  return callDO(`/droplets/${id}/actions`, {
    method: "POST",
    body: { type, ...extra }
  });
}

async function handleDropletAction(act, id) {
  const statusEl = document.getElementById("droplet-status");
  if (!id) {
    setStatus(statusEl, "Droplet belum dipilih.", "err");
    return;
  }

  try {
    switch (act) {
      case "power_on":
      case "power_off":
      case "shutdown":
      case "reboot":
      case "power_cycle":
      case "password_reset": {
        setStatus(statusEl, `Mengirim action ${act}...`);
        await dropletActionApi(id, act);
        setStatus(statusEl, `✅ Action ${act} dikirim.`, "ok");
        break;
      }

      case "snapshot":
      case "snapshot-go": {
        const nameEl = document.getElementById("snapshot-name");
        const snapName = nameEl?.value.trim() || `snapshot-${id}-${Date.now()}`;
        setStatus(statusEl, "Membuat snapshot...");
        await dropletActionApi(id, "snapshot", { name: snapName });
        setStatus(statusEl, `✅ Snapshot dibuat: ${snapName}`, "ok");
        break;
      }

      case "rename-go": {
        const renameEl = document.getElementById("rename-name");
        const newName = renameEl?.value.trim();
        if (!newName) {
          setStatus(statusEl, "Nama baru kosong.", "err");
          return;
        }
        setStatus(statusEl, "Mengganti nama droplet...");
        await dropletActionApi(id, "rename", { name: newName });
        setStatus(statusEl, "✅ Rename terkirim. Reload droplets untuk melihat perubahan.", "ok");
        await loadDroplets();
        break;
      }

      case "resize-go": {
        const resizeSel = document.getElementById("resize-size");
        const sizeSlug = resizeSel?.value;
        if (!sizeSlug) {
          setStatus(statusEl, "Size belum dipilih.", "err");
          return;
        }
        setStatus(statusEl, "Mengirim action resize...");
        await dropletActionApi(id, "resize", { size: sizeSlug, disk: true });
        setStatus(statusEl, "✅ Resize dikirim. Proses bisa butuh beberapa menit.", "ok");
        break;
      }

      case "destroy": {
        if (!confirm("Yakin ingin DESTROY droplet ini? Semua data akan hilang.")) return;
        setStatus(statusEl, "Menghapus droplet...");
        await callDO(`/droplets/${id}`, { method: "DELETE" });
        setStatus(statusEl, "✅ Droplet dihapus.", "ok");
        await loadDroplets();
        const detailEl = document.getElementById("droplet-detail-content");
        if (detailEl) {
          detailEl.textContent = "Droplet sudah dihapus. Pilih droplet lain.";
        }
        break;
      }

      default:
        setStatus(statusEl, "Action tidak dikenali: " + act, "err");
    }
  } catch (e) {
    setStatus(statusEl, "❌ Error action: " + e.message, "err");
  }
}

/* ========= MINI API EXPLORER ========= */
async function handleExplorerSend() {
  const methodEl = document.getElementById("explorer-method");
  const pathEl = document.getElementById("explorer-path");
  const bodyEl = document.getElementById("explorer-body");
  const resultEl = document.getElementById("explorer-result");

  const method = methodEl.value;
  const rawPath = pathEl.value.trim() || "/account";
  const path = rawPath.startsWith("/") ? rawPath : "/" + rawPath;

  let body = null;
  if (bodyEl.value.trim()) {
    try {
      body = JSON.parse(bodyEl.value);
    } catch (e) {
      resultEl.textContent = "Body bukan JSON valid: " + e.message;
      return;
    }
  }

  resultEl.textContent = "Request in progress...";

  try {
    const json = await callDO(path, { method, body });
    resultEl.textContent = prettyJson(json);
  } catch (e) {
    resultEl.textContent = "Error: " + e.message;
  }
}

/* ========= TABS ========= */
function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const tabs = document.querySelectorAll(".tab");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.remove("active"));
      tabs.forEach(t => t.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(target)?.classList.add("active");
    });
  });
}

/* ========= INIT ========= */
function initEvents() {
  const saveBtn = document.getElementById("save-token");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const tokenInput = document.getElementById("token");
      setToken(tokenInput.value);
      try {
        await Promise.all([
          loadAccount(),
          loadMetaForCreate(),
          loadDroplets()
        ]);
      } catch (e) {
        console.warn("Init after save error:", e);
      }
    });
  }

  const createBtn = document.getElementById("create-btn");
  if (createBtn) {
    createBtn.addEventListener("click", handleCreateDroplet);
  }

  const reloadBtn = document.getElementById("reload-droplets");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", loadDroplets);
  }

  const explorerBtn = document.getElementById("explorer-send");
  if (explorerBtn) {
    explorerBtn.addEventListener("click", handleExplorerSend);
  }

  document.querySelectorAll('input[name="auth-method"]').forEach(r => {
    r.addEventListener("change", updateAuthVisibility);
  });
}

/* ========= AUTO LOAD ========= */
async function initialAutoLoad() {
  if (DO_TOKEN) {
    try {
      await Promise.all([
        loadAccount(),
        loadMetaForCreate(),
        loadDroplets()
      ]);
    } catch (e) {
      console.warn("Auto-load gagal:", e);
    }
  }
}

/* ========= DOM READY ========= */
document.addEventListener("DOMContentLoaded", () => {
  loadTokenFromStorage();
  initParallax();
  initParticles();
  initTabs();
  initEvents();
  updateAuthVisibility();
  initialAutoLoad();
});
