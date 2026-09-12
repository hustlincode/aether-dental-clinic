// Runs before first paint to apply the stored/OS theme and avoid a flash.
// Loaded by the root layout via next/script strategy="beforeInteractive".
(function () {
  try {
    var mode = localStorage.getItem("aether-theme");
    if (mode !== "light" && mode !== "dark" && mode !== "system") mode = "system";
    var resolved =
      mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    document.documentElement.setAttribute("data-theme", resolved);
  } catch {
    /* localStorage unavailable */
  }
})();
