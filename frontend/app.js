const CONFIG = {
  apiBaseUrl: window.IT_INVENTORY_API_URL || "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api",
  scriptUrl: window.IT_INVENTORY_SCRIPT_URL || "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1",
  staleDays: Number(window.IT_INVENTORY_STALE_DAYS || 30),
};

const state = {
  adminToken: localStorage.getItem("it_inventory_admin_token") || "",
  language: localStorage.getItem("it_inventory_language") || "fr",
  devices: [],
  filtered: [],
  selectedDeviceId: "",
  selectedDetail: null,
  selectedScans: [],
  accessTokens: [],
  rawAccessTokens: {},
  teams: [],
  establishments: [],
};

const statusLabels = {
  fr: { active: "Actif", replace: "A remplacer", stock: "En stock", lost: "Perdu", retired: "Sorti du parc" },
  en: { active: "Active", replace: "Replace", stock: "In stock", lost: "Lost", retired: "Retired" },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const originalText = new WeakMap();
const originalAttributes = new WeakMap();

const englishTranslations = {
  "Inventaire IT": "IT Inventory",
  "Navigation principale": "Main navigation",
  "Collecte": "Collection",
  "Activer le mode sombre": "Enable dark mode",
  "Activer le mode clair": "Enable light mode",
  "Changer de theme": "Change theme",
  "Changer de langue": "Change language",
  "Acces utilisateur": "User access",
  "Declarer un poste": "Register a computer",
  "Une page web seule ne peut pas lire le numero de serie, le CPU, la RAM ou le stockage complet. La collecte materielle passe donc par un script local lance volontairement par l'utilisateur.": "A web page alone cannot read the serial number, CPU, RAM, or full storage details. Hardware collection therefore uses a local script run voluntarily by the user.",
  "Token de collecte": "Collection token",
  "Nom": "Last name",
  "Prenom": "First name",
  "Equipe": "Team",
  "Etablissement": "Location",
  "Commentaire optionnel": "Optional comment",
  "Generer la commande": "Generate command",
  "Script local": "Local script",
  "Commande PowerShell": "PowerShell command",
  "Remplissez le formulaire pour obtenir une commande personnalisee.": "Complete the form to get a personalized command.",
  "Lancez cette commande dans PowerShell. Elle telecharge le script, collecte les informations du poste et les envoie a l'API.": "Run this command in PowerShell. It downloads the script, collects the computer information, and sends it to the API.",
  "Copier": "Copy",
  "Telecharger le script": "Download script",
  "Connexion": "Sign in",
  "Mot de passe admin": "Admin password",
  "Se connecter": "Sign in",
  "Dashboard": "Dashboard",
  "Vue du parc informatique": "IT fleet overview",
  "Actualiser": "Refresh",
  "Enrichir les donnees": "Enrich data",
  "Deconnexion": "Sign out",
  "Sections d'administration": "Administration sections",
  "Parc": "Fleet",
  "Organisation": "Organization",
  "Acces": "Access",
  "Acces collecte": "Collection access",
  "Tokens temporaires": "Temporary tokens",
  "Libelle": "Label",
  "Duree": "Duration",
  "1 heure": "1 hour",
  "24 heures": "24 hours",
  "7 jours": "7 days",
  "30 jours": "30 days",
  "90 jours": "90 days",
  "1 an": "1 year",
  "Utilisations maximum": "Maximum uses",
  "Illimite": "Unlimited",
  "Generer un token": "Generate token",
  "Ce token ne sera affiche qu'une fois. Conservez-le dans un endroit securise.": "This token is shown only once. Store it in a secure place.",
  "Copier le token": "Copy token",
  "Prefixe": "Prefix",
  "Expiration": "Expiration",
  "Utilisations": "Uses",
  "Derniere utilisation": "Last used",
  "Etat": "Status",
  "Structure": "Structure",
  "Equipes": "Teams",
  "Nouvelle equipe": "New team",
  "Description": "Description",
  "Couleur": "Color",
  "Equipe active": "Active team",
  "Enregistrer l'equipe": "Save team",
  "Implantations": "Locations",
  "Etablissements": "Locations",
  "Nouvel etablissement": "New location",
  "Type d'etablissement": "Location type",
  "Entrepot": "Warehouse",
  "Boutique": "Store",
  "Siege social": "Headquarters",
  "Centre R&D": "R&D center",
  "Comptabilite": "Accounting",
  "Bureau": "Office",
  "Autre": "Other",
  "Rechercher une adresse": "Search for an address",
  "Commencez a saisir une adresse...": "Start typing an address...",
  "Adresse": "Address",
  "Code postal": "Postal code",
  "Ville": "City",
  "Pays": "Country",
  "Etablissement actif": "Active location",
  "Enregistrer l'etablissement": "Save location",
  "Renseignez latitude et longitude pour afficher la carte.": "Enter latitude and longitude to display the map.",
  "Ouvrir dans OpenStreetMap": "Open in OpenStreetMap",
  "Recherche": "Search",
  "Anciennete": "Age",
  "Toutes": "All",
  "Tous": "All",
  "Recent": "Recent",
  "A surveiller": "Monitor",
  "A remplacer": "Replace",
  "Modele": "Model",
  "Statut": "Status",
  "Actif": "Active",
  "En stock": "In stock",
  "Perdu": "Lost",
  "Sorti du parc": "Retired",
  "Score CPU": "CPU score",
  "Faible": "Low",
  "Moyen": "Medium",
  "Bon": "Good",
  "Valeur": "Value",
  "Moins de 180 EUR": "Less than EUR 180",
  "Plus de 350 EUR": "More than EUR 350",
  "Machines": "Computers",
  "Utilisateur": "User",
  "Derniere remontee": "Last report",
  "Detail": "Details",
  "Selectionnez une machine": "Select a computer",
  "Aucune machine selectionnee.": "No computer selected.",
  "Valeur estimee": "Estimated value",
  "CPU faible": "Low CPU",
  "Stockage faible": "Low storage",
  "Chargement de l'historique...": "Loading history...",
  "IP locale": "Local IP",
  "Stockage": "Storage",
  "Utilisateur OS": "OS user",
  "Score age": "Age score",
  "Generation CPU": "CPU generation",
  "Annee CPU": "CPU year",
  "Annee modele": "Model year",
  "Prix lancement": "Launch price",
  "Valeur actuelle": "Current value",
  "Confiance": "Confidence",
  "Reco": "Recommendation",
  "Dernier enrichissement": "Last enrichment",
  "Mettre a jour": "Update",
  "Historique des scans": "Scan history",
  "Aucun scan detaille.": "No detailed scans.",
  "Historique prix marche": "Market price history",
  "Aucun prix externe collecte.": "No external prices collected.",
  "Non renseigne": "Not provided",
  "Aucune donnee.": "No data.",
  "Machines par etablissement": "Computers by location",
  "Machines par equipe": "Computers by team",
  "Non mises a jour": "Not recently updated",
  "A jour": "Up to date",
  "Anciennete du parc": "Fleet age",
  "Modeles presents": "Most common models",
  "RAM moyenne par equipe": "Average RAM by team",
  "Valeur actuelle estimee": "Estimated current value",
  "Valeur par etablissement": "Value by location",
  "Top machines a remplacer": "Top computers to replace",
  "Age materiel vs CPU": "Hardware age vs CPU",
  "Enrichissement requis.": "Enrichment required.",
  "Enrichissement...": "Enriching...",
  "Aucune equipe.": "No teams.",
  "Aucun etablissement.": "No locations.",
  "Aucun token genere.": "No tokens generated.",
  "Revoquer": "Revoke",
  "Revoque": "Revoked",
  "Expire": "Expired",
  "Epuise": "Exhausted",
  "Valide": "Valid",
  "Token complet indisponible apres rechargement": "Full token unavailable after reload",
  "Agence Paris - juin": "Paris office - June",
  "Nom, hostname, modele, serial...": "Name, hostname, model, serial...",
  "Commande generee.": "Command generated.",
  "Commande copiee.": "Command copied.",
  "Token genere.": "Token generated.",
  "Token copie.": "Token copied.",
  "Token revoque.": "Token revoked.",
  "Statut mis a jour.": "Status updated.",
  "Equipe mise a jour.": "Team updated.",
  "Equipe creee.": "Team created.",
  "Etablissement mis a jour.": "Location updated.",
  "Etablissement cree.": "Location created.",
  "Recherche d'adresse...": "Searching addresses...",
  "Aucune adresse trouvee.": "No address found.",
  "Selection de l'adresse...": "Loading address...",
  "Adresse completee automatiquement.": "Address completed automatically.",
  "Google Places n'est pas configure.": "Google Places is not configured.",
  "Mode clair": "Light mode",
  "Mode sombre": "Dark mode",
};

function translate(value) {
  return state.language === "en" ? englishTranslations[value] || value : value;
}

function currentStatusLabels() {
  return statusLabels[state.language] || statusLabels.fr;
}

function translateElement(root) {
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  if (root.nodeType === Node.TEXT_NODE) textNodes.unshift(root);

  textNodes.forEach((textNode) => {
    if (!originalText.has(textNode)) originalText.set(textNode, textNode.nodeValue);
    const source = originalText.get(textNode);
    const trimmed = source.trim();
    if (!trimmed) return;
    const translated = translate(trimmed);
    textNode.nodeValue = source.replace(trimmed, translated);
  });

  const elements = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll("*")] : [];
  elements.forEach((element) => {
    if (!originalAttributes.has(element)) originalAttributes.set(element, {});
    const sources = originalAttributes.get(element);
    ["placeholder", "title", "aria-label"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      if (!(attribute in sources)) sources[attribute] = element.getAttribute(attribute);
      element.setAttribute(attribute, translate(sources[attribute]));
    });
  });
}

function applyLanguage(language, persist = true) {
  state.language = language === "en" ? "en" : "fr";
  document.documentElement.lang = state.language;
  if (persist) localStorage.setItem("it_inventory_language", state.language);
  $("#current-language-flag").textContent = state.language === "en"
    ? "\u{1F1EC}\u{1F1E7}"
    : "\u{1F1EB}\u{1F1F7}";
  $$("[data-language]").forEach((button) => button.classList.toggle("is-active", button.dataset.language === state.language));
  renderDevices();
  renderMetrics();
  renderCharts();
  renderOrganization();
  renderAccessTokens();
  if (state.selectedDetail) renderDetail(state.selectedDetail, state.selectedScans);
  translateElement(document.body);
  setTheme(document.documentElement.dataset.theme || "light");
}

const languageObserver = new MutationObserver((records) => {
  if (state.language !== "en") return;
  records.forEach((record) => {
    record.addedNodes.forEach((node) => translateElement(node));
  });
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("it_inventory_theme", theme);
  const toggle = $("#theme-toggle");
  if (toggle) {
    const dark = theme === "dark";
    toggle.setAttribute("aria-label", translate(dark ? "Activer le mode clair" : "Activer le mode sombre"));
    toggle.title = translate(dark ? "Mode clair" : "Mode sombre");
  }
}

function toast(message) {
  const node = $("#toast");
  node.textContent = translate(message);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(state.language === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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
  return new Intl.NumberFormat(state.language === "en" ? "en-GB" : "fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(number);
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

function tokenState(token) {
  if (token.revoked_at) return { key: "revoked", label: translate("Revoque") };
  if (new Date(token.expires_at).getTime() <= Date.now()) return { key: "expired", label: translate("Expire") };
  if (token.max_uses !== null && Number(token.use_count) >= Number(token.max_uses)) {
    return { key: "exhausted", label: translate("Epuise") };
  }
  return { key: "valid", label: translate("Valide") };
}

function copyIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2"></rect>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
    </svg>
  `;
}

function renderAccessTokens() {
  $("#tokens-table").innerHTML = state.accessTokens
    .map((token) => {
      const status = tokenState(token);
      const usage = token.max_uses === null
        ? `${token.use_count} / ${state.language === "en" ? "unlimited" : "illimite"}`
        : `${token.use_count} / ${token.max_uses}`;
      const canCopy = Boolean(state.rawAccessTokens[token.id]);
      const copyTitle = canCopy
        ? "Copier le token"
        : "Token complet indisponible apres rechargement";
      return `
        <tr>
          <td>${escapeHtml(token.label)}</td>
          <td>
            <div class="token-prefix">
              <code>${escapeHtml(token.token_prefix)}...</code>
              <button
                class="secondary icon-button copy-access-token"
                type="button"
                data-id="${token.id}"
                aria-label="${copyTitle}"
                title="${copyTitle}"
                ${canCopy ? "" : "disabled"}
              >${copyIcon()}</button>
            </div>
          </td>
          <td>${formatDate(token.expires_at)}</td>
          <td>${usage}</td>
          <td>${formatDate(token.last_used_at)}</td>
          <td><span class="token-state ${status.key}">${status.label}</span></td>
          <td>
            ${status.key === "valid" ? `<button class="secondary revoke-token" type="button" data-id="${token.id}">${translate("Revoquer")}</button>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");

  if (state.accessTokens.length === 0) {
    $("#tokens-table").innerHTML = `<tr><td colspan="7" class="helper">Aucun token genere.</td></tr>`;
  }

  $$(".copy-access-token").forEach((button) => {
    button.addEventListener("click", async () => {
      const token = state.rawAccessTokens[button.dataset.id];
      if (!token) return;
      await navigator.clipboard.writeText(token);
      toast("Token copie.");
    });
  });

  $$(".revoke-token").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api(`/admin/access-tokens/${button.dataset.id}/revoke`, { method: "POST", body: "{}" });
        await loadAccessTokens();
        toast("Token revoque.");
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    });
  });
}

async function loadAccessTokens() {
  const data = await api("/admin/access-tokens");
  state.accessTokens = data.tokens || [];
  renderAccessTokens();
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
  $("#result-count").textContent = state.language === "en"
    ? `${state.filtered.length} result${state.filtered.length === 1 ? "" : "s"}`
    : `${state.filtered.length} resultat${state.filtered.length === 1 ? "" : "s"}`;
  const labels = currentStatusLabels();
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
  state.selectedDetail = device;
  state.selectedScans = scans;
  const labels = currentStatusLabels();
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

function organizationIcon(type) {
  if (type === "team") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
}

const establishmentTypeLabels = {
  warehouse: "Entrepot",
  store: "Boutique",
  headquarters: "Siege social",
  research: "Centre R&D",
  accounting: "Comptabilite",
  office: "Bureau",
  other: "Autre",
};

function establishmentIcon(type) {
  const icons = {
    warehouse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 17h10"></path></svg>`,
    store: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l2-6h14l2 6M5 13v8h14v-8M9 21v-6h6v6"></path><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"></path></svg>`,
    headquarters: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16M6 21V5h8v16M14 9h4v12M9 8h2M9 12h2M9 16h2"></path></svg>`,
    research: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M8 15h8"></path></svg>`,
    accounting: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"></path></svg>`,
    office: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"></path></svg>`,
    other: organizationIcon("site"),
  };
  return icons[type] || icons.other;
}

function countryCodeFromName(country) {
  const codes = {
    France: "fr",
    Belgique: "be",
    Suisse: "ch",
    "Royaume-Uni": "gb",
    Espagne: "es",
    Italie: "it",
    Allemagne: "de",
    "Pays-Bas": "nl",
    Portugal: "pt",
    "Etats-Unis": "us",
  };
  return codes[country] || "";
}

function countryNameFromCode(code) {
  const countries = {
    fr: "France",
    be: "Belgique",
    ch: "Suisse",
    gb: "Royaume-Uni",
    es: "Espagne",
    it: "Italie",
    de: "Allemagne",
    nl: "Pays-Bas",
    pt: "Portugal",
    us: "Etats-Unis",
  };
  return countries[String(code || "").toLowerCase()] || "";
}

function setAdminView(view) {
  $$(".admin-nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.adminView === view));
  $$(".admin-section-view").forEach((section) => {
    section.classList.toggle("is-hidden", !section.classList.contains(`section-${view}`));
  });
}

function updateOrganizationDatalists() {
  $("#team-list").innerHTML = state.teams
    .filter((team) => team.active)
    .map((team) => `<option value="${escapeHtml(team.name)}"></option>`)
    .join("");
  $("#establishment-list").innerHTML = state.establishments
    .filter((site) => site.active)
    .map((site) => `<option value="${escapeHtml(site.name)}"></option>`)
    .join("");
}

function renderOrganization() {
  $("#teams-manager-list").innerHTML = state.teams
    .map(
      (team) => `
        <button class="organization-item edit-team ${team.active ? "" : "is-inactive"}" type="button" data-id="${team.id}">
          <span class="organization-icon" style="--item-color:${escapeHtml(team.color || "#16735f")}">${organizationIcon("team")}</span>
          <span>
            <strong>${escapeHtml(team.name)}</strong>
            <small>${state.language === "en" ? `${team.device_count} computer${team.device_count === 1 ? "" : "s"}` : `${team.device_count} machine${team.device_count === 1 ? "" : "s"}`}${team.description ? ` - ${escapeHtml(team.description)}` : ""}</small>
          </span>
          <span class="organization-chevron">&rsaquo;</span>
        </button>
      `,
    )
    .join("") || `<p class="helper">Aucune equipe.</p>`;

  $("#establishments-manager-list").innerHTML = state.establishments
    .map((site) => {
      const location = [site.city, site.country].filter(Boolean).join(", ");
      return `
        <button class="organization-item edit-establishment ${site.active ? "" : "is-inactive"}" type="button" data-id="${site.id}">
          <span class="organization-icon site type-${escapeHtml(site.establishment_type || "office")}">${establishmentIcon(site.establishment_type || "office")}</span>
          <span>
            <strong>${escapeHtml(site.name)}</strong>
            <small>${translate(establishmentTypeLabels[site.establishment_type] || establishmentTypeLabels.office)} - ${state.language === "en" ? `${site.device_count} computer${site.device_count === 1 ? "" : "s"}` : `${site.device_count} machine${site.device_count === 1 ? "" : "s"}`}${location ? ` - ${escapeHtml(location)}` : ""}</small>
          </span>
          <span class="organization-chevron">&rsaquo;</span>
        </button>
      `;
    })
    .join("") || `<p class="helper">Aucun etablissement.</p>`;

  $$(".edit-team").forEach((button) => button.addEventListener("click", () => editTeam(button.dataset.id)));
  $$(".edit-establishment").forEach((button) =>
    button.addEventListener("click", () => editEstablishment(button.dataset.id)),
  );
}

function resetTeamForm() {
  const form = $("#team-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.color.value = "#16735f";
  form.elements.active.checked = true;
  $("#team-editor-title").textContent = "Nouvelle equipe";
}

function editTeam(id) {
  const team = state.teams.find((item) => item.id === id);
  if (!team) return;
  const form = $("#team-form");
  form.elements.id.value = team.id;
  form.elements.name.value = team.name || "";
  form.elements.description.value = team.description || "";
  form.elements.color.value = team.color || "#16735f";
  form.elements.active.checked = Boolean(team.active);
  $("#team-editor-title").textContent = team.name;
}

function resetEstablishmentForm() {
  const form = $("#establishment-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.country.value = "France";
  form.elements.establishmentType.value = "office";
  form.elements.active.checked = true;
  $("#address-search").value = "";
  $("#address-search-status").textContent = "";
  hideAddressSuggestions();
  $("#establishment-editor-title").textContent = "Nouvel etablissement";
  renderEstablishmentMap();
}

function editEstablishment(id) {
  const site = state.establishments.find((item) => item.id === id);
  if (!site) return;
  const form = $("#establishment-form");
  form.elements.id.value = site.id;
  form.elements.name.value = site.name || "";
  form.elements.establishmentType.value = site.establishment_type || "office";
  form.elements.address.value = site.address || "";
  form.elements.postalCode.value = site.postal_code || "";
  form.elements.city.value = site.city || "";
  form.elements.country.value = site.country || "France";
  form.elements.latitude.value = site.latitude ?? "";
  form.elements.longitude.value = site.longitude ?? "";
  form.elements.active.checked = Boolean(site.active);
  $("#establishment-editor-title").textContent = site.name;
  renderEstablishmentMap();
}

function renderEstablishmentMap() {
  const form = $("#establishment-form");
  const latitude = Number(form.elements.latitude.value);
  const longitude = Number(form.elements.longitude.value);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !form.elements.latitude.value || !form.elements.longitude.value) {
    $("#establishment-map").innerHTML = `
      <div class="map-empty">
        ${organizationIcon("site")}
        Renseignez latitude et longitude pour afficher la carte.
      </div>
    `;
    return;
  }
  const delta = 0.015;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
  const openUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=16/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
  $("#establishment-map").innerHTML = `
    <iframe title="Carte de l'etablissement" loading="lazy" src="${src}"></iframe>
    <a href="${openUrl}" target="_blank" rel="noopener">Ouvrir dans OpenStreetMap</a>
  `;
}

async function loadOrganization() {
  const data = await api("/admin/organization");
  state.teams = data.teams || [];
  state.establishments = data.establishments || [];
  renderOrganization();
  updateOrganizationDatalists();
}

let addressSearchTimer = 0;
let addressSearchController = null;

function hideAddressSuggestions() {
  $("#address-suggestions").classList.add("is-hidden");
  $("#address-suggestions").innerHTML = "";
}

async function searchAddresses() {
  const form = $("#establishment-form");
  const query = $("#address-search").value.trim();
  if (query.length < 3) {
    $("#address-search-status").textContent = "";
    hideAddressSuggestions();
    return;
  }
  if (addressSearchController) addressSearchController.abort();
  addressSearchController = new AbortController();
  $("#address-search-status").textContent = translate("Recherche d'adresse...");
  const params = new URLSearchParams({
    q: query,
    country: countryCodeFromName(form.elements.country.value),
    language: state.language,
  });
  try {
    const data = await api(`/admin/address/autocomplete?${params}`, { signal: addressSearchController.signal });
    const suggestions = data.suggestions || [];
    $("#address-search-status").textContent = suggestions.length ? "" : translate("Aucune adresse trouvee.");
    $("#address-suggestions").innerHTML = suggestions
      .map(
        (suggestion) => `
          <button class="address-suggestion" type="button" role="option" data-place-id="${escapeHtml(suggestion.placeId)}">
            ${organizationIcon("site")}
            <span>${escapeHtml(suggestion.label)}</span>
          </button>
        `,
      )
      .join("");
    $("#address-suggestions").classList.toggle("is-hidden", suggestions.length === 0);
    $$(".address-suggestion").forEach((button) => {
      button.addEventListener("click", () => selectAddressSuggestion(button.dataset.placeId));
    });
  } catch (error) {
    if (error.name === "AbortError") return;
    hideAddressSuggestions();
    $("#address-search-status").textContent = translate(error.message);
  }
}

async function selectAddressSuggestion(placeId) {
  const form = $("#establishment-form");
  $("#address-search-status").textContent = translate("Selection de l'adresse...");
  hideAddressSuggestions();
  try {
    const params = new URLSearchParams({ placeId, language: state.language });
    const address = await api(`/admin/address/details?${params}`);
    form.elements.address.value = address.address || "";
    form.elements.postalCode.value = address.postalCode || "";
    form.elements.city.value = address.city || "";
    const countryValue = countryNameFromCode(address.countryCode);
    if (countryValue) form.elements.country.value = countryValue;
    form.elements.latitude.value = address.latitude ?? "";
    form.elements.longitude.value = address.longitude ?? "";
    $("#address-search").value = address.formattedAddress || address.address || "";
    $("#address-search-status").textContent = translate("Adresse completee automatiquement.");
    renderEstablishmentMap();
  } catch (error) {
    $("#address-search-status").textContent = translate(error.message);
  }
}

async function loadAdminData() {
  const data = await api("/admin/devices");
  loadAccessTokens().catch((error) => {
    state.accessTokens = [];
    renderAccessTokens();
    toast(`Module tokens indisponible: ${error.message}`);
  });
  loadOrganization().catch((error) => toast(`Module organisation indisponible: ${error.message}`));
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
  setTheme(document.documentElement.dataset.theme || "light");
  $("#theme-toggle").addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  $("#language-toggle").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("#language-menu");
    const open = menu.classList.toggle("is-hidden") === false;
    $("#language-toggle").setAttribute("aria-expanded", String(open));
  });
  $$("[data-language]").forEach((button) => {
    button.addEventListener("click", () => {
      applyLanguage(button.dataset.language);
      $("#language-menu").classList.add("is-hidden");
      $("#language-toggle").setAttribute("aria-expanded", "false");
    });
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".language-switcher")) return;
    $("#language-menu").classList.add("is-hidden");
    $("#language-toggle").setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    $("#language-menu").classList.add("is-hidden");
    $("#language-toggle").setAttribute("aria-expanded", "false");
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
      $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === tab.dataset.view));
    });
  });

  $$(".admin-nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      setAdminView(button.dataset.adminView);
      if (button.dataset.adminView === "organization") {
        loadOrganization().catch((error) => toast(error.message));
      }
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
  $("#refresh-tokens").addEventListener("click", () => loadAccessTokens().catch((error) => toast(error.message)));
  $("#new-team").addEventListener("click", resetTeamForm);
  $("#new-establishment").addEventListener("click", resetEstablishmentForm);
  $("#team-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const id = values.id;
    const payload = {
      name: values.name,
      description: values.description,
      color: values.color,
      active: form.elements.active.checked,
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api(id ? `/admin/teams/${id}` : "/admin/teams", { method: "POST", body: JSON.stringify(payload) });
      await loadAdminData();
      resetTeamForm();
      toast(id ? "Equipe mise a jour." : "Equipe creee.");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $("#establishment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const id = values.id;
    const payload = {
      name: values.name,
      establishmentType: values.establishmentType,
      address: values.address,
      postalCode: values.postalCode,
      city: values.city,
      country: values.country,
      latitude: values.latitude,
      longitude: values.longitude,
      active: form.elements.active.checked,
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api(id ? `/admin/establishments/${id}` : "/admin/establishments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadAdminData();
      resetEstablishmentForm();
      toast(id ? "Etablissement mis a jour." : "Etablissement cree.");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  ["latitude", "longitude"].forEach((name) => {
    $("#establishment-form").elements[name].addEventListener("input", renderEstablishmentMap);
  });
  $("#address-search").addEventListener("input", () => {
    window.clearTimeout(addressSearchTimer);
    addressSearchTimer = window.setTimeout(searchAddresses, 320);
  });
  $("#establishment-form").elements.country.addEventListener("change", () => {
    if ($("#address-search").value.trim().length >= 3) searchAddresses();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".address-search-field")) return;
    hideAddressSuggestions();
  });
  $("#token-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      label: values.label,
      durationHours: Number(values.durationHours),
      maxUses: values.maxUses ? Number(values.maxUses) : null,
    };
    try {
      const result = await api("/admin/access-tokens", { method: "POST", body: JSON.stringify(payload) });
      state.rawAccessTokens[result.record.id] = result.token;
      $("#generated-token").textContent = result.token;
      $("#token-result").classList.remove("is-hidden");
      event.currentTarget.reset();
      await loadAccessTokens();
      toast("Token genere.");
    } catch (error) {
      toast(error.message);
    }
  });
  $("#copy-token").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("#generated-token").textContent);
    toast("Token copie.");
  });
  $("#enrich-admin").addEventListener("click", async () => {
    const button = $("#enrich-admin");
    button.disabled = true;
    button.textContent = translate("Enrichissement...");
    try {
      const result = await api("/admin/enrich", { method: "POST", body: JSON.stringify({ limit: 50, force: false }) });
      toast(state.language === "en"
        ? `${result.enriched} computer(s) enriched, ${result.skipped} skipped.`
        : `${result.enriched} machine(s) enrichie(s), ${result.skipped} ignoree(s).`);
      await loadAdminData();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = translate("Enrichir les donnees");
    }
  });
  $("#export-csv").addEventListener("click", exportCsv);
  ["global-search", "filter-team", "filter-establishment", "filter-os", "filter-age", "filter-model", "filter-status", "filter-cpu-score", "filter-value"].forEach((id) => {
    $(`#${id}`).addEventListener("input", applyFilters);
  });
}

hydrateDatalists();
bindEvents();
applyLanguage(state.language, false);
languageObserver.observe(document.body, { childList: true, subtree: true });

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
