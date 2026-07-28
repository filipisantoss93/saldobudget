(function () {
  'use strict';

  var deferredPrompt = null;
  var banner = null;
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var dismissedAt = Number(localStorage.getItem('pwaInstallDismissedAt') || 0);
  var sevenDays = 7 * 24 * 60 * 60 * 1000;

  if (isStandalone || (dismissedAt && Date.now() - dismissedAt < sevenDays)) return;

  function injectStyles() {
    if (document.getElementById('pwa-install-styles')) return;
    var style = document.createElement('style');
    style.id = 'pwa-install-styles';
    style.textContent = [
      '.pwa-install{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:300;max-width:520px;margin:auto;padding:16px;border:1px solid #3b4652;border-radius:16px;background:rgba(26,31,36,.98);box-shadow:0 20px 50px rgba(0,0,0,.42);color:#f2f4f7;font-family:IBM Plex Sans,system-ui,sans-serif;display:flex;gap:14px;align-items:flex-start}',
      '.pwa-install__icon{width:48px;height:48px;flex:0 0 48px;border-radius:12px;background:#111315 url("/icon-192x192.png?v=2") center/cover no-repeat;border:1px solid #313943}',
      '.pwa-install__content{min-width:0;flex:1}',
      '.pwa-install__title{font-size:15px;font-weight:700;margin:0 0 4px}',
      '.pwa-install__text{font-size:13px;line-height:1.45;color:#a2abb6;margin:0}',
      '.pwa-install__actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
      '.pwa-install__btn{border:1px solid #313943;border-radius:10px;padding:9px 13px;background:#232a31;color:#f2f4f7;font:600 13px IBM Plex Sans,system-ui,sans-serif;cursor:pointer}',
      '.pwa-install__btn--primary{background:#0a84ff;border-color:#0a84ff;color:#fff}',
      '.pwa-install__close{position:absolute;right:10px;top:8px;border:0;background:transparent;color:#a2abb6;font-size:22px;line-height:1;cursor:pointer;padding:6px}',
      '@media(max-width:520px){.pwa-install{align-items:center}.pwa-install__icon{width:44px;height:44px;flex-basis:44px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function hideBanner(remember) {
    if (remember) localStorage.setItem('pwaInstallDismissedAt', String(Date.now()));
    if (banner) banner.remove();
    banner = null;
  }

  function showBanner(mode) {
    if (banner || isStandalone) return;
    injectStyles();
    banner = document.createElement('aside');
    banner.className = 'pwa-install';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Instalar aplicativo');

    var iosText = 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
    var defaultText = 'Instale para abrir em tela cheia e acessar mais rápido pelo celular ou computador.';
    banner.innerHTML = '<button class="pwa-install__close" aria-label="Fechar">×</button>' +
      '<div class="pwa-install__icon" aria-hidden="true"></div>' +
      '<div class="pwa-install__content"><p class="pwa-install__title">Instalar Painel de Cortesia</p>' +
      '<p class="pwa-install__text">' + (mode === 'ios' ? iosText : defaultText) + '</p>' +
      '<div class="pwa-install__actions">' +
      (mode === 'prompt' ? '<button class="pwa-install__btn pwa-install__btn--primary" data-install>Instalar aplicativo</button>' : '') +
      '<button class="pwa-install__btn" data-later>Agora não</button></div></div>';

    document.body.appendChild(banner);
    banner.querySelector('.pwa-install__close').onclick = function () { hideBanner(true); };
    banner.querySelector('[data-later]').onclick = function () { hideBanner(true); };

    var installButton = banner.querySelector('[data-install]');
    if (installButton) {
      installButton.onclick = async function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        hideBanner(false);
      };
    }
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    showBanner('prompt');
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideBanner(false);
    localStorage.removeItem('pwaInstallDismissedAt');
  });

  window.addEventListener('load', function () {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js?v=2').catch(function (error) {
        console.warn('Falha ao registrar o Service Worker:', error);
      });
    }

    if (isIOS) {
      window.setTimeout(function () { showBanner('ios'); }, 1200);
    }
  });
})();