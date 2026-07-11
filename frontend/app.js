const {
  config: CONFIG,
  constants: {
    collectorInstallStateKey: COLLECTOR_INSTALL_STATE_KEY,
    collectorDownloadStateKey: COLLECTOR_DOWNLOAD_STATE_KEY,
    enrichmentWorkflowStateKey: ENRICHMENT_WORKFLOW_STATE_KEY,
    enrichmentBatchSize: ENRICHMENT_BATCH_SIZE,
  },
  createInitialState,
  createApiClient,
  createInventoryApi,
  createPublicResourceService,
  queryElement,
  queryElements,
  translations: {
    english: englishTranslations,
    frenchNotifications: frenchNotificationTranslations,
    normalizeKey: normalizeTranslationKey,
    localizeError: localizeErrorMessage,
  },
  domain: {
    inventory: inventoryDomain,
    dates: dateDomain,
    collector: collectorDomain,
    fleet: fleetDomain,
    invoices: invoiceDomain,
    history: historyDomain,
    organization: organizationDomain,
    formatters: formattersDomain,
    enrichment: enrichmentDomain,
    notifications: notificationDomain,
    cpuRelease: cpuReleaseDomain,
  },
} = window.SpacefootCore;

const state = createInitialState();
let pendingRetirement = null;
let activeEnrichmentRun = null;
const enrichmentWorkflowCoordinator = new enrichmentDomain.EnrichmentWorkflowCoordinator();
let lastEnrichmentWorkflow = null;
let renderedEnrichmentWorkflowSteps = [];
let activeEnrichmentJobProgress = null;
let unifiedEnrichmentRunActive = false;
let pendingFilterFrame = null;

const statusLabels = {
  fr: { active: "Actif", replace: "Remplacement planifié", stock: "En stock", lost: "Perdu", retired: "Sorti du parc" },
  en: { active: "Active", replace: "Planned replacement", stock: "In stock", lost: "Lost", retired: "Retired" },
};

const $ = queryElement;
const $$ = queryElements;
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
let pendingReassignment = null;
const apiClient = createApiClient(() => state.adminToken);
const inventoryApi = createInventoryApi(apiClient);
const publicResources = createPublicResourceService();
const { downloadLabel, macosInstallCommand, osIconSvg, platformLabel, ubuntuInstallCommand } = collectorDomain;

const organizationPalette = [
  "#3b6ea8",
  "#21867a",
  "#4f8a52",
  "#b88325",
  "#b86632",
  "#b45c75",
  "#7b61a8",
  "#4e68b0",
  "#2f8898",
  "#7a963f",
  "#64748b",
  "#b15f9a",
];

function translate(value) {
  const key = normalizeTranslationKey(value);
  if (key.startsWith("notification.")) {
    return state.language === "en" ? englishTranslations[key] || value : frenchNotificationTranslations[key] || value;
  }
  return state.language === "en" ? englishTranslations[key] || value : value;
}

function currentStatusLabels() {
  return statusLabels[state.language] || statusLabels.fr;
}

function localizedEnrichmentValue(value) {
  const labels = {
    fr: {
      completed: "Terminé",
      partial: "Partiel",
      failed: "Échec",
      pending: "En attente",
      "business-laptop": "Portable professionnel",
      workstation: "Station de travail",
      "mini-pc": "Mini PC",
      desktop: "Ordinateur fixe",
      "all-in-one": "Tout-en-un",
      keep: "Garder",
      watch: "Surveiller",
      replace: "Remplacer",
      market_verified: "Prix marché vérifié",
      market_blended: "Prix marché mixte",
      manufacturer_msrp: "Prix constructeur vérifié",
      model_matched: "Modèle identifié",
      spec_estimate: "Estimation technique",
      fallback_estimate: "Estimation prudente",
      invoice_backed: "Facture verifiee",
      day: "Jour exact",
      month: "Mois",
      quarter: "Trimestre",
      half_year: "Semestre",
      year: "Année",
      announcement: "Annonce",
      launch: "Lancement",
      first_product_availability: "Première disponibilité produit",
      expected_availability: "Disponibilité prévue",
      exact_part_number: "Référence exacte",
      exact_canonical_name: "Nom exact",
      validated_alias: "Alias validé",
      controlled_family: "Famille contrôlée",
    },
    en: {
      completed: "Completed",
      partial: "Partial",
      failed: "Failed",
      pending: "Pending",
      "business-laptop": "Business laptop",
      workstation: "Workstation",
      "mini-pc": "Mini PC",
      desktop: "Desktop",
      "all-in-one": "All-in-one",
      keep: "Keep",
      watch: "Monitor",
      replace: "Replace",
      market_verified: "Market verified",
      market_blended: "Market blended",
      manufacturer_msrp: "Manufacturer MSRP",
      model_matched: "Model matched",
      spec_estimate: "Spec estimate",
      fallback_estimate: "Fallback estimate",
      invoice_backed: "Invoice backed",
      day: "Exact day",
      month: "Month",
      quarter: "Quarter",
      half_year: "Half-year",
      year: "Year",
      announcement: "Announcement",
      launch: "Launch",
      first_product_availability: "First product availability",
      expected_availability: "Expected availability",
      exact_part_number: "Exact part number",
      exact_canonical_name: "Exact name",
      validated_alias: "Validated alias",
      controlled_family: "Controlled family",
    },
  };
  return labels[state.language]?.[value] || value;
}

function cpuPlatformLabel(cpuName) {
  const cpu = String(cpuName || "").toLowerCase();
  const labels = {
    intel: "Intel x86",
    amd: "AMD x86",
    apple: "Apple Silicon (ARM)",
    qualcomm: "Qualcomm Snapdragon (ARM)",
    unknown: state.language === "en" ? "Unknown" : "Inconnue",
  };
  if (/\b(intel|core|xeon|pentium|celeron)\b/.test(cpu)) return labels.intel;
  if (/\b(amd|ryzen|athlon|epyc|threadripper)\b/.test(cpu)) return labels.amd;
  if (/\bapple\s+m[1-4]\b/.test(cpu)) return labels.apple;
  if (/\b(snapdragon|qualcomm|oryon)\b/.test(cpu)) return labels.qualcomm;
  return labels.unknown;
}

function valuationReasonsDisplay(device) {
  const reasons = Array.isArray(device.valuation_reasons) ? device.valuation_reasons : [];
  return reasons.map((reason) => String(reason).replaceAll("_", " ")).join(" / ");
}

function localizedMarketCondition(value) {
  const condition = String(value || "").trim();
  if (!condition) return "-";
  return condition
    .split(" - ")
    .map((part) => translate(part))
    .join(" - ");
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
  $("#current-language-flag").textContent = state.language === "en" ? "\u{1F1EC}\u{1F1E7}" : "\u{1F1EB}\u{1F1F7}";
  $$("[data-language]").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.language === state.language),
  );
  renderDevices();
  renderMetrics();
  renderOemMetrics();
  renderValuation();
  renderOrganization();
  renderAccessTokens();
  renderNotifications();
  syncAdminUserActiveLabel();
  updateWeatherDisplay();
  if (state.selectedDetail) renderDetail(state.selectedDetail, state.selectedScans, state.selectedHistory);
  translateElement(document.body);
  updateTimeFormatButton();
  updateCollectorDownloadUi();
  setTheme(state.themePreference, false);
}

const languageObserver = new MutationObserver((records) => {
  if (state.language !== "en") return;
  records.forEach((record) => {
    record.addedNodes.forEach((node) => translateElement(node));
  });
});

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function activeTheme(preference = state.themePreference) {
  return preference === "system" ? systemTheme() : preference;
}

function setTheme(preference, persist = true) {
  state.themePreference = ["system", "light", "dark"].includes(preference) ? preference : "system";
  const theme = activeTheme();
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem("it_inventory_theme_preference", state.themePreference);
  const toggle = $("#theme-toggle");
  if (toggle) {
    const dark = theme === "dark";
    const label =
      state.themePreference === "system" ? translate("Theme systeme") : translate(dark ? "Mode sombre" : "Mode clair");
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }
}

function toast(message, type = "info") {
  const node = $("#toast");
  node.textContent = translate(message);
  node.dataset.type = type;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 3200);
}

const rolePermissions = {
  ADMIN: [
    "DEVICE_VIEW",
    "DEVICE_EDIT",
    "DEVICE_DELETE",
    "TEAM_MANAGE",
    "LOCATION_MANAGE",
    "TOKEN_MANAGE",
    "USER_MANAGE",
    "PENDING_CHANGE_APPROVE",
    "EXPORT_DATA",
    "VIEW_HISTORY",
    "VIEW_DASHBOARD",
    "NOTIFICATION_VIEW",
    "NOTIFICATION_MANAGE",
  ],
  MANAGER: [
    "DEVICE_VIEW",
    "DEVICE_EDIT",
    "TEAM_MANAGE",
    "LOCATION_MANAGE",
    "EXPORT_DATA",
    "VIEW_HISTORY",
    "VIEW_DASHBOARD",
    "NOTIFICATION_VIEW",
    "PENDING_CHANGE_APPROVE",
  ],
  VIEWER: ["DEVICE_VIEW", "VIEW_HISTORY", "VIEW_DASHBOARD", "NOTIFICATION_VIEW"],
  READ_ONLY: ["DEVICE_VIEW", "VIEW_HISTORY", "VIEW_DASHBOARD", "NOTIFICATION_VIEW"],
  COLLECTOR_USER: [],
};

function canPerformAction(action) {
  const role = state.currentAdmin?.role || "VIEWER";
  return rolePermissions[role]?.includes(action) || false;
}

function applyPermissions() {
  $$("[data-permission]").forEach((node) => {
    const allowed = canPerformAction(node.dataset.permission);
    if (node.classList.contains("admin-section-view")) {
      node.classList.toggle("permission-hidden", !allowed);
    } else {
      node.classList.toggle("is-hidden", !allowed);
    }
  });
  const editable = canPerformAction("DEVICE_EDIT");
  [
    "#valuation-enrich-fleet",
    "#valuation-enrich-all",
    "#valuation-recalculate",
    "#refresh-cpu-release-dates",
    "#sync-cpu-benchmarks",
    "#import-cpu-benchmarks",
  ].forEach((selector) => {
    const node = $(selector);
    if (node) node.classList.toggle("is-hidden", !editable);
  });
  $$("[data-admin-only]").forEach((node) => node.classList.toggle("is-hidden", state.currentAdmin?.role !== "ADMIN"));
  $("#export-csv")?.classList.toggle("is-hidden", !canPerformAction("EXPORT_DATA"));
  const sessionLabel = $("#admin-session-label");
  if (sessionLabel) {
    sessionLabel.innerHTML = state.currentAdmin ? renderSessionRole(state.currentAdmin) : "";
    sessionLabel.title = state.currentAdmin
      ? `${state.currentAdmin.displayName || state.currentAdmin.username} - ${formatRoleLabel(state.currentAdmin.role)}`
      : "";
  }
  if (state.currentView === "admin" && validAdminView(state.currentAdminView) !== state.currentAdminView) {
    setAdminView("fleet");
  }
}

function roleIcon(role) {
  const paths = {
    ADMIN: '<path d="M12 3 4 6v6c0 5 3.4 8.1 8 10 4.6-1.9 8-5 8-10V6l-8-3Z"></path><path d="m9 12 2 2 4-5"></path>',
    MANAGER:
      '<rect width="18" height="14" x="3" y="7" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"></path>',
    VIEWER: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle>',
    READ_ONLY:
      '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle>',
    COLLECTOR_USER: '<path d="M12 3v12"></path><path d="m8 11 4 4 4-4"></path><path d="M4 21h16"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[role] || paths.VIEWER}</svg>`;
}

function formatRoleLabel(role) {
  const labels = {
    ADMIN: "Admin",
    MANAGER: "Manager",
    VIEWER: "Viewer",
    READ_ONLY: "Read only",
    COLLECTOR_USER: "Collector",
  };
  return labels[role] || role || "Viewer";
}

function renderSessionRole(user) {
  const role = user.role || "VIEWER";
  const name = user.displayName || user.username || "Admin";
  return `
    <span class="session-role-badge role-${escapeHtml(String(role).toLowerCase())}">
      ${roleIcon(role)}
      <span>${escapeHtml(name)}</span>
      <small>${escapeHtml(formatRoleLabel(role))}</small>
    </span>
  `;
}

function collectionForm() {
  return $("#collect-form");
}

function saveCollectionDraft() {
  const form = collectionForm();
  if (!form) return;
  const draft = Object.fromEntries(new FormData(form));
  state.collectionDraft = draft;
  localStorage.setItem("it_inventory_collection_draft", JSON.stringify(draft));
}

function restoreCollectionDraft() {
  const form = collectionForm();
  if (!form) return;
  Object.entries(state.collectionDraft || {}).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  if (state.currentInviteCode && form.elements.inviteCode) form.elements.inviteCode.value = state.currentInviteCode;
  toggleProposalFields();
}

function toggleProposalFields() {
  const form = collectionForm();
  if (!form) return;
  const teamOther = form.elements.team.value === "__other__";
  const establishmentOther = form.elements.establishment.value === "__other__";
  $("#proposed-team-field")?.classList.toggle("is-hidden", !teamOther);
  $("#proposed-establishment-field")?.classList.toggle("is-hidden", !establishmentOther);
  if (form.elements.proposedTeam) form.elements.proposedTeam.required = teamOther;
  if (form.elements.proposedEstablishment) form.elements.proposedEstablishment.required = establishmentOther;
}

function setCollectionInviteMode(invite = null) {
  const form = collectionForm();
  if (!form) return;
  state.currentInvite = invite;
  state.currentInviteCode = invite?.inviteCode || "";
  if (form.elements.inviteCode) form.elements.inviteCode.value = state.currentInviteCode;
  const hasInvite = Boolean(state.currentInviteCode);
  $("#collect-invite-banner")?.classList.toggle("is-hidden", !hasInvite);
  $("#collect-support-token")?.classList.toggle("is-hidden", hasInvite);
  if (form.elements.accessToken) form.elements.accessToken.required = !hasInvite;
}

function applyCollectionInvite(invite) {
  const form = collectionForm();
  if (!form) return;
  setCollectionInviteMode(invite);
  ["firstName", "lastName", "email", "team", "establishment", "comment"].forEach((field) => {
    if (form.elements[field] && invite[field]) form.elements[field].value = invite[field];
  });
  saveCollectionDraft();
  toggleProposalFields();
}

async function loadInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get("invite") || "";
  if (!inviteCode) {
    setCollectionInviteMode(null);
    return;
  }
  state.currentInviteCode = inviteCode;
  collectionForm().elements.inviteCode.value = inviteCode;
  try {
    const invite = await inventoryApi.getCollectionInvite(inviteCode);
    applyCollectionInvite(invite);
    toast("Invitation chargée.", "success");
  } catch (error) {
    setCollectionInviteMode(null);
    if (collectionForm().elements.inviteCode) collectionForm().elements.inviteCode.value = inviteCode;
    toast(error.message, "error");
  }
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach((node) => {
    node.textContent = "";
  });
  form.querySelectorAll(".field-invalid").forEach((node) => node.classList.remove("field-invalid"));
}

function setFieldError(input, message) {
  const label = input.closest("label");
  label?.classList.add("field-invalid");
  const error = label?.querySelector(".field-error");
  if (error) error.textContent = translate(message);
}

function validateCollectionForm(form) {
  toggleProposalFields();
  clearFieldErrors(form);
  let valid = true;
  Array.from(form.elements).forEach((input) => {
    if (!input.name || input.disabled || input.type === "submit" || input.closest(".is-hidden")) return;
    const value = String(input.value || "").trim();
    if (input.required && !value) {
      setFieldError(input, "Champ requis.");
      valid = false;
    } else if (input.type === "email" && value && !input.checkValidity()) {
      setFieldError(input, "Adresse email invalide.");
      valid = false;
    }
  });
  return valid;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fallbackAbbreviation(name) {
  const words = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function displayWithAbbreviation(name, abbreviation) {
  const abbr = String(abbreviation || "")
    .trim()
    .toUpperCase();
  return abbr ? `${abbr} - ${name}` : name;
}

function defaultOrganizationColor(index = 0) {
  return organizationPalette[Math.abs(index) % organizationPalette.length];
}

function badgeStyle(color) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#64748b";
  return `style="--badge-color:${escapeHtml(safeColor)}"`;
}

function teamRecordByName(name) {
  return state.teams.find((team) => team.name === name) || null;
}

function teamRecordById(id) {
  return state.teams.find((team) => team.id === id) || null;
}

function establishmentRecordByName(name) {
  return state.establishments.find((site) => site.name === name) || null;
}

function establishmentRecordById(id) {
  return state.establishments.find((site) => site.id === id) || null;
}

const normalizeOsInfo = inventoryDomain.normalizeOsInfo;

function osIcon(iconType) {
  if (iconType === "windows-11") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z"></path></svg>`;
  }
  if (iconType === "windows-10" || iconType === "windows-server") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 8-1.2v7.5H3V5Zm9.5-1.4L21 2.3v9h-8.5V3.6ZM3 12.7h8v7.5L3 19v-6.3Zm9.5 0H21v9l-8.5-1.3v-7.7Z"></path></svg>`;
  }
  if (iconType === "ubuntu") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><circle cx="12" cy="3.5" r="2"></circle><circle cx="4.7" cy="16.2" r="2"></circle><circle cx="19.3" cy="16.2" r="2"></circle><path d="M11 5.5 9.5 8M6.4 15.2 8.8 14M15.2 14l2.4 1.2"></path></svg>`;
  }
  if (iconType === "macos") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.2c-1 .1-2.2.7-2.8 1.5-.6.7-1.1 1.8-.9 2.8 1.1.1 2.2-.5 2.9-1.3.7-.8 1.1-1.9.8-3Z"></path><path d="M19.3 16.7c-.5 1.2-.8 1.8-1.5 2.9-1 1.5-2.4 3.4-4.1 3.4-1.5 0-1.9-1-3.8-1s-2.4 1-3.9 1c-1.7 0-3-1.7-4-3.2C-.6 16 .5 10.3 3.1 8.7c1.8-1.1 4.5-.9 6 .2 1.1.8 1.8.8 2.9 0 1.5-1.1 4.2-1.4 6-.2.7.4 1.7 1.3 2.2 2.2-1.9 1.1-2.3 3.7-.9 5.8Z"></path></svg>`;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2"></rect>
      <path d="M8 21h8M12 17v4"></path>
    </svg>
  `;
}

function renderOsBadge(device) {
  const fullOs = [device.os_name || device.osType || device.os_type, device.os_version]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!fullOs) return "-";
  const info = normalizeOsInfo(fullOs);
  return `<span class="os-badge ${info.iconType}" title="${escapeHtml(fullOs)}" aria-label="${escapeHtml(fullOs)}">${osIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function displayLocale() {
  return state.language === "fr" ? "fr-FR" : "en-US";
}

function formatCapacityGb(value, suffix = "Go") {
  return inventoryDomain.formatCapacityGb(value, displayLocale(), suffix);
}

function formatStorageUsableGb(value) {
  return inventoryDomain.formatStorageUsableGb(value, displayLocale());
}

function formatStorageMarketingCapacity(value) {
  return inventoryDomain.formatStorageMarketingCapacity(value, displayLocale());
}

function formatStorageTotalGb(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const marketing = formatStorageMarketingCapacity(numeric);
  const usable = formatStorageUsableGb(numeric);
  return marketing && marketing !== usable ? `${marketing} (${usable} ${translate("utilisables")})` : usable;
}

function formatStorageSummary(totalGb, freeGb) {
  const total = formatStorageTotalGb(totalGb) || "-";
  const free = formatStorageUsableGb(freeGb) || "-";
  return `${total} ${translate("total")} / ${free} ${translate("libres")}`;
}

function latestScanPayload(scans = []) {
  return scans.find((scan) => scan.payload)?.payload || {};
}

function memorySummary(payload = {}) {
  const modules = Array.isArray(payload.memoryModules) ? payload.memoryModules : [];
  if (!modules.length) return "";
  const types = [...new Set(modules.map((module) => module.memoryType || module.type).filter(Boolean))];
  const speeds = [
    ...new Set(modules.map((module) => Number(module.speedMhz || module.configuredSpeedMhz || 0)).filter(Boolean)),
  ];
  const slots = modules.length;
  return [
    slots ? `${slots} slot${slots > 1 ? "s" : ""}` : "",
    types.join(" + "),
    speeds.length ? `${speeds.join(" / ")} MHz` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const normalizeManufacturer = inventoryDomain.normalizeManufacturer;
const detectDeviceFamily = inventoryDomain.detectDeviceFamily;

function renderManufacturerLogo(info) {
  const assetName =
    {
      Surface: "microsoft",
      Microsoft: "microsoft",
      "Intel NUC": "intel",
    }[info.manufacturerName] ||
    info.logoType ||
    "unknown";
  return `<img src="./assets/logos/oem/${escapeHtml(assetName)}.svg" alt="" loading="lazy" />`;
}

function renderManufacturerBadge(device) {
  const info = normalizeManufacturer(device.manufacturer, device.model);
  return `<span class="${info.badgeClass}" title="${escapeHtml(info.rawManufacturer || info.manufacturerName)}"><span class="manufacturer-logo ${info.colorClass}">${renderManufacturerLogo(info)}</span><span>${escapeHtml(info.manufacturerName)}</span></span>`;
}

function shortDeviceModel(device = {}) {
  return device.model || device.model_number || "-";
}

function fullDeviceModel(device = {}) {
  return [device.model, device.model_number].filter(Boolean).join(" / ") || "-";
}

function normalizeTeamInfo(teamName, abbreviation = "") {
  const rawTeamName = String(teamName || "").trim();
  const normalized = rawTeamName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const rules = [
    ["sav", /\b(sav|service apres[- ]vente|support)\b/],
    ["purchase", /\b(achat|achats|procurement|mp)\b/],
    ["hr", /\b(rh|ressources humaines|human resources)\b/],
    ["sales", /\b(commercial|commerciale|biz dev|business development)\b/],
    ["tech", /\b(tech|it|informatique|developpement)\b/],
    ["design", /\b(design|graphisme|creative)\b/],
    ["store", /\b(store manager|responsable boutique)\b/],
    ["logistics", /\b(logistique|logistics|warehouse|log)\b/],
    ["marketplace", /\b(marketplace|marketplaces|place de marché|places de marché|market place)\b/],
    ["catalog", /\b(catalogue|catalog|product integration|integration produits|data catalogue|pim|pimup|cata)\b/],
    ["b2c", /\bb2c\b/],
    ["finance", /\b(finance|compta|accounting|comptabilite)\b/],
    ["management", /\b(direction|management|dg|codir)\b/],
    ["ads", /\b(publicite|advertising|ads|acquisition|campaign|campagne|pub)\b/],
    ["marketing", /\b(marketing|communication)\b/],
  ];
  const storedAbbreviation = String(abbreviation || "")
    .trim()
    .toUpperCase();
  const fallback = fallbackAbbreviation(rawTeamName);
  const iconType = rules.find(([, pattern]) => pattern.test(normalized))?.[0] || "team";
  return {
    normalizedTeamName: normalized,
    displayLabel: storedAbbreviation || fallback || rawTeamName || translate("Non renseigné"),
    abbreviation: storedAbbreviation || fallback,
    fullLabel: rawTeamName || translate("Non renseigné"),
    iconType,
    badgeClass: `team-badge team-${iconType}`,
    rawTeamName,
  };
}

function teamIcon(type) {
  const paths = {
    sav: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2v2Zm16 0a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2ZM17 18c-1 2-3 3-5 3"/>',
    purchase:
      '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"/>',
    hr: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    sales:
      '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    tech: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
    design:
      '<path d="m12 19 7-7 3 3-7 7-3-3ZM18 13l-1.5-7.5L2 2l3.5 14.5L13 18M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
    store:
      '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    logistics:
      '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    marketplace:
      '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7"/><path d="M8 16h8M8 20v-7M16 20v-7"/><circle cx="12" cy="6" r="1"/>',
    catalog:
      '<path d="M4 5c0-1 4-2 8-2s8 1 8 2-4 2-8 2-8-1-8-2Z"/><path d="M4 5v6c0 1 4 2 8 2s8-1 8-2V5M4 11v6c0 1 4 2 8 2s8-1 8-2v-6"/><path d="M12 8v8M9 13l3 3 3-3"/>',
    b2c: '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7"/><circle cx="12" cy="14" r="2"/><path d="M8 20v-1a4 4 0 0 1 8 0v1"/>',
    finance: '<path d="M6 7h12M6 12h10M6 17h12"/><path d="M15 4c-5 0-8 3-8 8s3 8 8 8"/>',
    management: '<path d="m12 3 3 6 6 .5-4.5 4 1.5 6.5-6-3.5-6 3.5 1.5-6.5L3 9.5 9 9l3-6Z"/>',
    ads: '<path d="m3 11 14-6v14L3 13v-2Z"/><path d="M7 14v5a2 2 0 0 0 2 2h1M21 9v6"/>',
    marketing: '<path d="m3 11 14-6v14L3 13v-2Z"/><path d="M7 14v5a2 2 0 0 0 2 2h1"/>',
    team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || paths.team}</svg>`;
}

function renderTeamBadge(teamName, teamId = "", teamColor = "") {
  const record = teamRecordById(teamId) || teamRecordByName(teamName);
  const info = normalizeTeamInfo(teamName, record?.abbreviation);
  const color = teamColor || record?.color || "#64748b";
  return `<span class="${info.badgeClass}" ${badgeStyle(color)} title="${escapeHtml(info.fullLabel)}">${teamIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function locationInfo(type, name = "", discipline = "", abbreviation = "") {
  const disciplineType = String(discipline || "").trim();
  const normalizedType = [
    "bike",
    "racket",
    "football",
    "golf",
    "lifestyle",
    "running",
    "general",
    "office",
    "store",
    "warehouse",
    "headquarters",
    "remote",
    "other",
  ].includes(disciplineType)
    ? disciplineType
    : ["office", "store", "warehouse", "headquarters", "remote", "other"].includes(type)
      ? type
      : "other";
  const storedAbbreviation = String(abbreviation || "")
    .trim()
    .toUpperCase();
  const displayLabel = storedAbbreviation || fallbackAbbreviation(name) || name || translate("Non renseigné");
  return {
    iconType: normalizedType,
    badgeClass: `location-badge location-${normalizedType}`,
    displayLabel,
    fullLabel: name || translate("Non renseigné"),
  };
}

function locationIcon(type) {
  const paths = {
    bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h3l3-6h-4l-3 6M10 8h3M14 6h2"/>',
    racket: '<ellipse cx="9" cy="8" rx="4" ry="6" transform="rotate(-35 9 8)"/><path d="m12 13 7 7M17 18l2-2"/>',
    football:
      '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 5h-5L8 10l4-3ZM5 10l3 0M16 10l3 0M9.5 15 8 19M14.5 15 16 19"/>',
    golf: '<path d="M8 21V4l10 3-10 3"/><path d="M4 21h12"/><circle cx="17" cy="18" r="1"/>',
    lifestyle: '<path d="M6 8h12l2 12H4L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M8 15h8M10 12h4"/>',
    running: '<path d="M4 16c5 0 7-4 11-4h2l3 4-2 2H9c-3 0-4-1-5-2Z"/><path d="M12 12 9 8M15 12l-1-4M6 20h12"/>',
    general:
      '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v3a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3"/>',
    office: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M8 7h4M8 11h4M8 15h4M16 9h4v12"/>',
    store: '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    warehouse: '<path d="M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 16h10"/>',
    headquarters: '<path d="M3 21h18M5 21V3h10v18M15 9h4v12M8 7h4M8 11h4M8 15h4"/>',
    remote: '<path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/><path d="M9 10a5 5 0 0 1 6 0M11 12a2 2 0 0 1 2 0"/>',
    other: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || paths.other}</svg>`;
}

function renderLocationBadge(device) {
  const site = establishmentRecordById(device.establishment_id) || establishmentRecordByName(device.establishment_name);
  const info = locationInfo(
    device.establishment_type || site?.establishment_type || "other",
    device.establishment_name,
    device.establishment_discipline || site?.discipline,
    device.establishment_abbreviation || site?.abbreviation,
  );
  const color = device.establishment_color || site?.color || "#64748b";
  return `<span class="${info.badgeClass}" ${badgeStyle(color)} title="${escapeHtml(info.fullLabel)}">${locationIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function confirmAction({ title = "Confirmer la suppression", message, confirmLabel = "Supprimer" }) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = translate(title);
  $("#confirm-message").textContent = translate(message);
  $("#confirm-action").textContent = translate(confirmLabel);
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

function openReassignment(entityType, sourceId, references) {
  const candidates = entityType === "team" ? state.teams : state.establishments;
  const select = $("#reassign-form").elements.targetId;
  select.innerHTML = candidates
    .filter((item) => item.id !== sourceId && item.active)
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join("");
  if (!select.options.length) {
    toast(
      state.language === "en"
        ? "Create another active destination before reassigning."
        : "Créez une autre destination active avant la réaffectation.",
      "error",
    );
    return;
  }
  pendingReassignment = { entityType, sourceId };
  $("#reassign-form").elements.entityType.value = entityType;
  $("#reassign-form").elements.sourceId.value = sourceId;
  $("#reassign-message").textContent =
    state.language === "en"
      ? `${references.devices || 0} device(s) and ${references.users || 0} user(s) are linked. Choose a destination; the original record will then be deleted.`
      : `${references.devices || 0} poste(s) et ${references.users || 0} utilisateur(s) sont liés. Choisissez une destination ; l’ancien élément sera ensuite supprimé.`;
  $("#reassign-dialog").showModal();
}

function formatDate(value) {
  if (!value) return "-";
  const locale = state.language === "en" ? "en-US" : "fr-FR";
  const preference = effectiveTimePreference();
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: preference === "12h",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "-";
  const locale = state.language === "en" ? "en-US" : "fr-FR";
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizeDateInputValue(value) {
  return dateDomain.normalizeDateInputValue(value, translate("Date invalide. Utilisez le format JJ/MM/AAAA."));
}

function dateInputPlaceholder() {
  return state.language === "en" ? "DD/MM/YYYY" : "JJ/MM/AAAA";
}

const addMonthsToDateOnly = dateDomain.addMonthsToDateOnly;
const formatDateForInput = dateDomain.formatDateForInput;

function effectiveTimePreference() {
  return state.timeFormatPreference === "auto" ? (state.language === "en" ? "12h" : "24h") : state.timeFormatPreference;
}

function formatTime(value = new Date()) {
  const locale = state.language === "en" ? "en-US" : "fr-FR";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: effectiveTimePreference() === "12h",
  }).format(value instanceof Date ? value : new Date(value));
}

function formatHeaderDateTime(value = new Date()) {
  const locale = state.language === "en" ? "en-US" : "fr-FR";
  const date = value instanceof Date ? value : new Date(value);
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${datePart} · ${formatTime(date)}`;
}

function updateClock() {
  const clock = $("#current-time");
  if (!clock) return;
  const now = new Date();
  clock.textContent = formatHeaderDateTime(now);
  clock.dateTime = now.toISOString();
  clock.setAttribute("aria-label", `${translate("Heure actuelle")}: ${clock.textContent}`);
}

function updateTimeFormatButton() {
  const button = $("#time-format-toggle");
  const label = $("#time-format-label");
  if (!button || !label) return;
  const display =
    state.timeFormatPreference === "auto" ? "Auto" : state.timeFormatPreference === "24h" ? "24h" : "AM/PM";
  label.textContent = display;
  button.title = `${translate("Format horaire")}: ${display}`;
  button.setAttribute("aria-label", `${translate("Format horaire")}: ${display}`);
  updateClock();
}

function weatherIcon(code, isDay = true) {
  if ([0, 1].includes(Number(code))) {
    return isDay
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path></svg>';
  }
  if ([2, 3].includes(Number(code))) {
    return '<svg viewBox="0 0 24 24"><path d="M17.5 19H8a5 5 0 1 1 1.7-9.7A7 7 0 0 1 22 14a5 5 0 0 1-4.5 5Z"></path></svg>';
  }
  if ([45, 48].includes(Number(code))) {
    return '<svg viewBox="0 0 24 24"><path d="M3 8h18M5 12h14M3 16h18"></path></svg>';
  }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code))) {
    return '<svg viewBox="0 0 24 24"><path d="M17.5 18H8a5 5 0 1 1 1.7-9.7A7 7 0 0 1 22 13.5"></path><path d="M9 19v2M13 18v2M17 19v2"></path></svg>';
  }
  if ([71, 73, 75, 77, 85, 86].includes(Number(code))) {
    return '<svg viewBox="0 0 24 24"><path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"></path></svg>';
  }
  if ([95, 96, 99].includes(Number(code))) {
    return '<svg viewBox="0 0 24 24"><path d="m13 2-8 13h7l-1 7 8-13h-7l1-7Z"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4M12 16h.01"></path></svg>';
}

function weatherLabel(code) {
  const labels = {
    fr: {
      0: "Ciel clair",
      1: "Plutot clair",
      2: "Partiellement nuageux",
      3: "Couvert",
      45: "Brouillard",
      48: "Brouillard givrant",
      51: "Bruine legere",
      53: "Bruine",
      55: "Bruine forte",
      61: "Pluie legere",
      63: "Pluie",
      65: "Pluie forte",
      71: "Neige legere",
      73: "Neige",
      75: "Neige forte",
      80: "Averses",
      81: "Averses",
      82: "Averses fortes",
      95: "Orage",
      96: "Orage avec grêle",
      99: "Orage avec grêle",
    },
    en: {
      0: "Clear sky",
      1: "Mostly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      48: "Rime fog",
      51: "Light drizzle",
      53: "Drizzle",
      55: "Dense drizzle",
      61: "Light rain",
      63: "Rain",
      65: "Heavy rain",
      71: "Light snow",
      73: "Snow",
      75: "Heavy snow",
      80: "Showers",
      81: "Showers",
      82: "Heavy showers",
      95: "Thunderstorm",
      96: "Thunderstorm with hail",
      99: "Thunderstorm with hail",
    },
  };
  return labels[state.language]?.[Number(code)] || (state.language === "en" ? "Weather" : "Météo");
}

function updateWeatherDisplay() {
  const button = $("#weather-toggle");
  const icon = $("#weather-icon");
  const value = $("#weather-value");
  if (!button || !icon || !value) return;
  if (!state.weather) {
    icon.innerHTML = weatherIcon(null);
    value.textContent = "--";
    button.title = translate("Meteo indisponible");
    button.setAttribute("aria-label", button.title);
    return;
  }
  const unit = state.temperatureUnit === "fahrenheit" ? "°F" : "°C";
  const temperature = Math.round(Number(state.weather.temperature));
  if (!Number.isFinite(temperature)) {
    icon.innerHTML = weatherIcon(null);
    value.textContent = "--";
    button.title = translate("Meteo indisponible");
    button.setAttribute("aria-label", button.title);
    return;
  }
  const label = weatherLabel(state.weather.weatherCode);
  icon.innerHTML = weatherIcon(state.weather.weatherCode, state.weather.isDay);
  value.textContent = `${temperature}${unit}`;
  button.title = `${CONFIG.weatherLocationLabel} · ${label} · ${temperature}${unit} · ${translate("Basculer Celsius Fahrenheit")}`;
  button.setAttribute("aria-label", button.title);
}

async function loadWeather() {
  const unit = state.temperatureUnit === "fahrenheit" ? "fahrenheit" : "celsius";
  try {
    state.weather = await publicResources.getWeather({
      latitude: CONFIG.weatherLatitude,
      longitude: CONFIG.weatherLongitude,
      temperatureUnit: unit,
    });
  } catch {
    state.weather = null;
  }
  updateWeatherDisplay();
}

function formatRelativeDate(value) {
  if (!value) return "-";
  const deltaDays = Math.round((new Date(value).getTime() - Date.now()) / 86400000);
  const locale = state.language === "en" ? "en-US" : "fr-FR";
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(deltaDays) < 1) return formatter.format(0, "day");
  if (Math.abs(deltaDays) < 31) return formatter.format(deltaDays, "day");
  const deltaMonths = Math.round(deltaDays / 30);
  if (Math.abs(deltaMonths) < 18) return formatter.format(deltaMonths, "month");
  return formatter.format(Math.round(deltaMonths / 12), "year");
}

function formatDuration(startValue, endValue = null) {
  if (!startValue) return "-";
  const start = new Date(startValue).getTime();
  const end = endValue ? new Date(endValue).getTime() : Date.now();
  const days = Math.max(0, Math.floor((end - start) / 86400000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const restDays = days - years * 365 - months * 30;
  const parts = [];
  if (years)
    parts.push(state.language === "en" ? `${years} year${years > 1 ? "s" : ""}` : `${years} an${years > 1 ? "s" : ""}`);
  if (months) parts.push(state.language === "en" ? `${months} month${months > 1 ? "s" : ""}` : `${months} mois`);
  if (restDays || parts.length === 0)
    parts.push(
      state.language === "en"
        ? `${restDays} day${restDays > 1 ? "s" : ""}`
        : `${restDays} jour${restDays > 1 ? "s" : ""}`,
    );
  return parts.join(", ");
}

function fleetEvaluationContext() {
  return { staleDays: CONFIG.staleDays };
}

const daysSince = fleetDomain.daysSince;
function money(value) {
  const number = Number(value || 0);
  if (!number) return "-";
  const hasCents = Math.round(number * 100) % 100 !== 0;
  return new Intl.NumberFormat(state.language === "en" ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(number);
}

function moneyWithCurrency(value, currency = "EUR") {
  const number = Number(value || 0);
  if (!number) return "-";
  const safeCurrency = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase()) ? String(currency).toUpperCase() : "EUR";
  const hasCents = Math.round(number * 100) % 100 !== 0;
  return new Intl.NumberFormat(state.language === "en" ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(number);
}

const estimatedValue = inventoryDomain.estimatedValue;

function setOptions(select, values, label, preserveOrder = false) {
  const previousValue = select.value;
  select.innerHTML = `<option value="">${label}</option>`;
  const options = values.filter(Boolean);
  if (!preserveOrder) options.sort((a, b) => String(a).localeCompare(String(b), "fr"));
  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if (!previousValue) return;
  const hasPreviousValue = [...select.options].some((option) => option.value === previousValue);
  if (!hasPreviousValue) {
    const option = document.createElement("option");
    option.value = previousValue;
    option.textContent = previousValue;
    select.appendChild(option);
  }
  select.value = previousValue;
}

function statusClass(status) {
  return `status ${status || "active"}`;
}

const deviceRowStatusClass = inventoryDomain.deviceRowStatusClass;
const isMissingInventoryValue = inventoryDomain.isMissingInventoryValue;
const compareVersions = inventoryDomain.compareVersions;

function deviceDataQuality(device) {
  const reasons = [];
  let level = "ok";
  const seenDays = daysSince(device.last_seen_at);
  const latestCollectorVersion =
    state.collectorReleases?.latestVersion || state.collectorReleases?.assets?.windows?.version || "";
  const criticalHardwareFields = [
    device.os_name,
    device.manufacturer,
    device.model,
    device.cpu,
    device.ram_total_gb,
    device.storage_total_gb,
  ];
  const missingCriticalFields = criticalHardwareFields.filter(isMissingInventoryValue).length;
  const unassignedStatus = isDetachedInventoryStatus(device.status);

  if (!device.last_seen_at) {
    level = "critical";
    reasons.push(translate("Aucune collecte"));
  } else if (seenDays > Math.max(CONFIG.staleDays * 3, 90)) {
    level = "critical";
    reasons.push(`${translate("Dernière collecte ancienne")} (${seenDays}j)`);
  } else if (seenDays > CONFIG.staleDays) {
    level = "warning";
    reasons.push(`${translate("Dernière collecte ancienne")} (${seenDays}j)`);
  }

  if (missingCriticalFields >= 3) {
    level = "critical";
    reasons.push(translate("Champs critiques manquants"));
  } else if (missingCriticalFields > 0) {
    if (level === "ok") level = "review";
    reasons.push(translate("Données matérielles incomplètes"));
  }

  if (
    !unassignedStatus &&
    (isMissingInventoryValue(device.first_name) ||
      isMissingInventoryValue(device.last_name) ||
      isMissingInventoryValue(device.email) ||
      isMissingInventoryValue(device.team_name) ||
      isMissingInventoryValue(device.establishment_name))
  ) {
    if (level === "ok") level = "review";
    reasons.push(translate("Profil utilisateur incomplet"));
  }

  if (
    !unassignedStatus &&
    String(device.email || "")
      .toLowerCase()
      .endsWith(".local")
  ) {
    if (level === "ok") level = "review";
    reasons.push(translate("E-mail utilisateur à vérifier"));
  }

  if (
    latestCollectorVersion &&
    device.script_version &&
    compareVersions(device.script_version, latestCollectorVersion) < 0
  ) {
    if (level === "ok") level = "review";
    reasons.push(translate("Collector ancien"));
  }

  const labels = {
    ok: translate("Données à jour"),
    review: translate("Données à vérifier"),
    warning: translate("Données obsolètes"),
    critical: translate("Données critiques"),
  };
  return {
    level,
    label: labels[level],
    reasons: reasons.length ? Array.from(new Set(reasons)) : [labels.ok],
  };
}

function dataQualityIcon(level) {
  if (level === "critical") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 2 20h20L12 2Z"></path><path d="M12 8v5"></path><path d="M12 17h.01"></path></svg>';
  }
  if (level === "warning") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
  }
  if (level === "review") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8h.01"></path><path d="M11 12h1v5h1"></path></svg>';
}

function renderDataQualitySignal(device) {
  const quality = deviceDataQuality(device);
  const title = `${translate("Qualité des données")}: ${quality.label} - ${quality.reasons.join(" / ")}`;
  return `
    <span class="data-quality-signal data-quality-${quality.level}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
      ${dataQualityIcon(quality.level)}
    </span>
  `;
}

function tokenState(token) {
  if (token.revoked_at) return { key: "revoked", label: translate("Révoqué") };
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

function generateStrongPassword(length = 18) {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*_-+=?"];
  const all = groups.join("");
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const chars = groups.map((group, index) => group[bytes[index] % group.length]);
  for (let index = groups.length; index < length; index += 1) {
    chars.push(all[bytes[index] % all.length]);
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[index] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

async function copyText(value, successMessage, emptyMessage) {
  const text = String(value || "");
  if (!text) {
    toast(emptyMessage, "warning");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, "success");
    return true;
  } catch {
    toast("Copie impossible.", "error");
    return false;
  }
}

function syncAdminUserActiveLabel() {
  const form = $("#admin-user-form");
  const active = form?.elements.isActive.checked;
  const label = $("#admin-user-active-label");
  if (label) label.textContent = active ? translate("Actif") : translate("Desactive");
}

function renderAccessTokens() {
  $("#tokens-table").innerHTML = state.accessTokens
    .map((token) => {
      const status = tokenState(token);
      const usage =
        token.max_uses === null
          ? `${token.use_count} / ${state.language === "en" ? "unlimited" : "illimité"}`
          : `${token.use_count} / ${token.max_uses}`;
      const canCopy = Boolean(state.rawAccessTokens[token.id]);
      const copyTitle = canCopy ? "Copier le token" : "Token complet indisponible apres rechargement";
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
            <div class="token-actions">
              ${status.key === "valid" ? `<button class="secondary revoke-token" type="button" data-id="${token.id}">${translate("Revoquer")}</button>` : ""}
              <button class="danger-button delete-token" type="button" data-id="${token.id}" data-label="${escapeHtml(token.label)}">${translate("Supprimer")}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  if (state.accessTokens.length === 0) {
    $("#tokens-table").innerHTML = `<tr><td colspan="7" class="helper">Aucun token généré.</td></tr>`;
  }

  $$(".copy-access-token").forEach((button) => {
    button.addEventListener("click", async () => {
      const token = state.rawAccessTokens[button.dataset.id];
      await copyText(token, "Token copie.", "Token complet indisponible apres rechargement");
    });
  });

  $$(".revoke-token").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await inventoryApi.revokeAccessToken(button.dataset.id);
        await loadAccessTokens();
        toast("Token révoqué.");
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    });
  });

  $$(".delete-token").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmAction({
        message:
          state.language === "en"
            ? `Permanently delete the token "${button.dataset.label}"? This action cannot be undone.`
            : `Supprimer définitivement le token "${button.dataset.label}" ? Cette action est irréversible.`,
      });
      if (!confirmed) return;
      button.disabled = true;
      try {
        await inventoryApi.deleteAccessToken(button.dataset.id);
        delete state.rawAccessTokens[button.dataset.id];
        await loadAccessTokens();
        toast("Token supprimé.");
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    });
  });
}

function inviteState(invite) {
  if (invite.revoked_at) return { key: "revoked", label: translate("Révoqué") };
  if (new Date(invite.expires_at).getTime() <= Date.now()) return { key: "expired", label: translate("Expire") };
  if (invite.max_uses !== null && Number(invite.use_count) >= Number(invite.max_uses)) {
    return { key: "exhausted", label: translate("Epuise") };
  }
  return { key: "valid", label: translate("Valide") };
}

function displayInviteUrl(inviteUrl) {
  if (!inviteUrl || !window.IT_INVENTORY_LOCAL_LIVE) return inviteUrl || "";
  try {
    const url = new URL(inviteUrl, window.location.href);
    const inviteCode = url.searchParams.get("invite") || "";
    const localUrl = new URL(window.location.href);
    localUrl.pathname = "/";
    localUrl.search = "";
    localUrl.hash = "";
    localUrl.searchParams.set("invite", inviteCode);
    return localUrl.toString();
  } catch {
    return inviteUrl || "";
  }
}

function renderCollectionInvites() {
  const table = $("#invites-table");
  if (!table) return;
  table.innerHTML = state.collectionInvites
    .map((invite) => {
      const status = inviteState(invite);
      const usage =
        invite.max_uses === null
          ? `${invite.use_count} / ${state.language === "en" ? "unlimited" : "illimité"}`
          : `${invite.use_count} / ${invite.max_uses}`;
      return `
        <tr>
          <td>${escapeHtml(invite.label)}</td>
          <td>
            <div class="token-prefix">
              <code>${escapeHtml(invite.invite_code)}</code>
              <button class="secondary icon-button copy-invite-row" type="button" data-id="${invite.id}" aria-label="Copier le lien" title="Copier le lien">${copyIcon()}</button>
            </div>
            <span class="cell-secondary">${escapeHtml((invite.payload?.email || invite.payload?.team || invite.payload?.establishment || "").toString())}</span>
          </td>
          <td>${formatDate(invite.expires_at)}</td>
          <td>${usage}</td>
          <td>${formatDate(invite.last_used_at)}</td>
          <td><span class="token-state ${status.key}">${status.label}</span></td>
          <td>
            <div class="token-actions">
              ${status.key === "valid" ? `<button class="secondary revoke-invite" type="button" data-id="${invite.id}">${translate("Revoquer")}</button>` : ""}
              <button class="secondary delete-invite" type="button" data-id="${invite.id}">${translate("Supprimer")}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  if (state.collectionInvites.length === 0) {
    table.innerHTML = `<tr><td colspan="7" class="helper">Aucune invitation générée.</td></tr>`;
  }
  $$(".copy-invite-row").forEach((button) => {
    button.addEventListener("click", async () => {
      const invite = state.collectionInvites.find((item) => item.id === button.dataset.id);
      await copyText(
        displayInviteUrl(invite?.invite_url || state.rawInviteUrls[button.dataset.id]),
        "Lien copie.",
        "Aucun lien à copier",
      );
    });
  });
  $$(".revoke-invite").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await inventoryApi.revokeCollectionInvite(button.dataset.id);
        await loadCollectionInvites();
        toast("Invitation révoquée.");
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    });
  });
  $$(".delete-invite").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(translate("Supprimer cette invitation ?"))) return;
      button.disabled = true;
      try {
        await inventoryApi.deleteCollectionInvite(button.dataset.id);
        delete state.rawInviteUrls[button.dataset.id];
        await loadCollectionInvites();
        toast("Invitation supprimée.");
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    });
  });
}

async function loadCollectionInvites() {
  if (!canPerformAction("TOKEN_MANAGE")) return;
  const data = await inventoryApi.listCollectionInvites();
  state.collectionInvites = data.invites || [];
  renderCollectionInvites();
}

async function loadAccessTokens() {
  if (!canPerformAction("TOKEN_MANAGE")) return;
  const data = await inventoryApi.listAccessTokens();
  state.accessTokens = data.tokens || [];
  renderAccessTokens();
}

function renderAdminUsers() {
  $("#admin-users-table").innerHTML =
    state.adminUsers
      .map(
        (user) => `
    <tr data-id="${user.id}">
      <td><span class="cell-primary">${escapeHtml(user.username)}</span><span class="cell-secondary">${escapeHtml(user.displayName || user.email || "-")}</span></td>
      <td><span class="role-badge role-${escapeHtml(String(user.role || "").toLowerCase())}">${escapeHtml(user.role)}</span></td>
      <td>${user.isActive ? translate("Actif") : translate("Desactive")}</td>
      <td>${formatDate(user.createdAt)}</td>
      <td>${formatDate(user.lastLoginAt)}</td>
    </tr>
  `,
      )
      .join("") || `<tr><td colspan="5">${translate("Aucune donnée.")}</td></tr>`;
  $$("#admin-users-table tr[data-id]").forEach((row) =>
    row.addEventListener("click", () => editAdminUser(row.dataset.id)),
  );
}

async function loadAdminUsers() {
  if (!canPerformAction("USER_MANAGE")) return;
  const data = await inventoryApi.listAdminUsers();
  state.adminUsers = data.users || [];
  renderAdminUsers();
}

function resetAdminUserForm() {
  const form = $("#admin-user-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.role.value = "VIEWER";
  form.elements.isActive.checked = true;
  form.elements.password.type = "password";
  $("#admin-user-created-at").textContent = `${translate("Création")} : -`;
  syncAdminUserActiveLabel();
  $("#delete-admin-user").classList.add("is-hidden");
}

function editAdminUser(id) {
  const user = state.adminUsers.find((item) => item.id === id);
  if (!user) return;
  const form = $("#admin-user-form");
  form.elements.id.value = user.id;
  form.elements.username.value = user.username || "";
  form.elements.displayName.value = user.displayName || "";
  form.elements.email.value = user.email || "";
  form.elements.role.value = user.role || "VIEWER";
  form.elements.password.value = "";
  form.elements.password.type = "password";
  form.elements.isActive.checked = user.isActive !== false;
  $("#admin-user-created-at").textContent = `${translate("Création")} : ${formatDate(user.createdAt)}`;
  syncAdminUserActiveLabel();
  $("#delete-admin-user").classList.toggle("is-hidden", user.id === state.currentAdmin?.id);
}

function notificationMarkup(item, { compact = false } = {}) {
  return `
    <article class="notification-item ${compact ? "is-compact" : ""} ${item.is_read ? "is-read" : ""} severity-${String(item.severity || "INFO").toLowerCase()}" role="button" tabindex="0" data-id="${escapeHtml(item.id)}">
      ${notificationIcon(item)}
      <div class="notification-content">
        <div class="notification-heading">
          <span class="notification-severity">${compact ? translate("Non lue") : escapeHtml(item.severity || "INFO")}</span>
          <strong>${escapeHtml(notificationTitle(item))}</strong>
        </div>
        <p>${escapeHtml(notificationMessage(item))}</p>
        ${compact ? "" : notificationFacts(item)}
        <small>${formatDate(item.created_at)}${compact ? "" : ` (${formatRelativeDate(item.created_at)}) - ${escapeHtml(notificationTypeLabel(item.type))}`}</small>
      </div>
      ${item.is_read ? "" : `<button class="secondary mark-notification-read" type="button" data-id="${item.id}">${translate("Marquer comme lue")}</button>`}
    </article>
  `;
}

function bindNotificationList(root, { closePanel = false } = {}) {
  root.querySelectorAll(".notification-item[data-id]").forEach((item) => {
    const activate = () => {
      if (closePanel) closeNotificationPanel();
      openNotificationTarget(item.dataset.id).catch((error) => toast(error.message, "error"));
    };
    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      activate();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
  });
  root.querySelectorAll(".mark-notification-read").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await inventoryApi.markNotificationRead(button.dataset.id);
        await loadNotifications();
      } catch (error) {
        button.disabled = false;
        toast(error.message, "error");
      }
    });
  });
}

function renderNotificationPanel() {
  const list = $("#notification-panel-list");
  if (!list) return;
  const snapshot = notificationDomain.notificationSnapshot(state.notifications, 5);
  state.unreadNotifications = snapshot.unreadCount;
  list.innerHTML = snapshot.latestUnread.map((item) => notificationMarkup(item, { compact: true })).join("");
  list.classList.toggle("is-hidden", snapshot.latestUnread.length === 0);
  $("#notification-panel-empty").classList.toggle("is-hidden", snapshot.latestUnread.length > 0);
  bindNotificationList(list, { closePanel: true });

  const count = $("#notification-count");
  count.textContent = String(snapshot.unreadCount);
  count.classList.toggle("is-hidden", snapshot.unreadCount === 0);
}

function closeNotificationPanel() {
  $("#notification-panel")?.classList.add("is-hidden");
  $("#notifications-bell")?.setAttribute("aria-expanded", "false");
}

function renderNotifications() {
  const severity = $("#notification-severity-filter")?.value || "";
  const readFilter = $("#notification-read-filter")?.value || "";
  const notifications = state.notifications.filter((item) => {
    if (severity && item.severity !== severity) return false;
    if (readFilter === "read" && !item.is_read) return false;
    if (readFilter === "unread" && item.is_read) return false;
    return true;
  });
  const list = $("#notifications-list");
  list.innerHTML =
    notifications.map((item) => notificationMarkup(item)).join("") ||
    `<p class="helper">${translate("Aucune notification")}</p>`;
  bindNotificationList(list);
  renderNotificationPanel();
}

function notificationTypeKey(type) {
  const keys = {
    PENDING_TEAM_PROPOSAL: "notification.pendingTeam",
    PENDING_LOCATION_PROPOSAL: "notification.pendingLocation",
    COLLECTOR_SUBMISSION_RECEIVED: "notification.collectorReceived",
    COLLECTOR_SUBMISSION_FAILED: "notification.collectorFailed",
    DEVICE_REASSIGNED: "notification.deviceReassigned",
    DEVICE_OWNER_CHANGED: "notification.ownerChanged",
    TEAM_CHANGED: "notification.teamChanged",
    LOCATION_CHANGED: "notification.locationChanged",
    OS_CHANGED: "notification.osChanged",
    HARDWARE_CHANGED: "notification.hardwareChanged",
    USER_REMOVED: "notification.userRemoved",
    DEVICE_RETIRED: "notification.deviceRetired",
    DEVICE_REACTIVATED: "notification.deviceReactivated",
    DEVICE_OLDER_THAN_THRESHOLD: "notification.deviceOld",
    LOW_CPU_SCORE: "notification.lowCpu",
    LOW_RAM_DEVICE: "notification.lowRam",
    TOKEN_EXPIRED: "notification.tokenExpired",
    TOKEN_REVOKED: "notification.tokenRevoked",
    TOKEN_DELETED: "notification.tokenDeleted",
    PENDING_CHANGE_APPROVED: "notification.pendingApproved",
    PENDING_CHANGE_REJECTED: "notification.pendingRejected",
    LOCATION_TEAM_DELETE_BLOCKED: "notification.deleteBlocked",
    ADMIN_ACTION_COMPLETED: "notification.adminAction",
  };
  return keys[type] || "";
}

function notificationTitle(item) {
  const device = notificationDevice(item);
  if (device) {
    const manufacturer = normalizeManufacturer(device.manufacturer, device.model);
    const brand = manufacturer.manufacturerName === "Unknown" ? translate("Poste") : manufacturer.manufacturerName;
    const deviceLabel = notificationDeviceLabel(device);
    const user = notificationUserLabel(device);
    const type = String(item.type || "");
    const isEnglish = state.language === "en";
    if (type === "COLLECTOR_SUBMISSION_RECEIVED") {
      return isEnglish ? `${brand} collection received` : `Collecte ${brand} reçue`;
    }
    if (type === "DEVICE_REASSIGNED" || type === "DEVICE_OWNER_CHANGED") {
      return isEnglish ? `${deviceLabel} assigned to ${user}` : `${deviceLabel} affecté à ${user}`;
    }
    if (type === "DEVICE_RETIRED") {
      return isEnglish ? `${deviceLabel} retired` : `${deviceLabel} sorti du parc`;
    }
    if (type === "DEVICE_REACTIVATED") {
      return isEnglish ? `${deviceLabel} reactivated` : `${deviceLabel} réactivé`;
    }
  }
  if (String(item.title || "").startsWith("notification.")) return translate(item.title);
  const key = notificationTypeKey(item.type);
  return key ? translate(`${key}.title`) : translate(item.title || item.type || "Notification");
}

function notificationMessage(item) {
  const device = notificationDevice(item);
  if (device) {
    const manufacturer = normalizeManufacturer(device.manufacturer, device.model);
    const model =
      [manufacturer.manufacturerName === "Unknown" ? "" : manufacturer.manufacturerName, fullDeviceModel(device)]
        .filter((value) => value && value !== "-")
        .join(" ") || translate("Non renseigné");
    const user = notificationUserLabel(device);
    const team =
      displayWithAbbreviation(device.team_name || "", device.team_abbreviation) || translate("Non renseigné");
    const site =
      displayWithAbbreviation(device.establishment_name || "", device.establishment_abbreviation) ||
      translate("Non renseigné");
    if (state.language === "en") {
      return `${notificationDeviceLabel(device)} (${model}) is linked to ${user}. Team: ${team}. Location: ${site}.`;
    }
    return `${notificationDeviceLabel(device)} (${model}) est lié à ${user}. Équipe : ${team}. Établissement : ${site}.`;
  }
  if (String(item.message || "").startsWith("notification.")) return translate(item.message);
  const key = notificationTypeKey(item.type);
  return key ? translate(`${key}.message`) : translate(item.message || "");
}

function notificationTypeLabel(type) {
  const key = notificationTypeKey(type);
  return key ? translate(`${key}.title`) : translate(type || "");
}

function notificationDevice(item) {
  return item?.device && typeof item.device === "object" ? item.device : null;
}

function notificationDeviceLabel(device = {}) {
  return device.hostname || device.serial_number || translate("Poste");
}

function notificationUserLabel(device = {}) {
  return [device.first_name, device.last_name].filter(Boolean).join(" ") || device.email || translate("Non renseigné");
}

function notificationIcon(item) {
  const device = notificationDevice(item);
  if (device) {
    const manufacturer = normalizeManufacturer(device.manufacturer, device.model);
    return `<span class="notification-icon notification-oem ${manufacturer.colorClass}" title="${escapeHtml(manufacturer.manufacturerName)}">${renderManufacturerLogo(manufacturer)}</span>`;
  }
  const label = String(item.severity || "INFO")
    .slice(0, 1)
    .toUpperCase();
  return `<span class="notification-icon notification-initial">${escapeHtml(label)}</span>`;
}

function notificationFacts(item) {
  const device = notificationDevice(item);
  if (!device) return "";
  const manufacturer = normalizeManufacturer(device.manufacturer, device.model);
  const model = [
    manufacturer.manufacturerName === "Unknown" ? "" : manufacturer.manufacturerName,
    fullDeviceModel(device),
  ]
    .filter((value) => value && value !== "-")
    .join(" ");
  const facts = [
    ["Poste", notificationDeviceLabel(device)],
    ["Utilisateur", notificationUserLabel(device)],
    ["Équipe", displayWithAbbreviation(device.team_name || "", device.team_abbreviation) || translate("Non renseigné")],
    [
      "Établissement",
      displayWithAbbreviation(device.establishment_name || "", device.establishment_abbreviation) ||
        translate("Non renseigné"),
    ],
    ["Modèle", model || translate("Non renseigné")],
  ];
  return `<div class="notification-facts">${facts
    .map(
      ([label, value]) => `
    <span><strong>${escapeHtml(translate(label))}</strong>${escapeHtml(value)}</span>
  `,
    )
    .join("")}</div>`;
}

async function openNotificationTarget(id) {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) return;
  if (!notification.is_read) {
    await inventoryApi.markNotificationRead(id);
  }
  const entityType = String(notification.related_entity_type || notification.relatedEntityType || "").toLowerCase();
  const entityId = notification.related_entity_id || notification.relatedEntityId || "";
  setMainView("admin", { updateUrl: false });
  if (entityType === "device" && entityId) {
    setAdminView("fleet");
    if (!state.devices.some((device) => device.id === entityId)) await loadAdminData();
    if (!state.devices.some((device) => device.id === entityId)) {
      toast("Element lié introuvable.", "error");
      await loadNotifications();
      return;
    }
    await selectDevice(entityId);
    if (
      ["DEVICE_RETIRED", "DEVICE_REACTIVATED", "DEVICE_REASSIGNED", "DEVICE_OWNER_CHANGED"].includes(
        String(notification.type || ""),
      )
    ) {
      activateDetailTab("history");
    }
  } else if (entityType === "pending_change") {
    setAdminView("pending");
    await Promise.all([loadOrganization(), loadPendingChanges()]);
  } else if (entityType === "team") {
    setAdminView("organization");
    await loadOrganization();
    if (entityId) editTeam(entityId);
  } else if (entityType === "establishment" || entityType === "location") {
    setAdminView("organization");
    await loadOrganization();
    if (entityId) editEstablishment(entityId);
  } else if (entityType === "collection_access_token" || entityType === "token") {
    setAdminView("access");
    await loadAccessTokens();
  } else {
    toast("Notification marquee comme lue.", "success");
  }
  await loadNotifications();
}

function activateDetailTab(tabName) {
  const availableTabs = $$(".detail-tab").map((tab) => tab.dataset.detailTab);
  const activeTab = availableTabs.includes(tabName) ? tabName : "overview";
  state.activeDetailTab = activeTab;
  $$(".detail-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.detailTab === activeTab));
  $$(".detail-tab-panel").forEach((panel) =>
    panel.classList.toggle("is-active", panel.dataset.detailPanel === activeTab),
  );
}

async function loadNotifications() {
  if (!canPerformAction("NOTIFICATION_VIEW")) return;
  const data = await inventoryApi.listNotifications();
  state.notifications = data.notifications || [];
  state.unreadNotifications = notificationDomain.notificationSnapshot(state.notifications).unreadCount;
  renderNotifications();
}

function renderPendingChanges() {
  const existingTeamOptions = state.teams
    .map(
      (team) =>
        `<option value="${escapeHtml(team.id)}">${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`,
    )
    .join("");
  const existingSiteOptions = state.establishments
    .map(
      (site) =>
        `<option value="${escapeHtml(site.id)}">${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`,
    )
    .join("");
  $("#pending-changes-list").innerHTML =
    state.pendingChanges
      .map((item) => {
        const isTeam = item.type === "TEAM";
        const options = isTeam ? existingTeamOptions : existingSiteOptions;
        const disabled = item.status !== "PENDING";
        return `
      <article class="pending-change-item status-${escapeHtml(String(item.status || "").toLowerCase())}">
        <div>
          <span class="notification-severity">${escapeHtml(item.type)}</span>
          <strong>${escapeHtml(item.proposed_value)}</strong>
          <p>${escapeHtml(item.proposed_by_user || item.proposed_by_email || "Utilisateur collecte")} - ${formatDate(item.created_at)}</p>
          <small>${escapeHtml(item.status)}${item.admin_notes ? ` - ${escapeHtml(item.admin_notes)}` : ""}</small>
        </div>
        <form class="pending-change-form" data-id="${escapeHtml(item.id)}">
          <label>
            Valeur finale
            <input name="proposedValue" value="${escapeHtml(item.proposed_value)}" ${disabled ? "disabled" : ""} />
          </label>
          <label>
            Lier à l'existant
            <select name="linkedEntityId" ${disabled ? "disabled" : ""}>
              <option value="">Créer une nouvelle valeur</option>
              ${options}
            </select>
          </label>
          <label>
            Notes admin
            <input name="adminNotes" ${disabled ? "disabled" : ""} />
          </label>
          <div class="actions">
            <button class="primary pending-approve" type="button" ${disabled ? "disabled" : ""}>${translate("Approuver")}</button>
            <button class="secondary pending-modify" type="button" ${disabled ? "disabled" : ""}>${translate("Modifier et approuver")}</button>
            <button class="danger-button pending-reject" type="button" ${disabled ? "disabled" : ""}>${translate("Rejeter")}</button>
          </div>
        </form>
      </article>
    `;
      })
      .join("") || `<p class="helper">${translate("Aucune donnée.")}</p>`;

  $$(".pending-change-form").forEach((form) => {
    const submitDecision = async (decision) => {
      const values = Object.fromEntries(new FormData(form));
      await inventoryApi.decidePendingChange(form.dataset.id, { ...values, decision });
      toast("Proposition traitee.", "success");
      await Promise.all([loadPendingChanges(), loadOrganization(), loadNotifications()]);
    };
    form
      .querySelector(".pending-approve")
      ?.addEventListener("click", () => submitDecision("APPROVE").catch((error) => toast(error.message, "error")));
    form
      .querySelector(".pending-modify")
      ?.addEventListener("click", () => submitDecision("MODIFY").catch((error) => toast(error.message, "error")));
    form
      .querySelector(".pending-reject")
      ?.addEventListener("click", () => submitDecision("REJECT").catch((error) => toast(error.message, "error")));
  });
}

async function loadPendingChanges() {
  if (!canPerformAction("PENDING_CHANGE_APPROVE")) return;
  const data = await inventoryApi.listPendingChanges();
  state.pendingChanges = (data.pendingChanges || []).filter((item) => item.status === "PENDING");
  renderPendingChanges();
}

const isDetachedInventoryStatus = fleetDomain.isDetachedInventoryStatus;
const activeTeamName = fleetDomain.activeTeamName;
const normalizedDeviceOsFamily = fleetDomain.normalizedDeviceOsFamily;

function applyFilters() {
  const search = normalize($("#global-search").value);
  const team = $("#filter-team").value;
  const establishment = $("#filter-establishment").value;
  const os = $("#filter-os").value;
  const model = $("#filter-model").value;
  const manufacturer = $("#filter-manufacturer").value;
  const status = $("#filter-status").value;
  const age = $("#filter-age").value;
  const cpuScore = $("#filter-cpu-score").value;
  const value = $("#filter-value").value;

  const sortBy = $("#sort-devices").value;
  state.filtered = fleetDomain.filterFleetDevices(
    state.devices,
    { search, team, establishment, os, model, manufacturer, status, age, cpuScore, value },
    sortBy,
    fleetEvaluationContext(),
    state.language,
  );

  renderDevices();
  renderMetrics();
  renderOemMetrics();
  renderValuation();
}

function scheduleApplyFilters() {
  if (pendingFilterFrame !== null) return;
  pendingFilterFrame = window.requestAnimationFrame(() => {
    pendingFilterFrame = null;
    applyFilters();
  });
}

function clearFleetFilters() {
  [
    "global-search",
    "filter-team",
    "filter-establishment",
    "filter-os",
    "filter-age",
    "filter-model",
    "filter-manufacturer",
    "filter-status",
    "filter-cpu-score",
    "filter-value",
  ].forEach((id) => {
    $(`#${id}`).value = "";
  });
  $("#sort-devices").value = "last_seen";
  applyFilters();
}

function renderMetrics() {
  renderFleetDashboard();
}

function renderOemMetrics() {
  const target = $("#oem-metrics");
  if (!target) return;

  const counts = countBy(
    state.filtered,
    (device) => normalizeManufacturer(device.manufacturer, device.model).manufacturerName,
  );
  const primary = ["Dell", "HP", "Lenovo", "Apple"];
  const other = Object.entries(counts)
    .filter(([name]) => !primary.includes(name))
    .reduce((sum, [, count]) => sum + count, 0);
  $("#oem-metrics").innerHTML = [...primary.map((name) => [name, counts[name] || 0]), ["Autres", other]]
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

const deviceAge = inventoryDomain.deviceAge;

function fleetLocale() {
  return state.language === "en" ? "en-US" : "fr-FR";
}

function formatFleetNumber(value, maximumFractionDigits = 0) {
  const number = Number(value || 0);
  return new Intl.NumberFormat(fleetLocale(), { maximumFractionDigits }).format(number);
}

function formatFleetPercent(value) {
  return `${formatFleetNumber(value, 0)}%`;
}

function fallbackText(value, fallback = "Non renseigné") {
  const text = String(value ?? "").trim();
  return text || translate(fallback);
}

const deviceCpuScore = fleetDomain.deviceCpuScore;
const activeFleetDevices = fleetDomain.activeFleetDevices;

function computeFleetKpis(items = state.filtered) {
  const snapshot = fleetDomain.fleetKpiSnapshot(items, fleetEvaluationContext());
  return [
    {
      id: "total",
      label: "Total des postes",
      value: formatFleetNumber(snapshot.total),
      helper: `${formatFleetNumber(snapshot.actionable)} ${translate("postes actuels, hors stock, perdus et sortis du parc")}`,
      level: "info",
    },
    {
      id: "active",
      label: "Postes actifs",
      value: formatFleetNumber(snapshot.active),
      helper: translate("Statut actif dans le parc"),
      level: "ok",
    },
    {
      id: "replace",
      label: "Postes à remplacer en priorité",
      value: formatFleetNumber(snapshot.replace),
      helper: translate("Statut, âge, CPU ou priorité élevée"),
      level: snapshot.replace ? "critical" : "ok",
    },
    {
      id: "stale",
      label: `Postes sans remontée depuis plus de ${CONFIG.staleDays} jours`,
      value: formatFleetNumber(snapshot.stale),
      helper: translate("Postes actuels dont la dernière remontée dépasse le seuil configuré"),
      level: snapshot.stale ? "warning" : "ok",
    },
    {
      id: "storage",
      label: "Stockage faible",
      value: formatFleetNumber(snapshot.lowStorage),
      helper: translate("Moins de 30 Go libres"),
      level: snapshot.lowStorage ? "warning" : "ok",
    },
    {
      id: "windows10",
      label: "Postes sous Windows 10",
      value: formatFleetNumber(snapshot.windows10),
      helper: translate("OS obsolète"),
      level: snapshot.windows10 ? "warning" : "ok",
    },
    {
      id: "value",
      label: "Valeur actuelle estimée du parc",
      value: money(snapshot.value),
      helper: translate("Estimation basée sur le modèle, le CPU, la RAM, le GPU et l’âge du matériel"),
      level: "info",
    },
    {
      id: "age",
      label: "Âge moyen du parc",
      value: formattersDomain.formatAgeYears(snapshot.averageAge, state.language),
      helper: formattersDomain.formatAgePopulation(snapshot.devicesWithAge, state.language),
      level: snapshot.averageAge !== null && snapshot.averageAge >= 5 ? "warning" : "ok",
    },
  ];
}

const riskScoreForDevice = (device) => fleetDomain.riskScoreForDevice(device, fleetEvaluationContext());

function riskReasonsForDevice(device) {
  return fleetDomain.riskReasonCodes(device, fleetEvaluationContext()).map((reason) => {
    if (reason === "status") return translate("Statut de remplacement");
    if (reason === "stale")
      return `${daysSince(device.last_seen_at)} ${state.language === "en" ? "days without report" : "jours sans remontée"}`;
    if (reason === "storage") return translate("Stockage faible");
    if (reason === "os") return translate("OS obsolète");
    if (reason === "cpu") return translate("Score CPU faible");
    return translate("Matériel vieillissant");
  });
}

function computeReplacementCandidates(items = state.filtered, limit = 8) {
  return fleetDomain.replacementCandidates(items, fleetEvaluationContext(), limit).map(({ device, score }) => ({
    device,
    score,
    reasons: riskReasonsForDevice(device),
  }));
}

function countStats(items, getter, limit = 6) {
  return fleetDomain.countStats(items, (item) => String(getter(item) ?? ""), fallbackText(""), limit);
}

function averageStats(items, groupGetter, valueGetter, limit = 6) {
  return fleetDomain.averageStats(
    items,
    (item) => String(groupGetter(item) ?? ""),
    valueGetter,
    fallbackText(""),
    limit,
  );
}

function computeLocationStats(items = state.filtered) {
  return countStats(organizationDomain.currentDevicesByLocation(items), (device) => device.establishment_name);
}

function computeTeamStats(items = state.filtered) {
  return countStats(activeFleetDevices(items), activeTeamName);
}

function computeOsStats(items = state.filtered) {
  return countStats(items, normalizedDeviceOsFamily);
}

function computeValuationStats(items = state.filtered) {
  return fleetDomain.fleetValuationSnapshot(items, fleetEvaluationContext(), fallbackText(""));
}

function computeFleetHealth(items = state.filtered) {
  const snapshot = fleetDomain.fleetHealthSnapshot(items, fleetEvaluationContext());
  const reasons = [
    snapshot.stale ? `${snapshot.stale} ${translate("Dernière remontée depuis plus de 30 jours")}` : "",
    snapshot.lowStorage ? `${snapshot.lowStorage} ${translate("Stockage faible")}` : "",
    snapshot.windows10 ? `${snapshot.windows10} ${translate("Machines Windows 10")}` : "",
    snapshot.lowCpu ? `${snapshot.lowCpu} ${translate("Score CPU faible")}` : "",
    snapshot.replace ? `${snapshot.replace} ${translate("Postes à remplacer en priorité")}` : "",
  ].filter(Boolean);
  return {
    ...snapshot,
    status: snapshot.score >= 78 ? "Bon état" : snapshot.score >= 55 ? "À surveiller" : "Critique",
    reasons,
  };
}

function renderFleetKpiCards(kpis) {
  const target = $("#fleet-kpis");
  if (!target) return;
  target.innerHTML = kpis
    .map(
      (kpi) => `
    <article class="fleet-kpi-card fleet-level-${kpi.level}" title="${escapeHtml(kpi.helper)}">
      <span class="fleet-kpi-state">${translate(kpi.level === "ok" ? "Bon" : kpi.level === "critical" ? "Critique" : "À surveiller")}</span>
      <span class="fleet-kpi-label">${translate(kpi.label)}</span>
      <strong>${escapeHtml(kpi.value)}</strong>
      <small>${escapeHtml(kpi.helper)}</small>
    </article>
  `,
    )
    .join("");
}

function renderFleetStatList(title, subtitle, rows, valueFormatter = (value) => formatFleetNumber(value)) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  return `
    <div class="fleet-card-head">
      <div>
        <p class="eyebrow">${translate(title)}</p>
        <h3>${translate(subtitle)}</h3>
      </div>
    </div>
    <div class="fleet-stat-list">
      ${
        rows
          .map(
            (row) => `
        <div class="fleet-stat-row" title="${escapeHtml(row.label)}">
          <div class="fleet-stat-label"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(valueFormatter(row.value))}</strong></div>
          <div class="fleet-stat-track" aria-hidden="true"><span style="width:${Math.max(4, (Number(row.value || 0) / max) * 100)}%"></span></div>
          ${row.percent ? `<small>${formatFleetPercent(row.percent)}</small>` : ""}
        </div>
      `,
          )
          .join("") || `<p class="helper">${translate("Aucune donnée.")}</p>`
      }
    </div>
  `;
}

function renderFleetPriority(items) {
  const target = $("#fleet-priority");
  if (!target) return;
  target.innerHTML = `
    <div class="fleet-card-head">
      <div>
        <p class="eyebrow">${translate("À traiter en priorité")}</p>
        <h3>${translate("Postes à remplacer en priorité")}</h3>
      </div>
      <span class="fleet-card-note">${translate("Actions IT triees par score de risque")}</span>
    </div>
    ${
      items.length
        ? `
      <div class="fleet-priority-table-wrap">
        <table class="fleet-priority-table">
          <thead>
            <tr>
              <th>Hostname</th>
              <th>${translate("Utilisateur")}</th>
              <th>${translate("Équipe")}</th>
              <th>${translate("Établissement")}</th>
              <th>${translate("Modèle")}</th>
              <th>OS</th>
              <th>${translate("Dernière remontée")}</th>
              <th>${translate("Raison")}</th>
              <th>${translate("Priorité")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(({ device, score, reasons }) => {
                const user =
                  `${device.first_name || ""} ${device.last_name || ""}`.trim() ||
                  translate("Aucun utilisateur actuel");
                const reason = reasons.join(" / ") || translate("À surveiller");
                return `
                <tr data-id="${escapeHtml(device.id)}">
                  <td><strong>${escapeHtml(device.hostname || "-")}</strong><small>${escapeHtml(device.serial_number || device.service_tag || "")}</small></td>
                  <td><strong>${escapeHtml(user)}</strong><small>${escapeHtml(device.email || "")}</small></td>
                  <td>${renderTeamBadge(activeTeamName(device), device.team_id, device.team_color)}</td>
                  <td>${renderLocationBadge(device)}</td>
                  <td title="${escapeHtml(fullDeviceModel(device))}">${escapeHtml(shortDeviceModel(device))}</td>
                  <td>${renderOsBadge(device)}</td>
                  <td>${formatDate(device.last_seen_at)}</td>
                  <td>${escapeHtml(reason)}</td>
                  <td><span class="risk-pill ${score >= 75 ? "risk-critical" : score >= 50 ? "risk-warning" : "risk-info"}">${score}</span></td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `
      <div class="fleet-empty-state">
        <strong>${translate("Aucune action prioritaire")}</strong>
        <span>${translate("Le parc filtre ne remonte pas de risque majeur.")}</span>
      </div>
    `
    }
  `;
  $$("#fleet-priority tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => selectDevice(row.dataset.id));
  });
}

function renderFleetDistribution(items) {
  const target = $("#fleet-distribution");
  if (!target) return;
  const models = countStats(items, fullDeviceModel, 5);
  target.innerHTML = `
    <div class="fleet-card-head">
      <div>
        <p class="eyebrow">${translate("Répartition du parc")}</p>
        <h3>${translate("Établissements, équipes et systèmes d’exploitation")}</h3>
      </div>
    </div>
    <div class="fleet-mini-grid">
      <section>${renderFleetStatList("Établissements", "Par établissement", computeLocationStats(items), formatFleetNumber)}</section>
      <section>${renderFleetStatList("Équipes", "Par équipe", computeTeamStats(items), formatFleetNumber)}</section>
      <section>${renderFleetStatList("OS", "Par système d’exploitation", computeOsStats(items), formatFleetNumber)}</section>
      <section>${renderFleetStatList("Modèles présents", "Modèles fréquents", models, formatFleetNumber)}</section>
    </div>
  `;
}

function renderFleetHealth(health, items) {
  const target = $("#fleet-health");
  if (!target) return;
  const activeItems = activeFleetDevices(items);
  const ramRows = averageStats(activeItems, activeTeamName, (device) => device.ram_total_gb, 5);
  const signalRows = [
    {
      label: translate("Signal récent"),
      value: health.signal.recent,
      percent: activeItems.length ? (health.signal.recent / activeItems.length) * 100 : 0,
    },
    {
      label: translate("Signal a surveiller"),
      value: health.signal.aging,
      percent: activeItems.length ? (health.signal.aging / activeItems.length) * 100 : 0,
    },
    {
      label: translate("Signal ancien"),
      value: health.signal.old,
      percent: activeItems.length ? (health.signal.old / activeItems.length) * 100 : 0,
    },
  ];
  target.innerHTML = `
    <div class="fleet-card-head">
      <div>
        <p class="eyebrow">${translate("Santé du parc")}</p>
        <h3>${translate(health.status)}</h3>
      </div>
      <div class="health-score fleet-level-${health.level}" aria-label="${translate("Score global")}: ${health.score}/100">
        <strong>${health.score}</strong>
        <span>/100</span>
      </div>
    </div>
    <div class="fleet-health-layout">
      <div>
        <p class="fleet-section-label">${translate("Principales raisons")}</p>
        <ul class="health-reasons">
          ${(health.reasons.length ? health.reasons : [translate("Aucun risque majeur")]).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </div>
      <div>${renderFleetStatList("Signal du parc", "Récent / à surveiller / ancien", signalRows, formatFleetNumber)}</div>
      <div>${renderFleetStatList("RAM moyenne par équipe", "Par équipe", ramRows, (value) => `${formatFleetNumber(value, 1)} Go`)}</div>
    </div>
  `;
}

function renderFleetValuation(stats) {
  const target = $("#fleet-valuation");
  if (!target) return;
  target.innerHTML = `
    <div class="fleet-card-head">
      <div>
        <p class="eyebrow">${translate("Valorisation")}</p>
        <h3>${translate("Valeur actuelle estimée")}</h3>
      </div>
    </div>
    <div class="fleet-value-grid">
      <article title="${translate("Somme des valeurs estimées des postes actuels")}">
        <span>${translate("Valeur actuelle estimée du parc")}</span>
        <strong>${money(stats.total)}</strong>
        <small>${translate("Somme des valeurs estimées des postes actuels")}</small>
      </article>
      <article title="${translate("Valeur estimée moyenne par poste actuel")}">
        <span>${translate("Valeur moyenne par poste")}</span>
        <strong>${money(stats.average)}</strong>
        <small>${translate("Valeur estimée moyenne par poste actuel")}</small>
      </article>
      <article title="${translate("Somme des valeurs estimées des candidats au remplacement")}">
        <span>${translate("Valeur des postes à remplacer")}</span>
        <strong>${money(stats.replaceValue)}</strong>
        <small>${translate("Somme des valeurs estimées des candidats au remplacement")}</small>
      </article>
    </div>
    ${renderFleetStatList("Valeur par établissement", "Principaux établissements", stats.byLocation, money)}
  `;
}

function renderFleetAgeCpu(items) {
  const target = $("#fleet-age-cpu");
  if (!target) return;
  const points = activeFleetDevices(items)
    .map((device) => ({
      device,
      age: deviceAge(device),
      cpu: deviceCpuScore(device),
      score: riskScoreForDevice(device),
    }))
    .filter((point) => point.age !== null && point.cpu > 0)
    .slice(0, 160);
  if (!points.length) {
    target.innerHTML = `
      <div class="fleet-card-head">
        <div><p class="eyebrow">${translate("Âge du matériel et score CPU")}</p><h3>${translate("Score CPU")}</h3></div>
      </div>
      <p class="helper">${translate("Un enrichissement est requis pour afficher le graphique âge et CPU.")}</p>
    `;
    return;
  }
  const width = 960;
  const height = 420;
  const pad = { left: 74, right: 34, top: 42, bottom: 66 };
  const maxAge = Math.max(6, ...points.map((point) => point.age));
  const maxCpu = Math.max(18000, ...points.map((point) => point.cpu));
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const x = (age) => pad.left + (Math.min(age, maxAge) / maxAge) * plotWidth;
  const y = (cpu) => pad.top + plotHeight - (Math.min(cpu, maxCpu) / maxCpu) * plotHeight;
  const pointJitter = (device, axis) => {
    const seed = String(device.id || device.hostname || device.serial_number || device.model || "")
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), axis === "x" ? 17 : 43);
    return ((seed % 100) - 50) / 50;
  };
  const axisAges = [0, Math.round(maxAge / 2), maxAge];
  const axisScores = [0, Math.round(maxCpu / 2), maxCpu];
  target.innerHTML = `
    <div class="fleet-card-head">
      <div>
        <p class="eyebrow">${translate("Âge du matériel et score CPU")}</p>
        <h3>${translate("Postes disposant de données sur le processeur et l’âge")}</h3>
      </div>
      <span class="fleet-card-note">${translate("Chaque point représente un poste et sa couleur indique sa criticité")}</span>
    </div>
    <div class="age-cpu-chart" role="img" aria-label="${translate("Âge du matériel et score CPU")}">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <rect class="chart-frame" x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}"></rect>
        <rect class="zone zone-good" x="${pad.left}" y="${pad.top}" width="${plotWidth * 0.45}" height="${plotHeight}"></rect>
        <rect class="zone zone-watch" x="${pad.left + plotWidth * 0.45}" y="${pad.top}" width="${plotWidth * 0.3}" height="${plotHeight}"></rect>
        <rect class="zone zone-replace" x="${pad.left + plotWidth * 0.75}" y="${pad.top}" width="${plotWidth * 0.25}" height="${plotHeight}"></rect>
        ${axisAges.map((age) => `<line class="grid-line" x1="${x(age)}" x2="${x(age)}" y1="${pad.top}" y2="${pad.top + plotHeight}"></line><text class="axis-label axis-x" x="${x(age)}" y="${height - 36}">${age}a</text>`).join("")}
        ${axisScores.map((score) => `<line class="grid-line" x1="${pad.left}" x2="${pad.left + plotWidth}" y1="${y(score)}" y2="${y(score)}"></line><text class="axis-label axis-y" x="${pad.left - 16}" y="${y(score) + 4}">${formatFleetNumber(score)}</text>`).join("")}
        <line class="threshold-line" x1="${pad.left}" x2="${pad.left + plotWidth}" y1="${y(7000)}" y2="${y(7000)}"></line>
        <line class="axis-line" x1="${pad.left}" x2="${pad.left + plotWidth}" y1="${pad.top + plotHeight}" y2="${pad.top + plotHeight}"></line>
        <line class="axis-line" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + plotHeight}"></line>
        <text class="zone-label" x="${pad.left + 18}" y="${pad.top + 26}">${translate("Récent / correct")}</text>
        <text class="zone-label" x="${pad.left + plotWidth * 0.49}" y="${pad.top + 26}">${translate("Vieillissant")}</text>
        <text class="zone-label" x="${pad.left + plotWidth * 0.79}" y="${pad.top + 26}">${translate("À remplacer")}</text>
        <text class="axis-title axis-title-x" x="${pad.left + plotWidth / 2}" y="${height - 10}">${translate("Âge du matériel")}</text>
        <text class="axis-title axis-title-y" x="18" y="${pad.top + plotHeight / 2}" transform="rotate(-90 18 ${pad.top + plotHeight / 2})">${translate("Score CPU")}</text>
        ${points
          .map((point) => {
            const className = point.score >= 75 ? "replace" : point.score >= 50 ? "watch" : "ok";
            const title = `${point.device.hostname || point.device.model || translate("Poste")} - ${point.age} ${state.language === "en" ? "yrs" : "ans"} - CPU ${point.cpu}`;
            const cx = clamp(x(point.age) + pointJitter(point.device, "x") * 9, pad.left + 6, pad.left + plotWidth - 6);
            const cy = clamp(y(point.cpu) + pointJitter(point.device, "y") * 7, pad.top + 6, pad.top + plotHeight - 6);
            return `<circle class="age-point ${className}" cx="${cx}" cy="${cy}" r="5.8"><title>${escapeHtml(title)}</title></circle>`;
          })
          .join("")}
      </svg>
      <div class="age-cpu-legend">
        <span><i class="legend-ok"></i>${translate("Récent / correct")}</span>
        <span><i class="legend-watch"></i>${translate("À surveiller")}</span>
        <span><i class="legend-replace"></i>${translate("À remplacer")}</span>
      </div>
    </div>
  `;
}

function renderFleetDashboard() {
  if (!$("#fleet-dashboard")) return;
  const items = state.filtered;
  const kpis = computeFleetKpis(items);
  const health = computeFleetHealth(items);
  const candidates = computeReplacementCandidates(items);
  const valuation = computeValuationStats(items);
  renderFleetKpiCards(kpis);
  renderFleetPriority(candidates);
  renderFleetDistribution(items);
  renderFleetHealth(health, items);
  renderFleetValuation(valuation);
  renderFleetAgeCpu(items);
}

function renderValuation() {
  const metricsTarget = $("#valuation-metrics");
  if (!metricsTarget) return;
  const devices = activeFleetDevices(state.filtered);
  const launchValue = devices.reduce((sum, device) => sum + Number(device.estimated_launch_price || 0), 0);
  const currentValue = devices.reduce((sum, device) => sum + estimatedValue(device), 0);
  const depreciation = launchValue > 0 ? Math.round((1 - currentValue / launchValue) * 100) : 0;
  const ageSnapshot = fleetDomain.fleetKpiSnapshot(devices, fleetEvaluationContext());
  const ages = inventoryDomain.fleetDeviceAges(devices);
  const averageAge = ageSnapshot.averageAge;
  const olderThanFour = ageSnapshot.olderThanFour;
  const lowCpu = devices.filter(
    (device) =>
      Number(device.cpu_benchmark_score || device.cpu_score || 0) > 0 &&
      Number(device.cpu_benchmark_score || device.cpu_score || 0) < 8000,
  ).length;
  const highPriority = devices.filter(
    (device) => Number(device.replacement_priority || device.obsolescence_index || 0) >= 70,
  ).length;
  const marketObserved = devices.filter((device) => Number(device.market_observation_count || 0) > 0).length;
  const highConfidence = devices.filter((device) =>
    ["A", "B"].includes(String(device.valuation_confidence_label || "")),
  ).length;

  metricsTarget.innerHTML = [
    {
      label: "Valeur de lancement totale",
      value: money(launchValue),
      helper: "Somme des prix de lancement estimés pour les postes filtrés",
    },
    {
      label: "Valeur actuelle estimée du parc",
      value: money(currentValue),
      helper: "Somme des dernières valeurs estimées pour les postes filtrés",
    },
    {
      label: "Dépréciation moyenne estimée",
      value: `${depreciation}%`,
      helper: "Écart entre la valeur de lancement totale et la valeur actuelle estimée",
    },
    {
      label: "Âge moyen du parc",
      value: formattersDomain.formatAgeYears(averageAge, state.language),
      helper: formattersDomain.formatAgePopulation(ageSnapshot.devicesWithAge, state.language),
    },
    {
      label: "Postes de plus de quatre ans",
      value: formatFleetNumber(olderThanFour),
      helper: "Postes actuels avec une date de sortie exploitable et un âge strictement supérieur à quatre ans",
    },
    {
      label: "Postes avec un processeur peu performant",
      value: formatFleetNumber(lowCpu),
      helper: "Postes dont le score processeur connu est inférieur à 8 000",
    },
    {
      label: "Postes à remplacer en priorité",
      value: formatFleetNumber(highPriority),
      helper: "Postes dont la priorité de remplacement calculée est supérieure ou égale à 70",
    },
    {
      label: "Prix de marché observés",
      value: formatFleetNumber(marketObserved),
      helper: "Postes disposant d’au moins une observation de prix externe",
    },
    {
      label: "Niveau de confiance A–B",
      value: formatFleetNumber(highConfidence),
      helper: "Postes dont l’estimation atteint un niveau de confiance A ou B",
    },
  ]
    .map(
      ({ label, value, helper }) => `
        <article class="metric" title="${escapeHtml(translate(helper))}">
          <span>${translate(label)}</span>
          <strong>${value}</strong>
          <small>${escapeHtml(translate(helper))}</small>
        </article>`,
    )
    .join("");

  const ageDistribution = { "0-1": 0, "2-3": 0, "4-5": 0, "6+": 0 };
  ages.forEach((age) => {
    if (age <= 1) ageDistribution["0-1"] += 1;
    else if (age <= 3) ageDistribution["2-3"] += 1;
    else if (age <= 5) ageDistribution["4-5"] += 1;
    else ageDistribution["6+"] += 1;
  });
  const performance = { Faible: 0, Moyen: 0, Bon: 0 };
  devices.forEach((device) => {
    const score = Number(device.cpu_benchmark_score || device.cpu_score || 0);
    if (!score) return;
    if (score < 8000) performance.Faible += 1;
    else if (score < 14000) performance.Moyen += 1;
    else performance.Bon += 1;
  });
  const priorities = { Faible: 0, Moyen: 0, Élevée: 0 };
  devices.forEach((device) => {
    const priority = Number(device.replacement_priority || device.obsolescence_index || 0);
    if (priority >= 70) priorities.Élevée += 1;
    else if (priority >= 45) priorities.Moyen += 1;
    else priorities.Faible += 1;
  });

  renderBarChart(
    '[data-valuation-chart="value-team"]',
    translate("Valeur par équipe"),
    sumBy(devices, activeTeamName, estimatedValue),
    " EUR",
  );
  renderBarChart('[data-valuation-chart="age"]', translate("Distribution des âges"), ageDistribution);
  renderBarChart('[data-valuation-chart="performance"]', translate("Distribution des performances"), performance);
  renderBarChart('[data-valuation-chart="priority"]', translate("Priorité de remplacement"), priorities);

  if (state.cpuBenchmarkStats) {
    $("#cpu-benchmark-status").textContent =
      `${translate("Benchmarks importés")}: ${state.cpuBenchmarkStats.importedCount} / ${translate("Jeu intégré")}: ${state.cpuBenchmarkStats.bundledCount}`;
  }
  const latestEnrichment = inventoryDomain.latestEnrichmentAt(state.devices);
  $("#last-enrichment-label").textContent = latestEnrichment
    ? `${translate("Dernier enrichissement")}: ${formatDate(latestEnrichment)}`
    : translate("Aucun enrichissement terminé");
}

function renderDevices() {
  $("#result-count").textContent =
    state.language === "en"
      ? `${state.filtered.length} result${state.filtered.length === 1 ? "" : "s"}`
      : `${formatFleetNumber(state.filtered.length)} résultat${state.filtered.length === 1 ? "" : "s"}`;
  const labels = currentStatusLabels();
  $("#devices-table").innerHTML = state.filtered
    .map((device) => {
      const unassignedStatus = isDetachedInventoryStatus(device.status);
      const userName = unassignedStatus
        ? translate("Aucun utilisateur actuel")
        : `${device.first_name || ""} ${device.last_name || ""}`.trim() || "-";
      const userEmail = unassignedStatus ? labels[device.status] || translate("Sorti du parc") : device.email || "";
      return `
        <tr data-id="${device.id}" class="${deviceRowStatusClass(device.status)} ${device.id === state.selectedDeviceId ? "is-selected" : ""}">
          <td>
            <span class="hostname-quality">
              <strong class="cell-primary">${escapeHtml(device.hostname || "-")}</strong>
              ${renderDataQualitySignal(device)}
            </span>
            <small class="cell-secondary">${escapeHtml(device.serial_number || device.service_tag || "")}</small>
          </td>
          <td><strong class="cell-primary">${escapeHtml(userName)}</strong><small class="cell-secondary">${escapeHtml(userEmail)}</small></td>
          <td>${unassignedStatus ? "" : renderTeamBadge(device.team_name, device.team_id, device.team_color)}</td>
          <td>${renderLocationBadge(device)}</td>
          <td>${renderOsBadge(device)}</td>
          <td class="manufacturer-cell">${renderManufacturerBadge(device)}<small title="${escapeHtml(fullDeviceModel(device))}">${escapeHtml(shortDeviceModel(device))}</small></td>
          <td>${formatDate(device.last_seen_at)}</td>
          <td><span class="${statusClass(device.status)}">${labels[device.status] || device.status || "Actif"}</span></td>
        </tr>
      `;
    })
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
  $("#detail-title").textContent = device.hostname || translate("Poste");
  $("#device-detail").innerHTML = `<p class="helper">Chargement de l'historique...</p>`;
  try {
    const detail = await inventoryApi.getDevice(id);
    renderDetail(
      {
        ...detail.device,
        priceHistory: detail.priceHistory || [],
        invoices: detail.invoices || detail.device?.invoices || [],
      },
      detail.scans || [],
      detail.history || [],
    );
  } catch (error) {
    toast(error.message);
    renderDetail(device, [], []);
  }
}

function historyLabel(event) {
  const labels = {
    DEVICE_CREATED: "Poste créé",
    DEVICE_UPDATED: "Poste mis à jour",
    DEVICE_RETIRED: "Poste sorti du parc",
    DEVICE_REACTIVATED: "Poste réactivé",
    USER_ASSIGNED: "Utilisateur affecté",
    USER_REASSIGNED: "Utilisateur réaffecté",
    USER_REMOVED: "Utilisateur retiré",
    TEAM_CHANGED: "Équipe modifiée",
    LOCATION_CHANGED: "Établissement modifié",
    OS_CHANGED: "Système mis à jour",
    HARDWARE_CHANGED: "Matériel modifié",
    STATUS_CHANGED: "Statut modifié",
    COLLECTOR_UPDATE: "Collecte mise à jour",
    DEVICE_RESET: "Réinitialisation détectée",
    MANUAL_EDIT: "Note administrateur",
    IMPORT_UPDATE: "Import mis à jour",
    INVOICE_ADDED: "Facture ajoutée",
    INVOICE_DELETED: "Facture supprimée",
    GROUPED_UPDATE: "Modification groupée",
  };
  return labels[event.event_type] || event.event_type;
}

function historyFieldLabel(fieldName) {
  const labels = {
    hostname: "Nom d’hôte",
    os_name: "OS",
    os_version: "Version OS",
    manufacturer: "Fabricant",
    model: "Modèle",
    model_number: "Numéro modèle / SKU",
    service_tag: "Étiquette du service",
    serial_number: "Numéro de série",
    cpu: "CPU",
    gpu: "GPU",
    ram_total_gb: "RAM totale",
    storage_total_gb: "Stockage total",
    storage_type: "Type de stockage",
    windows_user: "Utilisateur OS",
    team_id: "Équipe",
    establishment_id: "Établissement",
    assigned_user_id: "Propriétaire",
    owner_email: "Email propriétaire",
    status: "Statut",
    invoice: "Facture",
    legacy_google_sheets_history: "Historique Google Sheets",
  };
  return translate(labels[fieldName] || fieldName);
}

const cleanImportedText = historyDomain.cleanImportedText;
const parseHistoryJson = historyDomain.parseHistoryJson;

function legacyHistorySummary(value) {
  const data = parseHistoryJson(value);
  if (!data) return cleanImportedText(value || "-");
  const fullName = [data.firstName, data.lastName].map(cleanImportedText).filter(Boolean).join(" ");
  const parts = [
    fullName,
    cleanImportedText(data.team),
    cleanImportedText(data.establishment),
    cleanImportedText(data.osUser) ? `${translate("Utilisateur OS")}: ${cleanImportedText(data.osUser)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "-";
}

function historyValueDisplay(event, side) {
  const value = side === "old" ? event.old_value : event.new_value;
  if (event.field_name === "legacy_google_sheets_history") return legacyHistorySummary(value);
  return cleanImportedText(value || "-");
}

const groupHistoryEvents = historyDomain.groupHistoryEvents;
const historyGroupLabel = historyDomain.historyGroupLabel;

function renderHistoryNotes(events) {
  const seen = new Set();
  return events
    .map((event) => {
      const note = cleanImportedText(event.notes);
      if (!note) return "";
      const key = `${event.event_type || ""}:${note.toLowerCase()}`;
      if (seen.has(key)) return "";
      seen.add(key);
      const isAdminNote =
        event.event_type === "MANUAL_EDIT" || String(event.source || "").toLowerCase() === "manual-note";
      return `
      <p class="${isAdminNote ? "history-admin-note" : "history-event-note"}">
        ${isAdminNote ? `<span>${escapeHtml(translate("Note administrateur"))}</span>` : ""}
        ${escapeHtml(note)}
      </p>
    `;
    })
    .join("");
}

function renderHistoryChanges(events) {
  const changes = events.filter((event) => event.old_value !== null || event.new_value !== null);
  if (changes.length === 0) return "";
  if (changes.length === 1) {
    const event = changes[0];
    return `
      <p class="${event.field_name === "legacy_google_sheets_history" ? "history-change legacy-history-change" : "history-change"}">
        <span>${translate("De")}: ${escapeHtml(historyValueDisplay(event, "old"))}</span>
        <span>${translate("Vers")}: ${escapeHtml(historyValueDisplay(event, "new"))}</span>
      </p>
    `;
  }
  return `
    <ul class="history-change-list">
      ${changes
        .map(
          (event) => `
        <li>
          <strong>${escapeHtml(historyFieldLabel(event.field_name))}</strong>
          <span>${translate("De")}: ${escapeHtml(historyValueDisplay(event, "old"))}</span>
          <span>${translate("Vers")}: ${escapeHtml(historyValueDisplay(event, "new"))}</span>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function renderHistoryTimeline(history) {
  return (
    groupHistoryEvents(history)
      .map((group) => {
        const event = group.events[0];
        const groupLabel = historyGroupLabel(group.events);
        const changedFields = new Set(
          group.events.filter((item) => item.field_name).map((item) => historyFieldLabel(item.field_name)),
        );
        const fieldSummary =
          changedFields.size > 1
            ? `${changedFields.size} ${state.language === "en" ? "fields updated" : "champs mis à jour"}`
            : event.field_name
              ? historyFieldLabel(event.field_name)
              : "";
        return `
    <article class="history-event">
      <span class="history-marker"></span>
      <div>
        <time>${formatDate(event.changed_at)} (${formatRelativeDate(event.changed_at)})</time>
        <strong>${escapeHtml(translate(historyLabel({ ...event, event_type: groupLabel })))}</strong>
        ${fieldSummary ? `<small>${escapeHtml(fieldSummary)}</small>` : ""}
        ${renderHistoryChanges(group.events)}
        ${renderHistoryNotes(group.events)}
        <dl class="history-meta">
          <div><dt>${translate("Qui")}</dt><dd>${escapeHtml(event.changed_by || "system")}</dd></div>
          <div><dt>${translate("Comment")}</dt><dd>${escapeHtml(sourceLabel(event.source))}</dd></div>
          <div><dt>${translate("Quand")}</dt><dd>${escapeHtml(formatDate(event.changed_at))}</dd></div>
        </dl>
      </div>
    </article>
    `;
      })
      .join("") || `<p class="helper">${translate("Aucun historique.")}</p>`
  );
}

function sourceLabel(source) {
  const normalized = String(source || "SYSTEM")
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_");
  if (normalized === "MANUAL") return translate("MANUAL_ADMIN");
  return translate(normalized);
}

function assignmentPeriodsFromLegacyHistory(history = [], fallbackPeriods = []) {
  const importedReason =
    state.language === "en"
      ? "Usage period reconstructed from the imported Google Sheets history."
      : "Période d’utilisation reconstruite depuis l’historique Google Sheets importé.";
  return historyDomain.assignmentPeriodsFromLegacyHistory(history, fallbackPeriods, importedReason);
}

function renderAssignmentPeriods(periods = []) {
  return (
    periods
      .map((period) => {
        const user = period.user_name || period.user_email || translate("Aucun utilisateur actuel");
        const endLabel = period.ended_at ? formatDate(period.ended_at) : translate("a aujourd'hui");
        return `
      <article class="assignment-period">
        <strong>${escapeHtml(user)}</strong>
        <small>${escapeHtml([period.team_name, period.establishment_name].filter(Boolean).join(" - ") || "-")}</small>
        <p>${translate("Utilise de")} ${escapeHtml(formatDate(period.started_at))} ${translate("a")} ${escapeHtml(endLabel)}</p>
        <p>${translate("Durée")}: ${escapeHtml(formatDuration(period.started_at, period.ended_at))}</p>
        <small>${translate("Assigne par")}: ${escapeHtml(period.assigned_by || "-")} · ${translate("Source")}: ${escapeHtml(sourceLabel(period.source))}</small>
        ${period.unassigned_by ? `<small>${translate("Retire par")}: ${escapeHtml(period.unassigned_by)}</small>` : ""}
        ${period.reason ? `<p>${translate("Pourquoi")}: ${escapeHtml(period.reason)}</p>` : ""}
      </article>
    `;
      })
      .join("") || `<p class="helper">${translate("Aucune donnée.")}</p>`
  );
}

function promptRetirementNote(device) {
  return new Promise((resolve) => {
    pendingRetirement = { resolve };
    $("#retire-dialog-title").textContent = translate("Sortir le poste du parc");
    $("#retire-dialog-message").textContent =
      `${translate("Ajoutez une note avant de confirmer la sortie du parc.")} ${device.hostname || ""}`.trim();
    $("#retire-note").value = "";
    $("#retire-dialog").showModal();
    $("#retire-note").focus();
  });
}

const invoiceTypeLabels = {
  purchase: "Facture achat",
  warranty_extension: "Extension garantie",
  repair: "Reparation",
  accessory: "Accessoire",
  other: "Autre facture",
};

const invoiceTypeValue = invoiceDomain.invoiceTypeValue;

function invoiceTypeLabel(invoice) {
  return invoiceTypeLabels[invoiceTypeValue(invoice)] || invoiceTypeLabels.other;
}

function invoiceDetailRows(invoice) {
  const rows = [
    invoice.invoice_number ? ["Numéro de facture", invoice.invoice_number] : null,
    invoice.invoice_date ? ["Date de facture", formatDateOnly(invoice.invoice_date)] : null,
    invoice.purchase_price
      ? ["Montant de la facture", moneyWithCurrency(invoice.purchase_price, invoice.currency)]
      : null,
  ];
  if (invoiceTypeValue(invoice) === "warranty_extension") {
    rows.push(
      invoice.warranty_provider ? ["Garantie fournisseur", invoice.warranty_provider] : null,
      invoice.warranty_start_date ? ["Début de garantie", formatDateOnly(invoice.warranty_start_date)] : null,
      invoice.warranty_end_date ? ["Fin de garantie", formatDateOnly(invoice.warranty_end_date)] : null,
      invoice.warranty_duration_months
        ? [
            "Durée de garantie en mois",
            `${invoice.warranty_duration_months} ${state.language === "en" ? "months" : "mois"}`,
          ]
        : null,
    );
  }
  return rows.filter(Boolean);
}

function renderInvoiceDetails(invoice) {
  const rows = invoiceDetailRows(invoice);
  if (!rows.length) return "";
  return [
    `<dl class="invoice-data-grid">`,
    ...rows.map(
      ([label, value]) => `
      <div>
        <dt>${escapeHtml(translate(label))}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `,
    ),
    `</dl>`,
  ].join("");
}

function warrantyStatusInfo(invoice) {
  const snapshot = invoiceDomain.warrantyStatusSnapshot(invoice);
  if (!snapshot) return null;
  const activeLabel = snapshot.isEstimated ? translate("Garantie constructeur estimee") : translate("Garantie active");
  if (snapshot.status === "unknown") {
    return {
      status: "unknown",
      label: translate("Garantie incomplète"),
      helper: translate("Fin de garantie"),
      progress: 0,
    };
  }
  if (snapshot.status === "expired") {
    const days = Math.abs(snapshot.daysLeft);
    return {
      status: "expired",
      label: translate("Garantie expiree"),
      helper: `${translate("Expirée depuis")} ${days} ${translate(days > 1 ? "jours" : "jour")}`,
      progress: 0,
    };
  }
  if (snapshot.daysLeft === 0) {
    return {
      status: "warning",
      label: translate("Garantie bientot expiree"),
      helper: translate("Expire aujourd'hui"),
      progress: snapshot.progress,
    };
  }
  if (snapshot.status === "warning") {
    return {
      status: "warning",
      label: translate("Garantie bientot expiree"),
      helper: `${translate("Expire dans")} ${snapshot.daysLeft} ${translate(snapshot.daysLeft > 1 ? "jours" : "jour")}`,
      progress: snapshot.progress,
    };
  }
  return {
    status: "active",
    label: activeLabel,
    helper: `${translate("Expire dans")} ${snapshot.daysLeft} ${translate(snapshot.daysLeft > 1 ? "jours" : "jour")}`,
    progress: snapshot.progress,
  };
}

function renderWarrantyStatusBar(invoice) {
  const info = warrantyStatusInfo(invoice);
  if (!info) return "";
  return `
    <div class="warranty-status warranty-status-${escapeHtml(info.status)}" role="group" aria-label="${escapeHtml(`${info.label}. ${info.helper}`)}">
      <div class="warranty-status-header">
        <span>${escapeHtml(info.label)}</span>
        <strong>${escapeHtml(info.helper)}</strong>
      </div>
      <div class="warranty-status-track" aria-hidden="true">
        <span style="width: ${Number(info.progress) || 0}%"></span>
      </div>
    </div>
  `;
}

const latestWarrantyInvoice = invoiceDomain.latestWarrantyInvoice;
const latestDatedPurchaseInvoice = invoiceDomain.latestDatedPurchaseInvoice;

function standardWarrantyInvoiceFromPurchase(purchaseInvoice) {
  return invoiceDomain.standardWarrantyInvoiceFromPurchase(purchaseInvoice, translate("Garantie standard 1 an"));
}

function renderInvoiceList(invoices = [], canEditDevice = false) {
  if (!invoices.length) return `<p class="helper">${translate("Aucune facture.")}</p>`;
  return `
    <div class="invoice-list">
      ${invoices
        .map(
          (invoice) => `
        <article class="invoice-item">
          <div class="invoice-content">
            <div class="invoice-title">
              <strong>${escapeHtml(invoice.supplier || invoice.invoice_number || translate("Factures"))}</strong>
              <span class="invoice-type-badge invoice-type-${escapeHtml(invoiceTypeValue(invoice))}">${escapeHtml(translate(invoiceTypeLabel(invoice)))}</span>
            </div>
            ${renderWarrantyStatusBar(invoice)}
            ${renderInvoiceDetails(invoice)}
            ${invoice.file_name ? `<small>${escapeHtml(invoice.file_name)}</small>` : ""}
            ${invoice.notes ? `<p class="invoice-note">${escapeHtml(invoice.notes)}</p>` : ""}
          </div>
          <div class="invoice-actions">
            ${invoice.file_url ? `<a class="secondary button-like" href="${escapeHtml(invoice.file_url)}" target="_blank" rel="noopener">${translate("Ouvrir la facture")}</a>` : ""}
            ${canEditDevice ? `<button class="danger-button invoice-delete" type="button" data-invoice-id="${escapeHtml(invoice.id)}">${translate("Supprimer la facture")}</button>` : ""}
          </div>
        </article>
      `,
        )
        .join("")}
    </div>
  `;
}

const latestPurchaseInvoice = invoiceDomain.latestPurchaseInvoice;

const maxInvoiceUploadBytes = 10 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("File read failed")));
    reader.readAsDataURL(file);
  });
}

async function invoiceFormPayload(form) {
  const values = Object.fromEntries(new FormData(form));
  const file = form.elements.invoiceFile?.files?.[0] || null;
  if (file && file.size > maxInvoiceUploadBytes) {
    throw new Error(translate("Fichier trop volumineux. Maximum 10 Mo."));
  }
  const payload = {
    invoiceType: String(values.invoiceType || "purchase").trim(),
    supplier: String(values.supplier || "").trim(),
    invoiceNumber: String(values.invoiceNumber || "").trim(),
    invoiceDate: normalizeDateInputValue(values.invoiceDate),
    purchasePrice: String(values.purchasePrice || "").trim(),
    currency: String(values.currency || "EUR")
      .trim()
      .toUpperCase(),
    warrantyProvider: String(values.warrantyProvider || "").trim(),
    warrantyStartDate: normalizeDateInputValue(values.warrantyStartDate),
    warrantyEndDate: normalizeDateInputValue(values.warrantyEndDate),
    warrantyDurationMonths: String(values.warrantyDurationMonths || "").trim(),
    fileName: String(values.fileName || file?.name || "").trim(),
    fileUrl: String(values.fileUrl || "").trim(),
    notes: String(values.notes || "").trim(),
  };
  if (file) {
    payload.fileDataBase64 = await readFileAsBase64(file);
    payload.fileMimeType = file.type || "application/octet-stream";
    payload.fileSizeBytes = file.size;
  }
  return payload;
}

function syncWarrantyEndFromDuration(form) {
  const startInput = form.elements.warrantyStartDate;
  const endInput = form.elements.warrantyEndDate;
  const durationInput = form.elements.warrantyDurationMonths;
  if (!startInput || !endInput || !durationInput) return;
  const durationMonths = Number(durationInput.value || 0);
  if (!durationMonths || durationMonths < 0) return;
  let startIso = "";
  try {
    startIso = normalizeDateInputValue(startInput.value);
  } catch {
    return;
  }
  if (!startIso) return;
  const endIso = addMonthsToDateOnly(startIso, durationMonths);
  if (endIso) endInput.value = formatDateForInput(endIso);
}

function renderDetail(device, scans, history = []) {
  state.selectedDetail = device;
  state.selectedScans = scans;
  state.selectedHistory = history;
  const labels = currentStatusLabels();
  const priorityValue = device.replacement_priority ?? device.obsolescence_index;
  const manufacturer = normalizeManufacturer(device.manufacturer, device.model);
  const family = detectDeviceFamily(manufacturer.manufacturerName, device.model);
  const canEditDevice = canPerformAction("DEVICE_EDIT");
  const canDeleteDevice = canPerformAction("DEVICE_DELETE");
  const unassignedStatus = isDetachedInventoryStatus(device.status);
  const currentUserLabel = unassignedStatus
    ? translate("Aucun utilisateur actuel")
    : `${device.first_name || ""} ${device.last_name || ""}`.trim() || device.email || translate("Non renseigné");
  const currentTeamLabel = unassignedStatus
    ? ""
    : displayWithAbbreviation(device.team_name || "", device.team_abbreviation);
  const currentTeamBadge = unassignedStatus ? "" : renderTeamBadge(device.team_name, device.team_id, device.team_color);
  const payload = latestScanPayload(scans);
  const memoryDetails = memorySummary(payload);
  const invoices = Array.isArray(device.invoices) ? device.invoices : [];
  const purchaseInvoice = latestPurchaseInvoice(invoices);
  const purchaseDateInvoice = latestDatedPurchaseInvoice(invoices);
  const warrantyInvoice = latestWarrantyInvoice(invoices);
  const warrantySummaryInvoice = warrantyInvoice || standardWarrantyInvoiceFromPurchase(purchaseDateInvoice);
  const warrantySummaryStatus = warrantySummaryInvoice ? warrantyStatusInfo(warrantySummaryInvoice) : null;
  const warrantyDisplay = warrantySummaryInvoice
    ? [
        warrantySummaryInvoice.warranty_provider || "",
        warrantySummaryStatus?.label || "",
        warrantySummaryInvoice.warranty_end_date
          ? `${translate("Fin de garantie")} ${formatDateOnly(warrantySummaryInvoice.warranty_end_date)}`
          : "",
        warrantySummaryInvoice.is_estimated_warranty ? translate("Depuis la facture d’achat") : "",
      ]
        .filter(Boolean)
        .join(" - ")
    : "";
  const actualPurchaseRaw = purchaseInvoice?.purchase_price ?? device.actual_purchase_price;
  const actualPurchaseCurrency = purchaseInvoice?.currency ?? device.actual_purchase_currency;
  const actualPurchasePrice =
    Number(actualPurchaseRaw || 0) > 0 ? moneyWithCurrency(actualPurchaseRaw, actualPurchaseCurrency) : "";
  const launchPriceNumber = Number(device.estimated_launch_price || 0);
  const purchasePriceNumber = Number(actualPurchaseRaw || 0);
  const launchLooksLikeInvoice =
    device.valuation_method === "invoice_backed" &&
    launchPriceNumber > 0 &&
    purchasePriceNumber > 0 &&
    Math.round(launchPriceNumber * 100) === Math.round(purchasePriceNumber * 100);
  const launchPriceDisplay = launchLooksLikeInvoice ? "" : money(device.estimated_launch_price);
  const cpuBenchmarkSourceUrl = /^https?:\/\//i.test(String(device.cpu_benchmark_source_url || ""))
    ? String(device.cpu_benchmark_source_url)
    : "";
  const cpuBenchmarkSourceLink = cpuBenchmarkSourceUrl
    ? {
        html: `<a href="${escapeHtml(cpuBenchmarkSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(translate("Voir la source"))}</a>`,
      }
    : "";
  const cpuReleaseSourceUrl = /^https?:\/\//i.test(String(device.cpu_release_source_url || ""))
    ? String(device.cpu_release_source_url)
    : "";
  const cpuReleaseSourceLink = cpuReleaseSourceUrl
    ? {
        html: `<a href="${escapeHtml(cpuReleaseSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(translate("Voir la source officielle"))}</a>`,
      }
    : "";
  const cpuReleaseInfo = cpuReleaseDomain.cpuReleasePresentation(device, state.language);
  const effectiveTeamId = unassignedStatus ? "" : device.team_id;
  const effectiveUserId = unassignedStatus ? "" : device.assigned_user_id;
  const teamOptions = state.teams
    .map(
      (team) =>
        `<option value="${team.id}" ${effectiveTeamId === team.id ? "selected" : ""}>${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`,
    )
    .join("");
  const establishmentOptions = state.establishments
    .map(
      (site) =>
        `<option value="${site.id}" ${device.establishment_id === site.id ? "selected" : ""}>${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`,
    )
    .join("");
  const userOptions = state.users
    .map((user) => {
      const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email;
      return `<option value="${user.id}" ${effectiveUserId === user.id ? "selected" : ""}>${escapeHtml(name)} (${escapeHtml(user.email)})</option>`;
    })
    .join("");
  const detailValueHtml = (value) => {
    if (value && typeof value === "object" && Object.hasOwn(value, "html")) return value.html;
    return escapeHtml(value === 0 ? 0 : value || "-");
  };
  const detailRows = (rows) =>
    `<dl class="detail-list">${rows.map(([key, value]) => `<div><dt>${escapeHtml(translate(key))}</dt><dd>${detailValueHtml(value)}</dd></div>`).join("")}</dl>`;
  const priceRows = (device.priceHistory || [])
    .slice(0, 8)
    .map(
      (row) =>
        `<li>${formatDate(row.collected_at)} - ${row.source} - ${money(row.price)} - ${escapeHtml(localizedMarketCondition(row.condition))}</li>`,
    )
    .join("");
  const scanRows = scans
    .slice(0, 8)
    .map((scan) => `<li>${formatDate(scan.collected_at)} - ${scan.os_name || "-"} ${scan.os_version || ""}</li>`)
    .join("");

  $("#device-detail").innerHTML = `
    <div class="manufacturer-hero">
      <span class="manufacturer-logo ${manufacturer.colorClass}">${renderManufacturerLogo(manufacturer)}</span>
      <span>
        <strong>${escapeHtml(manufacturer.manufacturerName)}${family ? ` ${escapeHtml(family)}` : ""}</strong>
        <span title="${escapeHtml(fullDeviceModel(device))}">${escapeHtml(shortDeviceModel(device) || translate("Non renseigné"))}</span>
      </span>
    </div>
    ${warrantySummaryInvoice ? `<div class="detail-warranty-summary">${renderWarrantyStatusBar(warrantySummaryInvoice)}</div>` : ""}
    <nav class="detail-tabs" aria-label="${escapeHtml(translate("Sections du poste"))}">
      <button class="detail-tab is-active" type="button" data-detail-tab="overview">${translate("Vue générale")}</button>
      <button class="detail-tab" type="button" data-detail-tab="hardware">${translate("Matériel")}</button>
      <button class="detail-tab" type="button" data-detail-tab="os">${translate("OS")}</button>
      <button class="detail-tab" type="button" data-detail-tab="network">${translate("Réseau")}</button>
      <button class="detail-tab" type="button" data-detail-tab="assignment">${translate("Affectation")}</button>
      <button class="detail-tab" type="button" data-detail-tab="invoices">${translate("Factures")}</button>
      <button class="detail-tab" type="button" data-detail-tab="lifecycle">${translate("Cycle de vie")}</button>
      <button class="detail-tab" type="button" data-detail-tab="history">${translate("Historique")}</button>
    </nav>
    <section class="detail-tab-panel is-active" data-detail-panel="overview">
      ${detailRows([
        ["Hostname", device.hostname],
        ["Fabricant", manufacturer.manufacturerName],
        ["Famille", family],
        ["Modèle", device.model],
        ["Numéro modèle / SKU", device.model_number],
        ["Étiquette du service", device.service_tag],
        ["Dernière remontée", formatDate(device.last_seen_at)],
        ["Utilisateur", currentUserLabel],
        ["Équipe", currentTeamLabel],
        ["Établissement", displayWithAbbreviation(device.establishment_name || "", device.establishment_abbreviation)],
      ])}
      ${
        canEditDevice
          ? `<form id="status-form" class="form-grid one scan-history">
        <label>${translate("Statut")}<select name="status">${Object.entries(labels)
          .map(
            ([value, label]) =>
              `<option value="${value}" ${device.status === value ? "selected" : ""}>${label}</option>`,
          )
          .join("")}</select></label>
        <button type="submit" class="primary">${translate("Mettre à jour")}</button>
      </form>`
          : ""
      }
      ${
        canEditDevice || canDeleteDevice
          ? `<div class="detail-actions">
        ${canEditDevice ? `<button id="enrich-device" class="secondary detail-enrich-button" type="button">${translate("Enrichir ce poste")}</button>` : ""}
        ${canDeleteDevice ? `<button id="delete-device" class="danger-button" type="button">${translate("Supprimer ce poste")}</button>` : ""}
      </div>`
          : ""
      }
    </section>
    <section class="detail-tab-panel" data-detail-panel="hardware">
      ${detailRows([
        ["Numéro de série", device.serial_number],
        ["Étiquette du service", device.service_tag],
        ["Numéro modèle / SKU", device.model_number],
        ["CPU", device.cpu],
        ["Plateforme CPU", cpuPlatformLabel(device.cpu)],
        ["GPU", device.gpu],
        ["RAM", device.ram_total_gb ? formatCapacityGb(device.ram_total_gb) : ""],
        ["Mémoire", memoryDetails],
        ["Stockage", formatStorageSummary(device.storage_total_gb, device.storage_free_gb)],
        ["Type de stockage", device.storage_type],
        ["Score CPU", device.cpu_benchmark_score || device.cpu_score],
        ...(cpuBenchmarkSourceLink ? [["Source du score CPU", cpuBenchmarkSourceLink]] : []),
        ["Génération du processeur", device.cpu_generation],
        ["Date de sortie CPU", cpuReleaseInfo.summary],
        ["Nom CPU canonique", device.cpu_release_canonical_name],
        ["Fabricant de la source CPU", localizedEnrichmentValue(device.cpu_release_vendor)],
        ["Précision de la date CPU", localizedEnrichmentValue(device.cpu_release_precision)],
        ["Type d'événement CPU", localizedEnrichmentValue(device.cpu_release_event_type)],
        ["Correspondance CPU", localizedEnrichmentValue(device.cpu_release_match_method)],
        ["Confiance date CPU", device.cpu_release_confidence ? `${device.cpu_release_confidence}/100` : ""],
        ...(cpuReleaseSourceLink ? [["Source officielle de la date CPU", cpuReleaseSourceLink]] : []),
        ["Dernière vérification de la date CPU", formatDate(device.cpu_release_last_verified_at)],
        ["Année du modèle", device.release_year || device.model_release_year],
        ["Prix d’achat réel", actualPurchasePrice],
        ["Garantie", warrantyDisplay],
        ["Prix de lancement", launchPriceDisplay],
        [
          "Valeur actuelle estimée",
          money(device.resale_value || device.estimated_current_value || device.current_market_price_avg),
        ],
        ["Valeur revente", money(device.resale_value || device.estimated_current_value)],
        ["Coût de remplacement", money(device.replacement_cost)],
        ["Valeur comptable", money(device.book_value)],
        ["Méthode de valorisation", localizedEnrichmentValue(device.valuation_method)],
        [
          "Confiance de la valorisation",
          device.valuation_confidence_label
            ? `${device.valuation_confidence_label} (${device.price_confidence_score || device.confidence_score || 0}/100)`
            : "",
        ],
        ["Observations du marché", device.market_observation_count],
        ["Raisons de la valorisation", valuationReasonsDisplay(device)],
      ])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="network">
      ${detailRows([
        ["MAC", device.mac_address],
        ["IP locale", device.local_ip],
        ["Utilisateur OS", device.windows_user],
        ["Script", device.script_version],
      ])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="os">
      ${detailRows([
        ["OS", device.os_name],
        ["Version OS", device.os_version],
        ["Dernière remontée", formatDate(device.last_seen_at)],
        ["Script", device.script_version],
      ])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="assignment">
      <div class="assignment-summary">${currentTeamBadge} ${renderLocationBadge(device)}</div>
      ${
        canEditDevice
          ? `<form id="assignment-form" class="form-grid one assignment-form">
        <label>${translate("Équipe")}<select name="teamId"><option value="">${translate("Non renseigné")}</option>${teamOptions}</select></label>
        <label>${translate("Établissement")}<select name="establishmentId"><option value="">${translate("Non renseigné")}</option>${establishmentOptions}</select></label>
        <label>${translate("Propriétaire")}<select name="assignedUserId"><option value="">${translate("Non renseigné")}</option>${userOptions}</select></label>
        <label>${translate("Prénom propriétaire")}<input name="ownerFirstName" value="${escapeHtml(device.first_name || "")}" maxlength="120" /></label>
        <label>${translate("Nom propriétaire")}<input name="ownerLastName" value="${escapeHtml(device.last_name || "")}" maxlength="120" /></label>
        <label>${translate("Email propriétaire")}<input name="ownerEmail" type="email" value="${escapeHtml(device.email || "")}" maxlength="255" /></label>
        <button type="submit" class="primary">${translate("Enregistrer les affectations")}</button>
      </form>`
          : ""
      }
    </section>
    <section class="detail-tab-panel" data-detail-panel="invoices">
      ${renderInvoiceList(invoices, canEditDevice)}
      ${
        canEditDevice
          ? `<form id="invoice-form" class="form-grid invoice-form">
        <label>${translate("Type de facture")}<select name="invoiceType">
          <option value="purchase">${translate("Facture d’achat")}</option>
          <option value="warranty_extension">${translate("Extension de garantie")}</option>
          <option value="repair">${translate("Réparation")}</option>
          <option value="accessory">${translate("Accessoire")}</option>
          <option value="other">${translate("Autre facture")}</option>
        </select></label>
        <label>${translate("Fournisseur")}<input name="supplier" maxlength="160" placeholder="Apple, Dell, LDLC..." /></label>
        <label>${translate("Numéro de facture")}<input name="invoiceNumber" maxlength="120" /></label>
        <label>${translate("Date de facture")}<input name="invoiceDate" inputmode="numeric" autocomplete="off" placeholder="${dateInputPlaceholder()}" pattern="\\d{1,2}[\\/\\-\\s.]\\d{1,2}[\\/\\-\\s.]\\d{4}" /></label>
        <label>${translate("Montant de la facture")}<input name="purchasePrice" type="number" min="0" step="0.01" /></label>
        <label>${translate("Devise")}<input name="currency" maxlength="3" value="EUR" /></label>
        <label class="invoice-warranty-field">${translate("Garantie fournisseur")}<input name="warrantyProvider" maxlength="160" placeholder="Dell, AppleCare, assureur..." /></label>
        <label class="invoice-warranty-field">${translate("Début de garantie")}<input name="warrantyStartDate" inputmode="numeric" autocomplete="off" placeholder="${dateInputPlaceholder()}" pattern="\\d{1,2}[\\/\\-\\s.]\\d{1,2}[\\/\\-\\s.]\\d{4}" /></label>
        <label class="invoice-warranty-field">${translate("Fin de garantie")}<input name="warrantyEndDate" inputmode="numeric" autocomplete="off" placeholder="${dateInputPlaceholder()}" pattern="\\d{1,2}[\\/\\-\\s.]\\d{1,2}[\\/\\-\\s.]\\d{4}" /></label>
        <label class="invoice-warranty-field">${translate("Durée de garantie en mois")}<input name="warrantyDurationMonths" type="number" min="0" step="1" /></label>
        ${
          purchaseDateInvoice?.invoice_date
            ? `<div class="invoice-warranty-preset wide">
          <label>${translate("Durée constructeur")}
            <select class="invoice-warranty-preset-duration">
              <option value="12">12 ${translate("mois")}</option>
              <option value="24">24 ${translate("mois")}</option>
              <option value="36">36 ${translate("mois")}</option>
              <option value="48">48 ${translate("mois")}</option>
              <option value="60">60 ${translate("mois")}</option>
            </select>
          </label>
          <button class="secondary invoice-warranty-preset-button" type="button" data-purchase-date="${escapeHtml(purchaseDateInvoice.invoice_date)}">${translate("Préremplir la garantie")}</button>
          <small>${escapeHtml(translate("Depuis la facture d’achat"))} : ${escapeHtml(formatDateOnly(purchaseDateInvoice.invoice_date))}</small>
        </div>`
            : ""
        }
        <label>${translate("Nom fichier")}<input name="fileName" maxlength="255" placeholder="facture-macbook.pdf" /></label>
        <label>${translate("Fichier facture")}<input name="invoiceFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*,application/pdf" /></label>
        <label class="wide">${translate("Lien facture")}<input name="fileUrl" type="url" maxlength="2000" placeholder="https://..." /></label>
        <label class="wide">${translate("Notes facture")}<textarea name="notes" rows="3" maxlength="1000"></textarea></label>
        <button type="submit" class="primary">${translate("Ajouter une facture")}</button>
      </form>`
          : ""
      }
    </section>
    <section class="detail-tab-panel" data-detail-panel="history">
      <form id="history-note-form" class="history-note-form">
        <textarea name="notes" rows="3" maxlength="2000" placeholder="${escapeHtml(translate("Ajouter une note à l’historique..."))}" required></textarea>
        <button class="secondary" type="submit">${translate("Ajouter la note")}</button>
      </form>
      <div class="history-timeline">${renderHistoryTimeline(history)}</div>
      <div class="scan-history"><h3>${translate("Chronologie utilisateurs")}</h3>${renderAssignmentPeriods(assignmentPeriodsFromLegacyHistory(history, device.assignmentPeriods || []))}</div>
      <div class="scan-history"><h3>${translate("Scans")}</h3><ul>${scanRows || `<li>${translate("Aucun scan détaillé.")}</li>`}</ul></div>
      <div class="scan-history"><h3>${translate("Prix du marché")}</h3><ul>${priceRows || `<li>${translate("Aucun prix externe collecté.")}</li>`}</ul></div>
    </section>
    <section class="detail-tab-panel" data-detail-panel="lifecycle">
      ${detailRows([
        ["Statut", labels[device.status] || device.status],
        ["Score d’âge", `${device.hardware_age_score || 0}/100`],
        [
          "Priorité de remplacement",
          priorityValue !== null && priorityValue !== undefined ? `${priorityValue}/100` : "",
        ],
        ["Recommandation", localizedEnrichmentValue(device.recommendation)],
        ["Dernier enrichissement", formatDate(device.last_enriched_at)],
        ["Confiance du prix", device.price_confidence_score ? `${device.price_confidence_score}/100` : ""],
        ["Prix d’achat réel", actualPurchasePrice],
        ["Garantie", warrantyDisplay],
        [
          "Valeur actuelle estimée",
          money(device.resale_value || device.estimated_current_value || device.current_market_price_avg),
        ],
        ["Coût de remplacement", money(device.replacement_cost)],
        ["Méthode de valorisation", localizedEnrichmentValue(device.valuation_method)],
        ["Confiance de la valorisation", device.valuation_confidence_label || ""],
      ])}
    </section>
  `;

  $$(".detail-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateDetailTab(button.dataset.detailTab);
    });
  });
  activateDetailTab(state.activeDetailTab);

  if ($("#assignment-form"))
    $("#assignment-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const ownerEmail = String(values.ownerEmail || "").trim();
      if (ownerEmail && !event.currentTarget.elements.ownerEmail.checkValidity()) {
        toast("Email propriétaire invalide.", "error");
        return;
      }
      try {
        await inventoryApi.updateDeviceAssignment(device.id, values);
        await loadAdminData();
        await selectDevice(device.id);
        toast("Affectations mises à jour.");
      } catch (error) {
        toast(error.message, "error");
      }
    });

  const invoiceForm = $("#invoice-form");
  if (invoiceForm) {
    const invoiceTypeSelect = invoiceForm.elements.invoiceType;
    const syncInvoiceType = () => {
      invoiceForm.classList.toggle("is-warranty", invoiceTypeSelect?.value === "warranty_extension");
    };
    invoiceTypeSelect?.addEventListener("change", syncInvoiceType);
    syncInvoiceType();
    invoiceForm.querySelector(".invoice-warranty-preset-button")?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      const purchaseDate = button.dataset.purchaseDate || "";
      const selectedDuration = Number(invoiceForm.querySelector(".invoice-warranty-preset-duration")?.value || 12);
      const durationMonths = selectedDuration > 0 ? selectedDuration : 12;
      const warrantyEnd = addMonthsToDateOnly(purchaseDate, durationMonths);
      if (invoiceTypeSelect) invoiceTypeSelect.value = "warranty_extension";
      invoiceForm.elements.supplier.value = invoiceForm.elements.supplier.value || translate("Garantie constructeur");
      invoiceForm.elements.invoiceDate.value =
        invoiceForm.elements.invoiceDate.value || formatDateForInput(purchaseDate);
      invoiceForm.elements.warrantyProvider.value =
        invoiceForm.elements.warrantyProvider.value || translate("Garantie constructeur");
      invoiceForm.elements.warrantyStartDate.value = formatDateForInput(purchaseDate);
      invoiceForm.elements.warrantyEndDate.value = formatDateForInput(warrantyEnd);
      invoiceForm.elements.warrantyDurationMonths.value = String(durationMonths);
      invoiceForm.elements.notes.value = invoiceForm.elements.notes.value || translate("Depuis la facture d’achat");
      syncInvoiceType();
    });
    invoiceForm.elements.warrantyStartDate?.addEventListener("change", () => syncWarrantyEndFromDuration(invoiceForm));
    invoiceForm.elements.warrantyDurationMonths?.addEventListener("change", () =>
      syncWarrantyEndFromDuration(invoiceForm),
    );
    invoiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type='submit']");
      const originalText = button.textContent;
      button.disabled = true;
      try {
        button.textContent = translate("Lecture du fichier...");
        const payload = await invoiceFormPayload(event.currentTarget);
        await inventoryApi.addDeviceInvoice(device.id, payload);
        await loadAdminData();
        await selectDevice(device.id);
        activateDetailTab("invoices");
        toast("Facture ajoutée.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  }

  $$(".invoice-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmAction({
        title: "Supprimer la facture",
        message: translate("Supprimer cette facture ?"),
        confirmLabel: "Supprimer",
      });
      if (!confirmed) return;
      button.disabled = true;
      try {
        await inventoryApi.deleteDeviceInvoice(device.id, button.dataset.invoiceId);
        await loadAdminData();
        await selectDevice(device.id);
        activateDetailTab("invoices");
        toast("Facture supprimée.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        button.disabled = false;
      }
    });
  });

  $("#history-note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const notes = new FormData(event.currentTarget).get("notes");
    try {
      await inventoryApi.addDeviceHistoryNote(device.id, { notes });
      await selectDevice(device.id);
      toast("Note ajoutée.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  if ($("#status-form"))
    $("#status-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = new FormData(event.currentTarget).get("status");
      let note = "";
      if (status === "retired" && device.status !== "retired") {
        note = await promptRetirementNote(device);
        if (!note) {
          event.currentTarget.elements.status.value = device.status;
          return;
        }
      }
      try {
        const result = await inventoryApi.updateDeviceStatus(device.id, { status, note });
        const index = state.devices.findIndex((item) => item.id === device.id);
        if (index >= 0) {
          state.devices[index] = {
            ...state.devices[index],
            status: result.device.status,
            assigned_user_id: isDetachedInventoryStatus(result.device.status)
              ? null
              : state.devices[index].assigned_user_id,
            first_name: isDetachedInventoryStatus(result.device.status) ? "" : state.devices[index].first_name,
            last_name: isDetachedInventoryStatus(result.device.status) ? "" : state.devices[index].last_name,
            email: isDetachedInventoryStatus(result.device.status) ? "" : state.devices[index].email,
            team_id: isDetachedInventoryStatus(result.device.status) ? null : state.devices[index].team_id,
            team_name: isDetachedInventoryStatus(result.device.status) ? "" : state.devices[index].team_name,
            team_abbreviation: isDetachedInventoryStatus(result.device.status)
              ? ""
              : state.devices[index].team_abbreviation,
            team_color: isDetachedInventoryStatus(result.device.status) ? "" : state.devices[index].team_color,
          };
        }
        await loadAdminData();
        await selectDevice(device.id);
        toast("Statut mis à jour.");
      } catch (error) {
        toast(error.message);
      }
    });

  if ($("#enrich-device"))
    $("#enrich-device").addEventListener("click", async () => {
      const button = $("#enrich-device");
      button.disabled = true;
      button.textContent = translate("Enrichissement...");
      try {
        const result = await inventoryApi.enrichDevices({
          deviceId: device.id,
          limit: 1,
          force: true,
          mode: "refresh",
          useExternal: true,
        });
        toast(result.failed ? "Erreur serveur." : enrichmentResultMessage(result));
        await loadAdminData();
        await selectDevice(device.id);
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
        button.textContent = translate("Enrichir ce poste");
      }
    });

  if ($("#delete-device"))
    $("#delete-device").addEventListener("click", async () => {
      const label = device.hostname || device.serial_number || device.service_tag || device.id;
      const confirmed = await confirmAction({
        title: "Confirmer la suppression",
        message:
          state.language === "en"
            ? `Permanently delete "${label}" and its scan history? This action cannot be undone.`
            : `Supprimer définitivement "${label}" et son historique de scan ? Cette action est irréversible.`,
        confirmLabel: "Supprimer",
      });
      if (!confirmed) return;
      const button = $("#delete-device");
      button.disabled = true;
      try {
        await inventoryApi.deleteDevice(device.id);
        state.devices = state.devices.filter((item) => item.id !== device.id);
        state.filtered = state.filtered.filter((item) => item.id !== device.id);
        state.selectedDeviceId = "";
        state.selectedDetail = null;
        state.selectedScans = [];
        state.selectedHistory = [];
        $("#detail-title").textContent = translate("Sélectionnez un poste");
        $("#device-detail").textContent = translate("Aucun poste sélectionné");
        applyFilters();
        toast("Poste supprimé.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        button.disabled = false;
      }
    });
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "Non renseigné";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function renderBarChart(selector, title, data, suffix = "") {
  const target = document.querySelector(selector);
  if (!target) return;
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  target.innerHTML = `
    <h3>${title}</h3>
    ${
      entries
        .map(
          ([key, value]) => `
          <div class="bar-row">
            <span title="${escapeHtml(translate(key))}">${escapeHtml(translate(key))}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${(value / max) * 100}%"></span></span>
            <strong>${value}${suffix}</strong>
          </div>
        `,
        )
        .join("") || `<p class="helper">${translate("Aucune donnée.")}</p>`
    }
  `;
}

function sumBy(items, groupGetter, valueGetter) {
  return items.reduce((acc, item) => {
    const group = groupGetter(item) || "Non renseigné";
    acc[group] = Math.round((acc[group] || 0) + Number(valueGetter(item) || 0));
    return acc;
  }, {});
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCsv(enrichedExport = false) {
  const columns = [
    "hostname",
    "first_name",
    "last_name",
    "email",
    "team_name",
    "establishment_name",
    "os_name",
    "os_version",
    "manufacturer",
    "model",
    "model_number",
    "service_tag",
    "serial_number",
    "cpu",
    "gpu",
    "ram_total_gb",
    "storage_total_gb",
    "storage_free_gb",
    "storage_type",
    "last_seen_at",
    "status",
    "hardware_age_score",
    "cpu_score",
    "cpu_benchmark_score",
    "cpu_benchmark_source_url",
    "cpu_generation",
    "cpu_release_year",
    "model_release_year",
    "release_year",
    "current_market_price_avg",
    "estimated_current_value",
    "resale_value",
    "replacement_cost",
    "book_value",
    "valuation_method",
    "valuation_confidence_label",
    "valuation_reasons",
    "market_observation_count",
    "price_confidence_score",
    "performance_index",
    "obsolescence_index",
    "replacement_priority",
    "recommendation",
    "enrichment_status",
    "enrichment_source",
    "device_category",
    "enrichment_notes",
    "confidence_score",
    "last_enriched_at",
  ];
  const csv = [
    columns.join(","),
    ...state.filtered.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${enrichedExport ? "inventaire-it-enrichi" : "inventaire-it"}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadCollectorReleases() {
  state.detectedPlatform = collectorDomain.detectClientPlatform(navigator);
  try {
    state.collectorReleases = await publicResources.getJson(CONFIG.collectorReleaseConfigUrl, { cache: "no-store" });
  } catch {
    state.collectorReleases = {
      fallbackReleasePageUrl: "https://github.com/badr-spacefoot/pc_inventory_2.0/releases",
      assets: {},
    };
  }
  updateCollectorDownloadUi();
}

function collectorAsset(platform = state.detectedPlatform) {
  return state.collectorReleases?.assets?.[platform] || null;
}

function expectedCollectorVersion(asset = collectorAsset()) {
  return asset?.version || state.collectorReleases?.latestVersion || "";
}

function hasKnownCompatibleCollector(asset = collectorAsset()) {
  if (state.detectedPlatform !== "windows") return false;
  const saved = state.collectorInstallState || {};
  return Boolean(
    asset &&
    saved.platform === state.detectedPlatform &&
    saved.version &&
    saved.version === expectedCollectorVersion(asset),
  );
}

function hasDownloadedExpectedCollector(asset = collectorAsset()) {
  const saved = state.collectorDownloadState || {};
  return Boolean(
    asset &&
    saved.platform === state.detectedPlatform &&
    saved.version &&
    saved.version === expectedCollectorVersion(asset),
  );
}

function rememberCollectorDownload(asset = collectorAsset()) {
  const version = expectedCollectorVersion(asset);
  if (!version || state.detectedPlatform === "unknown") return;
  state.collectorDownloadState = {
    platform: state.detectedPlatform,
    version,
    downloadedAt: new Date().toISOString(),
  };
  localStorage.setItem(COLLECTOR_DOWNLOAD_STATE_KEY, JSON.stringify(state.collectorDownloadState));
}

function rememberCollectorLaunch(asset = collectorAsset()) {
  const version = expectedCollectorVersion(asset);
  if (!version || state.detectedPlatform === "unknown") return;
  state.collectorInstallState = {
    platform: state.detectedPlatform,
    version,
    launchedAt: new Date().toISOString(),
  };
  localStorage.setItem(COLLECTOR_INSTALL_STATE_KEY, JSON.stringify(state.collectorInstallState));
}

function updateUbuntuInstallGuide() {
  const guide = $("#ubuntu-install-guide");
  const code = $("#ubuntu-install-command");
  if (!guide || !code) return;
  const shouldShow = state.detectedPlatform === "linux" && Boolean(collectorAsset("linux"));
  guide.classList.toggle("is-hidden", !shouldShow);
  code.textContent = ubuntuInstallCommand(collectorAsset("linux"));
}

function updateMacosInstallGuide() {
  const guide = $("#macos-install-guide");
  const code = $("#macos-install-command");
  if (!guide || !code) return;
  const shouldShow = state.detectedPlatform === "macos" && Boolean(collectorAsset("macos"));
  guide.classList.toggle("is-hidden", !shouldShow);
  code.textContent = macosInstallCommand(collectorAsset("macos"));
}

function downloadPrefillFile(options = {}) {
  if (!state.prefillCode) {
    if (options.silent) return;
    toast("Aucun code de pré-remplissage", "error");
    return;
  }
  const payload = {
    ...(state.prefillPayload || {}),
    apiUrl: CONFIG.apiBaseUrl,
    prefillCode: state.prefillCode,
    launchUrl: state.collectorLaunchUrl,
    createdAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `spacefoot-collector-prefill-${state.prefillCode || "draft"}.json`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, options.revokeDelayMs || 2500);
  if (options.silent) return true;
  toast("Fichier de pré-remplissage téléchargé. Ouvrez le collecteur : il le détectera automatiquement.", "success");
  return true;
}

function updateCollectorDownloadUi() {
  const primary = $("#collector-download-primary");
  const releases = $("#collector-releases-link");
  const openApp = $("#collector-open-app");
  const launcher = primary?.closest(".launcher-downloads");
  if (!primary || !releases) return;
  const releasePage =
    state.collectorReleases?.releasePageUrl ||
    state.collectorReleases?.fallbackReleasePageUrl ||
    "https://github.com/badr-spacefoot/pc_inventory_2.0/releases";
  releases.href =
    state.collectorReleases?.fallbackReleasePageUrl || "https://github.com/badr-spacefoot/pc_inventory_2.0/releases";
  const detected = state.detectedPlatform;
  const asset = collectorAsset(detected);
  const canLaunch = Boolean(state.collectorLaunchUrl);
  const compatibleCollectorKnown = canLaunch && hasKnownCompatibleCollector(asset);
  const downloadedExpectedCollector = canLaunch && hasDownloadedExpectedCollector(asset);
  const shouldPrioritizeOpen = compatibleCollectorKnown || downloadedExpectedCollector;
  if (asset) {
    primary.href = asset.downloadUrl;
    primary.setAttribute("download", asset.fileName || "");
    primary.querySelector("span:not(.collector-os-icon)").textContent = downloadedExpectedCollector
      ? state.language === "en"
        ? "Download again"
        : "Telecharger a nouveau"
      : downloadLabel(detected, translate);
    $("#collector-os-icon").innerHTML = osIconSvg(detected);
    $("#collector-platform-copy").textContent = compatibleCollectorKnown
      ? state.language === "en"
        ? `Collector ${asset.version || ""} already opened from this browser. Launch it to load the profile.`
        : `Collecteur ${asset.version || ""} déjà lancé depuis ce navigateur. Ouvrez-le pour charger le profil.`
      : `${translate("Collecteur detecte pour")} ${platformLabel(detected)} (${asset.version || ""}).`;
    if (!compatibleCollectorKnown) {
      $("#collector-platform-copy").textContent = downloadedExpectedCollector
        ? state.language === "en"
          ? "Installer finished? Click Open collector here to load the prefilled profile."
          : "Installation terminée ? Cliquez sur Ouvrir le collecteur ici pour charger le profil pré-rempli."
        : state.language === "en"
          ? `Step 1: download and install the ${platformLabel(detected)} collector. Then return here for step 2.`
          : `Etape 1 : telechargez et installez le collecteur ${platformLabel(detected)}. Revenez ensuite ici pour l'etape 2.`;
    }
  } else {
    primary.href = releasePage;
    primary.removeAttribute("download");
    primary.querySelector("span:not(.collector-os-icon)").textContent = translate("Télécharger le collecteur");
    $("#collector-os-icon").innerHTML = osIconSvg("unknown");
    $("#collector-platform-copy").textContent =
      detected === "unknown"
        ? translate("Choisissez votre plateforme ci-dessous.")
        : translate("Aucun asset collecteur disponible pour cette plateforme.");
  }
  if (openApp) {
    openApp.disabled = !canLaunch;
    openApp.classList.toggle("is-disabled", !canLaunch);
    openApp.classList.toggle("primary", shouldPrioritizeOpen);
    openApp.classList.toggle("secondary", !shouldPrioritizeOpen);
    openApp.textContent =
      shouldPrioritizeOpen && state.language !== "en"
        ? "Ouvrir le collecteur prérempli"
        : translate("Ouvrir le collecteur");
    primary.classList.toggle("primary", !shouldPrioritizeOpen);
    primary.classList.toggle("secondary", shouldPrioritizeOpen);
    launcher?.classList.toggle("is-ready-to-open", shouldPrioritizeOpen);
  }
  $$("[data-platform-download]").forEach((link) => {
    const platform = link.dataset.platformDownload;
    const item = collectorAsset(platform);
    link.href = item?.downloadUrl || releasePage;
    if (item?.fileName) link.setAttribute("download", item.fileName);
    else link.removeAttribute("download");
  });
  updateUbuntuInstallGuide();
  updateMacosInstallGuide();
}

async function loadScriptPreview() {
  try {
    state.scriptPreviewText = await publicResources.getText(CONFIG.scriptUrl, { cache: "no-store" });
    $("#script-preview").textContent = state.scriptPreviewText;
  } catch {
    state.scriptPreviewText =
      "# Apercu indisponible. Utilisez le lien de telechargement ou le fichier scripts/collect-windows.ps1 du depot.";
    $("#script-preview").textContent = state.scriptPreviewText;
  }
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
  remote: "Teletravail",
  other: "Autre",
};

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

function validAdminView(view) {
  const requested = String(view || "");
  const button = $(`.admin-nav-button[data-admin-view="${CSS.escape(requested)}"]`);
  return button && !button.classList.contains("is-hidden") ? requested : "fleet";
}

function updateRoute({ replace = false } = {}) {
  const url = new URL(window.location.href);
  if (state.currentView === "admin") {
    url.searchParams.set("view", "admin");
    url.searchParams.set("admin", state.currentAdminView || "fleet");
  } else {
    url.searchParams.delete("view");
    url.searchParams.delete("admin");
  }
  if (url.href === window.location.href) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", url);
}

function setMainView(view, { updateUrl = true, replace = false } = {}) {
  const nextView = view === "admin" ? "admin" : "collect";
  state.currentView = nextView;
  $$(".tab").forEach((item) => item.classList.toggle("is-active", item.dataset.view === nextView));
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === nextView));
  if (nextView === "admin") setAdminView(state.currentAdminView || "fleet", { updateUrl: false });
  if (updateUrl) updateRoute({ replace });
}

function restoreRoute({ updateUrl = true, replace = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  const routeView = params.get("view") === "admin" || params.has("admin") ? "admin" : "collect";
  const routeAdminView = validAdminView(params.get("admin") || state.currentAdminView || "fleet");
  state.currentAdminView = routeAdminView;
  setMainView(routeView, { updateUrl: false });
  setAdminView(routeAdminView, { updateUrl: false });
  if (updateUrl) updateRoute({ replace });
}

function setAdminView(view, { updateUrl = true } = {}) {
  const nextView = validAdminView(view);
  state.currentAdminView = nextView;
  $$(".admin-nav-button").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.adminView === nextView),
  );
  $$(".admin-section-view").forEach((section) => {
    section.classList.toggle("is-hidden", !section.classList.contains(`section-${nextView}`));
  });
  if (updateUrl && state.currentView === "admin") updateRoute();
}

function updateOrganizationDatalists() {
  const teamSelect = collectionForm()?.elements.team;
  const establishmentSelect = collectionForm()?.elements.establishment;
  const inviteForm = $("#invite-form");
  if (teamSelect) {
    const selected = teamSelect.value || state.collectionDraft.team || "";
    teamSelect.innerHTML = [
      `<option value="">${translate("Sélectionnez une équipe")}</option>`,
      ...state.teams
        .filter((team) => team.active !== false)
        .map(
          (team) =>
            `<option value="${escapeHtml(team.name)}">${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`,
        ),
      `<option value="__other__">${translate("Autre")}</option>`,
    ].join("");
    teamSelect.value = [...teamSelect.options].some((option) => option.value === selected) ? selected : "";
  }
  if (establishmentSelect) {
    const selected = establishmentSelect.value || state.collectionDraft.establishment || "";
    establishmentSelect.innerHTML = [
      `<option value="">${translate("Sélectionnez un établissement")}</option>`,
      ...state.establishments
        .filter((site) => site.active !== false)
        .map(
          (site) =>
            `<option value="${escapeHtml(site.name)}">${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`,
        ),
      `<option value="__other__">${translate("Autre")}</option>`,
    ].join("");
    establishmentSelect.value = [...establishmentSelect.options].some((option) => option.value === selected)
      ? selected
      : "";
  }
  if (inviteForm?.elements.team) {
    const selected = inviteForm.elements.team.value || "";
    inviteForm.elements.team.innerHTML = [
      `<option value="">${translate("Optionnel")}</option>`,
      ...state.teams
        .filter((team) => team.active !== false)
        .map(
          (team) =>
            `<option value="${escapeHtml(team.name)}">${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`,
        ),
    ].join("");
    inviteForm.elements.team.value = [...inviteForm.elements.team.options].some((option) => option.value === selected)
      ? selected
      : "";
  }
  if (inviteForm?.elements.establishment) {
    const selected = inviteForm.elements.establishment.value || "";
    inviteForm.elements.establishment.innerHTML = [
      `<option value="">${translate("Optionnel")}</option>`,
      ...state.establishments
        .filter((site) => site.active !== false)
        .map(
          (site) =>
            `<option value="${escapeHtml(site.name)}">${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`,
        ),
    ].join("");
    inviteForm.elements.establishment.value = [...inviteForm.elements.establishment.options].some(
      (option) => option.value === selected,
    )
      ? selected
      : "";
  }
  toggleProposalFields();
}

function organizationBreakdown(record, field) {
  if (state.devices.length > 0) {
    return organizationDomain.organizationDeviceBreakdown(state.devices, field, record.id, record.name);
  }
  if (Object.prototype.hasOwnProperty.call(record, "assigned_device_count")) {
    return {
      total: Number(record.device_count || 0),
      assigned: Number(record.assigned_device_count || 0),
      stock: Number(record.stock_device_count || 0),
      unassigned: Number(record.unassigned_device_count || 0),
      userCount: Number(record.active_user_count ?? record.user_count ?? 0),
    };
  }
  return {
    total: Number(record.device_count || 0),
    assigned: Number(record.device_count || 0),
    stock: 0,
    unassigned: 0,
    userCount: Number(record.user_count || 0),
  };
}

function organizationCountSummary(record, field) {
  const breakdown = organizationBreakdown(record, field);
  const tooltip = translate(
    "Le total inclut les postes attribués, en stock et non attribués. Les postes perdus ou sortis du parc sont exclus.",
  );
  const metrics = [
    { type: "devices", value: breakdown.total, label: "Postes actuels" },
    { type: "users", value: breakdown.userCount, label: "Utilisateurs attribués" },
    ...(breakdown.stock ? [{ type: "stock", value: breakdown.stock, label: "Postes en stock" }] : []),
    ...(breakdown.unassigned
      ? [{ type: "unassigned", value: breakdown.unassigned, label: "Postes non attribués" }]
      : []),
  ];
  return `
    <span class="organization-counts" title="${escapeHtml(tooltip)}">
      ${metrics
        .map(
          (metric) => `
            <span class="organization-count-chip type-${metric.type}" title="${escapeHtml(translate(metric.label))}" aria-label="${escapeHtml(`${translate(metric.label)}: ${formatFleetNumber(metric.value)}`)}">
              ${organizationMetricIcon(metric.type)}
              <strong>${formatFleetNumber(metric.value)}</strong>
            </span>
          `,
        )
        .join("")}
    </span>
  `;
}

function organizationMetricIcon(type) {
  if (type === "users") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M19 8v6M22 11h-6"></path></svg>`;
  }
  if (type === "stock") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 8-9 5-9-5 9-5 9 5Z"></path><path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z"></path></svg>`;
  }
  if (type === "unassigned") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4M9 9h6"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>`;
}

function organizationUnusedGroup(label, rows) {
  if (!rows.length) return "";
  return `
    <details class="organization-unused">
      <summary>
        <span>${translate(label)}</span>
        <strong>${formatFleetNumber(rows.length)}</strong>
      </summary>
      <div class="organization-unused-list">${rows.join("")}</div>
    </details>
  `;
}

function organizationRows(records, field) {
  return records.map((record, index) => ({
    record,
    index,
    hasData: (() => {
      const breakdown = organizationBreakdown(record, field);
      return breakdown.total > 0 || breakdown.userCount > 0;
    })(),
  }));
}

function renderTeamOrganizationRow(team, index, canManageTeams) {
  return `
    <div class="organization-sort-row ${team.active ? "" : "is-inactive"}" draggable="${canManageTeams}" data-entity="team" data-id="${team.id}">
      ${canManageTeams ? `<button class="drag-handle" type="button" aria-label="Déplacer ${escapeHtml(team.name)}" title="Glisser pour réordonner">&#8942;&#8942;</button>` : ""}
      <button class="organization-item edit-team" type="button" data-id="${team.id}">
        <span class="organization-icon" style="--item-color:${escapeHtml(team.color || "#16735f")}">${teamIcon(normalizeTeamInfo(team.name, team.abbreviation).iconType)}</span>
        <span>
          <strong>${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</strong>
          <small class="organization-meta">
            ${organizationCountSummary(team, "team_id")}
            ${team.description ? `<span>${escapeHtml(team.description)}</span>` : ""}
          </small>
        </span>
        <span class="organization-chevron">&rsaquo;</span>
      </button>
      ${
        canManageTeams
          ? `<span class="sort-buttons">
        <button type="button" class="sort-step" data-direction="-1" data-entity="team" data-id="${team.id}" ${index === 0 ? "disabled" : ""} aria-label="Monter">&#8593;</button>
        <button type="button" class="sort-step" data-direction="1" data-entity="team" data-id="${team.id}" ${index === state.teams.length - 1 ? "disabled" : ""} aria-label="Descendre">&#8595;</button>
      </span>`
          : ""
      }
    </div>
  `;
}

function renderEstablishmentOrganizationRow(site, index, canManageLocations) {
  const location = [site.city, site.country].filter(Boolean).join(", ");
  return `
    <div class="organization-sort-row ${site.active ? "" : "is-inactive"}" draggable="${canManageLocations}" data-entity="establishment" data-id="${site.id}">
      ${canManageLocations ? `<button class="drag-handle" type="button" aria-label="Déplacer ${escapeHtml(site.name)}" title="Glisser pour réordonner">&#8942;&#8942;</button>` : ""}
      <button class="organization-item edit-establishment" type="button" data-id="${site.id}">
        <span class="organization-icon site type-${escapeHtml(site.discipline || site.establishment_type || "office")}" style="--item-color:${escapeHtml(site.color || "#64748b")}">${locationIcon(site.discipline || site.establishment_type || "office")}</span>
        <span>
          <strong>${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</strong>
          <small class="organization-meta">
            <span>${translate(establishmentTypeLabels[site.establishment_type] || establishmentTypeLabels.office)}${location ? ` · ${escapeHtml(location)}` : ""}</span>
            ${organizationCountSummary(site, "establishment_id")}
          </small>
        </span>
        <span class="organization-chevron">&rsaquo;</span>
      </button>
      ${
        canManageLocations
          ? `<span class="sort-buttons">
        <button type="button" class="sort-step" data-direction="-1" data-entity="establishment" data-id="${site.id}" ${index === 0 ? "disabled" : ""} aria-label="Monter">&#8593;</button>
        <button type="button" class="sort-step" data-direction="1" data-entity="establishment" data-id="${site.id}" ${index === state.establishments.length - 1 ? "disabled" : ""} aria-label="Descendre">&#8595;</button>
      </span>`
          : ""
      }
    </div>
  `;
}

function renderOrganization() {
  const canManageTeams = canPerformAction("TEAM_MANAGE");
  const canManageLocations = canPerformAction("LOCATION_MANAGE");
  const teamRows = organizationRows(state.teams, "team_id");
  const populatedTeams = teamRows
    .filter((row) => row.hasData)
    .map(({ record, index }) => renderTeamOrganizationRow(record, index, canManageTeams));
  const unusedTeams = teamRows
    .filter((row) => !row.hasData)
    .map(({ record, index }) => renderTeamOrganizationRow(record, index, canManageTeams));
  $("#teams-manager-list").innerHTML =
    populatedTeams.join("") + organizationUnusedGroup("Équipes sans poste ni utilisateur", unusedTeams) ||
    `<p class="helper">Aucune équipe.</p>`;

  const establishmentRows = organizationRows(state.establishments, "establishment_id");
  const populatedEstablishments = establishmentRows
    .filter((row) => row.hasData)
    .map(({ record, index }) => renderEstablishmentOrganizationRow(record, index, canManageLocations));
  const unusedEstablishments = establishmentRows
    .filter((row) => !row.hasData)
    .map(({ record, index }) => renderEstablishmentOrganizationRow(record, index, canManageLocations));
  $("#establishments-manager-list").innerHTML =
    populatedEstablishments.join("") +
      organizationUnusedGroup("Établissements sans poste ni utilisateur", unusedEstablishments) ||
    `<p class="helper">Aucun établissement.</p>`;

  $$(".edit-team").forEach((button) => button.addEventListener("click", () => editTeam(button.dataset.id)));
  $$(".edit-establishment").forEach((button) =>
    button.addEventListener("click", () => editEstablishment(button.dataset.id)),
  );
  bindOrganizationSorting();
}

async function saveOrganizationOrder(entityType) {
  const items = entityType === "team" ? state.teams : state.establishments;
  await inventoryApi.reorderOrganization({ entityType, ids: items.map((item) => item.id) });
}

async function moveOrganizationItem(entityType, id, targetIndex) {
  const items = entityType === "team" ? state.teams : state.establishments;
  const currentIndex = items.findIndex((item) => item.id === id);
  const boundedIndex = Math.max(0, Math.min(targetIndex, items.length));
  if (currentIndex < 0 || currentIndex === boundedIndex) return;
  const [item] = items.splice(currentIndex, 1);
  const adjustedIndex = currentIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
  items.splice(adjustedIndex, 0, item);
  renderOrganization();
  updateOrganizationDatalists();
  try {
    await saveOrganizationOrder(entityType);
    toast("Ordre enregistré.", "success");
  } catch (error) {
    toast(error.message, "error");
    await loadOrganization();
  }
}

function bindOrganizationSorting() {
  const clearDropIndicators = () => {
    $$(".organization-sort-row.drop-before, .organization-sort-row.drop-after").forEach((row) => {
      row.classList.remove("drop-before", "drop-after");
    });
  };
  $$(".sort-step").forEach((button) => {
    button.addEventListener("click", () => {
      const items = button.dataset.entity === "team" ? state.teams : state.establishments;
      const index = items.findIndex((item) => item.id === button.dataset.id);
      moveOrganizationItem(button.dataset.entity, button.dataset.id, index + Number(button.dataset.direction));
    });
  });
  $$(".organization-sort-row").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      row.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${row.dataset.entity}:${row.dataset.id}`);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      clearDropIndicators();
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropIndicators();
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      row.classList.add(after ? "drop-after" : "drop-before");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const [entityType, id] = event.dataTransfer.getData("text/plain").split(":");
      if (entityType !== row.dataset.entity) return;
      const items = entityType === "team" ? state.teams : state.establishments;
      const targetIndex = items.findIndex((item) => item.id === row.dataset.id);
      const after = row.classList.contains("drop-after");
      clearDropIndicators();
      moveOrganizationItem(entityType, id, targetIndex + (after ? 1 : 0));
    });
  });
}

function resetTeamForm() {
  const form = $("#team-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.abbreviation.value = "";
  form.elements.color.value = defaultOrganizationColor(state.teams.length);
  form.elements.active.checked = true;
  $("#team-editor-title").textContent = "Nouvelle équipe";
  $("#delete-team").classList.add("is-hidden");
  renderTeamPreview();
}

function editTeam(id) {
  const team = state.teams.find((item) => item.id === id);
  if (!team) return;
  const form = $("#team-form");
  form.elements.id.value = team.id;
  form.elements.name.value = team.name || "";
  form.elements.abbreviation.value = team.abbreviation || "";
  form.elements.description.value = team.description || "";
  form.elements.color.value = team.color || defaultOrganizationColor(state.teams.findIndex((item) => item.id === id));
  form.elements.active.checked = Boolean(team.active);
  $("#team-editor-title").textContent = team.name;
  $("#delete-team").classList.remove("is-hidden");
  renderTeamPreview();
}

function renderTeamPreview() {
  const form = $("#team-form");
  const name = form.elements.name.value || translate("Nouvelle équipe");
  const info = normalizeTeamInfo(name, form.elements.abbreviation.value);
  $("#team-badge-preview").innerHTML =
    `<span class="${info.badgeClass}" ${badgeStyle(form.elements.color.value)}>${teamIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function resetEstablishmentForm() {
  const form = $("#establishment-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.abbreviation.value = "";
  form.elements.country.value = "France";
  form.elements.establishmentType.value = "office";
  form.elements.discipline.value = "general";
  form.elements.color.value = defaultOrganizationColor(state.establishments.length);
  form.elements.active.checked = true;
  $("#address-search").value = "";
  $("#address-search-status").textContent = "";
  hideAddressSuggestions();
  $("#establishment-editor-title").textContent = "Nouvel établissement";
  $("#delete-establishment").classList.add("is-hidden");
  renderEstablishmentPreview();
  renderEstablishmentMap();
}

function editEstablishment(id) {
  const site = state.establishments.find((item) => item.id === id);
  if (!site) return;
  const form = $("#establishment-form");
  form.elements.id.value = site.id;
  form.elements.name.value = site.name || "";
  form.elements.abbreviation.value = site.abbreviation || "";
  form.elements.establishmentType.value = site.establishment_type || "office";
  form.elements.discipline.value = site.discipline || "general";
  form.elements.color.value =
    site.color || defaultOrganizationColor(state.establishments.findIndex((item) => item.id === id));
  form.elements.address.value = site.address || "";
  form.elements.postalCode.value = site.postal_code || "";
  form.elements.city.value = site.city || "";
  form.elements.country.value = site.country || "France";
  form.elements.latitude.value = site.latitude ?? "";
  form.elements.longitude.value = site.longitude ?? "";
  form.elements.active.checked = Boolean(site.active);
  $("#establishment-editor-title").textContent = site.name;
  $("#delete-establishment").classList.remove("is-hidden");
  renderEstablishmentPreview();
  renderEstablishmentMap();
}

function renderEstablishmentPreview() {
  const form = $("#establishment-form");
  const name = form.elements.name.value || translate("Nouvel établissement");
  const info = locationInfo(
    form.elements.establishmentType.value,
    name,
    form.elements.discipline.value,
    form.elements.abbreviation.value,
  );
  $("#establishment-badge-preview").innerHTML =
    `<span class="${info.badgeClass}" ${badgeStyle(form.elements.color.value)}>${locationIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function renderEstablishmentMap() {
  const form = $("#establishment-form");
  const latitude = Number(form.elements.latitude.value);
  const longitude = Number(form.elements.longitude.value);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !form.elements.latitude.value ||
    !form.elements.longitude.value
  ) {
    $("#establishment-map").innerHTML = `
      <div class="map-empty">
        ${organizationIcon("site")}
        Renseignez latitude et longitude pour afficher la carte.
      </div>
    `;
    return;
  }
  let src;
  let openUrl;
  let linkLabel;
  if (state.mapProvider === "google") {
    const location = encodeURIComponent(`${latitude},${longitude}`);
    src = `https://www.google.com/maps?q=${location}&z=16&output=embed`;
    openUrl = `https://www.google.com/maps/search/?api=1&query=${location}`;
    linkLabel = "Ouvrir dans Google Maps";
  } else {
    const delta = 0.015;
    const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
    src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
    openUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=16/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
    linkLabel = "Ouvrir dans OpenStreetMap";
  }
  $("#establishment-map").innerHTML = `
    <iframe title="Carte de l'établissement" loading="lazy" src="${src}"></iframe>
    <a href="${openUrl}" target="_blank" rel="noopener">${translate(linkLabel)}</a>
  `;
}

async function loadOrganization() {
  const data = await inventoryApi.getAdminOrganization();
  state.teams = data.teams || [];
  state.establishments = data.establishments || [];
  state.users = data.users || [];
  state.mapProvider = data.map_provider === "google" ? "google" : "openstreetmap";
  renderOrganization();
  updateOrganizationDatalists();
  renderEstablishmentMap();
}

async function loadPublicOrganization() {
  const data = await inventoryApi.getPublicOrganization();
  state.teams = data.teams || [];
  state.establishments = data.establishments || [];
  updateOrganizationDatalists();
  restoreCollectionDraft();
  await loadInviteFromUrl();
}

async function loadCpuBenchmarkStats() {
  const data = await inventoryApi.getCpuBenchmarkStats();
  state.cpuBenchmarkStats = data;
  renderValuation();
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
    const data = await inventoryApi.autocompleteAddress(params.toString(), addressSearchController.signal);
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
  $("#address-search-status").textContent = translate("Sélection de l’adresse...");
  hideAddressSuggestions();
  try {
    const params = new URLSearchParams({ placeId, language: state.language });
    const address = await inventoryApi.getAddressDetails(params.toString());
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
  applyPermissions();
  const data = await inventoryApi.listDevices();
  loadAccessTokens().catch((error) => {
    state.accessTokens = [];
    renderAccessTokens();
    toast(`Module tokens indisponible: ${error.message}`);
  });
  loadCollectionInvites().catch((error) => {
    state.collectionInvites = [];
    renderCollectionInvites();
    toast(`Module invitations indisponible: ${error.message}`);
  });
  loadAdminUsers().catch((error) => toast(`Module utilisateurs indisponible: ${error.message}`, "error"));
  loadNotifications().catch((error) => toast(`Module notifications indisponible: ${error.message}`, "error"));
  loadPendingChanges().catch((error) => toast(`Module validations indisponible: ${error.message}`, "error"));
  const organizationPromise = loadOrganization().catch((error) =>
    toast(`Module organisation indisponible: ${error.message}`, "error"),
  );
  loadCpuBenchmarkStats().catch(() => {
    state.cpuBenchmarkStats = null;
  });
  state.devices = data.devices || [];
  const teams = [...new Set(state.devices.map(activeTeamName))];
  const establishments = [...new Set(state.devices.map((d) => d.establishment_name))];
  const os = [...new Set(state.devices.map(normalizedDeviceOsFamily))];
  const models = [...new Set(state.devices.map((d) => d.model))];
  const manufacturers = [
    ...new Set(
      state.devices.map((device) => normalizeManufacturer(device.manufacturer, device.model).manufacturerName),
    ),
  ];
  setOptions($("#filter-team"), teams, "Toutes");
  setOptions($("#filter-establishment"), establishments, "Tous");
  setOptions($("#filter-os"), os, "Tous");
  setOptions($("#filter-model"), models, "Tous");
  setOptions($("#filter-manufacturer"), manufacturers, "Tous");
  applyFilters();
  await organizationPromise;
  setOptions(
    $("#filter-team"),
    state.teams.map((team) => team.name),
    "Toutes",
    true,
  );
  setOptions(
    $("#filter-establishment"),
    state.establishments.map((site) => site.name),
    "Tous",
    true,
  );
  applyFilters();
  resumeActiveEnrichmentJob().catch(() => {});
}

async function runEnrichment({ mode = "refresh", deviceId = "", button = null } = {}) {
  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = translate("Enrichissement...");
  }
  try {
    if (!deviceId) {
      const result = await runEnrichmentBatches({ mode, button });
      toast(enrichmentResultMessage(result));
      await loadAdminData();
      return result;
    }

    const result = await inventoryApi.enrichDevices({
      ...(deviceId ? { deviceId } : {}),
      limit: deviceId ? 1 : 100,
      force: true,
      mode,
      useExternal: mode !== "recalculate",
    });
    toast(enrichmentResultMessage(result));
    await loadAdminData();
    return result;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function runEnrichmentBatches({ mode = "refresh", button = null, onProgress = null } = {}) {
  if (activeEnrichmentRun) return activeEnrichmentRun;
  activeEnrichmentRun = (async () => {
    const started = await inventoryApi.startEnrichmentJob({
      force: true,
      mode,
      useExternal: mode !== "recalculate",
    });
    return await continueEnrichmentJob(started.job, { button, onProgress });
  })();
  try {
    return await activeEnrichmentRun;
  } finally {
    activeEnrichmentRun = null;
  }
}

function updateEnrichmentButtonProgress(button, job) {
  if (!job) return;
  const total = Math.max(Number(job.totalCount || 0), 1);
  const processed = Math.min(Number(job.processedCount || 0), total);
  if (button) button.textContent = `${translate("Enrichissement...")} ${processed}/${total}`;
  updateEnrichmentWorkflowJobProgress(job);
}

function enrichmentJobResult(job, results = []) {
  return {
    ok: job?.status !== "failed",
    enriched: Number(job?.enrichedCount || 0),
    skipped: Number(job?.skippedCount || 0),
    failed: Number(job?.failedCount || 0),
    processed: Number(job?.processedCount || 0),
    total: Number(job?.totalCount || 0),
    batches: 0,
    ebayResultCount: Number(job?.ebayResultCount || 0),
    providerStatuses: job?.providerStatuses || {},
    results,
  };
}

async function continueEnrichmentJob(initialJob, { button = null, onProgress = null } = {}) {
  let job = initialJob;
  const results = [];
  const batchSize = enrichmentDomain.enrichmentBatchSizeForJob(job, ENRICHMENT_BATCH_SIZE);
  const maxBatches = Math.ceil(Math.max(Number(job?.totalCount || state.devices.length || 0), 1) / batchSize) + 10;

  updateEnrichmentButtonProgress(button, job);
  onProgress?.(job);

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    if (!job || !["queued", "running"].includes(job.status)) break;
    updateEnrichmentButtonProgress(button, job);
    const batch = await inventoryApi.processEnrichmentJob({
      jobId: job.id,
      limit: batchSize,
    });
    if (Array.isArray(batch.results)) results.push(...batch.results);
    job = batch.job;
    updateEnrichmentButtonProgress(button, job);
    onProgress?.(job);
    if (!job || !["queued", "running"].includes(job.status)) break;
  }

  return enrichmentJobResult(job, results);
}

async function resumeActiveEnrichmentJob() {
  if (activeEnrichmentRun || unifiedEnrichmentRunActive || !state.adminToken || !canPerformAction("DEVICE_EDIT")) {
    return;
  }
  const storedWorkflow = readEnrichmentWorkflowState();
  const active = await inventoryApi.getActiveEnrichmentJob();
  if (storedWorkflow?.active) {
    if (active.job) {
      const resumeSteps = resumedEnrichmentWorkflowSteps(active.job, storedWorkflow.steps);
      await runUnifiedEnrichment({ resumeJob: active.job, resumeSteps });
      return;
    }
    const runningStep = storedWorkflow.steps?.find((step) => step.status === "running");
    if (runningStep) {
      const resumeSteps = storedWorkflow.steps.map((step) =>
        step.id === runningStep.id ? { ...step, status: "success" } : step,
      );
      await runUnifiedEnrichment({ resumeFromStepId: runningStep.id, resumeSteps });
      return;
    }
    clearEnrichmentWorkflowState();
  }
  if (!active.job) return;
  const standaloneSteps = resumedEnrichmentWorkflowSteps(active.job);
  renderEnrichmentWorkflow(standaloneSteps);
  const button = $("#valuation-enrich-fleet") || $("#valuation-enrich-all");
  if (button) {
    button.disabled = true;
    updateEnrichmentButtonProgress(button, active.job);
  }
  activeEnrichmentRun = continueEnrichmentJob(active.job, { button });
  try {
    const result = await activeEnrichmentRun;
    const completedSteps = standaloneSteps.map((step) =>
      step.status === "running" ? { ...step, status: "success", result: workflowResultCounts(result) } : step,
    );
    renderEnrichmentWorkflow(completedSteps, workflowResultFromStates(completedSteps));
    toast(enrichmentResultMessage(result));
    await loadAdminData();
  } finally {
    activeEnrichmentRun = null;
    if (button) {
      button.disabled = false;
      button.textContent = translate("Enrichir et recalculer le parc");
    }
  }
}

function enrichmentResultMessage(result) {
  const rows = Array.isArray(result?.results) ? result.results : [];
  const ebayCount = Number(
    result?.ebayResultCount ?? rows.reduce((sum, item) => sum + Number(item?.providerCounts?.ebay || 0), 0),
  );
  const jobStatuses = Array.isArray(result?.providerStatuses?.ebay) ? result.providerStatuses.ebay : [];
  const statuses = [
    ...new Set([...jobStatuses, ...rows.map((item) => item?.providerStatus?.ebay?.status).filter(Boolean)]),
  ];
  const statusLabel = statuses.length ? statuses.join(", ") : "disabled";
  if (state.language === "en") {
    return `${result?.enriched || 0} enriched, ${result?.skipped || 0} skipped, ${result?.failed || 0} failed. eBay: ${ebayCount} result(s) (${statusLabel}).`;
  }
  return `${result?.enriched || 0} enrichi(s), ${result?.skipped || 0} ignoré(s), ${result?.failed || 0} en échec. eBay : ${ebayCount} résultat(s) (${statusLabel}).`;
}

async function importCpuBenchmarkFile(file) {
  if (!file) return;
  const csv = await file.text();
  const result = await inventoryApi.importCpuBenchmarks({ csv });
  toast(
    state.language === "en"
      ? `${result.imported} CPU benchmark(s) imported, ${result.rejected} rejected.`
      : `${result.imported} benchmark(s) CPU importé(s), ${result.rejected} rejeté(s).`,
  );
  await loadCpuBenchmarkStats();
}

async function refreshCpuReleaseDates(button) {
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = translate("Actualisation...");
  try {
    const result = await inventoryApi.refreshCpuReleaseDates({ limit: 120 });
    const message =
      state.language === "en"
        ? `${result.updated || 0} CPU date(s) updated: ${result.official || 0} official, ${result.observed || 0} observed by PassMark, ${result.fallback || 0} estimated.`
        : `${result.updated || 0} date(s) CPU mise(s) à jour : ${result.official || 0} officielles, ${result.observed || 0} observées via PassMark, ${result.fallback || 0} estimées.`;
    toast(message);
    await loadCpuBenchmarkStats();
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

async function syncCpuBenchmarks(button) {
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = translate("Actualisation...");
  try {
    const result = await inventoryApi.syncCpuBenchmarks({ limit: 250, recalculate: true, recalculateLimit: 120 });
    const message =
      state.language === "en"
        ? `${result.matched || 0} CPU score(s) matched, ${result.imported || 0} imported, ${result.updated || 0} updated, ${result.recalculated || 0} device(s) recalculated.`
        : `${result.matched || 0} score(s) CPU trouvé(s), ${result.imported || 0} importé(s), ${result.updated || 0} mis à jour, ${result.recalculated || 0} poste(s) recalculé(s).`;
    toast(message);
    await loadAdminData();
    await loadCpuBenchmarkStats();
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
}

const enrichmentStepLabels = {
  benchmarks: "Vérification des benchmarks CPU",
  scores: "Synchronisation des scores CPU",
  releaseDates: "Résolution des dates de sortie CPU",
  enrichDevices: "Enrichissement des postes éligibles",
  recalculateValues: "Recalcul des valeurs actuelles",
  refreshDashboard: "Actualisation des indicateurs",
};

const enrichmentStepIds = Object.keys(enrichmentStepLabels);
const enrichmentStoredResultKeys = [
  "analyzed",
  "updated",
  "skipped",
  "failures",
  "processed",
  "total",
  "enriched",
  "failed",
  "recalculated",
  "importedCount",
  "bundledCount",
  "matched",
  "unmatched",
  "official",
  "observed",
  "fallback",
];

function sanitizeEnrichmentWorkflowSteps(steps = []) {
  return steps.map((step) => {
    const stored = { id: step.id, status: step.status };
    if (step.error) stored.error = String(step.error);
    if (step.result) {
      stored.result = Object.fromEntries(
        enrichmentStoredResultKeys
          .filter((key) => step.result[key] !== undefined)
          .map((key) => [key, Number(step.result[key] || 0)]),
      );
    }
    return stored;
  });
}

function readEnrichmentWorkflowState() {
  try {
    const value = JSON.parse(localStorage.getItem(ENRICHMENT_WORKFLOW_STATE_KEY) || "null");
    return value && typeof value === "object" && Array.isArray(value.steps) ? value : null;
  } catch {
    return null;
  }
}

function persistEnrichmentWorkflowState(steps) {
  const existing = readEnrichmentWorkflowState();
  localStorage.setItem(
    ENRICHMENT_WORKFLOW_STATE_KEY,
    JSON.stringify({
      active: true,
      startedAt: existing?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: sanitizeEnrichmentWorkflowSteps(steps),
    }),
  );
}

function clearEnrichmentWorkflowState() {
  localStorage.removeItem(ENRICHMENT_WORKFLOW_STATE_KEY);
}

function enrichmentStepIdForJob(job) {
  return job?.mode === "recalculate" ? "recalculateValues" : "enrichDevices";
}

function resumedEnrichmentWorkflowSteps(job, storedSteps = []) {
  return enrichmentDomain.resumedEnrichmentStepStates(enrichmentStepIds, enrichmentStepIdForJob(job), storedSteps);
}

function mergeResumedEnrichmentSteps(steps, resumeSteps = []) {
  return enrichmentDomain.mergeSuccessfulEnrichmentSteps(steps, resumeSteps);
}

function workflowResultFromStates(steps) {
  return {
    steps,
    failedStepIds: steps.filter((step) => step.status === "failed").map((step) => step.id),
    summary: enrichmentDomain.summarizeEnrichmentSteps(steps),
  };
}

function enrichmentJobProgressText(job) {
  const total = Math.max(Number(job?.totalCount || 0), 1);
  const processed = Math.min(Number(job?.processedCount || 0), total);
  const updated = Number(job?.enrichedCount || 0);
  const skipped = Number(job?.skippedCount || 0);
  const failed = Number(job?.failedCount || 0);
  if (state.language === "en") {
    return `${processed}/${total} devices · ${updated} updated · ${skipped} skipped · ${failed} failed`;
  }
  return `${processed}/${total} postes · ${updated} mis à jour · ${skipped} ignorés · ${failed} en échec`;
}

function enrichmentStepDetail(step) {
  if (step.error) return localizeErrorMessage(step.error, state.language);
  if (step.status === "running" && enrichmentStepIdForJob(activeEnrichmentJobProgress) === step.id) {
    return enrichmentJobProgressText(activeEnrichmentJobProgress);
  }
  const result = step.result;
  if (!result) return "";
  if (step.id === "benchmarks") {
    return state.language === "en"
      ? `${result.importedCount || 0} imported · ${result.bundledCount || 0} bundled`
      : `${result.importedCount || 0} importés · ${result.bundledCount || 0} intégrés`;
  }
  if (step.id === "scores") {
    return state.language === "en"
      ? `${result.matched || 0} matched · ${result.updated || 0} updated · ${result.unmatched || 0} unmatched`
      : `${result.matched || 0} trouvés · ${result.updated || 0} mis à jour · ${result.unmatched || 0} non trouvés`;
  }
  if (step.id === "releaseDates") {
    return state.language === "en"
      ? `${result.updated || 0} updated · ${result.official || 0} official · ${result.observed || 0} observed · ${result.fallback || 0} estimated`
      : `${result.updated || 0} mises à jour · ${result.official || 0} officielles · ${result.observed || 0} observées · ${result.fallback || 0} estimées`;
  }
  if (["enrichDevices", "recalculateValues"].includes(step.id)) {
    return state.language === "en"
      ? `${result.analyzed || 0} analyzed · ${result.updated || 0} updated · ${result.skipped || 0} skipped · ${result.failures || 0} failed`
      : `${result.analyzed || 0} analysés · ${result.updated || 0} mis à jour · ${result.skipped || 0} ignorés · ${result.failures || 0} en échec`;
  }
  return "";
}

function updateEnrichmentWorkflowJobProgress(job) {
  if (!job) return;
  activeEnrichmentJobProgress = job;
  const stepId = enrichmentStepIdForJob(job);
  const detail = $(`[data-enrichment-step-detail="${stepId}"]`);
  if (detail) detail.textContent = enrichmentJobProgressText(job);
  const container = $("#enrichment-workflow");
  if (!container || container.classList.contains("is-hidden")) return;
  const totalSteps = enrichmentStepIds.length;
  const completed = renderedEnrichmentWorkflowSteps.filter((step) =>
    ["success", "failed"].includes(step.status),
  ).length;
  const total = Math.max(Number(job.totalCount || 0), 1);
  const processed = Math.min(Number(job.processedCount || 0), total);
  const jobProgress = Math.max(0, Math.min(1, processed / total));
  $("#enrichment-progress").value = Math.min(totalSteps, completed + jobProgress);
  $("#enrichment-progress-value").textContent = `${completed} / ${totalSteps} · ${processed} / ${total}`;
}

function workflowResultCounts(result, overrides = {}) {
  return {
    ...result,
    analyzed: Number(overrides.analyzed ?? result?.processed ?? result?.total ?? 0),
    updated: Number(overrides.updated ?? result?.updated ?? result?.enriched ?? result?.recalculated ?? 0),
    skipped: Number(overrides.skipped ?? result?.skipped ?? 0),
    failures: Number(overrides.failures ?? result?.failed ?? result?.failures ?? 0),
  };
}

function createEnrichmentWorkflowSteps() {
  return [
    {
      id: "benchmarks",
      run: async () => {
        const result = await inventoryApi.getCpuBenchmarkStats();
        state.cpuBenchmarkStats = result;
        renderValuation();
        return workflowResultCounts(result);
      },
    },
    {
      id: "scores",
      run: async () => {
        const result = await inventoryApi.syncCpuBenchmarks({ limit: 250, recalculate: false });
        return workflowResultCounts(result, {
          analyzed: Number(result.matched || 0) + Number(result.unmatched || 0),
          updated: result.updated,
          failures: result.failed,
        });
      },
    },
    {
      id: "releaseDates",
      run: async () => {
        const result = await inventoryApi.refreshCpuReleaseDates({ limit: 120 });
        return workflowResultCounts(result, {
          analyzed: Number(result.updated || 0) + Number(result.skipped || 0),
          updated: result.updated,
        });
      },
    },
    {
      id: "enrichDevices",
      run: async () => workflowResultCounts(await runEnrichmentBatches({ mode: "refresh" })),
    },
    {
      id: "recalculateValues",
      run: async () => workflowResultCounts(await runEnrichmentBatches({ mode: "recalculate" })),
    },
    {
      id: "refreshDashboard",
      run: async () => {
        await loadAdminData();
        await loadCpuBenchmarkStats();
        return {};
      },
    },
  ];
}

function enrichmentStatusLabel(status) {
  const labels = {
    pending: "En attente",
    running: "En cours",
    success: "Terminée",
    failed: "Échec",
    skipped: "Non relancée",
  };
  return translate(labels[status] || status);
}

function renderEnrichmentWorkflow(steps = [], result = null) {
  const container = $("#enrichment-workflow");
  if (!container) return;
  renderedEnrichmentWorkflowSteps = steps.map((step) => ({ ...step }));
  container.classList.remove("is-hidden");
  const totalSteps = Object.keys(enrichmentStepLabels).length;
  const completed = steps.filter((step) => ["success", "failed"].includes(step.status)).length;
  $("#enrichment-progress").value = completed;
  $("#enrichment-progress").max = totalSteps;
  $("#enrichment-progress-value").textContent = `${completed} / ${totalSteps}`;
  $("#enrichment-steps").innerHTML = steps
    .map((step) => {
      const detail = enrichmentStepDetail(step);
      return `
        <li class="status-${escapeHtml(step.status)}">
          <span class="enrichment-step-marker" aria-hidden="true"></span>
          <span>
            <strong>${translate(enrichmentStepLabels[step.id] || step.id)}</strong>
            <small class="enrichment-step-detail ${step.error ? "is-error" : ""}" data-enrichment-step-detail="${escapeHtml(step.id)}" ${detail ? "" : "hidden"}>${escapeHtml(detail)}</small>
          </span>
          <em>${escapeHtml(enrichmentStatusLabel(step.status))}</em>
        </li>
      `;
    })
    .join("");

  if (activeEnrichmentJobProgress) updateEnrichmentWorkflowJobProgress(activeEnrichmentJobProgress);

  const summary = $("#enrichment-summary");
  if (!result) {
    summary.classList.add("is-hidden");
  } else {
    const values = [
      ["Postes analysés", result.summary.analyzed],
      ["Postes mis à jour", result.summary.updated],
      ["Postes ignorés", result.summary.skipped],
      ["Échecs", result.summary.failures],
    ];
    summary.innerHTML = values
      .map(
        ([label, value]) =>
          `<span><small>${translate(label)}</small><strong>${formatFleetNumber(value)}</strong></span>`,
      )
      .join("");
    summary.classList.remove("is-hidden");
  }
  $("#retry-enrichment").classList.toggle("is-hidden", !result?.failedStepIds?.length);
}

function setUnifiedEnrichmentBusy(busy) {
  const primary = $("#valuation-enrich-fleet");
  if (primary) {
    primary.disabled = busy;
    primary.textContent = translate(busy ? "Enrichissement du parc en cours..." : "Enrichir et recalculer le parc");
  }
  [
    "#valuation-enrich-all",
    "#valuation-recalculate",
    "#refresh-cpu-release-dates",
    "#sync-cpu-benchmarks",
    "#import-cpu-benchmarks",
  ].forEach((selector) => {
    const button = $(selector);
    if (button) button.disabled = busy;
  });
}

async function runUnifiedEnrichment({
  retryFailed = false,
  resumeJob = null,
  resumeFromStepId = "",
  resumeSteps = [],
} = {}) {
  const steps = createEnrichmentWorkflowSteps();
  const requestedResumeStepId = resumeJob ? enrichmentStepIdForJob(resumeJob) : resumeFromStepId;
  const resumeIndex = enrichmentStepIds.indexOf(requestedResumeStepId);
  const onlyStepIds = resumeIndex >= 0 ? enrichmentStepIds.slice(resumeIndex + (resumeJob ? 0 : 1)) : undefined;
  const initialStates = mergeResumedEnrichmentSteps(
    steps.map((step) => ({
      id: step.id,
      status: onlyStepIds && !onlyStepIds.includes(step.id) ? "skipped" : "pending",
    })),
    resumeSteps,
  );

  unifiedEnrichmentRunActive = true;
  setUnifiedEnrichmentBusy(true);
  persistEnrichmentWorkflowState(initialStates);
  renderEnrichmentWorkflow(initialStates);
  try {
    const options = {
      ...(onlyStepIds ? { onlyStepIds } : {}),
      onChange: (states) => {
        const displayStates = mergeResumedEnrichmentSteps(states, resumeSteps);
        persistEnrichmentWorkflowState(displayStates);
        renderEnrichmentWorkflow(displayStates);
      },
    };
    const result =
      retryFailed && lastEnrichmentWorkflow
        ? await enrichmentWorkflowCoordinator.retryFailed(lastEnrichmentWorkflow, steps, options)
        : await enrichmentWorkflowCoordinator.run(steps, options);
    const displaySteps = mergeResumedEnrichmentSteps(result.steps, resumeSteps);
    const displayResult = workflowResultFromStates(displaySteps);
    lastEnrichmentWorkflow = displayResult;
    if (retryFailed) {
      try {
        await loadAdminData();
      } catch (error) {
        toast(error.message, "error");
      }
    }
    renderEnrichmentWorkflow(displaySteps, displayResult);
    if (!displayResult.failedStepIds.length) clearEnrichmentWorkflowState();
    toast(
      displayResult.failedStepIds.length
        ? "Enrichissement terminé avec des étapes en échec."
        : "Enrichissement et recalcul terminés.",
      displayResult.failedStepIds.length ? "warning" : "success",
    );
    return displayResult;
  } finally {
    unifiedEnrichmentRunActive = false;
    activeEnrichmentJobProgress = null;
    setUnifiedEnrichmentBusy(false);
  }
}

function bindEvents() {
  window.addEventListener("popstate", () => restoreRoute({ updateUrl: false }));

  $("#download-script").href = CONFIG.scriptUrl;
  loadCollectorReleases().catch(() => updateCollectorDownloadUi());
  setTheme(state.themePreference, false);
  $("#theme-toggle").addEventListener("click", () => {
    const order = ["system", "light", "dark"];
    const currentIndex = order.indexOf(state.themePreference);
    setTheme(order[(currentIndex + 1) % order.length]);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.themePreference === "system") setTheme("system", false);
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
    closeNotificationPanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    $("#language-menu").classList.add("is-hidden");
    $("#language-toggle").setAttribute("aria-expanded", "false");
    closeNotificationPanel();
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setMainView(tab.dataset.view);
    });
  });

  $$(".admin-nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      setAdminView(button.dataset.adminView);
      if (button.dataset.adminView === "organization") {
        loadOrganization().catch((error) => toast(error.message));
      }
      if (button.dataset.adminView === "pending") {
        Promise.all([loadOrganization(), loadPendingChanges()]).catch((error) => toast(error.message));
      }
    });
  });

  $("#collect-form").addEventListener("input", () => {
    toggleProposalFields();
    saveCollectionDraft();
  });
  $("#collect-form").addEventListener("change", () => {
    toggleProposalFields();
    saveCollectionDraft();
  });

  $("#collect-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateCollectionForm(event.currentTarget)) {
      saveCollectionDraft();
      toast("Veuillez compléter les champs requis.", "error");
      return;
    }
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...form };
    if (payload.team === "__other__") payload.team = "";
    if (payload.establishment === "__other__") payload.establishment = "";
    payload.apiUrl = CONFIG.apiBaseUrl;
    payload.language = state.language;
    payload.theme = state.themePreference;
    try {
      const hasInvite = Boolean(state.currentInviteCode || form.inviteCode);
      const result = hasInvite
        ? await inventoryApi.createInvitePrefill(state.currentInviteCode || form.inviteCode, payload)
        : await inventoryApi.createPrefill(payload, form.accessToken);
      $("#command-empty").classList.add("is-hidden");
      $("#command-result").classList.remove("is-hidden");
      $("#collector-prefill-code").textContent = result.prefillCode || "";
      state.prefillCode = result.prefillCode || "";
      state.collectorLaunchUrl = result.launchUrl || "";
      state.prefillPayload = {
        ...payload,
        prefillCode: result.prefillCode || "",
        accessToken:
          result.accessToken ||
          (hasInvite
            ? `invite_${state.currentInviteCode || form.inviteCode || result.inviteCode || ""}`
            : form.accessToken || ""),
        expiresAt: result.expiresAt || "",
        apiUrl: result.apiUrl || CONFIG.apiBaseUrl,
        launchUrl: result.launchUrl || "",
      };
      $("#powershell-command").textContent =
        state.language === "en"
          ? "Use the native collector app. Install it once, then open it from this page to load the profile automatically. The script fallback is reserved for IT support."
          : "Utilisez l'application collecteur native. Installez-la une fois, puis ouvrez-la depuis cette page pour charger le profil automatiquement. Le script fallback reste réservé au support IT.";
      updateCollectorDownloadUi();
      toast(
        hasKnownCompatibleCollector()
          ? state.language === "en"
            ? "Preparation complete. Open the collector."
            : "Préparation terminée. Ouvrez le collecteur."
          : translate("Préparation terminée. Téléchargez le collecteur."),
        "success",
      );
    } catch (error) {
      saveCollectionDraft();
      toast(error.message, "error");
    }
  });

  $("#copy-command").addEventListener("click", async () => {
    await copyText($("#powershell-command").textContent, "Commande copiée.", "Aucune commande à copier");
  });
  $("#copy-collector-token")?.addEventListener("click", async () => {
    await copyText($("#collector-token")?.textContent, "Token copié.", "Aucun token à copier");
  });
  $("#copy-prefill-code").addEventListener("click", async () => {
    await copyText($("#collector-prefill-code").textContent, "Code copié.", "Aucun code à copier");
  });
  $("#copy-ubuntu-command")?.addEventListener("click", async () => {
    await copyText(
      $("#ubuntu-install-command")?.textContent,
      "Commande Ubuntu copiee.",
      "Aucune commande Ubuntu à copier",
    );
  });
  $("#copy-macos-command")?.addEventListener("click", async () => {
    await copyText(
      $("#macos-install-command")?.textContent,
      "Commande macOS copiee.",
      "Aucune commande macOS à copier",
    );
  });
  $("#download-prefill-file").addEventListener("click", downloadPrefillFile);
  $("#collector-download-primary")?.addEventListener("click", () => {
    rememberCollectorDownload();
    window.setTimeout(updateCollectorDownloadUi, 250);
  });
  $("#collector-open-app")?.addEventListener("click", async () => {
    if (!state.collectorLaunchUrl) {
      toast("Aucun code de pré-remplissage", "error");
      return;
    }
    if (state.detectedPlatform === "macos") {
      downloadPrefillFile({ silent: true, revokeDelayMs: 5000 });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
    if (state.detectedPlatform === "windows") rememberCollectorLaunch();
    updateCollectorDownloadUi();
    window.location.href = state.collectorLaunchUrl;
    toast(
      state.language === "en"
        ? "Opening the collector. If nothing happens, install it first."
        : "Ouverture du collecteur. Si rien ne se passe, installez-le d'abord.",
      "success",
    );
  });
  $("#copy-script").addEventListener("click", async () => {
    if (!state.scriptPreviewText) await loadScriptPreview();
    await copyText(state.scriptPreviewText, "Script copié.", "Aucun script à copier");
  });
  $("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await inventoryApi.authenticateAdmin(form);
      state.adminToken = result.token;
      state.currentAdmin = result.user || null;
      localStorage.setItem("it_inventory_admin_token", state.adminToken);
      localStorage.setItem("it_inventory_admin_user", JSON.stringify(state.currentAdmin));
      $("#admin-login").classList.add("is-hidden");
      $("#admin-dashboard").classList.remove("is-hidden");
      applyPermissions();
      await loadAdminData();
    } catch (error) {
      toast(error.message);
    }
  });

  $("#logout-admin").addEventListener("click", () => {
    state.adminToken = "";
    state.currentAdmin = null;
    localStorage.removeItem("it_inventory_admin_token");
    localStorage.removeItem("it_inventory_admin_user");
    $("#admin-login").classList.remove("is-hidden");
    $("#admin-dashboard").classList.add("is-hidden");
  });

  $("#time-format-toggle").addEventListener("click", () => {
    const formats = ["auto", "24h", "12h"];
    const currentIndex = formats.indexOf(state.timeFormatPreference);
    state.timeFormatPreference = formats[(currentIndex + 1) % formats.length];
    localStorage.setItem("it_inventory_time_format", state.timeFormatPreference);
    updateTimeFormatButton();
    renderNotifications();
    if (state.selectedDetail) renderDetail(state.selectedDetail, state.selectedScans, state.selectedHistory);
    applyFilters();
  });

  $("#weather-toggle").addEventListener("click", () => {
    state.temperatureUnit = state.temperatureUnit === "celsius" ? "fahrenheit" : "celsius";
    localStorage.setItem("it_inventory_temperature_unit", state.temperatureUnit);
    loadWeather();
  });

  $("#cancel-retire").addEventListener("click", () => {
    pendingRetirement?.resolve("");
    pendingRetirement = null;
  });
  $("#confirm-retire").addEventListener("click", (event) => {
    const note = $("#retire-note").value.trim();
    if (!note) {
      event.preventDefault();
      toast("Note de sortie du parc requise.", "warning");
      $("#retire-note").focus();
      return;
    }
    pendingRetirement?.resolve(note);
    pendingRetirement = null;
  });
  $("#retire-dialog").addEventListener("close", () => {
    if (pendingRetirement) {
      pendingRetirement.resolve("");
      pendingRetirement = null;
    }
  });

  $("#refresh-admin").addEventListener("click", () => loadAdminData().catch((error) => toast(error.message)));
  $("#refresh-tokens").addEventListener("click", () => {
    loadAccessTokens().catch((error) => toast(error.message));
    loadCollectionInvites().catch((error) => toast(error.message));
  });
  $("#refresh-pending-changes").addEventListener("click", () =>
    loadPendingChanges().catch((error) => toast(error.message)),
  );
  $("#new-team").addEventListener("click", resetTeamForm);
  $("#new-establishment").addEventListener("click", resetEstablishmentForm);
  ["name", "abbreviation", "color"].forEach((name) => {
    $("#team-form").elements[name].addEventListener("input", renderTeamPreview);
  });
  $("#reset-team-color").addEventListener("click", () => {
    const form = $("#team-form");
    const id = form.elements.id.value;
    const index = id ? state.teams.findIndex((team) => team.id === id) : state.teams.length;
    form.elements.color.value = defaultOrganizationColor(index < 0 ? state.teams.length : index);
    renderTeamPreview();
  });
  ["name", "abbreviation", "discipline", "establishmentType", "color"].forEach((name) => {
    $("#establishment-form").elements[name].addEventListener("input", renderEstablishmentPreview);
  });
  $("#reset-establishment-color").addEventListener("click", () => {
    const form = $("#establishment-form");
    const id = form.elements.id.value;
    const index = id ? state.establishments.findIndex((site) => site.id === id) : state.establishments.length;
    form.elements.color.value = defaultOrganizationColor(index < 0 ? state.establishments.length : index);
    renderEstablishmentPreview();
  });
  $("#delete-team").addEventListener("click", async () => {
    const form = $("#team-form");
    const id = form.elements.id.value;
    if (!id) return;
    const team = state.teams.find((item) => item.id === id);
    const confirmed = await confirmAction({
      message:
        state.language === "en"
          ? `Delete the team "${team?.name || form.elements.name.value}"? Deletion will be blocked if computers or users are still assigned.`
          : `Supprimer l’équipe "${team?.name || form.elements.name.value}" ? La suppression sera bloquée si des postes ou utilisateurs y sont encore affectés.`,
    });
    if (!confirmed) return;
    try {
      await inventoryApi.deleteTeam(id);
      await loadOrganization();
      resetTeamForm();
      toast("Équipe supprimée.", "success");
    } catch (error) {
      if (error.details?.code === "ENTITY_IN_USE") {
        openReassignment("team", id, error.details.références || {});
      } else {
        toast(error.message, "error");
      }
    }
  });
  $("#delete-establishment").addEventListener("click", async () => {
    const form = $("#establishment-form");
    const id = form.elements.id.value;
    if (!id) return;
    const site = state.establishments.find((item) => item.id === id);
    const confirmed = await confirmAction({
      message:
        state.language === "en"
          ? `Delete the location "${site?.name || form.elements.name.value}"? Deletion will be blocked if computers or users are still assigned.`
          : `Supprimer l’établissement "${site?.name || form.elements.name.value}" ? La suppression sera bloquée si des postes ou utilisateurs y sont encore affectés.`,
    });
    if (!confirmed) return;
    try {
      await inventoryApi.deleteEstablishment(id);
      await loadOrganization();
      resetEstablishmentForm();
      toast("Établissement supprimé.", "success");
    } catch (error) {
      if (error.details?.code === "ENTITY_IN_USE") {
        openReassignment("establishment", id, error.details.références || {});
      } else {
        toast(error.message, "error");
      }
    }
  });
  $("#cancel-reassign").addEventListener("click", () => {
    pendingReassignment = null;
    $("#reassign-dialog").close();
  });
  $("#reassign-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingReassignment) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await inventoryApi.reassignOrganization(values);
      if (pendingReassignment.entityType === "team") {
        await inventoryApi.deleteTeam(pendingReassignment.sourceId);
      } else {
        await inventoryApi.deleteEstablishment(pendingReassignment.sourceId);
      }
      $("#reassign-dialog").close();
      pendingReassignment = null;
      await loadAdminData();
      resetTeamForm();
      resetEstablishmentForm();
      toast("Réaffectation terminée.", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
  $("#team-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const id = values.id;
    const payload = {
      name: values.name,
      abbreviation: values.abbreviation,
      description: values.description,
      color: values.color,
      active: form.elements.active.checked,
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await inventoryApi.saveTeam(id, payload);
      await loadAdminData();
      resetTeamForm();
      toast(
        result.duplicateAbbreviation
          ? "Abréviation déjà utilisée par une autre équipe."
          : id
            ? "Équipe mise à jour."
            : "Équipe créée.",
        result.duplicateAbbreviation ? "warning" : "info",
      );
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
      abbreviation: values.abbreviation,
      establishmentType: values.establishmentType,
      discipline: values.discipline,
      color: values.color,
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
      const result = await inventoryApi.saveEstablishment(id, payload);
      await loadAdminData();
      resetEstablishmentForm();
      toast(
        result.duplicateAbbreviation
          ? "Abréviation déjà utilisée par un autre établissement."
          : id
            ? "Établissement mis à jour."
            : "Établissement créé.",
        result.duplicateAbbreviation ? "warning" : "info",
      );
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
  $("#invite-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      label: values.label,
      durationHours: Number(values.durationHours),
      maxUses: values.maxUses ? Number(values.maxUses) : null,
      email: values.email,
      firstName: values.firstName,
      lastName: values.lastName,
      team: values.team,
      establishment: values.establishment,
      language: state.language,
      theme: document.documentElement.dataset.theme || "light",
    };
    try {
      const result = await inventoryApi.createCollectionInvite(payload);
      const inviteUrl = result.invite.inviteUrl || result.invite.invite_url;
      state.rawInviteUrls[result.invite.id] = inviteUrl;
      $("#generated-invite-url").textContent = displayInviteUrl(inviteUrl);
      $("#invite-result").classList.remove("is-hidden");
      form.reset();
      updateOrganizationDatalists();
      await loadCollectionInvites();
      toast("Invitation créée.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#copy-invite-url").addEventListener("click", async () => {
    await copyText($("#generated-invite-url").textContent, "Lien copié.", "Aucun lien à copier");
  });
  $("#token-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const payload = {
      label: values.label,
      durationHours: Number(values.durationHours),
      maxUses: values.maxUses ? Number(values.maxUses) : null,
    };
    try {
      const result = await inventoryApi.createAccessToken(payload);
      state.rawAccessTokens[result.record.id] = result.token;
      $("#generated-token").textContent = result.token;
      $("#token-result").classList.remove("is-hidden");
      form.reset();
      await loadAccessTokens();
      toast("Token généré.");
    } catch (error) {
      toast(error.message);
    }
  });
  $("#copy-token").addEventListener("click", async () => {
    await copyText($("#generated-token").textContent, "Token copié.", "Aucun token à copier");
  });
  $("#new-admin-user").addEventListener("click", resetAdminUserForm);
  $("#generate-admin-password").addEventListener("click", () => {
    const passwordInput = $("#admin-user-form").elements.password;
    passwordInput.value = generateStrongPassword();
    passwordInput.type = "text";
    passwordInput.focus();
    passwordInput.select();
    toast("Mot de passe généré.", "success");
  });
  $("#copy-admin-password").addEventListener("click", async () => {
    await copyText($("#admin-user-form").elements.password.value, "Password copied", "No password to copy");
  });
  $("#admin-user-form").elements.isActive.addEventListener("change", syncAdminUserActiveLabel);
  $("#admin-user-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const id = values.id;
    const payload = {
      username: values.username,
      displayName: values.displayName,
      email: values.email || null,
      role: values.role,
      password: values.password || undefined,
      isActive: form.elements.isActive.checked,
    };
    try {
      await inventoryApi.saveAdminUser(id, payload);
      await loadAdminUsers();
      resetAdminUserForm();
      toast(id ? "Compte mis à jour." : "Compte créé.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#delete-admin-user").addEventListener("click", async () => {
    const id = $("#admin-user-form").elements.id.value;
    if (!id) return;
    const user = state.adminUsers.find((item) => item.id === id);
    const confirmed = await confirmAction({
      message:
        state.language === "en"
          ? `Delete account "${user?.username || id}"?`
          : `Supprimer le compte "${user?.username || id}" ?`,
    });
    if (!confirmed) return;
    try {
      await inventoryApi.deleteAdminUser(id);
      await loadAdminUsers();
      resetAdminUserForm();
      toast("Compte supprimé.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#notifications-bell").addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = $("#notification-panel");
    const open = panel.classList.contains("is-hidden");
    panel.classList.toggle("is-hidden", !open);
    $("#notifications-bell").setAttribute("aria-expanded", String(open));
    if (open) loadNotifications().catch((error) => toast(error.message, "error"));
  });
  $("#notification-panel").addEventListener("click", (event) => event.stopPropagation());
  $("#view-all-notifications").addEventListener("click", () => {
    closeNotificationPanel();
    setMainView("admin");
    setAdminView("notifications");
    loadNotifications().catch((error) => toast(error.message, "error"));
  });
  $("#mark-all-notifications").addEventListener("click", async () => {
    try {
      await inventoryApi.markAllNotificationsRead();
      await loadNotifications();
      toast("Notifications mises à jour.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  ["notification-severity-filter", "notification-read-filter"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderNotifications);
  });
  $("#valuation-enrich-fleet").addEventListener("click", () =>
    runUnifiedEnrichment().catch((error) => toast(error.message, "error")),
  );
  $("#retry-enrichment").addEventListener("click", () =>
    runUnifiedEnrichment({ retryFailed: true }).catch((error) => toast(error.message, "error")),
  );
  $("#valuation-enrich-all").addEventListener("click", () =>
    runEnrichment({ mode: "refresh", button: $("#valuation-enrich-all") }).catch((error) => toast(error.message)),
  );
  $("#valuation-recalculate").addEventListener("click", () =>
    runEnrichment({ mode: "recalculate", button: $("#valuation-recalculate") }).catch((error) => toast(error.message)),
  );
  $("#refresh-cpu-release-dates").addEventListener("click", () =>
    refreshCpuReleaseDates($("#refresh-cpu-release-dates")).catch((error) => toast(error.message, "error")),
  );
  $("#sync-cpu-benchmarks").addEventListener("click", () =>
    syncCpuBenchmarks($("#sync-cpu-benchmarks")).catch((error) => toast(error.message, "error")),
  );
  $("#import-cpu-benchmarks").addEventListener("click", () => $("#cpu-benchmark-file").click());
  $("#cpu-benchmark-file").addEventListener("change", async (event) => {
    const input = event.currentTarget;
    try {
      await importCpuBenchmarkFile(input.files?.[0]);
    } catch (error) {
      toast(error.message);
    } finally {
      input.value = "";
    }
  });
  $("#export-enriched-csv").addEventListener("click", () => exportCsv(true));
  $("#export-csv").addEventListener("click", () => exportCsv(false));
  $("#clear-filters").addEventListener("click", clearFleetFilters);
  [
    "global-search",
    "filter-team",
    "filter-establishment",
    "filter-os",
    "filter-age",
    "filter-model",
    "filter-manufacturer",
    "filter-status",
    "filter-cpu-score",
    "filter-value",
    "sort-devices",
  ].forEach((id) => {
    $(`#${id}`).addEventListener("input", scheduleApplyFilters);
  });
}

function renderStartupFailure(error) {
  const main = document.querySelector("main");
  if (!main) return;
  const message = error instanceof Error ? error.message : String(error || "Unknown startup error");
  main.innerHTML = `
    <section class="panel startup-error" role="alert">
      <p class="eyebrow">${escapeHtml(state.language === "en" ? "Application unavailable" : "Application indisponible")}</p>
      <h2>${escapeHtml(state.language === "en" ? "Unable to start the inventory interface" : "Impossible de démarrer l'interface d'inventaire")}</h2>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="primary startup-retry">${escapeHtml(state.language === "en" ? "Retry" : "Réessayer")}</button>
    </section>
  `;
  main.querySelector(".startup-retry")?.addEventListener("click", () => window.location.reload());
}

function bootstrapApplication() {
  bindEvents();
  restoreRoute();
  applyLanguage(state.language, false);
  languageObserver.observe(document.body, { childList: true, subtree: true });
  updateTimeFormatButton();
  setInterval(updateClock, 30000);
  loadWeather();
  setInterval(loadWeather, 20 * 60 * 1000);
  restoreCollectionDraft();
  loadPublicOrganization().catch((error) => {
    updateOrganizationDatalists();
    toast(`Organisation indisponible: ${error.message}`, "error");
  });
  loadScriptPreview().catch(() => {});

  if (!state.adminToken) return;
  $("#admin-login").classList.add("is-hidden");
  $("#admin-dashboard").classList.remove("is-hidden");
  applyPermissions();
  loadAdminData().catch(() => {
    state.adminToken = "";
    state.currentAdmin = null;
    localStorage.removeItem("it_inventory_admin_token");
    localStorage.removeItem("it_inventory_admin_user");
    $("#admin-login").classList.remove("is-hidden");
    $("#admin-dashboard").classList.add("is-hidden");
  });
}

try {
  bootstrapApplication();
} catch (error) {
  renderStartupFailure(error);
}
