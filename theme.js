/* Applied in <head> to prevent flash of wrong theme — light is default */
(function () {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  }
  _syncThemeBtn();
}

function _syncThemeBtn() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = isDark ? 'Light' : 'Dark';
}

document.addEventListener('DOMContentLoaded', _syncThemeBtn);
