const CONFIG = {
  apiBaseUrl: window.IT_INVENTORY_API_URL || "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api",
  scriptUrl: window.IT_INVENTORY_SCRIPT_URL || "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1",
  staleDays: Number(window.IT_INVENTORY_STALE_DAYS || 30),
};

const state = {
  adminToken: localStorage.getItem("it_inventory_admin_token") || "",
  devices: [],
  filtered: [],
  selectedDeviceId: "",
};

const labels = {
  active: "Actif",
  replace: "A remplacer",
  stock: "En stock",
  lost: "Perdu",
  retired: "Sorti du parc",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`;
  const response = await fetch(`${CONFIG.apiBaseUrl}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body.error || body.message || "Erreur API");
  return body;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function daysSince(value) {
  if (!value) return 9999;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

function ageBucket(device) {
  const score = Number(device.hardware_age_score || 0);
  if (score >= 75) return "old";
  if (score >= 45) return "aging";
  return "recent";
}

function money(value) {
  const number = Number(value || 0);
  if (!number) return "-";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(number);
}

function estimatedValue(device) {
  return Number(device.current_market_price_avg || device.current_new_price || device.estimated_launch_price || 0);
}

function cpuScoreBucket(device) {
  const score = Number(device.cpu_score || 0);
  if (!score) return "";
  if (score < 7000) return "low";
  if (score < 12000) return "medium";
  return "high";
}

function valueBucket(device) {
  const value = estimatedValue(device);
  if (!value) return "";
  if (value < 180) return "low";
  if (value <= 350) return "medium";
  return "high";
}

function setOptions(select, values, label) {
  select.innerHTML = `<option value="">${label}</option>`;
  values
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "fr"))
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
}

function statusClass(status) {
  return `status ${status || "active"}`;
}

function getSearchBlob(device) {
  return [
    device.hostname,
    device.serial_number,
    device.mac_address,
    device.first_name,
    device.last_name,
    device.email,
    device.team_name,
    device.establishment_name,
    device.model,
    device.manufacturer,
    device.os_name,
    device.os_version,
  ]
    .map(normalize)
    .join(" ");
}

function applyFilters() {
  const search = normalize($("#global-search").value);
  const team = $("#filter-team").value;
  const establishment = $("#filter-establishment").value;
  const os = $("#filter-os").value;
  const model = $("#filter-model").value;
  const status = $("#filter-status").value;
  const age = $("#filter-age").value;
  const cpuScore = $("#filter-cpu-score").value;
  const value = $("#filter-value").value;

  state.filtered = state.devices.filter((device) => {
    if (search && !getSearchBlob(device).includes(search)) return false;
    if (team && device.team_name !== team) return false;
    if (establishment && device.establishment_name !== establishment) return false;
    if (os && device.os_name !== os) return false;
    if (model && device.model !== model) return false;
    if (status && device.status !== status) return false;
    if (age && ageBucket(device) !== age) return false;
    if (cpuScore && cpuScoreBucket(device) !== cpuScore) return false;
    if (value && valueBucket(device) !== value) return false;
    return true;
  });

  renderDevices();
  renderMetrics();
  renderCharts();
}

function renderMetrics() {
  const total = state.filtered.length;
  const stale = state.filtered.filter((d) => daysSince(d.last_seen_at) > CONFIG.staleDays).length;
  const lowStorage = state.filtered.filter((d) => Number(d.storage_free_gb || 0) < 30).length;
  const replace = state.filtered.filter((d) => d.status === "replace" || Number(d.hardware_age_score || 0) >= 75).length;
  const fleetValue = state.filtered.reduce((sum, device) => sum + estimatedValue(device), 0);
  const lowCpu = state.filtered.filter((d) => Number(d.cpu_score || 0) > 0 && Number(d.cpu_score || 0) < 7000).length;

  $("#metrics").innerHTML = [
    ["Machines", total],
    ["Valeur estimee", money(fleetValue)],
    [`Sans scan +${CONFIG.staleDays}j`, stale],
    ["CPU faible", lowCpu],
    ["Stockage faible", lowStorage],
    ["A remplacer", replace],
  ]
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderDevices() {
  $("#result-count").textContent = `${state.filtered.length} resultat(s)`;
  $("#devices-table").innerHTML = state.filtered
    .map(
      (device) => `
        <tr data-id="${device.id}" class="${device.id === state.selectedDeviceId ? "is-selected" : ""}">
          <td>${device.hostname || "-"}</td>
          <td>${device.first_name || ""} ${device.last_name || ""}<br><small>${device.email || ""}</small></td>
          <td>${device.team_name || "-"}</td>
          <td>${device.establishment_name || "-"}</td>
          <td>${device.os_name || "-"} ${device.os_version || ""}</td>
          <td>${device.manufacturer || ""} ${device.model || "-"}</td>
          <td>${formatDate(device.last_seen_at)}</td>
          <td><span class="${statusClass(device.status)}">${labels[device.status] || device.status || "Actif"}</span></td>
        </tr>
      `
    )
    .join("");

  $$("#devices-table tr").forEach((row) => {
    row.addEventListener("click", () => selectDevice(row.dataset.id));
  });
}

async function selectDevice(id) {
  state.selectedDeviceId = id;
  renderDevices();
  const device = state.devices.find((item) => item.id === id);
  if (!device) return;
  $("#detail-title").textContent = device.hostname || "Machine";
  $("#device-detail").innerHTML = `<p class="helper">Chargement de l'historique...</p>`;
  try {
    const detail = await api(`/admin/devices/${id}`);
    renderDetail({ ...detail.device, priceHistory: detail.priceHistory || [] }, detail.scans || []);
  } catch (error) {
    toast(error.message);
    renderDetail(device, []);
  }
}

function renderDetail(device, scans) {
  const rows = [
    ["Serial", device.serial_number],
    ["MAC", device.mac_address],
    ["IP locale", device.local_ip],
    ["CPU", device.cpu],
    ["RAM", device.ram_total_gb ? `${device.ram_total_gb} Go` : ""],
    ["Stockage", `${device.storage_total_gb || "-"} Go total / ${device.storage_free_gb || "-"} Go libres`],
    ["Utilisateur OS", device.windows_user],
    ["Script", device.script_version],
    ["Score age", `${device.hardware_age_score || 0}/100`],
    ["Score CPU", device.cpu_score],
    ["Generation CPU", device.cpu_generation],
    ["Annee CPU", device.cpu_release_year],
    ["Annee modele", device.model_release_year],
    ["Prix lancement", money(device.estimated_launch_price)],
    ["Valeur actuelle", money(device.current_market_price_avg)],
    ["Confiance", device.confidence_score ? `${device.confidence_score}/100` : ""],
    ["Reco", device.recommendation],
    ["Dernier enrichissement", device.last_enriched_at ? formatDate(device.last_enriched_at) : ""],
  ];
  const priceRows = (device.priceHistory || [])
    .slice(0, 8)
    .map((row) => `<li>${formatDate(row.collected_at)} - ${row.source} - ${money(row.price)} - ${row.condition || "-"}</li>`)
    .join("");
  const scanRows = scans
    .slice(0, 8)
    .map((scan) => `<li>${formatDate(scan.collected_at)} - ${scan.os_name || "-"} ${scan.os_version || ""}</li>`)
    .join("");

  $("#device-detail").innerHTML = `
    <dl class="detail-list">
      ${rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value || "-"}</dd></div>`).join("")}
    </dl>
    <form id="status-form" class="form-grid one scan-history">
      <label>
        Statut
        <select name="status">
          ${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${device.status === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <button type="submit" class="primary">Mettre a jour</button>
    </form>
    <div class="scan-history">
      <h3>Historique des scans</h3>
      <ul>${scanRows || "<li>Aucun scan detaille.</li>"}</ul>
    </div>
    <div class="scan-history">
      <h3>Historique prix marche</h3>
      <ul>${priceRows || "<li>Aucun prix externe collecte.</li>"}</ul>
    </div>
  `;

  $("#status-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = new FormData(event.currentTarget).get("status");
    try {
      const result = await api(`/admin/devices/${device.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      const index = state.devices.findIndex((item) => item.id === device.id);
      if (index >= 0) state.devices[index] = { ...state.devices[index], status: result.device.status };
      applyFilters();
      toast("Statut mis a jour.");
    } catch (error) {
      toast(error.message);
    }
  });
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "Non renseigne";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function averageBy(items, groupGetter, valueGetter) {
  const groups = {};
  items.forEach((item) => {
    const group = groupGetter(item) || "Non renseigne";
    const value = Number(valueGetter(item) || 0);
    if (!value) return;
    groups[group] = groups[group] || { total: 0, count: 0 };
    groups[group].total += value;
    groups[group].count += 1;
  });
  return Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, Math.round(value.total / value.count)]));
}

function renderBarChart(selector, title, data, suffix = "") {
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  document.querySelector(selector).innerHTML = `
    <h3>${title}</h3>
    ${
      entries
        .map(
          ([key, value]) => `
          <div class="bar-row">
            <span title="${key}">${key}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(value / max) * 100}%"></span></span>
            <strong>${value}${suffix}</strong>
          </div>
        `
        )
        .join("") || "<p class='helper'>Aucune donnee.</p>"
    }
  `;
}

function renderCharts() {
  renderBarChart('[data-chart="establishments"]', "Machines par etablissement", countBy(state.filtered, (d) => d.establishment_name));
  renderBarChart('[data-chart="teams"]', "Machines par equipe", countBy(state.filtered, (d) => d.team_name));
  renderBarChart('[data-chart="os"]', "OS", countBy(state.filtered, (d) => d.os_name));
  renderBarChart('[data-chart="stale"]', "Non mises a jour", {
    [`+${CONFIG.staleDays} jours`]: state.filtered.filter((d) => daysSince(d.last_seen_at) > CONFIG.staleDays).length,
    "A jour": state.filtered.filter((d) => daysSince(d.last_seen_at) <= CONFIG.staleDays).length,
  });
  renderBarChart('[data-chart="age"]', "Anciennete du parc", countBy(state.filtered, ageBucket));
  renderBarChart('[data-chart="models"]', "Modeles presents", countBy(state.filtered, (d) => d.model));
  renderBarChart('[data-chart="ram"]', "RAM moyenne par equipe", averageBy(state.filtered, (d) => d.team_name, (d) => d.ram_total_gb), " Go");
  renderBarChart('[data-chart="storage"]', "Stockage faible", {
    "< 15 Go": state.filtered.filter((d) => Number(d.storage_free_gb || 0) < 15).length,
    "15-30 Go": state.filtered.filter((d) => Number(d.storage_free_gb || 0) >= 15 && Number(d.storage_free_gb || 0) < 30).length,
    "> 30 Go": state.filtered.filter((d) => Number(d.storage_free_gb || 0) >= 30).length,
  });
  renderBarChart('[data-chart="fleet-value"]', "Valeur actuelle estimee", {
    "Parc": Math.round(state.filtered.reduce((sum, d) => sum + estimatedValue(d), 0)),
  }, " EUR");
  renderBarChart('[data-chart="value-by-site"]', "Valeur par etablissement", sumBy(state.filtered, (d) => d.establishment_name, estimatedValue), " EUR");
  renderBarChart('[data-chart="replace-top"]', "Top machines a remplacer", topReplaceCandidates(state.filtered));
  renderScatter('[data-chart="age-performance"]', "Age materiel vs CPU", state.filtered);
}

function sumBy(items, groupGetter, valueGetter) {
  return items.reduce((acc, item) => {
    const group = groupGetter(item) || "Non renseigne";
    acc[group] = Math.round((acc[group] || 0) + Number(valueGetter(item) || 0));
    return acc;
  }, {});
}

function topReplaceCandidates(items) {
  const candidates = items
    .filter((item) => item.recommendation === "replace" || Number(item.obsolescence_index || 0) >= 70 || Number(item.cpu_score || 0) < 7000)
    .sort((a, b) => Number(b.obsolescence_index || 0) - Number(a.obsolescence_index || 0))
    .slice(0, 8);
  return Object.fromEntries(candidates.map((item) => [item.hostname || item.serial_number || item.model, Number(item.obsolescence_index || 0)]));
}

function renderScatter(selector, title, items) {
  const points = items
    .filter((item) => item.model_release_year && item.cpu_score)
    .slice(0, 80)
    .map((item) => {
      const age = Math.max(0, new Date().getFullYear() - Number(item.model_release_year));
      const cpu = Math.min(100, Math.round((Number(item.cpu_score) / 18000) * 100));
      return `<span class="point ${item.recommendation || ""}" title="${item.hostname || item.model}: ${age} ans / CPU ${item.cpu_score}" style="left:${Math.min(age * 12, 96)}%;bottom:${Math.min(cpu, 96)}%"></span>`;
    })
    .join("");
  document.querySelector(selector).innerHTML = `
    <h3>${title}</h3>
    <div class="scatter">${points || "<p class='helper'>Enrichissement requis.</p>"}</div>
  `;
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const columns = [
    "hostname",
    "first_name",
    "last_name",
    "email",
    "team_name",
    "establishment_name",
    "service",
    "os_name",
    "os_version",
    "manufacturer",
    "model",
    "serial_number",
    "cpu",
    "ram_total_gb",
    "storage_total_gb",
    "storage_free_gb",
    "last_seen_at",
    "status",
    "hardware_age_score",
    "cpu_score",
    "cpu_generation",
    "cpu_release_year",
    "model_release_year",
    "current_market_price_avg",
    "performance_index",
    "obsolescence_index",
    "recommendation",
    "confidence_score",
    "last_enriched_at",
  ];
  const csv = [columns.join(","), ...state.filtered.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `inventaire-it-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildCommand(collectionToken) {
  const apiUrl = CONFIG.apiBaseUrl.replace(/"/g, "");
  const scriptUrl = CONFIG.scriptUrl.replace(/"/g, "");
  return `powershell -ExecutionPolicy Bypass -NoProfile -Command "iwr '${scriptUrl}' -OutFile $env:TEMP\\collect-windows.ps1; & $env:TEMP\\collect-windows.ps1 -ApiUrl '${apiUrl}' -CollectionToken '${collectionToken}'"`;
}

async function loadAdminData() {
  const data = await api("/admin/devices");
  state.devices = data.devices || [];
  const teams = [...new Set(state.devices.map((d) => d.team_name))];
  const establishments = [...new Set(state.devices.map((d) => d.establishment_name))];
  const os = [...new Set(state.devices.map((d) => d.os_name))];
  const models = [...new Set(state.devices.map((d) => d.model))];
  setOptions($("#filter-team"), teams, "Toutes");
  setOptions($("#filter-establishment"), establishments, "Tous");
  setOptions($("#filter-os"), os, "Tous");
  setOptions($("#filter-model"), models, "Tous");
  applyFilters();
}

function hydrateDatalists() {
  ["IT", "Retail", "Marketing", "Finance", "Logistique", "RH"].forEach((value) => {
    $("#team-list").insertAdjacentHTML("beforeend", `<option value="${value}"></option>`);
  });
  ["Lyon", "Paris", "Nantes", "Marseille", "Remote"].forEach((value) => {
    $("#establishment-list").insertAdjacentHTML("beforeend", `<option value="${value}"></option>`);
  });
}

function bindEvents() {
  $("#download-script").href = CONFIG.scriptUrl;

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
      $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === tab.dataset.view));
    });
  });

  $("#collect-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api("/collect/profile", {
        method: "POST",
        headers: { "X-Collection-Access-Token": form.accessToken },
        body: JSON.stringify(form),
      });
      $("#command-empty").classList.add("is-hidden");
      $("#command-result").classList.remove("is-hidden");
      $("#powershell-command").textContent = buildCommand(result.collectionToken);
      toast("Commande generee.");
    } catch (error) {
      toast(error.message);
    }
  });

  $("#copy-command").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("#powershell-command").textContent);
    toast("Commande copiee.");
  });

  $("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    try {
      const result = await api("/auth/admin", { method: "POST", body: JSON.stringify({ password }) });
      state.adminToken = result.token;
      localStorage.setItem("it_inventory_admin_token", state.adminToken);
      $("#admin-login").classList.add("is-hidden");
      $("#admin-dashboard").classList.remove("is-hidden");
      await loadAdminData();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#logout-admin").addEventListener("click", () => {
    state.adminToken = "";
    localStorage.removeItem("it_inventory_admin_token");
    $("#admin-login").classList.remove("is-hidden");
    $("#admin-dashboard").classList.add("is-hidden");
  });

  $("#refresh-admin").addEventListener("click", () => loadAdminData().catch((error) => toast(error.message)));
  $("#enrich-admin").addEventListener("click", async () => {
    const button = $("#enrich-admin");
    button.disabled = true;
    button.textContent = "Enrichissement...";
    try {
      const result = await api("/admin/enrich", { method: "POST", body: JSON.stringify({ limit: 50, force: false }) });
      toast(`${result.enriched} machine(s) enrichie(s), ${result.skipped} ignoree(s).`);
      await loadAdminData();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Enrichir les donnees";
    }
  });
  $("#export-csv").addEventListener("click", exportCsv);
  ["global-search", "filter-team", "filter-establishment", "filter-os", "filter-age", "filter-model", "filter-status", "filter-cpu-score", "filter-value"].forEach((id) => {
    $(`#${id}`).addEventListener("input", applyFilters);
  });
}

hydrateDatalists();
bindEvents();

if (state.adminToken) {
  $("#admin-login").classList.add("is-hidden");
  $("#admin-dashboard").classList.remove("is-hidden");
  loadAdminData().catch(() => {
    state.adminToken = "";
    localStorage.removeItem("it_inventory_admin_token");
    $("#admin-login").classList.remove("is-hidden");
    $("#admin-dashboard").classList.add("is-hidden");
  });
}
