const APP_VERSION = '1.0.1';

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-version').forEach(el => { el.textContent = 'v' + APP_VERSION; });
});
