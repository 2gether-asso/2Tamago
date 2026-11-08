// Apply the saved theme before first paint to avoid a light/dark flash.
// An external file (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
