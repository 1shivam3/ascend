/*
 * ASCEND Theme Initialization
 * Runs synchronously before page paint to avoid FOUC (Flash of Unstyled Content).
 * Determines the correct theme (dark/light) from localStorage or system preference.
 */
(function () {
  try {
    var stored = localStorage.getItem('ascend_store');
    var theme = 'dark';
    var hasCustom = false;
    if (stored) {
      var parsed = JSON.parse(stored);
      var s = parsed.state || parsed;
      if (s && s.hasCustomTheme) {
        theme = s.theme;
        hasCustom = true;
      }
    }
    if (!hasCustom && window.matchMedia) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  } catch (e) {}
})();
