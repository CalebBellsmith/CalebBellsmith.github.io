/* Applied in <head> to prevent flash of wrong theme — dark is default,
   light only for visitors who have switched to it */
(function () {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  if (saved !== 'light') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', 'light'); } catch (e) {}
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('theme', 'dark'); } catch (e) {}
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
