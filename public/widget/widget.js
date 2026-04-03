/**
 * troqueAI Widget — Embeddable JS para qualquer loja
 *
 * Uso:
 *   <script src="https://troqueai.vercel.app/widget.js"
 *     data-tenant="slug-da-loja"
 *     data-position="bottom-right"
 *     data-color="#6366f1">
 *   </script>
 *
 * Opcoes:
 *   data-tenant: slug do tenant (obrigatorio)
 *   data-position: bottom-right | bottom-left (default: bottom-right)
 *   data-color: cor do botao (default: #6366f1)
 *   data-text: texto do botao (default: "Trocas e Devoluções")
 */
(function() {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-tenant]');
  if (!script) return;

  var tenant = script.getAttribute('data-tenant');
  if (!tenant) { console.error('[troqueAI] data-tenant obrigatorio'); return; }

  var position = script.getAttribute('data-position') || 'bottom-right';
  var color = script.getAttribute('data-color') || '#6366f1';
  var text = script.getAttribute('data-text') || 'Trocas e Devoluções';
  var baseUrl = script.src.replace(/\/widget\.js.*$/, '') || 'https://troqueai.vercel.app';
  var portalUrl = baseUrl + '/portal/' + tenant;

  // Inject styles
  var style = document.createElement('style');
  style.textContent = [
    '#troqueai-widget-btn {',
    '  position: fixed;',
    '  ' + (position === 'bottom-left' ? 'left' : 'right') + ': 20px;',
    '  bottom: 20px;',
    '  z-index: 99999;',
    '  background: ' + color + ';',
    '  color: white;',
    '  border: none;',
    '  border-radius: 50px;',
    '  padding: 14px 24px;',
    '  font-size: 14px;',
    '  font-weight: 600;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  cursor: pointer;',
    '  box-shadow: 0 4px 20px rgba(0,0,0,0.15);',
    '  transition: all 0.3s ease;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    '#troqueai-widget-btn:hover {',
    '  transform: translateY(-2px);',
    '  box-shadow: 0 6px 30px rgba(0,0,0,0.2);',
    '}',
    '#troqueai-widget-btn svg { width: 18px; height: 18px; }',
    '#troqueai-widget-iframe-wrap {',
    '  display: none;',
    '  position: fixed;',
    '  ' + (position === 'bottom-left' ? 'left' : 'right') + ': 20px;',
    '  bottom: 80px;',
    '  z-index: 99998;',
    '  width: 400px;',
    '  max-width: calc(100vw - 40px);',
    '  height: 600px;',
    '  max-height: calc(100vh - 120px);',
    '  border-radius: 16px;',
    '  overflow: hidden;',
    '  box-shadow: 0 10px 40px rgba(0,0,0,0.2);',
    '  background: white;',
    '}',
    '#troqueai-widget-iframe-wrap.open { display: block; }',
    '#troqueai-widget-iframe {',
    '  width: 100%;',
    '  height: 100%;',
    '  border: none;',
    '}',
    '#troqueai-widget-close {',
    '  position: absolute;',
    '  top: 8px;',
    '  right: 8px;',
    '  background: rgba(0,0,0,0.5);',
    '  color: white;',
    '  border: none;',
    '  border-radius: 50%;',
    '  width: 28px;',
    '  height: 28px;',
    '  font-size: 16px;',
    '  cursor: pointer;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  z-index: 1;',
    '}',
    '@media (max-width: 480px) {',
    '  #troqueai-widget-iframe-wrap {',
    '    width: calc(100vw - 20px);',
    '    height: calc(100vh - 100px);',
    '    ' + (position === 'bottom-left' ? 'left' : 'right') + ': 10px;',
    '    bottom: 70px;',
    '    border-radius: 12px;',
    '  }',
    '  #troqueai-widget-btn { padding: 12px 18px; font-size: 13px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  // Create button
  var btn = document.createElement('button');
  btn.id = 'troqueai-widget-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>' + text;

  // Create iframe wrapper
  var wrap = document.createElement('div');
  wrap.id = 'troqueai-widget-iframe-wrap';
  wrap.innerHTML = '<button id="troqueai-widget-close">&times;</button><iframe id="troqueai-widget-iframe"></iframe>';

  document.body.appendChild(btn);
  document.body.appendChild(wrap);

  var isOpen = false;
  var iframeLoaded = false;

  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    if (isOpen) {
      wrap.classList.add('open');
      if (!iframeLoaded) {
        document.getElementById('troqueai-widget-iframe').src = portalUrl;
        iframeLoaded = true;
      }
    } else {
      wrap.classList.remove('open');
    }
  });

  wrap.querySelector('#troqueai-widget-close').addEventListener('click', function() {
    isOpen = false;
    wrap.classList.remove('open');
  });
})();
