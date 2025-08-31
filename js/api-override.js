// /js/api-override.js
(function () {
  try {
    var url = new URL(location.href);
    var q = url.searchParams.get("api");
    if (q) {
      localStorage.setItem("magt_api_override", q);
      url.searchParams.delete("api");
      history.replaceState(null, "", url.toString());
    }
    var saved = localStorage.getItem("magt_api_override");
    if (q || saved) {
      window.API_BASE_OVERRIDE = q || saved;
      console.log("[MAGT] API override:", window.API_BASE_OVERRIDE);
    }
  } catch (e) {
    console.warn("[MAGT] API override init failed", e);
  }
})();
