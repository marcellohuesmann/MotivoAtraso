const APP_VERSION = '1.0.0';

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-version').forEach(el => { el.textContent = 'v' + APP_VERSION; });
});
