// Resolves the theme before first paint. Without this the page shows the
// default theme for a frame, which on a hard-contrast design is jarring.
//
// A separate file rather than an inline <script> so the Content-Security
// Policy can be script-src 'self' with no hash to keep in sync and no
// 'unsafe-inline'.
(function () {
  try {
    var saved = localStorage.getItem("jessica.theme");
    var mode =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.setAttribute("data-theme", mode);
  } catch (e) {
    /* private mode: the markup default stands */
  }
})();
