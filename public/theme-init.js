/*
 * ASCEND Theme Initialization
 * Runs synchronously before page paint to avoid FOUC (Flash of Unstyled Content).
 * Determines the correct theme (dark/light) from localStorage or system preference.
 *
 * §35: the stored preference is ONE value — ascend_theme_mode
 * ('light' | 'dark' | 'system'). 'system' (or no recorded mode)
 * resolves from matchMedia at paint time. Legacy keys
 * (ascend_theme + ascend_has_custom_theme) and the store blob's
 * legacy pair are still read as a fallback for users whose mode
 * key has not been written yet; the store rewrites all keys in
 * the new shape on the next theme action or load.
 */
(function () {
  try {
    var mode = localStorage.getItem('ascend_theme_mode');
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') {
      mode = null;
      var customFlag = localStorage.getItem('ascend_has_custom_theme');
      var standaloneTheme = localStorage.getItem('ascend_theme');
      if (customFlag === 'true' && (standaloneTheme === 'dark' || standaloneTheme === 'light')) {
        mode = standaloneTheme;
      } else if (customFlag === 'false') {
        mode = 'system';
      } else {
        var stored = localStorage.getItem('ascend_store');
        if (stored) {
          var parsed = JSON.parse(stored);
          var s = parsed.state || parsed;
          if (s) {
            if (s.themeMode === 'light' || s.themeMode === 'dark' || s.themeMode === 'system') {
              mode = s.themeMode;
            } else if (s.hasCustomTheme && (s.theme === 'dark' || s.theme === 'light')) {
              mode = s.theme;
            }
          }
        }
      }
    }

    var theme;
    if (mode === 'light' || mode === 'dark') {
      theme = mode;
    } else if (window.matchMedia) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      theme = 'dark';
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
