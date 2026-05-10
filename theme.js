/* Applied in <head> to prevent flash of wrong theme */
(function () {
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  _syncThemeBtn();
}

function _syncThemeBtn() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.textContent = isLight ? 'Dark' : 'Light';
}

document.addEventListener('DOMContentLoaded', _syncThemeBtn);
