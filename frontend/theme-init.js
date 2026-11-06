// Apply the saved display preference before the stylesheet paints.
document.documentElement.dataset.theme =
  (localStorage.getItem("it_inventory_theme_preference") === "dark" ||
  localStorage.getItem("it_inventory_theme_preference") === "light"
    ? localStorage.getItem("it_inventory_theme_preference")
    : null) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.documentElement.lang = localStorage.getItem("it_inventory_language") || "fr";
