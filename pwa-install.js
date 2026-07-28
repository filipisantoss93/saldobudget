(function () {
  'use strict';

  var deferredPrompt = null;
  var banner = null;
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  var dismissedAt = Number(localStorage.getItem('pwaInstallDismissedAt') || 0);
  var sevenDays = 7 * 24 * 60 * 60 * 1000;

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
      '.finance-breakdown{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}',
      '.finance-breakdown .kpi{margin:0}',
      '@media(max-width:620px){.finance-breakdown{grid-template-columns:1fr 1fr}}',
      '@media(max-width:420px){.finance-breakdown{grid-template-columns:1fr}.pwa-install{align-items:center}.pwa-install__icon{width:44px;height:44px;flex-basis:44px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function hideBanner(remember) {
    if (remember) localStorage.setItem('pwaInstallDismissedAt', String(Date.now()));
    if (banner) banner.remove();
    banner = null;
  }

  function showBanner(mode) {
    if (banner || isStandalone || (dismissedAt && Date.now() - dismissedAt < sevenDays)) return;
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

  function fmt(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  }

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function ensureFinanceBreakdown() {
    var summary = document.querySelector('.summary-card');
    if (!summary || document.getElementById('financeBreakdown')) return;
    var block = document.createElement('div');
    block.id = 'financeBreakdown';
    block.className = 'finance-breakdown';
    block.innerHTML = '<div class="kpi"><div class="kpi-label">Peças</div><div class="kpi-value" id="partsTotal">R$ 0,00</div><div class="kpi-help">Total lançado em peças</div></div>' +
      '<div class="kpi"><div class="kpi-label">Mão de obra</div><div class="kpi-value" id="laborTotal">R$ 0,00</div><div class="kpi-help">Total lançado em serviços</div></div>';
    summary.appendChild(block);
  }

  function applyFinancialDashboard(data) {
    if (!data) return;
    ensureFinanceBreakdown();
    var records = Array.isArray(data.records) ? data.records : [];
    var active = records.filter(function (record) { return record.status !== 'cancelada'; });
    var parts = active.reduce(function (sum, record) { return sum + number(record.pecas); }, 0);
    var labor = active.reduce(function (sum, record) { return sum + number(record.maoObra); }, 0);
    var committed = active.reduce(function (sum, record) {
      var total = number(record.total);
      return sum + (total > 0 ? total : number(record.pecas) + number(record.maoObra));
    }, 0);
    var balance = number(data.saldoInicial);
    var available = balance - committed;
    var pct = balance > 0 ? Math.max(0, Math.min(100, available / balance * 100)) : 0;
    var pending = active.filter(function (record) { return record.status === 'pendente'; }).reduce(function (sum, record) {
      var total = number(record.total);
      return sum + (total > 0 ? total : number(record.pecas) + number(record.maoObra));
    }, 0);
    var finalized = active.filter(function (record) { return record.status === 'ok'; }).reduce(function (sum, record) {
      var total = number(record.total);
      return sum + (total > 0 ? total : number(record.pecas) + number(record.maoObra));
    }, 0);

    var setText = function (id, value) { var el = document.getElementById(id); if (el) el.textContent = value; };
    setText('partsTotal', fmt(parts));
    setText('laborTotal', fmt(labor));
    setText('gaugeValue', fmt(available));
    setText('gaugeSub', 'De ' + fmt(balance) + ' no período');
    setText('gaugePct', Math.round(pct) + '% disponível');
    setText('legendUsed', fmt(committed));
    setText('legendAvailable', fmt(available));
    setText('statPendente', fmt(pending));
    setText('statFinalizado', fmt(finalized));
    setText('avgTicket', fmt(active.length ? committed / active.length : 0));

    var bar = document.getElementById('budgetBar');
    if (bar) bar.style.width = pct + '%';
    var gauge = document.getElementById('miniGauge');
    if (gauge) {
      gauge.style.setProperty('--gauge', Math.max(0, Math.min(50, pct / 2)) + '%');
      gauge.style.setProperty('--needle', (-90 + pct * 1.8) + 'deg');
    }
  }

  function refreshFinancialDashboard() {
    var scriptUrl = localStorage.getItem('saldoBudgetScriptUrl');
    var sheet = document.getElementById('sheetSelect');
    if (!scriptUrl || !sheet || !sheet.value) return;
    fetch(scriptUrl + '?action=list&sheet=' + encodeURIComponent(sheet.value) + '&_=' + Date.now(), { cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (response) { if (response && response.ok) applyFinancialDashboard(response.data || response); })
      .catch(function (error) { console.warn('Falha ao atualizar resumo financeiro:', error); });
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
    injectStyles();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(function (error) {
        console.warn('Falha ao registrar o Service Worker:', error);
      });
    }
    if (isIOS) window.setTimeout(function () { showBanner('ios'); }, 1200);
    window.setTimeout(refreshFinancialDashboard, 900);
    var sheet = document.getElementById('sheetSelect');
    if (sheet) sheet.addEventListener('change', function () { window.setTimeout(refreshFinancialDashboard, 250); });
    ['refreshBtn', 'saveRecordBtn', 'cancelOsBtn', 'deleteOsBtn', 'saveBalanceBtn'].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.addEventListener('click', function () { window.setTimeout(refreshFinancialDashboard, 900); });
    });
  });
})();