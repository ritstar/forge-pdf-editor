(() => {
  try {
    const stored = localStorage.getItem('forge-theme');
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch {}
})();
