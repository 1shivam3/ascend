/*
 * ASCEND Theme Initialization
 * Runs synchronously before page paint to avoid FOUC (Flash of Unstyled Content).
 * Determines the correct theme (dark/light) from localStorage or system preference.
 */
(function () {
  try {
    var theme = 'dark';
    var hasCustom = false;
    var customFlag = localStorage.getItem('ascend_has_custom_theme');
    var standaloneTheme = localStorage.getItem('ascend_theme');

    if (customFlag === 'true' && (standaloneTheme === 'dark' || standaloneTheme === 'light')) {
      theme = standaloneTheme;
      hasCustom = true;
    } else if (customFlag === 'false') {
      hasCustom = false;
    } else {
      var stored = localStorage.getItem('ascend_store');
      if (stored) {
        var parsed = JSON.parse(stored);
        var s = parsed.state || parsed;
        if (s && s.hasCustomTheme) {
          theme = s.theme;
          hasCustom = true;
        }
      }
    }

    if (!hasCustom && window.matchMedia) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
