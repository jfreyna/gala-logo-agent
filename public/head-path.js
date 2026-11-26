// Point the canonical link and og:url at this page's own address, for Gala's public pages.
(function () {
  var pages = { "/": "/", "/about": "/about" };
  var url = "https://gala.frillyconcierge.com" + (pages[location.pathname] || "/");
  var canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", url);
  var ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", url);
})();
