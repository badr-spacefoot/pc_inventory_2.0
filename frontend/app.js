const CONFIG = {
  apiBaseUrl: window.IT_INVENTORY_API_URL || "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api",
  scriptUrl: window.IT_INVENTORY_SCRIPT_URL || "https://badr-spacefoot.github.io/pc_inventory_2.0/scripts/collect-windows.ps1",
  collectorReleaseConfigUrl: window.IT_INVENTORY_COLLECTOR_RELEASES_URL || "./collector-releases.json",
  staleDays: Number(window.IT_INVENTORY_STALE_DAYS || 30),
  weatherLatitude: Number(window.IT_INVENTORY_WEATHER_LATITUDE || 48.8932),
  weatherLongitude: Number(window.IT_INVENTORY_WEATHER_LONGITUDE || 2.2879),
  weatherLocationLabel: window.IT_INVENTORY_WEATHER_LOCATION || "Levallois-Perret",
};

const COLLECTOR_INSTALL_STATE_KEY = "it_inventory_collector_install_state";

const state = {
  adminToken: localStorage.getItem("it_inventory_admin_token") || "",
  currentAdmin: JSON.parse(localStorage.getItem("it_inventory_admin_user") || "null"),
  language: localStorage.getItem("it_inventory_language") || "fr",
  timeFormatPreference: localStorage.getItem("it_inventory_time_format") || "auto",
  temperatureUnit: localStorage.getItem("it_inventory_temperature_unit") || "celsius",
  weather: null,
  devices: [],
  filtered: [],
  selectedDeviceId: "",
  selectedDetail: null,
  selectedScans: [],
  selectedHistory: [],
  accessTokens: [],
  collectionInvites: [],
  currentInviteCode: "",
  currentInvite: null,
  rawInviteUrls: {},
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
  collectorReleases: null,
  detectedPlatform: "unknown",
  prefillCode: "",
  collectorLaunchUrl: "",
  collectorInstallState: JSON.parse(localStorage.getItem(COLLECTOR_INSTALL_STATE_KEY) || "null"),
  mapProvider: "openstreetmap",
};
let pendingRetirement = null;

const statusLabels = {
  fr: { active: "Actif", replace: "A remplacer", stock: "En stock", lost: "Perdu", retired: "Sorti du parc" },
  en: { active: "Active", replace: "Replace", stock: "In stock", lost: "Lost", retired: "Retired" },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
let pendingReassignment = null;

const organizationPalette = [
  "#3b6ea8", "#21867a", "#4f8a52", "#b88325", "#b86632", "#b45c75",
  "#7b61a8", "#4e68b0", "#2f8898", "#7a963f", "#64748b", "#b15f9a",
];

const englishTranslations = {
  "Inventaire IT": "IT Inventory",
  "Navigation principale": "Main navigation",
  "Collecte": "Collection",
  "Activer le mode sombre": "Enable dark mode",
  "Activer le mode clair": "Enable light mode",
  "Changer de theme": "Change theme",
  "Changer de langue": "Change language",
  "Accès utilisateur": "User access",
  "Declarer un poste": "Register a computer",
  "Une page web seule ne peut pas lire le numero de serie, le CPU, la RAM ou le stockage complet. La collecte materielle passe donc par un script local lance volontairement par l'utilisateur.": "A web page alone cannot read the serial number, CPU, RAM, or full storage details. Hardware collection therefore uses a local script run voluntarily by the user.",
  "Token de collecte": "Collection token",
  "Invitation chargée": "Invitation loaded",
  "Vos informations sont pre-remplies. Telechargez le collecteur, relisez puis envoyez.": "Your information is prefilled. Download the collector, review, then submit.",
  "Mode support IT: utiliser un token manuel": "IT support mode: use a manual token",
  "Lien d'invitation": "Invitation link",
  "Chargé automatiquement depuis le lien": "Loaded automatically from the link",
  "Methode recommandee: telechargez l'application adaptee a votre systeme. Le fichier de pre-remplissage est telecharge automatiquement et le collecteur le detectera au demarrage.": "Recommended method: download the app for your system. After installation, open it from this page to load the profile automatically.",
  "Methode recommandee: telechargez l'application adaptee a votre systeme. Apres installation, ouvrez le collecteur depuis cette page pour charger le profil automatiquement.": "Recommended method: download the app for your system. After installation, open the collector from this page to load the profile automatically.",
  "Code support de pré-remplissage": "Support prefill code",
  "Preparation terminee. Telechargez le collecteur.": "Preparation complete. Download the collector.",
  "Invitations de collecte": "Collection invitations",
  "Créer un lien d'invitation": "Create invitation link",
  "Envoyez ce lien a l'utilisateur. Il ne verra pas le token technique.": "Send this link to the user. They will not see the technical token.",
  "Lien copie.": "Link copied.",
  "Aucun lien a copier": "No link to copy",
  "Invitation créée.": "Invitation created.",
  "Invitation révoquée.": "Invitation revoked.",
  "Invitation supprimée.": "Invitation deleted.",
  "Supprimer cette invitation ?": "Delete this invitation?",
  "Aucune invitation générée.": "No invitations generated.",
  "Tokens techniques avances": "Advanced technical tokens",
  "Optionnel": "Optional",
  "Champ requis.": "Required field.",
  "Adresse email invalide.": "Invalid email address.",
  "Email propriétaire invalide.": "Invalid owner email.",
  "Veuillez compléter les champs requis.": "Please complete the required fields.",
  "Nom": "Last name",
  "Prénom": "First name",
  "Équipe": "Team",
  "Établissement": "Location",
  "Proposer une nouvelle equipe": "Propose a new team",
  "Proposer un nouvel etablissement": "Propose a new location",
  "Selectionnez une equipe": "Select a team",
  "Selectionnez un etablissement": "Select a location",
  "Collecte transparente": "Transparent collection",
  "Ce collecteur recupere uniquement les informations d'inventaire utiles a l'equipe IT.": "This collector only gathers inventory information needed by the IT team.",
  "hostname, OS, fabricant, modèle et numéro de série": "hostname, OS, manufacturer, model, and serial number",
  "Numéro modèle / SKU": "Model number / SKU",
  "Etiquette service": "Service tag",
  "CPU, RAM, stockage, GPU si disponible": "CPU, RAM, storage, GPU if available",
  "IP locale, MAC si autorisee, utilisateur OS connecte": "Local IP, MAC if allowed, logged-in OS user",
  "Aucun fichier personnel, historique navigateur, mot de passe ou outil de controle distant n'est lu ou installe.": "No personal files, browser history, passwords, or remote-control tool are read or installed.",
  "Commentaire optionnel": "Optional comment",
  "Generer la commande": "Generate command",
  "Preparer le collecteur": "Prepare collector",
  "Remplissez le formulaire pour preparer le collecteur et pre-remplir l'application.": "Complete the form to prepare the collector and prefill the app.",
  "Methode recommandee: telechargez l'application adaptee a votre systeme, chargez le code de pre-remplissage, relisez les donnees collectees puis envoyez.": "Recommended method: download the app for your system, load the prefill code, review the collected data, then submit.",
  "Token temporaire a utiliser dans l'application": "Temporary token to use in the app",
  "Code de pré-remplissage": "Prefill code",
  "Copier le code de pré-remplissage": "Copy prefill code",
  "Copier le token collecteur": "Copy collector token",
  "Application native recommandee": "Recommended native app",
  "Detection du systeme en cours...": "Detecting system...",
  "Télécharger le collecteur": "Download collector",
  "Autres versions": "Other versions",
  "Autre plateforme": "Other platform",
  "Télécharger le collecteur Windows": "Download Windows Collector",
  "Télécharger le collecteur macOS": "Download macOS Collector",
  "Télécharger le collecteur Linux": "Download Linux Collector",
  "Télécharger le collecteur": "Download Collector",
  "Collecteur detecte pour": "Collector detected for",
  "Choisissez votre plateforme ci-dessous.": "Choose your platform below.",
  "Aucun asset collecteur disponible pour cette plateforme.": "No collector asset is available for this platform.",
  "Code cree. Telechargez le collecteur puis chargez le code de pre-remplissage.": "Code created. Download the collector, then load the prefill code.",
  "Application collecteur": "Collector app",
  "Version transparente Python/Tkinter pour Windows, Ubuntu/Linux et macOS. Elle affiche les données avant envoi.": "Transparent Python/Tkinter version for Windows, Ubuntu/Linux, and macOS. It shows data before sending.",
  "Fallback PowerShell": "PowerShell fallback",
  "Mode avancé IT": "Advanced IT mode",
  "Script lisible pour diagnostic ou support IT. Les antivirus peuvent bloquer les scripts lances depuis le navigateur.": "Readable script for diagnostics or IT support. Antivirus tools may block browser-launched scripts.",
  "Script lisible, non obfusque, a copier ou telecharger si l'application collecteur n'est pas disponible.": "Readable, non-obfuscated script to copy or download if the collector app is unavailable.",
  "Copier la commande": "Copy command",
  "Copier le script": "Copy script",
  "Apercu du script PowerShell": "PowerShell script preview",
  "Télécharger le script": "Download script",
  "Connexion": "Sign in",
  "Mot de passe admin": "Admin password",
  "Mot de passe": "Password",
  "Identifiant": "Username",
  "Nom affiche": "Display name",
  "Utilisateurs & roles": "Users & roles",
  "Utilisateurs": "Users",
  "Nouveau compte": "New account",
  "Enregistrer le compte": "Save account",
  "Compte actif": "Active account",
  "Compte utilisateur": "User account",
  "Dernière connexion": "Last login",
  "Creation": "Created",
  "Securite": "Security",
  "Vide = inchange": "Empty = unchanged",
  "Generer un mot de passe": "Generate password",
  "Copier le mot de passe": "Copy password",
  "Password copied": "Password copied",
  "No password to copy": "No password to copy",
  "Mot de passe généré.": "Password generated.",
  "Copie impossible.": "Copy failed.",
  "Aucune commande a copier": "No command to copy",
  "Aucun token a copier": "No token to copy",
  "Code copie.": "Code copied.",
  "Aucun code a copier": "No code to copy",
  "Télécharger le fichier de pré-remplissage": "Download prefill file",
  "Fichier de pre-remplissage telecharge. Ouvrez le collecteur: il le detectera automatiquement.": "Prefill file downloaded. Open the collector: it will detect it automatically.",
  "Aucun code de pré-remplissage": "No prefill code",
  "Aucun script a copier": "No script to copy",
  "Actif": "Active",
  "Desactive": "Disabled",
  "Centre de notifications": "Notification center",
  "Validation": "Validation",
  "Pending changes": "Pending changes",
  "Validations": "Pending changes",
  "Les propositions utilisateur ne creent pas d'equipe ou d'etablissement avant validation admin.": "User proposals do not create teams or locations before admin approval.",
  "Approuver": "Approve",
  "Rejeter": "Reject",
  "Lier a l'existant": "Link existing",
  "Modifier et approuver": "Modify and approve",
  "Proposition traitee.": "Proposal processed.",
  "Format horaire": "Time format",
  "Heure": "Time",
  "Heure actuelle": "Current time",
  "Meteo": "Weather",
  "Meteo indisponible": "Weather unavailable",
  "Basculer Celsius Fahrenheit": "Toggle Celsius/Fahrenheit",
  "Auto": "Auto",
  "Sortir la machine du parc": "Retire device",
  "Ajoutez une note avant de confirmer la sortie du parc.": "Please add a retirement note before confirming.",
  "Note de sortie du parc requise.": "Retirement note required.",
  "Confirmer": "Confirm",
  "Aucun utilisateur actuel": "No current user",
  "Chronologie utilisateurs": "User timeline",
  "Utilise de": "Used from",
  "a": "to",
  "a aujourd'hui": "to present",
  "Durée": "Duration",
  "Assigne par": "Assigned by",
  "Retire par": "Unassigned by",
  "Source": "Source",
  "Pourquoi": "Why",
  "Qui": "Who",
  "Quand": "When",
  "Comment": "How",
  "Quoi": "What",
  "MANUAL_ADMIN": "Manual admin",
  "COLLECTOR": "Collector",
  "IMPORT": "Import",
  "SYSTEM": "System",
  "notification.deviceRetired.title": "Device retired",
  "notification.deviceRetired.message": "A device has been retired.",
  "notification.deviceReactivated.title": "Device reactivated",
  "notification.deviceReactivated.message": "A device has been reactivated.",
  "notification.deviceReassigned.title": "Device reassigned",
  "notification.deviceReassigned.message": "A device assignment has changed.",
  "notification.pendingTeam.title": "Pending team proposal",
  "notification.pendingTeam.message": "A new team proposal is waiting for review.",
  "notification.pendingLocation.title": "Pending location proposal",
  "notification.pendingLocation.message": "A new location proposal is waiting for review.",
  "notification.collectorReceived.title": "Collector submission received",
  "notification.collectorReceived.message": "A device inventory submission was received.",
  "notification.collectorFailed.title": "Collector submission failed",
  "notification.collectorFailed.message": "A device inventory submission failed.",
  "notification.adminAction.title": "Admin action completed",
  "notification.adminAction.message": "An admin action has been completed.",
  "notification.tokenRevoked.title": "Token revoked",
  "notification.tokenRevoked.message": "A collection token was revoked.",
  "notification.tokenDeleted.title": "Token deleted",
  "notification.tokenDeleted.message": "A collection token was deleted.",
  "notification.tokenExpired.title": "Token expired",
  "notification.tokenExpired.message": "A collection token has expired.",
  "notification.ownerChanged.title": "Device owner changed",
  "notification.ownerChanged.message": "A device owner has changed.",
  "notification.teamChanged.title": "Team changed",
  "notification.teamChanged.message": "A device team has changed.",
  "notification.locationChanged.title": "Location changed",
  "notification.locationChanged.message": "A device location has changed.",
  "notification.osChanged.title": "OS changed",
  "notification.osChanged.message": "A device operating system has changed.",
  "notification.hardwareChanged.title": "Hardware changed",
  "notification.hardwareChanged.message": "A device hardware profile has changed.",
  "notification.userRemoved.title": "Current user removed",
  "notification.userRemoved.message": "A device no longer has a current user.",
  "notification.deviceOld.title": "Device older than threshold",
  "notification.deviceOld.message": "A device is older than the replacement threshold.",
  "notification.lowCpu.title": "Low CPU score",
  "notification.lowCpu.message": "A device has a low CPU performance score.",
  "notification.lowRam.title": "Low RAM device",
  "notification.lowRam.message": "A device has less RAM than recommended.",
  "notification.pendingApproved.title": "Pending change approved",
  "notification.pendingApproved.message": "A pending change has been approved.",
  "notification.pendingRejected.title": "Pending change rejected",
  "notification.pendingRejected.message": "A pending change has been rejected.",
  "notification.deleteBlocked.title": "Deletion blocked",
  "notification.deleteBlocked.message": "This team or location still has linked devices or users.",
  "Abréviation déjà utilisée par une autre équipe.": "Abbreviation already used by another team.",
  "Abréviation déjà utilisée par un autre établissement.": "Abbreviation already used by another location.",
  "Commande generee. Proposition envoyee a l'admin.": "Command generated. Proposal sent to admin.",
  "Commande copiee.": "Command copied.",
  "Script copie.": "Script copied.",
  "Tout marquer comme lu": "Mark all as read",
  "Marquer lu": "Mark read",
  "Non lues": "Unread",
  "Lues": "Read",
  "Severite": "Severity",
  "Compte créé.": "Account created.",
  "Compte mis a jour.": "Account updated.",
  "Compte supprimé.": "Account deleted.",
  "Notifications mises a jour.": "Notifications updated.",
  "Notification marquee comme lue.": "Notification marked as read.",
  "Element lié introuvable.": "Related item not found.",
  "Se connecter": "Sign in",
  "Dashboard": "Dashboard",
  "Vue du parc informatique": "IT fleet overview",
  "Actualiser": "Refresh",
  "Enrichir": "Enrich",
  "Enrichir les données": "Enrich data",
  "Déconnexion": "Sign out",
  "Sections d'administration": "Administration sections",
  "Parc": "Fleet",
  "Organisation": "Organization",
  "Valorisation": "Valuation",
  "Accès": "Access",
  "Accès collecte": "Collection access",
  "Tokens temporaires": "Temporary tokens",
  "Libellé": "Label",
  "Durée": "Duration",
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
  "Dernière utilisation": "Last used",
  "Etat": "Status",
  "Structure": "Structure",
  "Équipes": "Teams",
  "Nouvelle équipe": "New team",
  "Nom de l'équipe": "Team name",
  "Abréviation": "Abbreviation",
  "Description": "Description",
  "Couleur": "Color",
  "Équipe active": "Active team",
  "Enregistrer l'équipe": "Save team",
  "Implantations": "Locations",
  "Établissements": "Locations",
  "Nouvel établissement": "New location",
  "Nom de l'établissement": "Location name",
  "Type d'établissement": "Location type",
  "Discipline": "Discipline",
  "Entrepot": "Warehouse",
  "Boutique": "Store",
  "Siege social": "Headquarters",
  "Centre R&D": "R&D center",
  "Comptabilite": "Accounting",
  "Bureau": "Office",
  "Teletravail": "Remote",
  "Autre": "Other",
  "Sport general": "General sport",
  "Velo / cycling": "Bike / cycling",
  "Sports de raquette": "Racket sports",
  "Couleur par défaut": "Default color",
  "Rechercher une adresse": "Search for an address",
  "Commencez a saisir une adresse...": "Start typing an address...",
  "Adresse": "Address",
  "Code postal": "Postal code",
  "Ville": "City",
  "Pays": "Country",
  "Établissement actif": "Active location",
  "Enregistrer l'établissement": "Save location",
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
  "Modèle": "Model",
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
  "Dernière remontée": "Last report",
  "Detail": "Details",
  "Selectionnez une machine": "Select a computer",
  "Aucune machine s?lectionn?e.": "No computer selected.",
  "Valeur estimée": "Estimated value",
  "Valeur matérielle": "Hardware value",
  "Valorisation du parc": "Fleet valuation",
  "Enrichir toutes les machines": "Enrich all devices",
  "Recalculer les valeurs": "Recalculate values",
  "Importer benchmarks CPU": "Import CPU benchmarks",
  "Exporter inventaire enrichi": "Export enriched inventory",
  "Les valeurs sont des estimations basees sur le modèle, le CPU, la RAM, le GPU, la categorie et une depreciation par age.": "Values are estimates based on model, CPU, RAM, GPU, category, and age depreciation.",
  "Valeur de lancement totale": "Total launch value",
  "Valeur actuelle totale": "Total current value",
  "Depreciation moyenne": "Average depreciation",
  "Age moyen": "Average age",
  "Plus de 4 ans": "Older than 4 years",
  "Priorite elevee": "High priority",
  "Valeur par équipe": "Value by team",
  "Distribution des ages": "Age distribution",
  "Distribution des performances": "Performance distribution",
  "Priorite de remplacement": "Replacement priority",
  "Benchmarks importés": "Imported benchmarks",
  "Jeu intégré": "Bundled dataset",
  "Enrichir cette machine": "Enrich this device",
  "Source enrichissement": "Enrichment source",
  "Statut enrichissement": "Enrichment status",
  "Priorite remplacement": "Replacement priority",
  "Categorie matérielle": "Hardware category",
  "Valeur actuelle estimée": "Estimated current value",
  "Confiance prix": "Price confidence",
  "Notes enrichissement": "Enrichment notes",
  "GPU": "GPU",
  "Type stockage": "Storage type",
  "Fichier CPU importe.": "CPU file imported.",
  "Enrichissement terminé.": "Enrichment completed.",
  "Recalcul terminé.": "Recalculation completed.",
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
  "Génération CPU": "CPU génération",
  "Annee CPU": "CPU year",
  "Annee modèle": "Model year",
  "Prix lancement": "Launch price",
  "Valeur actuelle": "Current value",
  "Confiance": "Confidence",
  "Reco": "Recommendation",
  "Dernier enrichissement": "Last enrichment",
  "Mettre a jour": "Update",
  "Historique des scans": "Scan history",
  "Cycle de vie": "Lifecycle",
  "Version OS": "OS version",
  "Aucun scan detaille.": "No detailed scans.",
  "Historique prix marché": "Market price history",
  "Aucun prix externe collecte.": "No external prices collected.",
  "Non renseigné": "Not provided",
  "Aucune donnee.": "No data.",
  "Machines par établissement": "Computers by location",
  "Machines par équipe": "Computers by team",
  "Non mises a jour": "Not recently updated",
  "A jour": "Up to date",
  "Anciennete du parc": "Fleet age",
  "Modeles presents": "Most common models",
  "RAM moyenne par équipe": "Average RAM by team",
  "Valeur actuelle estimée": "Estimated current value",
  "Valeur par établissement": "Value by location",
  "Top machines a remplacer": "Top computers to replace",
  "Age matériel vs CPU": "Hardware age vs CPU",
  "Enrichissement requis.": "Enrichment required.",
  "Enrichissement...": "Enriching...",
  "Aucune équipe.": "No teams.",
  "Aucun établissement.": "No locations.",
  "Aucun token généré.": "No tokens generated.",
  "Révoquer": "Revoke",
  "Supprimer": "Delete",
  "Annuler": "Cancel",
  "Confirmer la suppression": "Confirm deletion",
  "Révoqué": "Revoked",
  "Expiré": "Expired",
  "Epuise": "Exhausted",
  "Valide": "Valid",
  "Token complet indisponible apres rechargement": "Full token unavailable after reload",
  "Agence Paris - juin": "Paris office - June",
  "Nom, hostname, modèle, serial...": "Name, hostname, model, serial...",
  "Commande générée.": "Command generated.",
  "Commande copiee.": "Command copied.",
  "Token généré.": "Token generated.",
  "Token copie.": "Token copied.",
  "Token révoqué.": "Token revoked.",
  "Token supprimé.": "Token deleted.",
  "Équipe supprimée.": "Team deleted.",
  "Établissement supprimé.": "Location deleted.",
  "Affectations mises a jour.": "Assignments updated.",
  "Réaffectation terminée.": "Reassignment completed.",
  "Ordre enregistre.": "Order saved.",
  "Fabricant": "Manufacturer",
  "Trier par": "Sort by",
  "Famille": "Family",
  "Affectations": "Assignments",
  "Propriétaire": "Owner",
  "Prénom propriétaire": "Owner first name",
  "Nom propriétaire": "Owner last name",
  "Email propriétaire": "Owner email",
  "Enregistrer les affectations": "Save assignments",
  "Reaffecter les elements liés": "Reassign linked records",
  "Nouvelle destination": "New destination",
  "Reaffecter": "Reassign",
  "Machines par fabricant": "Devices by manufacturer",
  "Fabricant et OS": "Manufacturer and OS",
  "Age moyen par fabricant": "Average age by manufacturer",
  "Vue generale": "Overview",
  "Matériel": "Hardware",
  "Réseau": "Network",
  "Affectation": "Assignment",
  "Historique": "History",
  "De": "From",
  "Vers": "To",
  "Aucun historique.": "No history.",
  "Ajouter la note": "Add note",
  "Ajouter une note a l'historique...": "Add a history note...",
  "Machine créée": "Device created",
  "Machine mise a jour": "Device updated",
  "Machine sortie du parc": "Device retired",
  "Machine réactivée": "Device reactivated",
  "Utilisateur affecté": "User assigned",
  "Utilisateur réaffecté": "User reassigned",
  "Utilisateur retiré": "User removed",
  "Équipe modifi?e": "Team changed",
  "Établissement modifi?": "Location changed",
  "Systeme mis a jour": "OS changed",
  "Matériel modifi?": "Hardware changed",
  "Statut modifi?": "Status changed",
  "Collecte mise a jour": "Collector update",
  "Reinitialisation detectee": "Reset detected",
  "Note administrateur": "Admin note",
  "Import mis a jour": "Import updated",
  "Sections machine": "Device sections",
  "Scans": "Scans",
  "Prix marché": "Market prices",
  "Nom d'hote": "Hostname",
  "Version OS": "OS version",
  "Numéro de série": "Serial number",
  "RAM totale": "Total RAM",
  "Mémoire": "Memory",
  "Stockage total": "Total storage",
  "Type stockage": "Storage type",
  "Utilisateur OS": "OS user",
  "Email propriétaire": "Owner email",
  "Note ajoutee.": "Note added.",
  "Statut mis a jour.": "Status updated.",
  "Equipe mise a jour.": "Team updated.",
  "Équipe créée.": "Team created.",
  "Etablissement mis a jour.": "Location updated.",
  "Établissement créé.": "Location created.",
  "Recherche d'adresse...": "Searching addresses...",
  "Aucune adresse trouvee.": "No address found.",
  "Selection de l'adresse...": "Loading address...",
  "Adresse completee automatiquement.": "Address completed automatically.",
  "Google Places n'est pas configure.": "Google Places is not configured.",
  "Mode clair": "Light mode",
  "Mode sombre": "Dark mode",
};

const frenchNotificationTranslations = {
  "notification.deviceRetired.title": "Machine sortie du parc",
  "notification.deviceRetired.message": "Une machine a ete sortie du parc.",
  "notification.deviceReactivated.title": "Machine réactivée",
  "notification.deviceReactivated.message": "Une machine a ete reactivee.",
  "notification.deviceReassigned.title": "Machine reaffectee",
  "notification.deviceReassigned.message": "L'affectation d'une machine a change.",
  "notification.pendingTeam.title": "Proposition d'équipe en attente",
  "notification.pendingTeam.message": "Une nouvelle proposition d'équipe attend validation.",
  "notification.pendingLocation.title": "Proposition d'établissement en attente",
  "notification.pendingLocation.message": "Une nouvelle proposition d'établissement attend validation.",
  "notification.collectorReceived.title": "Collecte reçue",
  "notification.collectorReceived.message": "Une remontee d'inventaire machine a ete recue.",
  "notification.collectorFailed.title": "Échec de collecte",
  "notification.collectorFailed.message": "Une remontee d'inventaire machine a echoue.",
  "notification.adminAction.title": "Action admin terminée",
  "notification.adminAction.message": "Une action admin a ete terminee.",
  "notification.tokenRevoked.title": "Token révoqué",
  "notification.tokenRevoked.message": "Un token de collecte a ete revoque.",
  "notification.tokenDeleted.title": "Token supprimé",
  "notification.tokenDeleted.message": "Un token de collecte a ete supprime.",
  "notification.tokenExpired.title": "Token expiré",
  "notification.tokenExpired.message": "Un token de collecte a expire.",
  "notification.ownerChanged.title": "Propriétaire modifi?",
  "notification.ownerChanged.message": "Le proprietaire d'une machine a change.",
  "notification.teamChanged.title": "Équipe modifi?e",
  "notification.teamChanged.message": "L'equipe d'une machine a change.",
  "notification.locationChanged.title": "Établissement modifi?",
  "notification.locationChanged.message": "L'etablissement d'une machine a change.",
  "notification.osChanged.title": "OS modifi?",
  "notification.osChanged.message": "Le systeme d'exploitation d'une machine a change.",
  "notification.hardwareChanged.title": "Matériel modifi?",
  "notification.hardwareChanged.message": "Le profil materiel d'une machine a change.",
  "notification.userRemoved.title": "Utilisateur actuel retire",
  "notification.userRemoved.message": "Une machine n'a plus d'utilisateur actuel.",
  "notification.deviceOld.title": "Machine au-dessus du seuil d'ancienneté",
  "notification.deviceOld.message": "Une machine depasse le seuil de remplacement.",
  "notification.lowCpu.title": "Score CPU faible",
  "notification.lowCpu.message": "Une machine a un score CPU faible.",
  "notification.lowRam.title": "RAM faible",
  "notification.lowRam.message": "Une machine a moins de RAM que recommande.",
  "notification.pendingApproved.title": "Proposition approuvee",
  "notification.pendingApproved.message": "Une proposition a ete approuvee.",
  "notification.pendingRejected.title": "Proposition rejetee",
  "notification.pendingRejected.message": "Une proposition a ete rejetee.",
  "notification.deleteBlocked.title": "Suppression bloquée",
  "notification.deleteBlocked.message": "Cette équipe ou cet établissement contient encore des machines ou utilisateurs liés.",
};

function translate(value) {
  if (String(value || "").startsWith("notification.")) {
    return state.language === "en"
      ? englishTranslations[value] || value
      : frenchNotificationTranslations[value] || value;
  }
  return state.language === "en" ? englishTranslations[value] || value : value;
}

function currentStatusLabels() {
  return statusLabels[state.language] || statusLabels.fr;
}

function localizedEnrichmentValue(value) {
  const labels = {
    fr: {
      completed: "Terminé", partial: "Partiel", failed: "Échec", pending: "En attente",
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
  renderNotifications();
  syncAdminUserActiveLabel();
  updateWeatherDisplay();
  if (state.selectedDetail) renderDetail(state.selectedDetail, state.selectedScans, state.selectedHistory);
  translateElement(document.body);
  updateTimeFormatButton();
  updateCollectorDownloadUi();
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
    const allowed = canPerformAction(node.dataset.permission);
    if (node.classList.contains("admin-section-view")) {
      node.classList.toggle("permission-hidden", !allowed);
    } else {
      node.classList.toggle("is-hidden", !allowed);
    }
  });
  const editable = canPerformAction("DEVICE_EDIT");
  ["#enrich-admin", "#valuation-enrich-all", "#valuation-recalculate", "#import-cpu-benchmarks"].forEach((selector) => {
    const node = $(selector);
    if (node) node.classList.toggle("is-hidden", !editable);
  });
  $("#export-csv")?.classList.toggle("is-hidden", !canPerformAction("EXPORT_DATA"));
  const sessionLabel = $("#admin-session-label");
  if (sessionLabel) {
    sessionLabel.innerHTML = state.currentAdmin ? renderSessionRole(state.currentAdmin) : "";
    sessionLabel.title = state.currentAdmin
      ? `${state.currentAdmin.displayName || state.currentAdmin.username} - ${formatRoleLabel(state.currentAdmin.role)}`
      : "";
  }
}

function roleIcon(role) {
  const paths = {
    ADMIN: '<path d="M12 3 4 6v6c0 5 3.4 8.1 8 10 4.6-1.9 8-5 8-10V6l-8-3Z"></path><path d="m9 12 2 2 4-5"></path>',
    MANAGER: '<rect width="18" height="14" x="3" y="7" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"></path>',
    VIEWER: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle>',
    READ_ONLY: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle>',
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
    const invite = await api(`/collect/invite/${encodeURIComponent(inviteCode)}`);
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
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

function displayWithAbbreviation(name, abbreviation) {
  const abbr = String(abbreviation || "").trim().toUpperCase();
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
  const fullOs = [device.os_name || device.osType || device.os_type, device.os_version].filter(Boolean).join(" ").trim();
  if (!fullOs) return "-";
  const info = normalizeOsInfo(fullOs);
  return `<span class="os-badge ${info.iconType}" title="${escapeHtml(fullOs)}" aria-label="${escapeHtml(fullOs)}">${osIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
}

function roundedCapacityGb(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const common = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];
  const match = common.find((candidate) => Math.abs(numeric - candidate) / candidate <= 0.08);
  return match || Math.round(numeric);
}

function formatCapacityGb(value, suffix = "Go") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const rounded = roundedCapacityGb(numeric);
  if (rounded && Math.abs(rounded - numeric) >= 0.1) {
    return `${rounded} ${suffix} (${numeric.toLocaleString(state.language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 })} ${suffix})`;
  }
  return `${numeric.toLocaleString(state.language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 })} ${suffix}`;
}

function latestScanPayload(scans = []) {
  return scans.find((scan) => scan.payload)?.payload || {};
}

function memorySummary(payload = {}) {
  const modules = Array.isArray(payload.memoryModules) ? payload.memoryModules : [];
  if (!modules.length) return "";
  const types = [...new Set(modules.map((module) => module.memoryType || module.type).filter(Boolean))];
  const speeds = [...new Set(modules.map((module) => Number(module.speedMhz || module.configuredSpeedMhz || 0)).filter(Boolean))];
  const slots = modules.length;
  return [
    slots ? `${slots} slot${slots > 1 ? "s" : ""}` : "",
    types.join(" + "),
    speeds.length ? `${speeds.join(" / ")} MHz` : "",
  ].filter(Boolean).join(" · ");
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

function normalizeTeamInfo(teamName, abbreviation = "") {
  const rawTeamName = String(teamName || "").trim();
  const normalized = rawTeamName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  const storedAbbreviation = String(abbreviation || "").trim().toUpperCase();
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
    purchase: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6"/>',
    hr: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    sales: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    tech: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
    design: '<path d="m12 19 7-7 3 3-7 7-3-3ZM18 13l-1.5-7.5L2 2l3.5 14.5L13 18M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
    store: '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    logistics: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    marketplace: '<path d="M3 9l2-5h14l2 5M5 13v7h14v-7"/><path d="M8 16h8M8 20v-7M16 20v-7"/><circle cx="12" cy="6" r="1"/>',
    catalog: '<path d="M4 5c0-1 4-2 8-2s8 1 8 2-4 2-8 2-8-1-8-2Z"/><path d="M4 5v6c0 1 4 2 8 2s8-1 8-2V5M4 11v6c0 1 4 2 8 2s8-1 8-2v-6"/><path d="M12 8v8M9 13l3 3 3-3"/>',
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
  const normalizedType = ["bike", "racket", "football", "golf", "lifestyle", "running", "general", "office", "store", "warehouse", "headquarters", "remote", "other"].includes(disciplineType)
    ? disciplineType
    : ["office", "store", "warehouse", "headquarters", "remote", "other"].includes(type)
      ? type
      : "other";
  const storedAbbreviation = String(abbreviation || "").trim().toUpperCase();
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
    football: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 5h-5L8 10l4-3ZM5 10l3 0M16 10l3 0M9.5 15 8 19M14.5 15 16 19"/>',
    golf: '<path d="M8 21V4l10 3-10 3"/><path d="M4 21h12"/><circle cx="17" cy="18" r="1"/>',
    lifestyle: '<path d="M6 8h12l2 12H4L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M8 15h8M10 12h4"/>',
    running: '<path d="M4 16c5 0 7-4 11-4h2l3 4-2 2H9c-3 0-4-1-5-2Z"/><path d="M12 12 9 8M15 12l-1-4M6 20h12"/>',
    general: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v3a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3"/>',
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

function openReassignment(entityType, sourceId, références) {
  const candidates = entityType === "team" ? state.teams : state.establishments;
  const select = $("#reassign-form").elements.targetId;
  select.innerHTML = candidates
    .filter((item) => item.id !== sourceId && item.active)
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join("");
  if (!select.options.length) {
    toast(state.language === "en"
      ? "Create another active destination before reassigning."
      : "Creez une autre destination active avant la réaffectation.", "error");
    return;
  }
  pendingReassignment = { entityType, sourceId };
  $("#reassign-form").elements.entityType.value = entityType;
  $("#reassign-form").elements.sourceId.value = sourceId;
  $("#reassign-message").textContent = state.language === "en"
    ? `${references.devices || 0} device(s) and ${references.users || 0} user(s) are linked. Choose a destination; the original record will then be deleted.`
    : `${références.devices || 0} machine(s) et ${références.users || 0} utilisateur(s) sont liés. Choisissez une destination; l'ancien element sera ensuite supprimé.`;
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

function effectiveTimePreference() {
  return state.timeFormatPreference === "auto"
    ? (state.language === "en" ? "12h" : "24h")
    : state.timeFormatPreference;
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
  const display = state.timeFormatPreference === "auto"
    ? "Auto"
    : (state.timeFormatPreference === "24h" ? "24h" : "AM/PM");
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
      0: "Ciel clair", 1: "Plutot clair", 2: "Partiellement nuageux", 3: "Couvert",
      45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine legere", 53: "Bruine", 55: "Bruine forte",
      61: "Pluie legere", 63: "Pluie", 65: "Pluie forte", 71: "Neige legere", 73: "Neige", 75: "Neige forte",
      80: "Averses", 81: "Averses", 82: "Averses fortes", 95: "Orage", 96: "Orage avec grele", 99: "Orage avec grele",
    },
    en: {
      0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
      80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
    },
  };
  return labels[state.language]?.[Number(code)] || (state.language === "en" ? "Weather" : "Meteo");
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
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(CONFIG.weatherLatitude));
  url.searchParams.set("longitude", String(CONFIG.weatherLongitude));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", unit);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather ${response.status}`);
    const data = await response.json();
    state.weather = {
      temperature: data.current?.temperature_2m,
      weatherCode: data.current?.weather_code,
      isDay: Boolean(data.current?.is_day),
      collectedAt: data.current?.time,
    };
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
  if (years) parts.push(state.language === "en" ? `${years} year${years > 1 ? "s" : ""}` : `${years} an${years > 1 ? "s" : ""}`);
  if (months) parts.push(state.language === "en" ? `${months} month${months > 1 ? "s" : ""}` : `${months} mois`);
  if (restDays || parts.length === 0) parts.push(state.language === "en" ? `${restDays} day${restDays > 1 ? "s" : ""}` : `${restDays} jour${restDays > 1 ? "s" : ""}`);
  return parts.join(", ");
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
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%^&*_-+=?",
  ];
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
        await api(`/admin/access-tokens/${button.dataset.id}/revoke`, { method: "POST", body: "{}" });
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
      const usage = invite.max_uses === null
        ? `${invite.use_count} / ${state.language === "en" ? "unlimited" : "illimite"}`
        : `${invite.use_count} / ${invite.max_uses}`;
      const inviteUrl = displayInviteUrl(invite.invite_url || state.rawInviteUrls[invite.id] || "");
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
      await copyText(displayInviteUrl(invite?.invite_url || state.rawInviteUrls[button.dataset.id]), "Lien copie.", "Aucun lien a copier");
    });
  });
  $$(".revoke-invite").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api(`/admin/collection-invites/${button.dataset.id}/revoke`, { method: "POST", body: "{}" });
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
        await api(`/admin/collection-invites/${button.dataset.id}`, { method: "DELETE" });
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
  const data = await api("/admin/collection-invites");
  state.collectionInvites = data.invites || [];
  renderCollectionInvites();
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
      <td>${formatDate(user.createdAt)}</td>
      <td>${formatDate(user.lastLoginAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">${translate("Aucune donnee.")}</td></tr>`;
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
  form.elements.password.type = "password";
  $("#admin-user-created-at").textContent = `${translate("Creation")}: -`;
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
  $("#admin-user-created-at").textContent = `${translate("Creation")}: ${formatDate(user.createdAt)}`;
  syncAdminUserActiveLabel();
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
    <article class="notification-item ${item.is_read ? "is-read" : ""} severity-${String(item.severity || "INFO").toLowerCase()}" role="button" tabindex="0" data-id="${escapeHtml(item.id)}">
      <div>
        <span class="notification-severity">${escapeHtml(item.severity || "INFO")}</span>
        <strong>${escapeHtml(notificationTitle(item))}</strong>
        <p>${escapeHtml(notificationMessage(item))}</p>
        <small>${formatDate(item.created_at)} (${formatRelativeDate(item.created_at)}) - ${escapeHtml(notificationTypeLabel(item.type))}</small>
      </div>
      ${item.is_read ? "" : `<button class="secondary mark-notification-read" type="button" data-id="${item.id}">${translate("Marquer lu")}</button>`}
    </article>
  `).join("") || `<p class="helper">${translate("Aucune donnee.")}</p>`;
  $$(".notification-item[data-id]").forEach((item) => {
    const activate = () => openNotificationTarget(item.dataset.id).catch((error) => toast(error.message, "error"));
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
  if (String(item.title || "").startsWith("notification.")) return translate(item.title);
  const key = notificationTypeKey(item.type);
  return key ? translate(`${key}.title`) : translate(item.title || item.type || "Notification");
}

function notificationMessage(item) {
  if (String(item.message || "").startsWith("notification.")) return translate(item.message);
  const key = notificationTypeKey(item.type);
  return key ? translate(`${key}.message`) : translate(item.message || "");
}

function notificationTypeLabel(type) {
  const key = notificationTypeKey(type);
  return key ? translate(`${key}.title`) : translate(type || "");
}

async function openNotificationTarget(id) {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) return;
  if (!notification.is_read) {
    await api(`/admin/notifications/${id}/read`, { method: "POST", body: "{}" });
  }
  const entityType = String(notification.related_entity_type || notification.relatedEntityType || "").toLowerCase();
  const entityId = notification.related_entity_id || notification.relatedEntityId || "";
  if (entityType === "device" && entityId) {
    setAdminView("fleet");
    if (!state.devices.some((device) => device.id === entityId)) await loadAdminData();
    if (!state.devices.some((device) => device.id === entityId)) {
      toast("Element lié introuvable.", "error");
      await loadNotifications();
      return;
    }
    await selectDevice(entityId);
    if (["DEVICE_RETIRED", "DEVICE_REACTIVATED", "DEVICE_REASSIGNED", "DEVICE_OWNER_CHANGED"].includes(String(notification.type || ""))) {
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
  $$(".detail-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.detailTab === tabName));
  $$(".detail-tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.detailPanel === tabName));
}

async function loadNotifications() {
  if (!canPerformAction("NOTIFICATION_VIEW")) return;
  const data = await api("/admin/notifications");
  state.notifications = data.notifications || [];
  state.unreadNotifications = data.unread || 0;
  renderNotifications();
}

function renderPendingChanges() {
  const existingTeamOptions = state.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`).join("");
  const existingSiteOptions = state.establishments.map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`).join("");
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
  state.pendingChanges = (data.pendingChanges || []).filter((item) => item.status === "PENDING");
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
    device.team_abbreviation,
    device.establishment_name,
    device.establishment_abbreviation,
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
    ["Valeur estimée", money(fleetValue)],
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

  renderBarChart('[data-valuation-chart="value-team"]', translate("Valeur par équipe"), sumBy(devices, (device) => device.team_name, estimatedValue), " EUR");
  renderBarChart('[data-valuation-chart="age"]', translate("Distribution des ages"), ageDistribution);
  renderBarChart('[data-valuation-chart="performance"]', translate("Distribution des performances"), performance);
  renderBarChart('[data-valuation-chart="priority"]', translate("Priorite de remplacement"), priorities);

  if (state.cpuBenchmarkStats) {
    $("#cpu-benchmark-status").textContent =
      `${translate("Benchmarks importés")}: ${state.cpuBenchmarkStats.importedCount} / ${translate("Jeu intégré")}: ${state.cpuBenchmarkStats.bundledCount}`;
  }
}

function renderDevices() {
  $("#result-count").textContent = state.language === "en"
    ? `${state.filtered.length} result${state.filtered.length === 1 ? "" : "s"}`
    : `${state.filtered.length} resultat${state.filtered.length === 1 ? "" : "s"}`;
  const labels = currentStatusLabels();
  $("#devices-table").innerHTML = state.filtered
    .map((device) => {
      const unassignedStatus = ["retired", "stock"].includes(device.status);
      const userName = unassignedStatus
        ? translate("Aucun utilisateur actuel")
        : (`${device.first_name || ""} ${device.last_name || ""}`.trim() || "-");
      const userEmail = unassignedStatus ? (labels[device.status] || translate("Sorti du parc")) : (device.email || "");
      return `
        <tr data-id="${device.id}" class="${device.id === state.selectedDeviceId ? "is-selected" : ""}">
          <td><strong class="cell-primary">${escapeHtml(device.hostname || "-")}</strong><small class="cell-secondary">${escapeHtml(device.serial_number || device.service_tag || "")}</small></td>
          <td><strong class="cell-primary">${escapeHtml(userName)}</strong><small class="cell-secondary">${escapeHtml(userEmail)}</small></td>
          <td>${renderTeamBadge(device.team_name, device.team_id, device.team_color)}</td>
          <td>${renderLocationBadge(device)}</td>
          <td>${renderOsBadge(device)}</td>
          <td class="manufacturer-cell">${renderManufacturerBadge(device)}<small>${escapeHtml([device.model, device.model_number].filter(Boolean).join(" / ") || "-")}</small></td>
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
    DEVICE_CREATED: "Machine créée",
    DEVICE_UPDATED: "Machine mise a jour",
    DEVICE_RETIRED: "Machine sortie du parc",
    DEVICE_REACTIVATED: "Machine réactivée",
    USER_ASSIGNED: "Utilisateur affecté",
    USER_REASSIGNED: "Utilisateur réaffecté",
    USER_REMOVED: "Utilisateur retiré",
    TEAM_CHANGED: "Équipe modifi?e",
    LOCATION_CHANGED: "Établissement modifi?",
    OS_CHANGED: "Systeme mis a jour",
    HARDWARE_CHANGED: "Matériel modifi?",
    STATUS_CHANGED: "Statut modifi?",
    COLLECTOR_UPDATE: "Collecte mise a jour",
    DEVICE_RESET: "Réinitialisation détectée",
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
    model: "Modèle",
    model_number: "Numéro modèle / SKU",
    service_tag: "Etiquette service",
    serial_number: "Numéro de série",
    cpu: "CPU",
    gpu: "GPU",
    ram_total_gb: "RAM totale",
    storage_total_gb: "Stockage total",
    storage_type: "Type stockage",
    windows_user: "Utilisateur OS",
    team_id: "Équipe",
    establishment_id: "Établissement",
    assigned_user_id: "Propriétaire",
    owner_email: "Email propriétaire",
    status: "Statut",
    legacy_google_sheets_history: "Historique Google Sheets",
  };
  return translate(labels[fieldName] || fieldName);
}

function cleanImportedText(value) {
  let text = String(value ?? "").trim();
  if (!text) return "";
  const replacements = {
    "�": "è",
    "ï¿½": "è",
    "Â·": "·",
    "Â ": " ",
    "Ã©": "é",
    "Ã¨": "è",
    "Ãª": "ê",
    "Ã«": "ë",
    "Ã ": "à",
    "Ã¢": "â",
    "Ã§": "ç",
    "Ã®": "î",
    "Ã¯": "ï",
    "Ã´": "ô",
    "Ã¹": "ù",
    "Ã»": "û",
    "Ã‰": "É",
  };
  Object.entries(replacements).forEach(([bad, good]) => {
    text = text.replaceAll(bad, good);
  });
  return text;
}

function parseHistoryJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

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

function renderHistoryTimeline(history) {
  return history.map((event) => `
    <article class="history-event">
      <span class="history-marker"></span>
      <div>
        <time>${formatDate(event.changed_at)} (${formatRelativeDate(event.changed_at)})</time>
        <strong>${escapeHtml(translate(historyLabel(event)))}</strong>
        ${event.field_name ? `<small>${escapeHtml(historyFieldLabel(event.field_name))}</small>` : ""}
        ${event.old_value !== null || event.new_value !== null ? `
          <p class="${event.field_name === "legacy_google_sheets_history" ? "history-change legacy-history-change" : "history-change"}">
            <span>${translate("De")}: ${escapeHtml(historyValueDisplay(event, "old"))}</span>
            <span>${translate("Vers")}: ${escapeHtml(historyValueDisplay(event, "new"))}</span>
          </p>
        ` : ""}
        ${event.notes ? `<p>${escapeHtml(cleanImportedText(event.notes))}</p>` : ""}
        <dl class="history-meta">
          <div><dt>${translate("Qui")}</dt><dd>${escapeHtml(event.changed_by || "system")}</dd></div>
          <div><dt>${translate("Comment")}</dt><dd>${escapeHtml(sourceLabel(event.source))}</dd></div>
          <div><dt>${translate("Quand")}</dt><dd>${escapeHtml(formatDate(event.changed_at))}</dd></div>
        </dl>
      </div>
    </article>
  `).join("") || `<p class="helper">${translate("Aucun historique.")}</p>`;
}

function sourceLabel(source) {
  const normalized = String(source || "SYSTEM").toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  if (normalized === "MANUAL") return translate("MANUAL_ADMIN");
  return translate(normalized);
}

function legacyAssignmentUser(data) {
  return [data?.firstName, data?.lastName].map(cleanImportedText).filter(Boolean).join(" ");
}

function sameLegacyAssignment(left, right) {
  return ["user_name", "team_name", "establishment_name"].every((field) =>
    cleanImportedText(left?.[field]).toLowerCase() === cleanImportedText(right?.[field]).toLowerCase());
}

function assignmentPeriodsFromLegacyHistory(history = [], fallbackPeriods = []) {
  const legacyEvents = history
    .filter((event) => event.field_name === "legacy_google_sheets_history" && event.new_value && event.changed_at)
    .map((event) => ({ event, data: parseHistoryJson(event.new_value) }))
    .filter(({ data }) => legacyAssignmentUser(data))
    .sort((left, right) => new Date(left.event.changed_at).getTime() - new Date(right.event.changed_at).getTime());

  if (legacyEvents.length === 0) return fallbackPeriods;

  const periods = [];
  legacyEvents.forEach(({ event, data }) => {
    const period = {
      user_name: legacyAssignmentUser(data),
      user_email: "",
      team_name: cleanImportedText(data.team),
      establishment_name: cleanImportedText(data.establishment),
      started_at: event.changed_at,
      ended_at: null,
      assigned_by: event.changed_by || "import",
      unassigned_by: "",
      source: "IMPORT",
      reason: state.language === "en"
        ? "Usage period reconstructed from the imported Google Sheets history."
        : "Periode d'utilisation reconstruite depuis l'historique Google Sheets importe.",
    };
    const previous = periods[periods.length - 1];
    if (sameLegacyAssignment(previous, period)) return;
    if (previous) {
      previous.ended_at = event.changed_at;
      previous.unassigned_by = event.changed_by || "import";
    }
    periods.push(period);
  });

  const lastLegacyDate = new Date(periods[periods.length - 1]?.started_at || 0).getTime();
  const laterManualPeriods = fallbackPeriods.filter((period) => {
    const startedAt = new Date(period.started_at).getTime();
    const source = String(period.source || "").toUpperCase();
    return startedAt > lastLegacyDate && source !== "SYSTEM";
  }).sort((left, right) => new Date(right.started_at).getTime() - new Date(left.started_at).getTime());

  if (laterManualPeriods.length > 0) {
    const firstManual = laterManualPeriods
      .slice()
      .sort((left, right) => new Date(left.started_at).getTime() - new Date(right.started_at).getTime())[0];
    periods[periods.length - 1].ended_at = firstManual.started_at;
    periods[periods.length - 1].unassigned_by = firstManual.assigned_by || "admin";
  }

  return [...laterManualPeriods, ...periods.slice().reverse()];
}

function renderAssignmentPeriods(periods = []) {
  return periods.map((period) => {
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
  }).join("") || `<p class="helper">${translate("Aucune donnee.")}</p>`;
}

function promptRetirementNote(device) {
  return new Promise((resolve) => {
    pendingRetirement = { resolve };
    $("#retire-dialog-title").textContent = translate("Sortir la machine du parc");
    $("#retire-dialog-message").textContent = `${translate("Ajoutez une note avant de confirmer la sortie du parc.")} ${device.hostname || ""}`.trim();
    $("#retire-note").value = "";
    $("#retire-dialog").showModal();
    $("#retire-note").focus();
  });
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
  const unassignedStatus = ["retired", "stock"].includes(device.status);
  const currentUserLabel = unassignedStatus
    ? translate("Aucun utilisateur actuel")
    : (`${device.first_name || ""} ${device.last_name || ""}`.trim() || device.email || translate("Non renseigné"));
  const payload = latestScanPayload(scans);
  const memoryDetails = memorySummary(payload);
  const teamOptions = state.teams.map((team) =>
    `<option value="${team.id}" ${device.team_id === team.id ? "selected" : ""}>${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`).join("");
  const establishmentOptions = state.establishments.map((site) =>
    `<option value="${site.id}" ${device.establishment_id === site.id ? "selected" : ""}>${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`).join("");
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
        <span>${escapeHtml([device.model, device.model_number].filter(Boolean).join(" / ") || translate("Non renseigné"))}</span>
      </span>
    </div>
    <nav class="detail-tabs" aria-label="${escapeHtml(translate("Sections machine"))}">
      <button class="detail-tab is-active" type="button" data-detail-tab="overview">${translate("Vue generale")}</button>
      <button class="detail-tab" type="button" data-detail-tab="hardware">${translate("Matériel")}</button>
      <button class="detail-tab" type="button" data-detail-tab="os">${translate("OS")}</button>
      <button class="detail-tab" type="button" data-detail-tab="network">${translate("Réseau")}</button>
      <button class="detail-tab" type="button" data-detail-tab="assignment">${translate("Affectation")}</button>
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
        ["Etiquette service", device.service_tag],
        ["Dernière remontée", formatDate(device.last_seen_at)],
        ["Utilisateur", currentUserLabel],
        ["Équipe", displayWithAbbreviation(device.team_name || "", device.team_abbreviation)],
        ["Établissement", displayWithAbbreviation(device.establishment_name || "", device.establishment_abbreviation)],
      ])}
      ${canEditDevice ? `<form id="status-form" class="form-grid one scan-history">
        <label>${translate("Statut")}<select name="status">${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${device.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <button type="submit" class="primary">${translate("Mettre a jour")}</button>
      </form>
      <button id="enrich-device" class="secondary detail-enrich-button" type="button">${translate("Enrichir cette machine")}</button>` : ""}
    </section>
    <section class="detail-tab-panel" data-detail-panel="hardware">
      ${detailRows([
        ["Serial", device.serial_number], ["Etiquette service", device.service_tag], ["Numéro modèle / SKU", device.model_number],
        ["CPU", device.cpu], ["GPU", device.gpu],
        ["RAM", device.ram_total_gb ? formatCapacityGb(device.ram_total_gb) : ""],
        ["Mémoire", memoryDetails],
        ["Stockage", `${formatCapacityGb(device.storage_total_gb) || "-"} total / ${formatCapacityGb(device.storage_free_gb) || "-"} libres`],
        ["Type stockage", device.storage_type], ["Score CPU", device.cpu_benchmark_score || device.cpu_score],
        ["Génération CPU", device.cpu_generation], ["Annee modèle", device.release_year || device.model_release_year],
        ["Prix lancement", money(device.estimated_launch_price)],
        ["Valeur actuelle estimée", money(device.estimated_current_value || device.current_market_price_avg)],
      ])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="network">
      ${detailRows([["MAC", device.mac_address], ["IP locale", device.local_ip], ["Utilisateur OS", device.windows_user], ["Script", device.script_version]])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="os">
      ${detailRows([["OS", device.os_name], ["Version OS", device.os_version], ["Dernière remontée", formatDate(device.last_seen_at)], ["Script", device.script_version]])}
    </section>
    <section class="detail-tab-panel" data-detail-panel="assignment">
      <div class="assignment-summary">${renderTeamBadge(device.team_name, device.team_id, device.team_color)} ${renderLocationBadge(device)}</div>
      ${canEditDevice ? `<form id="assignment-form" class="form-grid one assignment-form">
        <label>${translate("Équipe")}<select name="teamId"><option value="">${translate("Non renseigné")}</option>${teamOptions}</select></label>
        <label>${translate("Établissement")}<select name="establishmentId"><option value="">${translate("Non renseigné")}</option>${establishmentOptions}</select></label>
        <label>${translate("Propriétaire")}<select name="assignedUserId"><option value="">${translate("Non renseigné")}</option>${userOptions}</select></label>
        <label>${translate("Prénom propriétaire")}<input name="ownerFirstName" value="${escapeHtml(device.first_name || "")}" maxlength="120" /></label>
        <label>${translate("Nom propriétaire")}<input name="ownerLastName" value="${escapeHtml(device.last_name || "")}" maxlength="120" /></label>
        <label>${translate("Email propriétaire")}<input name="ownerEmail" type="email" value="${escapeHtml(device.email || "")}" maxlength="255" /></label>
        <button type="submit" class="primary">${translate("Enregistrer les affectations")}</button>
      </form>` : ""}
    </section>
    <section class="detail-tab-panel" data-detail-panel="history">
      <form id="history-note-form" class="history-note-form">
        <textarea name="notes" rows="3" maxlength="2000" placeholder="${escapeHtml(translate("Ajouter une note a l'historique..."))}" required></textarea>
        <button class="secondary" type="submit">${translate("Ajouter la note")}</button>
      </form>
      <div class="history-timeline">${renderHistoryTimeline(history)}</div>
      <div class="scan-history"><h3>${translate("Chronologie utilisateurs")}</h3>${renderAssignmentPeriods(assignmentPeriodsFromLegacyHistory(history, device.assignmentPeriods || []))}</div>
      <div class="scan-history"><h3>${translate("Scans")}</h3><ul>${scanRows || `<li>${translate("Aucun scan detaille.")}</li>`}</ul></div>
      <div class="scan-history"><h3>${translate("Prix marché")}</h3><ul>${priceRows || `<li>${translate("Aucun prix externe collecte.")}</li>`}</ul></div>
    </section>
    <section class="detail-tab-panel" data-detail-panel="lifecycle">
      ${detailRows([
        ["Statut", labels[device.status] || device.status],
        ["Score age", `${device.hardware_age_score || 0}/100`],
        ["Priorite remplacement", priorityValue !== null && priorityValue !== undefined ? `${priorityValue}/100` : ""],
        ["Reco", localizedEnrichmentValue(device.recommendation)],
        ["Dernier enrichissement", formatDate(device.last_enriched_at)],
        ["Confiance prix", device.price_confidence_score ? `${device.price_confidence_score}/100` : ""],
        ["Valeur actuelle estimée", money(device.estimated_current_value || device.current_market_price_avg)],
      ])}
    </section>
  `;

  $$(".detail-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateDetailTab(button.dataset.detailTab);
    });
  });

  if ($("#assignment-form")) $("#assignment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const ownerEmail = String(values.ownerEmail || "").trim();
    if (ownerEmail && !event.currentTarget.elements.ownerEmail.checkValidity()) {
      toast("Email propriétaire invalide.", "error");
      return;
    }
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
    let note = "";
    if (status === "retired" && device.status !== "retired") {
      note = await promptRetirementNote(device);
      if (!note) {
        event.currentTarget.elements.status.value = device.status;
        return;
      }
    }
    try {
      const result = await api(`/admin/devices/${device.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      });
      const index = state.devices.findIndex((item) => item.id === device.id);
      if (index >= 0) {
        state.devices[index] = {
          ...state.devices[index],
          status: result.device.status,
          assigned_user_id: result.device.status === "retired" ? null : state.devices[index].assigned_user_id,
          first_name: result.device.status === "retired" ? "" : state.devices[index].first_name,
          last_name: result.device.status === "retired" ? "" : state.devices[index].last_name,
          email: result.device.status === "retired" ? "" : state.devices[index].email,
          team_id: result.device.status === "retired" ? null : state.devices[index].team_id,
          team_name: result.device.status === "retired" ? "" : state.devices[index].team_name,
        };
      }
      await loadAdminData();
      await selectDevice(device.id);
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
    const key = getter(item) || "Non renseigné";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function averageBy(items, groupGetter, valueGetter) {
  const groups = {};
  items.forEach((item) => {
    const group = groupGetter(item) || "Non renseigné";
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
  renderBarChart('[data-chart="establishments"]', "Machines par établissement", countBy(state.filtered, (d) => d.establishment_name));
  renderBarChart('[data-chart="teams"]', "Machines par équipe", countBy(state.filtered, (d) => d.team_name));
  renderBarChart('[data-chart="os"]', "OS", countBy(state.filtered, (d) => d.os_name));
  renderBarChart('[data-chart="stale"]', "Non mises a jour", {
    [`+${CONFIG.staleDays} jours`]: state.filtered.filter((d) => daysSince(d.last_seen_at) > CONFIG.staleDays).length,
    "A jour": state.filtered.filter((d) => daysSince(d.last_seen_at) <= CONFIG.staleDays).length,
  });
  renderBarChart('[data-chart="age"]', "Anciennete du parc", countBy(state.filtered, ageBucket));
  renderBarChart('[data-chart="models"]', "Modeles presents", countBy(state.filtered, (d) => d.model));
  renderBarChart('[data-chart="ram"]', "RAM moyenne par équipe", averageBy(state.filtered, (d) => d.team_name, (d) => d.ram_total_gb), " Go");
  renderBarChart('[data-chart="storage"]', "Stockage faible", {
    "< 15 Go": state.filtered.filter((d) => Number(d.storage_free_gb || 0) < 15).length,
    "15-30 Go": state.filtered.filter((d) => Number(d.storage_free_gb || 0) >= 15 && Number(d.storage_free_gb || 0) < 30).length,
    "> 30 Go": state.filtered.filter((d) => Number(d.storage_free_gb || 0) >= 30).length,
  });
  renderBarChart('[data-chart="fleet-value"]', "Valeur actuelle estimée", {
    "Parc": Math.round(state.filtered.reduce((sum, d) => sum + estimatedValue(d), 0)),
  }, " EUR");
  renderBarChart('[data-chart="value-by-site"]', "Valeur par établissement", sumBy(state.filtered, (d) => d.establishment_name, estimatedValue), " EUR");
  renderBarChart('[data-chart="replace-top"]', "Top machines a remplacer", topReplaceCandidates(state.filtered));
  renderScatter('[data-chart="age-performance"]', "Age matériel vs CPU", state.filtered);
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
    const group = groupGetter(item) || "Non renseigné";
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

function detectClientPlatform() {
  const uaPlatform = navigator.userAgentData?.platform || navigator.platform || "";
  const ua = navigator.userAgent || "";
  const text = `${uaPlatform} ${ua}`.toLowerCase();
  if (text.includes("win")) return "windows";
  if (text.includes("mac")) return "macos";
  if (text.includes("linux") || text.includes("x11")) return "linux";
  return "unknown";
}

async function loadCollectorReleases() {
  state.detectedPlatform = detectClientPlatform();
  try {
    const response = await fetch(CONFIG.collectorReleaseConfigUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.collectorReleases = await response.json();
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
  const saved = state.collectorInstallState || {};
  return Boolean(
    asset
    && saved.platform === state.detectedPlatform
    && saved.version
    && saved.version === expectedCollectorVersion(asset),
  );
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

function platformLabel(platform) {
  return { windows: "Windows", macos: "macOS", linux: "Linux" }[platform] || "";
}

function downloadLabel(platform) {
  if (platform === "windows") return translate("Télécharger le collecteur Windows");
  if (platform === "macos") return translate("Télécharger le collecteur macOS");
  if (platform === "linux") return translate("Télécharger le collecteur Linux");
  return translate("Télécharger le collecteur");
}

function osIconSvg(platform) {
  if (platform === "windows") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="3" width="8" height="8" rx="1"></rect><rect x="3" y="13" width="8" height="8" rx="1"></rect><rect x="13" y="13" width="8" height="8" rx="1"></rect></svg>`;
  }
  if (platform === "macos") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.6 13.1c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.2-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6 0 0-2.7-1-2.7-3.7ZM15.5 6.2c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.7-1.3Z"></path></svg>`;
  }
  if (platform === "linux") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c-2.4 0-4 2-4 5.2 0 1.2-.4 2.2-1.1 3.3L4.4 15c-.9 1.6-.2 3.6 1.5 4.3 1 .4 2.1.2 2.9-.4.8.7 2 1.1 3.2 1.1s2.4-.4 3.2-1.1c.8.6 1.9.8 2.9.4 1.7-.7 2.4-2.7 1.5-4.3l-2.5-4.5C16.4 9.4 16 8.4 16 7.2 16 4 14.4 2 12 2Zm-1.4 6.1c-.5 0-.9-.5-.9-1.1s.4-1.1.9-1.1.9.5.9 1.1-.4 1.1-.9 1.1Zm2.8 0c-.5 0-.9-.5-.9-1.1s.4-1.1.9-1.1.9.5.9 1.1-.4 1.1-.9 1.1Z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M8 22h8M12 18v4"></path></svg>`;
}

function downloadPrefillFile() {
  if (!state.prefillCode) {
    toast("Aucun code de pré-remplissage", "error");
    return;
  }
  const payload = {
    apiUrl: CONFIG.apiBaseUrl,
    prefillCode: state.prefillCode,
    createdAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `spacefoot-collector-prefill-${state.prefillCode || "draft"}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Fichier de pre-remplissage telecharge. Ouvrez le collecteur: il le detectera automatiquement.", "success");
}

function updateCollectorDownloadUi() {
  const primary = $("#collector-download-primary");
  const releases = $("#collector-releases-link");
  const openApp = $("#collector-open-app");
  const launcher = primary?.closest(".launcher-downloads");
  if (!primary || !releases) return;
  const releasePage = state.collectorReleases?.releasePageUrl
    || state.collectorReleases?.fallbackReleasePageUrl
    || "https://github.com/badr-spacefoot/pc_inventory_2.0/releases";
  releases.href = state.collectorReleases?.fallbackReleasePageUrl || "https://github.com/badr-spacefoot/pc_inventory_2.0/releases";
  const detected = state.detectedPlatform;
  const asset = collectorAsset(detected);
  const canLaunch = Boolean(state.collectorLaunchUrl);
  const compatibleCollectorKnown = canLaunch && hasKnownCompatibleCollector(asset);
  if (asset) {
    primary.href = asset.downloadUrl;
    primary.setAttribute("download", asset.fileName || "");
    primary.querySelector("span:not(.collector-os-icon)").textContent = downloadLabel(detected);
    $("#collector-os-icon").innerHTML = osIconSvg(detected);
    $("#collector-platform-copy").textContent = compatibleCollectorKnown
      ? (state.language === "en"
        ? `Collector ${asset.version || ""} already opened from this browser. Launch it to load the profile.`
        : `Collecteur ${asset.version || ""} déjà lancé depuis ce navigateur. Ouvrez-le pour charger le profil.`)
      : `${translate("Collecteur detecte pour")} ${platformLabel(detected)} (${asset.version || ""}).`;
  } else {
    primary.href = releasePage;
    primary.removeAttribute("download");
    primary.querySelector("span:not(.collector-os-icon)").textContent = translate("Télécharger le collecteur");
    $("#collector-os-icon").innerHTML = osIconSvg("unknown");
    $("#collector-platform-copy").textContent = detected === "unknown"
      ? translate("Choisissez votre plateforme ci-dessous.")
      : translate("Aucun asset collecteur disponible pour cette plateforme.");
  }
  if (openApp) {
    openApp.disabled = !canLaunch;
    openApp.classList.toggle("is-disabled", !canLaunch);
    openApp.classList.toggle("primary", compatibleCollectorKnown);
    openApp.classList.toggle("secondary", !compatibleCollectorKnown);
    primary.classList.toggle("primary", !compatibleCollectorKnown);
    primary.classList.toggle("secondary", compatibleCollectorKnown);
    launcher?.classList.toggle("is-ready-to-open", compatibleCollectorKnown);
  }
  $$("[data-platform-download]").forEach((link) => {
    const platform = link.dataset.platformDownload;
    const item = collectorAsset(platform);
    link.href = item?.downloadUrl || releasePage;
    if (item?.fileName) link.setAttribute("download", item.fileName);
    else link.removeAttribute("download");
  });
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
  const inviteForm = $("#invite-form");
  if (teamSelect) {
    const selected = teamSelect.value || state.collectionDraft.team || "";
    teamSelect.innerHTML = [
      `<option value="">${translate("Selectionnez une equipe")}</option>`,
      ...state.teams
        .filter((team) => team.active !== false)
        .map((team) => `<option value="${escapeHtml(team.name)}">${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`),
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
        .map((site) => `<option value="${escapeHtml(site.name)}">${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`),
      `<option value="__other__">${translate("Autre")}</option>`,
    ].join("");
    establishmentSelect.value = [...establishmentSelect.options].some((option) => option.value === selected) ? selected : "";
  }
  if (inviteForm?.elements.team) {
    const selected = inviteForm.elements.team.value || "";
    inviteForm.elements.team.innerHTML = [
      `<option value="">${translate("Optionnel")}</option>`,
      ...state.teams
        .filter((team) => team.active !== false)
        .map((team) => `<option value="${escapeHtml(team.name)}">${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</option>`),
    ].join("");
    inviteForm.elements.team.value = [...inviteForm.elements.team.options].some((option) => option.value === selected) ? selected : "";
  }
  if (inviteForm?.elements.establishment) {
    const selected = inviteForm.elements.establishment.value || "";
    inviteForm.elements.establishment.innerHTML = [
      `<option value="">${translate("Optionnel")}</option>`,
      ...state.establishments
        .filter((site) => site.active !== false)
        .map((site) => `<option value="${escapeHtml(site.name)}">${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</option>`),
    ].join("");
    inviteForm.elements.establishment.value = [...inviteForm.elements.establishment.options].some((option) => option.value === selected) ? selected : "";
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
            <span class="organization-icon" style="--item-color:${escapeHtml(team.color || "#16735f")}">${teamIcon(normalizeTeamInfo(team.name, team.abbreviation).iconType)}</span>
            <span>
              <strong>${escapeHtml(displayWithAbbreviation(team.name, team.abbreviation))}</strong>
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
    .join("") || `<p class="helper">Aucune équipe.</p>`;

  $("#establishments-manager-list").innerHTML = state.establishments
    .map((site, index) => {
      const location = [site.city, site.country].filter(Boolean).join(", ");
      return `
        <div class="organization-sort-row ${site.active ? "" : "is-inactive"}" draggable="${canManageLocations}" data-entity="establishment" data-id="${site.id}">
          ${canManageLocations ? `<button class="drag-handle" type="button" aria-label="Deplacer ${escapeHtml(site.name)}" title="Glisser pour reordonner">&#8942;&#8942;</button>` : ""}
          <button class="organization-item edit-establishment" type="button" data-id="${site.id}">
            <span class="organization-icon site type-${escapeHtml(site.discipline || site.establishment_type || "office")}" style="--item-color:${escapeHtml(site.color || "#64748b")}">${locationIcon(site.discipline || site.establishment_type || "office")}</span>
            <span>
              <strong>${escapeHtml(displayWithAbbreviation(site.name, site.abbreviation))}</strong>
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
    .join("") || `<p class="helper">Aucun établissement.</p>`;

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
  const boundedIndex = Math.max(0, Math.min(targetIndex, items.length));
  if (currentIndex < 0 || currentIndex === boundedIndex) return;
  const [item] = items.splice(currentIndex, 1);
  const adjustedIndex = currentIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
  items.splice(adjustedIndex, 0, item);
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
  $("#team-badge-preview").innerHTML = `<span class="${info.badgeClass}" ${badgeStyle(form.elements.color.value)}>${teamIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
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
  form.elements.color.value = site.color || defaultOrganizationColor(state.establishments.findIndex((item) => item.id === id));
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
  const info = locationInfo(form.elements.establishmentType.value, name, form.elements.discipline.value, form.elements.abbreviation.value);
  $("#establishment-badge-preview").innerHTML = `<span class="${info.badgeClass}" ${badgeStyle(form.elements.color.value)}>${locationIcon(info.iconType)}<span>${escapeHtml(info.displayLabel)}</span></span>`;
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
    <iframe title="Carte de l'établissement" loading="lazy" src="${src}"></iframe>
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
  await loadInviteFromUrl();
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
  loadCollectionInvites().catch((error) => {
    state.collectionInvites = [];
    renderCollectionInvites();
    toast(`Module invitations indisponible: ${error.message}`);
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
      : `${result.enriched} enrichie(s), ${result.skipped} ignoree(s), ${result.failed || 0} en échec.`;
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
  loadCollectorReleases().catch(() => updateCollectorDownloadUi());
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
    payload.theme = document.documentElement.dataset.theme || "light";
    try {
      const hasInvite = Boolean(state.currentInviteCode || form.inviteCode);
      const result = hasInvite
        ? await api(`/collect/invite/${encodeURIComponent(state.currentInviteCode || form.inviteCode)}/prefill`, {
          method: "POST",
          body: JSON.stringify(payload),
        })
        : await api("/collect/prefill", {
          method: "POST",
          headers: { "X-Collection-Access-Token": form.accessToken },
          body: JSON.stringify(payload),
        });
      $("#command-empty").classList.add("is-hidden");
      $("#command-result").classList.remove("is-hidden");
      $("#collector-prefill-code").textContent = result.prefillCode || "";
      state.prefillCode = result.prefillCode || "";
      state.collectorLaunchUrl = result.launchUrl || "";
      $("#powershell-command").textContent = state.language === "en"
        ? "Use the native collector app. Install it once, then open it from this page to load the profile automatically. The script fallback is reserved for IT support."
        : "Utilisez l'application collecteur native. Installez-la une fois, puis ouvrez-la depuis cette page pour charger le profil automatiquement. Le script fallback reste réservé au support IT.";
      updateCollectorDownloadUi();
      toast(
        hasKnownCompatibleCollector()
          ? (state.language === "en" ? "Preparation complete. Open the collector." : "Préparation terminée. Ouvrez le collecteur.")
          : translate("Preparation terminee. Telechargez le collecteur."),
        "success",
      );
    } catch (error) {
      saveCollectionDraft();
      toast(error.message, "error");
    }
  });

  $("#copy-command").addEventListener("click", async () => {
    await copyText($("#powershell-command").textContent, "Commande copiee.", "Aucune commande a copier");
  });
  $("#copy-collector-token")?.addEventListener("click", async () => {
    await copyText($("#collector-token")?.textContent, "Token copie.", "Aucun token a copier");
  });
  $("#copy-prefill-code").addEventListener("click", async () => {
    await copyText($("#collector-prefill-code").textContent, "Code copie.", "Aucun code a copier");
  });
  $("#download-prefill-file").addEventListener("click", downloadPrefillFile);
  $("#collector-open-app")?.addEventListener("click", () => {
    if (!state.collectorLaunchUrl) {
      toast("Aucun code de pré-remplissage", "error");
      return;
    }
    rememberCollectorLaunch();
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
    await copyText(state.scriptPreviewText, "Script copie.", "Aucun script a copier");
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
  $("#refresh-pending-changes").addEventListener("click", () => loadPendingChanges().catch((error) => toast(error.message)));
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
      message: state.language === "en"
        ? `Delete the team "${team?.name || form.elements.name.value}"? Deletion will be blocked if computers or users are still assigned.`
        : `Supprimer l'equipe "${team?.name || form.elements.name.value}" ? La suppression sera bloquee si des machines ou utilisateurs y sont encore affectes.`,
    });
    if (!confirmed) return;
    try {
      await api(`/admin/teams/${id}`, { method: "DELETE" });
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
      message: state.language === "en"
        ? `Delete the location "${site?.name || form.elements.name.value}"? Deletion will be blocked if computers or users are still assigned.`
        : `Supprimer l'etablissement "${site?.name || form.elements.name.value}" ? La suppression sera bloquee si des machines ou utilisateurs y sont encore affectes.`,
    });
    if (!confirmed) return;
    try {
      await api(`/admin/establishments/${id}`, { method: "DELETE" });
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
      const result = await api(id ? `/admin/teams/${id}` : "/admin/teams", { method: "POST", body: JSON.stringify(payload) });
      await loadAdminData();
      resetTeamForm();
      toast(result.duplicateAbbreviation ? "Abreviation deja utilisee par une autre equipe." : id ? "Equipe mise a jour." : "Equipe creee.", result.duplicateAbbreviation ? "warning" : "info");
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
      const result = await api(id ? `/admin/establishments/${id}` : "/admin/establishments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadAdminData();
      resetEstablishmentForm();
      toast(result.duplicateAbbreviation ? "Abreviation deja utilisee par un autre etablissement." : id ? "Etablissement mis a jour." : "Etablissement cree.", result.duplicateAbbreviation ? "warning" : "info");
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
      const result = await api("/admin/collection-invites", { method: "POST", body: JSON.stringify(payload) });
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
    await copyText($("#generated-invite-url").textContent, "Lien copie.", "Aucun lien a copier");
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
      const result = await api("/admin/access-tokens", { method: "POST", body: JSON.stringify(payload) });
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
    await copyText($("#generated-token").textContent, "Token copie.", "Aucun token a copier");
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
      toast("Compte supprimé.", "success");
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
