const CONFIG = {
  apiBaseUrl: window.IT_INVENTORY_API_URL || "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api",
  scriptUrl: window.IT_INVENTORY_SCRIPT_URL || "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1",
  staleDays: Number(window.IT_INVENTORY_STALE_DAYS || 30),
};

const state = {
  adminToken: localStorage.getItem("it_inventory_admin_token") || "",
  currentAdmin: JSON.parse(localStorage.getItem("it_inventory_admin_user") || "null"),
  language: localStorage.getItem("it_inventory_language") || "fr",
  devices: [],
  filtered: [],
  selectedDeviceId: "",
  selectedDetail: null,
  selectedScans: [],
  selectedHistory: [],
  accessTokens: [],
  rawAccessTokens: {},
  teams: [],
  establishments: [],
  users: [],
  cpuBenchmarkStats: null,
  adminUsers: [],
  notifications: [],
  unreadNotifications: 0,
  pendingChanges: [],
  collectionDraft: JSON.parse(localStorage.getItem("it_inventory_collection_draft") || "{}"),
  scriptPreviewText: "",
  mapProvider: "openstreetmap",
};

const statusLabels = {
  fr: { active: "Actif", replace: "A remplacer", stock: "En stock", lost: "Perdu", retired: "Sorti du parc" },
  en: { active: "Active", replace: "Replace", stock: "In stock", lost: "Lost", retired: "Retired" },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
let pendingReassignment = null;

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
  "Proposer une nouvelle equipe": "Propose a new team",
  "Proposer un nouvel etablissement": "Propose a new location",
  "Selectionnez une equipe": "Select a team",
  "Selectionnez un etablissement": "Select a location",
  "Collecte transparente": "Transparent collection",
  "Ce collecteur recupere uniquement les informations d'inventaire utiles a l'equipe IT.": "This collector only gathers inventory information needed by the IT team.",
  "hostname, OS, fabricant, modele et numero de serie": "hostname, OS, manufacturer, model, and serial number",
  "CPU, RAM, stockage, GPU si disponible": "CPU, RAM, storage, GPU if available",
  "IP locale, MAC si autorisee, utilisateur OS connecte": "Local IP, MAC if allowed, logged-in OS user",
  "Aucun fichier personnel, historique navigateur, mot de passe ou outil de controle distant n'est lu ou installe.": "No personal files, browser history, passwords, or remote-control tool are read or installed.",
  "Commentaire optionnel": "Optional comment",
  "Generer la commande": "Generate command",
  "Remplissez le formulaire pour obtenir un token de collecteur et les options de lancement.": "Complete the form to get a collector token and launch options.",
  "Methode recommandee: ouvrez l'application collecteur, collez le token, relisez les donnees collectees puis envoyez. Le fallback script reste disponible pour les admins et utilisateurs avances.": "Recommended method: open the collector app, paste the token, review collected data, then submit. Script fallback remains available for admins and advanced users.",
  "Token du collecteur": "Collector token",
  "Copier le token collecteur": "Copy collector token",
  "Application collecteur": "Collector app",
  "Version transparente Python/Tkinter pour Windows, Ubuntu/Linux et macOS. Elle affiche les donnees avant envoi.": "Transparent Python/Tkinter version for Windows, Ubuntu/Linux, and macOS. It shows data before sending.",
  "Fallback PowerShell": "PowerShell fallback",
  "Script lisible, non obfusque, a copier ou telecharger si l'application collecteur n'est pas disponible.": "Readable, non-obfuscated script to copy or download if the collector app is unavailable.",
  "Copier la commande": "Copy command",
  "Copier le script": "Copy script",
  "Apercu du script PowerShell": "PowerShell script preview",
  "Telecharger le script": "Download script",
  "Connexion": "Sign in",
  "Mot de passe admin": "Admin password",
  "Mot de passe": "Password",
  "Identifiant": "Username",
  "Nom affiche": "Display name",
  "Utilisateurs & roles": "Users & roles",
  "Nouveau compte": "New account",
  "Enregistrer le compte": "Save account",
  "Compte actif": "Active account",
  "Desactive": "Disabled",
  "Derniere connexion": "Last login",
  "Centre de notifications": "Notification center",
  "Validation": "Validation",
  "Pending changes": "Pending changes",
  "Les propositions utilisateur ne creent pas d'equipe ou d'etablissement avant validation admin.": "User proposals do not create teams or locations before admin approval.",
  "Approuver": "Approve",
  "Rejeter": "Reject",
  "Lier a l'existant": "Link existing",
  "Modifier et approuver": "Modify and approve",
  "Proposition traitee.": "Proposal processed.",
  "Commande generee. Proposition envoyee a l'admin.": "Command generated. Proposal sent to admin.",
  "Commande copiee.": "Command copied.",
  "Script copie.": "Script copied.",
  "Tout marquer comme lu": "Mark all as read",
  "Marquer lu": "Mark read",
  "Non lues": "Unread",
  "Lues": "Read",
  "Severite": "Severity",
  "Compte cree.": "Account created.",
  "Compte mis a jour.": "Account updated.",
  "Compte supprime.": "Account deleted.",
  "Notifications mises a jour.": "Notifications updated.",
  "Se connecter": "Sign in",
  "Dashboard": "Dashboard",
  "Vue du parc informatique": "IT fleet overview",
  "Actualiser": "Refresh",
  "Enrichir les donnees": "Enrich data",
  "Deconnexion": "Sign out",
  "Sections d'administration": "Administration sections",
  "Parc": "Fleet",
  "Organisation": "Organization",
  "Valorisation": "Valuation",
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
  "Nom de l'equipe": "Team name",
  "Description": "Description",
  "Couleur": "Color",
  "Equipe active": "Active team",
  "Enregistrer l'equipe": "Save team",
  "Implantations": "Locations",
  "Etablissements": "Locations",
  "Nouvel etablissement": "New location",
  "Nom de l'etablissement": "Location name",
  "Type d'etablissement": "Location type",
  "Entrepot": "Warehouse",
  "Boutique": "Store",
  "Siege social": "Headquarters",
  "Centre R&D": "R&D center",
  "Comptabilite": "Accounting",
  "Bureau": "Office",
  "Teletravail": "Remote",
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
  "Ouvrir dans Google Maps": "Open in Google Maps",
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
  "Valeur materielle": "Hardware value",
  "Valorisation du parc": "Fleet valuation",
  "Enrichir toutes les machines": "Enrich all devices",
  "Recalculer les valeurs": "Recalculate values",
  "Importer benchmarks CPU": "Import CPU benchmarks",
  "Exporter inventaire enrichi": "Export enriched inventory",
  "Les valeurs sont des estimations basees sur le modele, le CPU, la RAM, le GPU, la categorie et une depreciation par age.": "Values are estimates based on model, CPU, RAM, GPU, category, and age depreciation.",
  "Valeur de lancement totale": "Total launch value",
  "Valeur actuelle totale": "Total current value",
  "Depreciation moyenne": "Average depreciation",
  "Age moyen": "Average age",
  "Plus de 4 ans": "Older than 4 years",
  "Priorite elevee": "High priority",
  "Valeur par equipe": "Value by team",
  "Distribution des ages": "Age distribution",
  "Distribution des performances": "Performance distribution",
  "Priorite de remplacement": "Replacement priority",
  "Benchmarks importes": "Imported benchmarks",
  "Jeu integre": "Bundled dataset",
  "Enrichir cette machine": "Enrich this device",
  "Source enrichissement": "Enrichment source",
  "Statut enrichissement": "Enrichment status",
  "Priorite remplacement": "Replacement priority",
  "Categorie materielle": "Hardware category",
  "Valeur actuelle estimee": "Estimated current value",
  "Confiance prix": "Price confidence",
  "Notes enrichissement": "Enrichment notes",
  "GPU": "GPU",
  "Type stockage": "Storage type",
  "Fichier CPU importe.": "CPU file imported.",
  "Enrichissement termine.": "Enrichment completed.",
  "Recalcul termine.": "Recalculation completed.",
  "completed": "Completed",
  "partial": "Partial",
  "failed": "Failed",
  "pending": "Pending",
  "business-laptop": "Business laptop",
  "workstation": "Workstation",
  "mini-pc": "Mini PC",
  "desktop": "Desktop",
  "all-in-one": "All-in-one",
  "keep": "Keep",
  "watch": "Monitor",
  "replace": "Replace",
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
  "Supprimer": "Delete",
  "Annuler": "Cancel",
  "Confirmer la suppression": "Confirm deletion",
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
  "Token supprime.": "Token deleted.",
  "Equipe supprimee.": "Team deleted.",
  "Etablissement supprime.": "Location deleted.",
  "Affectations mises a jour.": "Assignments updated.",
  "Reaffectation terminee.": "Reassignment completed.",
  "Ordre enregistre.": "Order saved.",
  "Fabricant": "Manufacturer",
  "Trier par": "Sort by",
  "Famille": "Family",
  "Affectations": "Assignments",
  "Proprietaire": "Owner",
  "Enregistrer les affectations": "Save assignments",
  "Reaffecter les elements lies": "Reassign linked records",
  "Nouvelle destination": "New destination",
  "Reaffecter": "Reassign",
  "Machines par fabricant": "Devices by manufacturer",
  "Fabricant et OS": "Manufacturer and OS",
  "Age moyen par fabricant": "Average age by manufacturer",
  "Vue generale": "Overview",
  "Materiel": "Hardware",
  "Reseau": "Network",
  "Affectation": "Assignment",
  "Historique": "History",
  "De": "From",
  "Vers": "To",
  "Aucun historique.": "No history.",
  "Ajouter la note": "Add note",
  "Ajouter une note a l'historique...": "Add a history note...",
  "Machine creee": "Device created",
  "Machine mise a jour": "Device updated",
  "Utilisateur affecte": "User assigned",
  "Utilisateur reaffecte": "User reassigned",
  "Equipe modifiee": "Team changed",
  "Etablissement modifie": "Location changed",
  "Systeme mis a jour": "OS changed",
  "Materiel modifie": "Hardware changed",
  "Reinitialisation detectee": "Reset detected",
  "Note administrateur": "Admin note",
  "Import mis a jour": "Import updated",
  "Sections machine": "Device sections",
  "Scans": "Scans",
  "Prix marche": "Market prices",
  "Nom d'hote": "Hostname",
  "Version OS": "OS version",
  "Numero de serie": "Serial number",
  "RAM totale": "Total RAM",
  "Stockage total": "Total storage",
  "Note ajoutee.": "Note added.",
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

function localizedEnrichmentValue(value) {
  const labels = {
    fr: {
      completed: "Termine", partial: "Partiel", failed: "Echec", pending: "En attente",
      "business-laptop": "Portable professionnel", workstation: "Station de travail",
      "mini-pc": "Mini PC", desktop: "Ordinateur fixe", "all-in-one": "Tout-en-un",
      keep: "Garder", watch: "Surveiller", replace: "Remplacer",
    },
    en: {
      completed: "Completed", partial: "Partial", failed: "Failed", pending: "Pending",
      "business-laptop": "Business laptop", workstation: "Workstation",
      "mini-pc": "Mini PC", desktop: "Desktop", "all-in-one": "All-in-one",
      keep: "Keep", watch: "Monitor", replace: "Replace",
    },
  };
  return labels[state.language]?.[value] || value;
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
  renderOemMetrics();
  renderCharts();
  renderValuation();
  renderOrganization();
  renderAccessTokens();
  if (state.selectedDetail) renderDetail(state.selectedDetail, state.selectedScans, state.selectedHistory);
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

function toast(message, type = "info") {
  const node = $("#toast");
  node.textContent = translate(message);
  node.dataset.type = type;
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
  if (!response.ok) {
    const error = new Error(body.error || body.message || "Erreur API");
    error.details = typeof body === "object" ? body : {};
    error.status = response.status;
    throw error;
  }
  return body;
}

const rolePermissions = {
  ADMIN: ["DEVICE_VIEW", "DEVICE_EDIT", "DEVICE_DELETE", "TEAM_MANAGE", "LOCATION_MANAGE", "TOKEN_MANAGE", "USER_MANAGE", "PENDING_CHANGE_APPROVE", "EXPORT_DATA", "VIEW_HISTORY", "VIEW_DASHBOARD", "NOTIFICATION_VIEW", "NOTIFICATION_MANAGE"],
  MANAGER: ["DEVICE_VIEW", "DEVICE_EDIT", "TEAM_MANAGE", "LOCATION_MANAGE", "EXPORT_DATA", "VIEW_HISTORY", "VIEW_DASHBOARD", "NOTIFICATION_VIEW", "PENDING_CHANGE_APPROVE"],
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
    node.classList.toggle("is-hidden", !canPerformAction(node.dataset.permission));
  });
  const editable = canPerformAction("DEVICE_EDIT");
  ["#enrich-admin", "#valuation-enrich-all", "#valuation-recalculate", "#import-cpu-benchmarks"].forEach((selector) => {
    const node = $(selector);
    if (node) node.classList.toggle("is-hidden", !editable);
  });
  $("#export-csv")?.classList.toggle("is-hidden", !canPerformAction("EXPORT_DATA"));
  $("#admin-session-label").textContent = state.currentAdmin
    ? `${state.currentAdmin.displayName || state.currentAdmin.username} - ${state.currentAdmin.role}`
    : "";
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
  toggleProposalFields();
}

function clearCollectionDraft() {
  state.collectionDraft = {};
  localStorage.removeItem("it_inventory_collection_draft");
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

function normalizeOsInfo(osString) {
  const original = String(osString || "").trim();
  const normalized = original.toLowerCase();
  const buildVersion = original.match(/\b\d+\.\d+\.\d+(?:\.\d+)?\b/)?.[0] || "";
  let osFamily = "Unknown";
  let iconType = "unknown";
  let osVersion = "";
  if (normalized.includes("windows server")) {
    const serverVersion = original.match(/Windows Server\s*(\d{4})?/i)?.[1] || "";
    osFamily = "Windows Server";
    osVersion = serverVersion;
    iconType = "windows-server";
  } else if (normalized.includes("windows 11")) {
    osFamily = "Windows 11";
    iconType = "windows-11";
  } else if (normalized.includes("windows 10")) {
    osFamily = "Windows 10";
    iconType = "windows-10";
  } else if (/\b(ubuntu)\b/.test(normalized)) {
    osFamily = "Ubuntu";
    osVersion = original.match(/\b\d{2}\.\d{2}(?:\.\d+)?(?:\s+LTS)?/i)?.[0] || "";
    iconType = "ubuntu";
  } else if (/\b(debian|fedora|linux)\b/.test(normalized)) {
    const distro = normalized.includes("debian") ? "Debian" : normalized.includes("fedora") ? "Fedora" : "Linux";
    osFamily = distro;
    osVersion = original.match(/\b\d+(?:\.\d+){1,2}\b/)?.[0] || "";
    iconType = "linux";
  } else if (/\b(macos|mac os|darwin|sonoma|ventura|monterey|sequoia)\b/.test(normalized)) {
    osFamily = "macOS";
    const releaseName = original.match(/\b(Sequoia|Sonoma|Ventura|Monterey)\b/i)?.[0] || "";
    const releaseNumber = original.match(/\b\d{1,2}\.\d+(?:\.\d+)?\b/)?.[0] || "";
    osVersion = [releaseName, releaseNumber].filter(Boolean).join(" ");
    iconType = "macos";
  }

  let osEdition = "Unknown";
  if (/\b(enterprise|entreprise)\b/.test(normalized)) osEdition = "Enterprise";
  else if (/\b(education|educational)\b/.test(normalized)) osEdition = "Education";
  else if (/\b(professionnel|professional|pro)\b/.test(normalized)) osEdition = "Pro";
  else if (/\b(famille|home)\b/.test(normalized)) osEdition = "Home";

  return {
    osFamily,
    osVersion,
    osEdition,
    buildVersion,
    displayLabel: [osFamily, osVersion, osEdition === "Unknown" ? "" : osEdition].filter(Boolean).join(" "),
    iconType,
    badgeClass: `os-${iconType}`,
    rawOsString: original,
  };
}

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
  const fullOs = [device.os_name, device.os_version].filter(Boolean).join(" ").trim();
  if (!fullOs) return "-";
  const info = normalizeOsInfo(fullOs);
  return `<span class="os-badge ${info.iconType}" title="${escapeHtml(fullOs)}" aria-label="${escapeHtml(fullOs)}">${osIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

const manufacturerRules = [
  ["Surface", /\bsurface\b/],
  ["Dell", /\bdell\b/],
  ["HP", /\b(hp|hewlett[- ]?packard)\b/],
  ["Lenovo", /\blenovo\b/],
  ["ASUS", /\b(asus|asustek)\b/],
  ["Acer", /\bacer\b/],
  ["Apple", /\bapple\b/],
  ["Microsoft", /\bmicrosoft\b/],
  ["MSI", /\b(msi|micro-star)\b/],
  ["Samsung", /\bsamsung\b/],
  ["Fujitsu", /\bfujitsu\b/],
  ["Dynabook", /\bdynabook\b/],
  ["Toshiba", /\btoshiba\b/],
  ["Huawei", /\bhuawei\b/],
  ["Framework", /\bframework\b/],
  ["Intel NUC", /\b(intel.*nuc|nuc)\b/],
  ["Gigabyte", /\bgigabyte\b/],
];

function normalizeManufacturer(manufacturerString, modelString = "") {
  const rawManufacturer = String(manufacturerString || "").trim();
  const searchable = `${rawManufacturer} ${modelString || ""}`.toLowerCase();
  const generic = /^(|system manufacturer|default string|to be filled by o\.e\.m\.|unknown|not available|oem)$/i;
  const matched = generic.test(rawManufacturer) ? null : manufacturerRules.find(([, pattern]) => pattern.test(searchable));
  const manufacturerName = matched?.[0] || "Unknown";
  const normalizedName = manufacturerName.toLowerCase().replaceAll(" ", "-");
  return {
    manufacturerName,
    normalizedName,
    logoType: normalizedName,
    badgeClass: `manufacturer-badge oem-${normalizedName}`,
    colorClass: `oem-${normalizedName}`,
    rawManufacturer,
  };
}

function detectDeviceFamily(manufacturer, model) {
  const text = String(model || "");
  const rules = {
    Dell: ["Latitude", "Precision", "OptiPlex", "XPS"],
    HP: ["EliteBook", "ProBook", "ZBook", "EliteDesk"],
    Lenovo: ["ThinkPad", "ThinkCentre", "ThinkBook"],
    Apple: ["MacBook Air", "MacBook Pro", "iMac", "Mac Mini"],
    Microsoft: ["Surface Laptop", "Surface Pro", "Surface Studio", "Surface"],
    Surface: ["Surface Laptop", "Surface Pro", "Surface Studio", "Surface"],
  };
  return (rules[manufacturer] || []).find((family) => text.toLowerCase().includes(family.toLowerCase())) || "";
}

function renderManufacturerLogo(info) {
  const assetName = {
    Surface: "microsoft",
    Microsoft: "microsoft",
    "Intel NUC": "intel",
  }[info.manufacturerName] || info.logoType || "unknown";
  return `<img src="./assets/logos/oem/${escapeHtml(assetName)}.svg" alt="" loading="lazy" />`;
}

function renderManufacturerBadge(device) {
  const info = normalizeManufacturer(device.manufacturer, device.model);
  return `<span class="${info.badgeClass}" title="${escapeHtml(info.rawManufacturer || info.manufacturerName)}"><span class="manufacturer-logo ${info.colorClass}">${renderManufacturerLogo(info)}</span><span>${escapeHtml(info.manufacturerName)}</span></span>`;
}

function normalizeTeamInfo(teamName) {
  const rawTeamName = String(teamName || "").trim();
  const normalized = rawTeamName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rules = [
    ["sav", /\b(sav|service apres[- ]vente|support)\b/],
    ["purchase", /\b(achat|achats|procurement)\b/],
    ["hr", /\b(rh|ressources humaines|human resources)\b/],
    ["sales", /\b(commercial|commerciale|biz dev|business development)\b/],
    ["tech", /\b(tech|it|informatique|developpement)\b/],
    ["design", /\b(design|graphisme|creative)\b/],
    ["store", /\b(store manager|responsable boutique)\b/],
    ["logistics", /\b(logistique|logistics|warehouse)\b/],
    ["catalog", /\b(catalogue|catalog|data)\b/],
    ["b2c", /\bb2c\b/],
  ];
  const iconType = rules.find(([, pattern]) => pattern.test(normalized))?.[0] || "team";
  return {
    normalizedTeamName: normalized,
    displayLabel: rawTeamName || translate("Non renseigne"),
    iconType,
    badgeClass: `team-badge team-${iconType}`,
    rawTeamName,
  };
}

function teamIcon(type) {
  const paths = {
    sav: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2v2Zm16 0a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2ZM17 18c-1 2-3 3-5 3"/>',
    purchase: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"/>',
    hr: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    sales: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    tech: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
    design: '<path d="m12 19 7-7 3 3-7 7-3-3ZM18 13l-1.5-7.5L2 2l3.5 14.5L13 18M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
    store: '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    logistics: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    catalog: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    b2c: '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7"/><circle cx="12" cy="14" r="2"/><path d="M8 20v-1a4 4 0 0 1 8 0v1"/>',
    team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || paths.team}</svg>`;
}

function renderTeamBadge(teamName) {
  const info = normalizeTeamInfo(teamName);
  return `<span class="${info.badgeClass}">${teamIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function locationInfo(type, name = "") {
  const normalizedType = ["office", "store", "warehouse", "headquarters", "remote", "other"].includes(type) ? type : "other";
  return { iconType: normalizedType, badgeClass: `location-badge location-${normalizedType}`, displayLabel: name || translate("Non renseigne") };
}

function locationIcon(type) {
  const paths = {
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
  const site = state.establishments.find((item) => item.name === device.establishment_name);
  const info = locationInfo(site?.establishment_type || "other", device.establishment_name);
  return `<span class="${info.badgeClass}">${locationIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
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
    toast(state.language === "en"
      ? "Create another active destination before reassigning."
      : "Creez une autre destination active avant la reaffectation.", "error");
    return;
  }
  pendingReassignment = { entityType, sourceId };
  $("#reassign-form").elements.entityType.value = entityType;
  $("#reassign-form").elements.sourceId.value = sourceId;
  $("#reassign-message").textContent = state.language === "en"
    ? `${references.devices || 0} device(s) and ${references.users || 0} user(s) are linked. Choose a destination; the original record will then be deleted.`
    : `${references.devices || 0} machine(s) et ${references.users || 0} utilisateur(s) sont lies. Choisissez une destination; l'ancien element sera ensuite supprime.`;
  $("#reassign-dialog").showModal();
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
  return Number(device.estimated_current_value || device.current_market_price_avg || device.current_new_price || device.estimated_launch_price || 0);
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

function setOptions(select, values, label, preserveOrder = false) {
  select.innerHTML = `<option value="">${label}</option>`;
  const options = values.filter(Boolean);
  if (!preserveOrder) options.sort((a, b) => String(a).localeCompare(String(b), "fr"));
  options
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

  $$(".delete-token").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmAction({
        message: state.language === "en"
          ? `Permanently delete the token "${button.dataset.label}"? This action cannot be undone.`
          : `Supprimer definitivement le token "${button.dataset.label}" ? Cette action est irreversible.`,
      });
      if (!confirmed) return;
      button.disabled = true;
      try {
        await api(`/admin/access-tokens/${button.dataset.id}`, { method: "DELETE" });
        delete state.rawAccessTokens[button.dataset.id];
        await loadAccessTokens();
        toast("Token supprime.");
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    });
  });
}

async function loadAccessTokens() {
  if (!canPerformAction("TOKEN_MANAGE")) return;
  const data = await api("/admin/access-tokens");
  state.accessTokens = data.tokens || [];
  renderAccessTokens();
}

function renderAdminUsers() {
  $("#admin-users-table").innerHTML = state.adminUsers.map((user) => `
    <tr data-id="${user.id}">
      <td><span class="cell-primary">${escapeHtml(user.username)}</span><span class="cell-secondary">${escapeHtml(user.displayName || user.email || "-")}</span></td>
      <td><span class="role-badge role-${escapeHtml(String(user.role || "").toLowerCase())}">${escapeHtml(user.role)}</span></td>
      <td>${user.isActive ? translate("Actif") : translate("Desactive")}</td>
      <td>${formatDate(user.lastLoginAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">${translate("Aucune donnee.")}</td></tr>`;
  $$("#admin-users-table tr[data-id]").forEach((row) => row.addEventListener("click", () => editAdminUser(row.dataset.id)));
}

async function loadAdminUsers() {
  if (!canPerformAction("USER_MANAGE")) return;
  const data = await api("/admin/users");
  state.adminUsers = data.users || [];
  renderAdminUsers();
}

function resetAdminUserForm() {
  const form = $("#admin-user-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.role.value = "VIEWER";
  form.elements.isActive.checked = true;
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
  form.elements.isActive.checked = user.isActive !== false;
  $("#delete-admin-user").classList.toggle("is-hidden", user.id === state.currentAdmin?.id);
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
  $("#notifications-list").innerHTML = notifications.map((item) => `
    <article class="notification-item ${item.is_read ? "is-read" : ""} severity-${String(item.severity || "INFO").toLowerCase()}">
      <div>
        <span class="notification-severity">${escapeHtml(item.severity || "INFO")}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.message)}</p>
        <small>${formatDate(item.created_at)} - ${escapeHtml(item.type || "")}</small>
      </div>
      ${item.is_read ? "" : `<button class="secondary mark-notification-read" type="button" data-id="${item.id}">${translate("Marquer lu")}</button>`}
    </article>
  `).join("") || `<p class="helper">${translate("Aucune donnee.")}</p>`;
  $$(".mark-notification-read").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/admin/notifications/${button.dataset.id}/read`, { method: "POST", body: "{}" });
      await loadNotifications();
    });
  });
  const count = $("#notification-count");
  count.textContent = String(state.unreadNotifications);
  count.classList.toggle("is-hidden", state.unreadNotifications === 0);
}

async function loadNotifications() {
  if (!canPerformAction("NOTIFICATION_VIEW")) return;
  const data = await api("/admin/notifications");
  state.notifications = data.notifications || [];
  state.unreadNotifications = data.unread || 0;
  renderNotifications();
}

function renderPendingChanges() {
  const existingTeamOptions = state.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join("");
  const existingSiteOptions = state.establishments.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`).join("");
  $("#pending-changes-list").innerHTML = state.pendingChanges.map((item) => {
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
            Lier a l'existant
            <select name="linkedEntityId" ${disabled ? "disabled" : ""}>
              <option value="">Creer une nouvelle valeur</option>
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
  }).join("") || `<p class="helper">${translate("Aucune donnee.")}</p>`;

  $$(".pending-change-form").forEach((form) => {
    const submitDecision = async (decision) => {
      const values = Object.fromEntries(new FormData(form));
      await api(`/admin/pending-changes/${form.dataset.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ ...values, decision }),
      });
      toast("Proposition traitee.", "success");
      await Promise.all([loadPendingChanges(), loadOrganization(), loadNotifications()]);
    };
    form.querySelector(".pending-approve")?.addEventListener("click", () => submitDecision("APPROVE").catch((error) => toast(error.message, "error")));
    form.querySelector(".pending-modify")?.addEventListener("click", () => submitDecision("MODIFY").catch((error) => toast(error.message, "error")));
    form.querySelector(".pending-reject")?.addEventListener("click", () => submitDecision("REJECT").catch((error) => toast(error.message, "error")));
  });
}

async function loadPendingChanges() {
  if (!canPerformAction("PENDING_CHANGE_APPROVE")) return;
  const data = await api("/admin/pending-changes");
  state.pendingChanges = data.pendingChanges || [];
  renderPendingChanges();
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
  const manufacturer = $("#filter-manufacturer").value;
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
    if (manufacturer && normalizeManufacturer(device.manufacturer, device.model).manufacturerName !== manufacturer) return false;
    if (status && device.status !== status) return false;
    if (age && ageBucket(device) !== age) return false;
    if (cpuScore && cpuScoreBucket(device) !== cpuScore) return false;
    if (value && valueBucket(device) !== value) return false;
    return true;
  });
  const sortBy = $("#sort-devices").value;
  state.filtered.sort((left, right) => {
    if (sortBy === "manufacturer") {
      return normalizeManufacturer(left.manufacturer, left.model).manufacturerName.localeCompare(
        normalizeManufacturer(right.manufacturer, right.model).manufacturerName,
        state.language,
      );
    }
    if (sortBy === "hostname") return String(left.hostname || "").localeCompare(String(right.hostname || ""), state.language);
    return new Date(right.last_seen_at || 0).getTime() - new Date(left.last_seen_at || 0).getTime();
  });

  renderDevices();
  renderMetrics();
  renderOemMetrics();
  renderCharts();
  renderValuation();
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

function renderOemMetrics() {
  const counts = countBy(state.filtered, (device) => normalizeManufacturer(device.manufacturer, device.model).manufacturerName);
  const primary = ["Dell", "HP", "Lenovo", "Apple"];
  const other = Object.entries(counts)
    .filter(([name]) => !primary.includes(name))
    .reduce((sum, [, count]) => sum + count, 0);
  $("#oem-metrics").innerHTML = [...primary.map((name) => [name, counts[name] || 0]), ["Autres", other]]
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function deviceAge(device) {
  const releaseYear = Number(device.release_year || device.model_release_year || device.cpu_release_year || 0);
  return releaseYear ? Math.max(0, new Date().getFullYear() - releaseYear) : null;
}

function renderValuation() {
  const devices = state.filtered;
  const launchValue = devices.reduce((sum, device) => sum + Number(device.estimated_launch_price || 0), 0);
  const currentValue = devices.reduce((sum, device) => sum + estimatedValue(device), 0);
  const depreciation = launchValue > 0 ? Math.round((1 - currentValue / launchValue) * 100) : 0;
  const ages = devices.map(deviceAge).filter((age) => age !== null);
  const averageAge = ages.length ? Math.round((ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10) / 10 : 0;
  const olderThanFour = ages.filter((age) => age > 4).length;
  const lowCpu = devices.filter((device) => Number(device.cpu_benchmark_score || device.cpu_score || 0) > 0 && Number(device.cpu_benchmark_score || device.cpu_score || 0) < 8000).length;
  const highPriority = devices.filter((device) => Number(device.replacement_priority || device.obsolescence_index || 0) >= 70).length;

  $("#valuation-metrics").innerHTML = [
    ["Valeur de lancement totale", money(launchValue)],
    ["Valeur actuelle totale", money(currentValue)],
    ["Depreciation moyenne", `${depreciation}%`],
    ["Age moyen", `${averageAge} ${state.language === "en" ? "years" : "ans"}`],
    ["Plus de 4 ans", olderThanFour],
    ["CPU faible", lowCpu],
    ["Priorite elevee", highPriority],
  ].map(([label, value]) => `<article class="metric"><span>${translate(label)}</span><strong>${value}</strong></article>`).join("");

  const ageDistribution = { "0-1": 0, "2-3": 0, "4-5": 0, "6+": 0 };
  ages.forEach((age) => {
    if (age <= 1) ageDistribution["0-1"] += 1;
    else if (age <= 3) ageDistribution["2-3"] += 1;
    else if (age <= 5) ageDistribution["4-5"] += 1;
    else ageDistribution["6+"] += 1;
  });
  const performance = { Low: 0, Medium: 0, Good: 0 };
  devices.forEach((device) => {
    const score = Number(device.cpu_benchmark_score || device.cpu_score || 0);
    if (!score) return;
    if (score < 8000) performance.Low += 1;
    else if (score < 14000) performance.Medium += 1;
    else performance.Good += 1;
  });
  const priorities = { Low: 0, Medium: 0, High: 0 };
  devices.forEach((device) => {
    const priority = Number(device.replacement_priority || device.obsolescence_index || 0);
    if (priority >= 70) priorities.High += 1;
    else if (priority >= 45) priorities.Medium += 1;
    else priorities.Low += 1;
  });

  renderBarChart('[data-valuation-chart="value-team"]', translate("Valeur par equipe"), sumBy(devices, (device) => device.team_name, estimatedValue), " EUR");
  renderBarChart('[data-valuation-chart="age"]', translate("Distribution des ages"), ageDistribution);
  renderBarChart('[data-valuation-chart="performance"]', translate("Distribution des performances"), performance);
  renderBarChart('[data-valuation-chart="priority"]', translate("Priorite de remplacement"), priorities);

  if (state.cpuBenchmarkStats) {
    $("#cpu-benchmark-status").textContent =
      `${translate("Benchmarks importes")}: ${state.cpuBenchmarkStats.importedCount} / ${translate("Jeu integre")}: ${state.cpuBenchmarkStats.bundledCount}`;
  }
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
          <td><strong class="cell-primary">${escapeHtml(device.hostname || "-")}</strong><small class="cell-secondary">${escapeHtml(device.serial_number || "")}</small></td>
          <td><strong class="cell-primary">${escapeHtml(`${device.first_name || ""} ${device.last_name || ""}`.trim() || "-")}</strong><small class="cell-secondary">${escapeHtml(device.email || "")}</small></td>
          <td>${renderTeamBadge(device.team_name)}</td>
          <td>${renderLocationBadge(device)}</td>
          <td>${renderOsBadge(device)}</td>
          <td class="manufacturer-cell">${renderManufacturerBadge(device)}<small>${escapeHtml(device.model || "-")}</small></td>
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
    renderDetail({ ...detail.device, priceHistory: detail.priceHistory || [] }, detail.scans || [], detail.history || []);
  } catch (error) {
    toast(error.message);
    renderDetail(device, [], []);
  }
}

function historyLabel(event) {
  const labels = {
    DEVICE_CREATED: "Machine creee",
    DEVICE_UPDATED: "Machine mise a jour",
    USER_ASSIGNED: "Utilisateur affecte",
    USER_REASSIGNED: "Utilisateur reaffecte",
    TEAM_CHANGED: "Equipe modifiee",
    LOCATION_CHANGED: "Etablissement modifie",
    OS_CHANGED: "Systeme mis a jour",
    HARDWARE_CHANGED: "Materiel modifie",
    DEVICE_RESET: "Reinitialisation detectee",
    MANUAL_EDIT: "Note administrateur",
    IMPORT_UPDATE: "Import mis a jour",
  };
  return labels[event.event_type] || event.event_type;
}

function historyFieldLabel(fieldName) {
  const labels = {
    hostname: "Nom d'hote",
    os_name: "OS",
    os_version: "Version OS",
    manufacturer: "Fabricant",
    model: "Modele",
    serial_number: "Numero de serie",
    cpu: "CPU",
    gpu: "GPU",
    ram_total_gb: "RAM totale",
    storage_total_gb: "Stockage total",
    storage_type: "Type stockage",
    windows_user: "Utilisateur OS",
    team_id: "Equipe",
    establishment_id: "Etablissement",
    assigned_user_id: "Proprietaire",
    status: "Statut",
  };
  return translate(labels[fieldName] || fieldName);
}

function renderHistoryTimeline(history) {
  return history.map((event) => `
    <article class="history-event">
      <span class="history-marker"></span>
      <div>
        <time>${formatDate(event.changed_at)}</time>
        <strong>${escapeHtml(translate(historyLabel(event)))}</strong>
        ${event.field_name ? `<small>${escapeHtml(historyFieldLabel(event.field_name))}</small>` : ""}
        ${event.old_value !== null || event.new_value !== null ? `
          <p><span>${translate("De")}: ${escapeHtml(event.old_value || "-")}</span><span>${translate("Vers")}: ${escapeHtml(event.new_value || "-")}</span></p>
        ` : ""}
        ${event.notes ? `<p>${escapeHtml(event.notes)}</p>` : ""}
        <small>${escapeHtml(event.changed_by || "system")} - ${escapeHtml(event.source || "system")}</small>
      </div>
    </article>
  `).join("") || `<p class="helper">${translate("Aucun historique.")}</p>`;
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
  const teamOptions = state.teams.map((team) =>
    `<option value="${team.id}" ${device.team_id === team.id ? "selected" : ""}>${escapeHtml(team.name)}</option>`).join("");
  const establishmentOptions = state.establishments.map((site) =>
    `<option value="${site.id}" ${device.establishment_id === site.id ? "selected" : ""}>${escapeHtml(site.name)}</option>`).join("");
  const userOptions = state.users.map((user) => {
    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email;
    return `<option value="${user.id}" ${device.assigned_user_id === user.id ? "selected" : ""}>${escapeHtml(name)} (${escapeHtml(user.email)})</option>`;
  }).join("");
  const detailRows = (rows) => `<dl class="detail-list">${rows.map(([key, value]) => `<div><dt>${escapeHtml(translate(key))}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl>`;
  const priceRows = (device.priceHistory || [])
    .slice(0, 8)
    .map((row) => `<li>${formatDate(row.collected_at)} - ${row.source} - ${money(row.price)} - ${row.condition || "-"}</li>`)
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
        <span>${escapeHtml(device.model || translate("Non renseigne"))}</span>
      </span>
    </div>
    <nav class="detail-tabs" aria-label="${escapeHtml(translate("Sections machine"))}">
      <button class="detail-tab is-active" type="button" data-detail-tab="overview">${translate("Vue generale")}</button>
      <button class="detail-tab" type="button" data-detail-tab="hardware">${translate("Materiel")}</button>
      <button class="detail-tab" type="button" data-detail-tab="network">${translate("Reseau")}</button>
      <button class="detail-tab" type="button" data-detail-tab="assignment">${translate("Affectation")}</button>
      <button class="detail-tab" type="button" data-detail-tab="history">${translate("Historique")}</button>
    </nav>
    <section class="detail-tab-panel is-active" data-detail-panel="overview">
      ${detailRows([
        ["Hostname", device.hostname],
        ["OS", [device.os_name, device.os_version].filter(Boolean).join(" ")],
        ["Fabricant", manufacturer.manufacturerName],
        ["Famille", family],
        ["Modele", device.model],
        ["Derniere remontee", formatDate(device.last_seen_at)],
        ["Score age", `${device.hardware_age_score || 0}/100`],
        ["Priorite remplacement", priorityValue !== null && priorityValue !== undefined ? `${priorityValue}/100` : ""],
        ["Reco", localizedEnrichmentValue(device.recommendation)],
      ])}
      ${canEditDevice ? `<form id="status-form" class="form-grid one scan-history">
        <label>${translate("Statut")}<select name="status">${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${device.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <button type="submit" class="primary">${translate("Mettre a jour")}</button>
      </form>
      <button id="enrich-device" class="secondary detail-enrich-button" type="button">${translate("Enrichir cette machine")}</button>` : ""}
    </section>
    <section class="detail-tab-panel" data-detail-panel="hardware">
      ${detailRows([
        ["Serial", device.serial_number], ["CPU", device.cpu], ["GPU", device.gpu],
        ["RAM", device.ram_total_gb ? `${device.ram_total_gb} Go` : ""],
        ["Stockage", `${device.storage_total_gb || "-"} Go total / ${device.storage_free_gb || "-"} Go libres`],
        ["Type stockage", device.storage_type], ["Score CPU", device.cpu_benchmark_score || device.cpu_score],
        ["Generation CPU", device.cpu_generation], ["Annee modele", device.release_year || device.model_release_year],
        ["Prix lancement", money(device.estimated_launch_price)],
        ["Valeur actuelle estimee", money(device.estimated_current_value || device.current_market_price_avg)],
      ])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="network">
      ${detailRows([["MAC", device.mac_address], ["IP locale", device.local_ip], ["Utilisateur OS", device.windows_user], ["Script", device.script_version]])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="assignment">
      <div class="assignment-summary">${renderTeamBadge(device.team_name)} ${renderLocationBadge(device)}</div>
      ${canEditDevice ? `<form id="assignment-form" class="form-grid one assignment-form">
        <label>${translate("Equipe")}<select name="teamId"><option value="">${translate("Non renseigne")}</option>${teamOptions}</select></label>
        <label>${translate("Etablissement")}<select name="establishmentId"><option value="">${translate("Non renseigne")}</option>${establishmentOptions}</select></label>
        <label>${translate("Proprietaire")}<select name="assignedUserId"><option value="">${translate("Non renseigne")}</option>${userOptions}</select></label>
        <button type="submit" class="primary">${translate("Enregistrer les affectations")}</button>
      </form>` : ""}
    </section>
    <section class="detail-tab-panel" data-detail-panel="history">
      <form id="history-note-form" class="history-note-form">
        <textarea name="notes" rows="3" maxlength="2000" placeholder="${escapeHtml(translate("Ajouter une note a l'historique..."))}" required></textarea>
        <button class="secondary" type="submit">${translate("Ajouter la note")}</button>
      </form>
      <div class="history-timeline">${renderHistoryTimeline(history)}</div>
      <div class="scan-history"><h3>${translate("Scans")}</h3><ul>${scanRows || `<li>${translate("Aucun scan detaille.")}</li>`}</ul></div>
      <div class="scan-history"><h3>${translate("Prix marche")}</h3><ul>${priceRows || `<li>${translate("Aucun prix externe collecte.")}</li>`}</ul></div>
    </section>
  `;

  $$(".detail-tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".detail-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
      $$(".detail-tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.detailPanel === button.dataset.detailTab));
    });
  });

  if ($("#assignment-form")) $("#assignment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/admin/devices/${device.id}/assignment`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      await loadAdminData();
      await selectDevice(device.id);
      toast("Affectations mises a jour.");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("#history-note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const notes = new FormData(event.currentTarget).get("notes");
    try {
      await api(`/admin/devices/${device.id}/history-note`, { method: "POST", body: JSON.stringify({ notes }) });
      await selectDevice(device.id);
      toast("Note ajoutee.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  if ($("#status-form")) $("#status-form").addEventListener("submit", async (event) => {
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

  if ($("#enrich-device")) $("#enrich-device").addEventListener("click", async () => {
    const button = $("#enrich-device");
    button.disabled = true;
    button.textContent = translate("Enrichissement...");
    try {
      const result = await api("/admin/enrich", {
        method: "POST",
        body: JSON.stringify({ deviceId: device.id, limit: 1, force: true, mode: "refresh", useExternal: false }),
      });
      toast(result.failed ? "Erreur serveur." : "Enrichissement termine.");
      await loadAdminData();
      await selectDevice(device.id);
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = translate("Enrichir cette machine");
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
  renderBarChart(
    '[data-chart="manufacturers"]',
    translate("Machines par fabricant"),
    countBy(state.filtered, (device) => normalizeManufacturer(device.manufacturer, device.model).manufacturerName),
  );
  renderBarChart(
    '[data-chart="manufacturer-os"]',
    translate("Fabricant et OS"),
    countBy(state.filtered, (device) => {
      const manufacturer = normalizeManufacturer(device.manufacturer, device.model).manufacturerName;
      const os = normalizeOsInfo([device.os_name, device.os_version].filter(Boolean).join(" ")).osFamily;
      return `${manufacturer} / ${os}`;
    }),
  );
  renderBarChart(
    '[data-chart="manufacturer-age"]',
    translate("Age moyen par fabricant"),
    averageBy(
      state.filtered,
      (device) => normalizeManufacturer(device.manufacturer, device.model).manufacturerName,
      (device) => deviceAge(device),
    ),
    state.language === "en" ? " yrs" : " ans",
  );
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
    "cpu_generation",
    "cpu_release_year",
    "model_release_year",
    "release_year",
    "current_market_price_avg",
    "estimated_current_value",
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
  const csv = [columns.join(","), ...state.filtered.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${enrichedExport ? "inventaire-it-enrichi" : "inventaire-it"}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildCommand(collectionToken) {
  const apiUrl = CONFIG.apiBaseUrl.replace(/"/g, "");
  const scriptUrl = CONFIG.scriptUrl.replace(/"/g, "");
  return `powershell -ExecutionPolicy Bypass -NoProfile -Command "iwr '${scriptUrl}' -OutFile $env:TEMP\\collect-windows.ps1; & $env:TEMP\\collect-windows.ps1 -ApiUrl '${apiUrl}' -CollectionToken '${collectionToken}'"`;
}

async function loadScriptPreview() {
  try {
    const response = await fetch(CONFIG.scriptUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Script indisponible.");
    state.scriptPreviewText = await response.text();
    $("#script-preview").textContent = state.scriptPreviewText;
  } catch (error) {
    state.scriptPreviewText = "# Apercu indisponible. Utilisez le lien de telechargement ou le fichier scripts/collect-windows.ps1 du depot.";
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

function establishmentIcon(type) {
  const icons = {
    warehouse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 17h10"></path></svg>`,
    store: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l2-6h14l2 6M5 13v8h14v-8M9 21v-6h6v6"></path><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"></path></svg>`,
    headquarters: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16M6 21V5h8v16M14 9h4v12M9 8h2M9 12h2M9 16h2"></path></svg>`,
    research: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M8 15h8"></path></svg>`,
    accounting: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"></path></svg>`,
    office: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"></path></svg>`,
    remote: locationIcon("remote"),
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
  const teamSelect = collectionForm()?.elements.team;
  const establishmentSelect = collectionForm()?.elements.establishment;
  if (teamSelect) {
    const selected = teamSelect.value || state.collectionDraft.team || "";
    teamSelect.innerHTML = [
      `<option value="">${translate("Selectionnez une equipe")}</option>`,
      ...state.teams
        .filter((team) => team.active !== false)
        .map((team) => `<option value="${escapeHtml(team.name)}">${escapeHtml(team.name)}</option>`),
      `<option value="__other__">${translate("Autre")}</option>`,
    ].join("");
    teamSelect.value = [...teamSelect.options].some((option) => option.value === selected) ? selected : "";
  }
  if (establishmentSelect) {
    const selected = establishmentSelect.value || state.collectionDraft.establishment || "";
    establishmentSelect.innerHTML = [
      `<option value="">${translate("Selectionnez un etablissement")}</option>`,
      ...state.establishments
        .filter((site) => site.active !== false)
        .map((site) => `<option value="${escapeHtml(site.name)}">${escapeHtml(site.name)}</option>`),
      `<option value="__other__">${translate("Autre")}</option>`,
    ].join("");
    establishmentSelect.value = [...establishmentSelect.options].some((option) => option.value === selected) ? selected : "";
  }
  toggleProposalFields();
}

function renderOrganization() {
  const canManageTeams = canPerformAction("TEAM_MANAGE");
  const canManageLocations = canPerformAction("LOCATION_MANAGE");
  $("#teams-manager-list").innerHTML = state.teams
    .map(
      (team, index) => `
        <div class="organization-sort-row ${team.active ? "" : "is-inactive"}" draggable="${canManageTeams}" data-entity="team" data-id="${team.id}">
          ${canManageTeams ? `<button class="drag-handle" type="button" aria-label="Deplacer ${escapeHtml(team.name)}" title="Glisser pour reordonner">&#8942;&#8942;</button>` : ""}
          <button class="organization-item edit-team" type="button" data-id="${team.id}">
            <span class="organization-icon" style="--item-color:${escapeHtml(team.color || "#16735f")}">${teamIcon(normalizeTeamInfo(team.name).iconType)}</span>
            <span>
              <strong>${escapeHtml(team.name)}</strong>
              <small>${state.language === "en" ? `${team.device_count} computer(s), ${team.user_count || 0} user(s)` : `${team.device_count} machine(s), ${team.user_count || 0} utilisateur(s)`}${team.description ? ` - ${escapeHtml(team.description)}` : ""}</small>
            </span>
            <span class="organization-chevron">&rsaquo;</span>
          </button>
          ${canManageTeams ? `<span class="sort-buttons">
            <button type="button" class="sort-step" data-direction="-1" data-entity="team" data-id="${team.id}" ${index === 0 ? "disabled" : ""} aria-label="Monter">&#8593;</button>
            <button type="button" class="sort-step" data-direction="1" data-entity="team" data-id="${team.id}" ${index === state.teams.length - 1 ? "disabled" : ""} aria-label="Descendre">&#8595;</button>
          </span>` : ""}
        </div>
      `,
    )
    .join("") || `<p class="helper">Aucune equipe.</p>`;

  $("#establishments-manager-list").innerHTML = state.establishments
    .map((site, index) => {
      const location = [site.city, site.country].filter(Boolean).join(", ");
      return `
        <div class="organization-sort-row ${site.active ? "" : "is-inactive"}" draggable="${canManageLocations}" data-entity="establishment" data-id="${site.id}">
          ${canManageLocations ? `<button class="drag-handle" type="button" aria-label="Deplacer ${escapeHtml(site.name)}" title="Glisser pour reordonner">&#8942;&#8942;</button>` : ""}
          <button class="organization-item edit-establishment" type="button" data-id="${site.id}">
            <span class="organization-icon site type-${escapeHtml(site.establishment_type || "office")}">${establishmentIcon(site.establishment_type || "office")}</span>
            <span>
              <strong>${escapeHtml(site.name)}</strong>
              <small>${translate(establishmentTypeLabels[site.establishment_type] || establishmentTypeLabels.office)} - ${state.language === "en" ? `${site.device_count} computer(s), ${site.user_count || 0} user(s)` : `${site.device_count} machine(s), ${site.user_count || 0} utilisateur(s)`}${location ? ` - ${escapeHtml(location)}` : ""}</small>
            </span>
            <span class="organization-chevron">&rsaquo;</span>
          </button>
          ${canManageLocations ? `<span class="sort-buttons">
            <button type="button" class="sort-step" data-direction="-1" data-entity="establishment" data-id="${site.id}" ${index === 0 ? "disabled" : ""} aria-label="Monter">&#8593;</button>
            <button type="button" class="sort-step" data-direction="1" data-entity="establishment" data-id="${site.id}" ${index === state.establishments.length - 1 ? "disabled" : ""} aria-label="Descendre">&#8595;</button>
          </span>` : ""}
        </div>
      `;
    })
    .join("") || `<p class="helper">Aucun etablissement.</p>`;

  $$(".edit-team").forEach((button) => button.addEventListener("click", () => editTeam(button.dataset.id)));
  $$(".edit-establishment").forEach((button) =>
    button.addEventListener("click", () => editEstablishment(button.dataset.id)),
  );
  bindOrganizationSorting();
}

async function saveOrganizationOrder(entityType) {
  const items = entityType === "team" ? state.teams : state.establishments;
  await api("/admin/organization/reorder", {
    method: "POST",
    body: JSON.stringify({ entityType, ids: items.map((item) => item.id) }),
  });
}

async function moveOrganizationItem(entityType, id, targetIndex) {
  const items = entityType === "team" ? state.teams : state.establishments;
  const currentIndex = items.findIndex((item) => item.id === id);
  const boundedIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
  if (currentIndex < 0 || currentIndex === boundedIndex) return;
  const [item] = items.splice(currentIndex, 1);
  items.splice(boundedIndex, 0, item);
  renderOrganization();
  updateOrganizationDatalists();
  try {
    await saveOrganizationOrder(entityType);
    toast("Ordre enregistre.", "success");
  } catch (error) {
    toast(error.message, "error");
    await loadOrganization();
  }
}

function bindOrganizationSorting() {
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
    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const [entityType, id] = event.dataTransfer.getData("text/plain").split(":");
      if (entityType !== row.dataset.entity) return;
      const items = entityType === "team" ? state.teams : state.establishments;
      moveOrganizationItem(entityType, id, items.findIndex((item) => item.id === row.dataset.id));
    });
  });
}

function resetTeamForm() {
  const form = $("#team-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.color.value = "#16735f";
  form.elements.active.checked = true;
  $("#team-editor-title").textContent = "Nouvelle equipe";
  $("#delete-team").classList.add("is-hidden");
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
  $("#delete-team").classList.remove("is-hidden");
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
  $("#delete-establishment").classList.add("is-hidden");
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
  $("#delete-establishment").classList.remove("is-hidden");
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
    <iframe title="Carte de l'etablissement" loading="lazy" src="${src}"></iframe>
    <a href="${openUrl}" target="_blank" rel="noopener">${translate(linkLabel)}</a>
  `;
}

async function loadOrganization() {
  const data = await api("/admin/organization");
  state.teams = data.teams || [];
  state.establishments = data.establishments || [];
  state.users = data.users || [];
  state.mapProvider = data.map_provider === "google" ? "google" : "openstreetmap";
  renderOrganization();
  updateOrganizationDatalists();
  renderEstablishmentMap();
}

async function loadPublicOrganization() {
  const data = await api("/organization");
  state.teams = data.teams || [];
  state.establishments = data.establishments || [];
  updateOrganizationDatalists();
  restoreCollectionDraft();
}

async function loadCpuBenchmarkStats() {
  const data = await api("/admin/cpu-benchmarks");
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
  applyPermissions();
  const data = await api("/admin/devices");
  loadAccessTokens().catch((error) => {
    state.accessTokens = [];
    renderAccessTokens();
    toast(`Module tokens indisponible: ${error.message}`);
  });
  loadAdminUsers().catch((error) => toast(`Module utilisateurs indisponible: ${error.message}`, "error"));
  loadNotifications().catch((error) => toast(`Module notifications indisponible: ${error.message}`, "error"));
  loadPendingChanges().catch((error) => toast(`Module validations indisponible: ${error.message}`, "error"));
  const organizationPromise = loadOrganization().catch((error) => toast(`Module organisation indisponible: ${error.message}`, "error"));
  loadCpuBenchmarkStats().catch(() => {
    state.cpuBenchmarkStats = null;
  });
  state.devices = data.devices || [];
  const teams = [...new Set(state.devices.map((d) => d.team_name))];
  const establishments = [...new Set(state.devices.map((d) => d.establishment_name))];
  const os = [...new Set(state.devices.map((d) => d.os_name))];
  const models = [...new Set(state.devices.map((d) => d.model))];
  const manufacturers = [...new Set(state.devices.map((device) =>
    normalizeManufacturer(device.manufacturer, device.model).manufacturerName))];
  setOptions($("#filter-team"), teams, "Toutes");
  setOptions($("#filter-establishment"), establishments, "Tous");
  setOptions($("#filter-os"), os, "Tous");
  setOptions($("#filter-model"), models, "Tous");
  setOptions($("#filter-manufacturer"), manufacturers, "Tous");
  applyFilters();
  await organizationPromise;
  setOptions($("#filter-team"), state.teams.map((team) => team.name), "Toutes", true);
  setOptions($("#filter-establishment"), state.establishments.map((site) => site.name), "Tous", true);
  applyFilters();
}

async function runEnrichment({ mode = "refresh", deviceId = "", button = null } = {}) {
  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = translate("Enrichissement...");
  }
  try {
    const result = await api("/admin/enrich", {
      method: "POST",
      body: JSON.stringify({
        deviceId: deviceId || undefined,
        limit: deviceId ? 1 : 100,
        force: mode === "recalculate",
        mode,
        useExternal: false,
      }),
    });
    const message = state.language === "en"
      ? `${result.enriched} enriched, ${result.skipped} skipped, ${result.failed || 0} failed.`
      : `${result.enriched} enrichie(s), ${result.skipped} ignoree(s), ${result.failed || 0} en echec.`;
    toast(message);
    await loadAdminData();
    return result;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function importCpuBenchmarkFile(file) {
  if (!file) return;
  const csv = await file.text();
  const result = await api("/admin/cpu-benchmarks/import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
  toast(state.language === "en"
    ? `${result.imported} CPU benchmark(s) imported, ${result.rejected} rejected.`
    : `${result.imported} benchmark(s) CPU importe(s), ${result.rejected} rejete(s).`);
  await loadCpuBenchmarkStats();
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
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...form };
    if (payload.team === "__other__") payload.team = "";
    if (payload.establishment === "__other__") payload.establishment = "";
    try {
      const result = await api("/collect/profile", {
        method: "POST",
        headers: { "X-Collection-Access-Token": form.accessToken },
        body: JSON.stringify(payload),
      });
      $("#command-empty").classList.add("is-hidden");
      $("#command-result").classList.remove("is-hidden");
      $("#collector-token").textContent = result.collectionToken;
      $("#powershell-command").textContent = buildCommand(result.collectionToken);
      if (result.pendingChanges?.length) {
        toast("Commande generee. Proposition envoyee a l'admin.", "success");
      } else {
        toast("Commande generee.", "success");
      }
    } catch (error) {
      saveCollectionDraft();
      toast(error.message, "error");
    }
  });

  $("#copy-command").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("#powershell-command").textContent);
    toast("Commande copiee.");
  });
  $("#copy-collector-token").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("#collector-token").textContent);
    toast("Token copie.");
  });
  $("#copy-script").addEventListener("click", async () => {
    if (!state.scriptPreviewText) await loadScriptPreview();
    await navigator.clipboard.writeText(state.scriptPreviewText);
    toast("Script copie.");
  });

  $("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api("/auth/admin", { method: "POST", body: JSON.stringify(form) });
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

  $("#refresh-admin").addEventListener("click", () => loadAdminData().catch((error) => toast(error.message)));
  $("#refresh-tokens").addEventListener("click", () => loadAccessTokens().catch((error) => toast(error.message)));
  $("#refresh-pending-changes").addEventListener("click", () => loadPendingChanges().catch((error) => toast(error.message)));
  $("#new-team").addEventListener("click", resetTeamForm);
  $("#new-establishment").addEventListener("click", resetEstablishmentForm);
  $("#delete-team").addEventListener("click", async () => {
    const form = $("#team-form");
    const id = form.elements.id.value;
    if (!id) return;
    const team = state.teams.find((item) => item.id === id);
    const confirmed = await confirmAction({
      message: state.language === "en"
        ? `Delete the team "${team?.name || form.elements.name.value}"? Deletion will be blocked if computers or users are still assigned.`
        : `Supprimer l'equipe "${team?.name || form.elements.name.value}" ? La suppression sera bloquee si des machines ou utilisateurs y sont encore affectes.`,
    });
    if (!confirmed) return;
    try {
      await api(`/admin/teams/${id}`, { method: "DELETE" });
      await loadOrganization();
      resetTeamForm();
      toast("Equipe supprimee.", "success");
    } catch (error) {
      if (error.details?.code === "ENTITY_IN_USE") {
        openReassignment("team", id, error.details.references || {});
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
      message: state.language === "en"
        ? `Delete the location "${site?.name || form.elements.name.value}"? Deletion will be blocked if computers or users are still assigned.`
        : `Supprimer l'etablissement "${site?.name || form.elements.name.value}" ? La suppression sera bloquee si des machines ou utilisateurs y sont encore affectes.`,
    });
    if (!confirmed) return;
    try {
      await api(`/admin/establishments/${id}`, { method: "DELETE" });
      await loadOrganization();
      resetEstablishmentForm();
      toast("Etablissement supprime.", "success");
    } catch (error) {
      if (error.details?.code === "ENTITY_IN_USE") {
        openReassignment("establishment", id, error.details.references || {});
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
      await api("/admin/organization/reassign", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const endpoint = pendingReassignment.entityType === "team" ? "teams" : "establishments";
      await api(`/admin/${endpoint}/${pendingReassignment.sourceId}`, { method: "DELETE" });
      $("#reassign-dialog").close();
      pendingReassignment = null;
      await loadAdminData();
      resetTeamForm();
      resetEstablishmentForm();
      toast("Reaffectation terminee.", "success");
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
  $("#new-admin-user").addEventListener("click", resetAdminUserForm);
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
      await api(id ? `/admin/users/${id}` : "/admin/users", { method: "POST", body: JSON.stringify(payload) });
      await loadAdminUsers();
      resetAdminUserForm();
      toast(id ? "Compte mis a jour." : "Compte cree.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#delete-admin-user").addEventListener("click", async () => {
    const id = $("#admin-user-form").elements.id.value;
    if (!id) return;
    const user = state.adminUsers.find((item) => item.id === id);
    const confirmed = await confirmAction({
      message: state.language === "en" ? `Delete account "${user?.username || id}"?` : `Supprimer le compte "${user?.username || id}" ?`,
    });
    if (!confirmed) return;
    try {
      await api(`/admin/users/${id}`, { method: "DELETE" });
      await loadAdminUsers();
      resetAdminUserForm();
      toast("Compte supprime.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#notifications-bell").addEventListener("click", () => {
    setAdminView("notifications");
    loadNotifications().catch((error) => toast(error.message, "error"));
  });
  $("#mark-all-notifications").addEventListener("click", async () => {
    try {
      await api("/admin/notifications/read-all", { method: "POST", body: "{}" });
      await loadNotifications();
      toast("Notifications mises a jour.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  ["notification-severity-filter", "notification-read-filter"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderNotifications);
  });
  $("#enrich-admin").addEventListener("click", () =>
    runEnrichment({ mode: "refresh", button: $("#enrich-admin") }).catch((error) => toast(error.message)));
  $("#valuation-enrich-all").addEventListener("click", () =>
    runEnrichment({ mode: "refresh", button: $("#valuation-enrich-all") }).catch((error) => toast(error.message)));
  $("#valuation-recalculate").addEventListener("click", () =>
    runEnrichment({ mode: "recalculate", button: $("#valuation-recalculate") }).catch((error) => toast(error.message)));
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
  ["global-search", "filter-team", "filter-establishment", "filter-os", "filter-age", "filter-model", "filter-manufacturer", "filter-status", "filter-cpu-score", "filter-value", "sort-devices"].forEach((id) => {
    $(`#${id}`).addEventListener("input", applyFilters);
  });
}

bindEvents();
applyLanguage(state.language, false);
languageObserver.observe(document.body, { childList: true, subtree: true });
restoreCollectionDraft();
loadPublicOrganization().catch((error) => {
  updateOrganizationDatalists();
  toast(`Organisation indisponible: ${error.message}`, "error");
});
loadScriptPreview().catch(() => {});

if (state.adminToken) {
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
