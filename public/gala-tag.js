// Google Analytics for Gala, counting visits on the live site only.
//
// Google is sent the page's origin and path, and nothing after them. A page
// address can carry a one-time sign-in token, an error, or other values from
// another site; the query string and the fragment are always dropped, so none
// of them leave the browser. The referrer is cleaned the same way. No person,
// project or account detail is ever set on the tag.
(function () {
  var MEASUREMENT_ID = "G-2G6KLWPM90";
  var PRODUCTION_HOST = "gala.frillyconcierge.com";

  // Local runs, previews and the server's own address send nothing.
  if (location.hostname !== PRODUCTION_HOST) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  // Origin and path only, or empty when the address is missing or unreadable.
  function clean(address) {
    if (!address) return "";
    try {
      var url = new URL(address);
      return url.origin + url.pathname;
    } catch (error) {
      return "";
    }
  }

  var lastSent = clean(location.href);

  // Set before the first hit, so the first page view (the one that can follow
  // a sign-in) already carries the cleaned addresses.
  gtag("js", new Date());
  gtag("set", { page_location: lastSent, page_referrer: clean(document.referrer) });
  // Gala's hits stay out of Google's ads features, whatever the property allows.
  gtag("config", MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });

  // Gala moves between its pages in place. Each move to a new path sends one
  // page view, with the page it came from as the referrer. A change that keeps
  // the path (an address tidied in place) sends nothing.
  function pageChanged() {
    var current = clean(location.href);
    if (current === lastSent) return;
    var previous = lastSent;
    lastSent = current;
    gtag("set", { page_location: current, page_referrer: previous });
    gtag("event", "page_view", { page_location: current, page_referrer: previous });
  }

  var pushState = history.pushState;
  history.pushState = function () {
    var result = pushState.apply(this, arguments);
    pageChanged();
    return result;
  };
  window.addEventListener("popstate", pageChanged);

  // Google's script is loaded here, on the live site only, so no other host
  // ever fetches it or hears from it.
  var loader = document.createElement("script");
  loader.async = true;
  loader.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
  document.head.appendChild(loader);
})();
