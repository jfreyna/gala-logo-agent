// Sets light or dark before the first paint, so the page never flashes the
// wrong mode. The person's own choice wins; otherwise the system setting.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem("gala-theme");
  } catch (error) {
    stored = null;
  }
  var dark =
    stored === "dark" ||
    (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
