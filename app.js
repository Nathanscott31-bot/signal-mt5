'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const P = window.SignalParser;

  // ---------- Copie (avec solution de repli si le presse-papiers moderne est refusé) ----------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* repli ci-dessous */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function copyButton(text) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy';
    b.textContent = 'Copier';
    b.addEventListener('click', async () => {
      const ok = await copyText(text);
      b.textContent = ok ? 'Copié ✓' : 'Échec';
      b.classList.toggle('done', ok);
      setTimeout(() => { b.textContent = 'Copier'; b.classList.remove('done'); }, 1500);
    });
    return b;
  }

  const setError = (msg) => { $('error').textContent = msg || ''; };

  // ---------- Affichage ----------
  function row(label, value, copyValue) {
    const wrap = document.createElement('div');
    wrap.className = 'vrow';
    const l = document.createElement('span');
    l.className = 'vlabel';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'vval';
    v.textContent = value;
    wrap.append(l, v);
    wrap.append(copyValue === undefined ? document.createElement('span') : copyButton(copyValue));
    return wrap;
  }

  function render(sig, hint, warnings, price) {
    $('r-title').textContent = `${sig.symbol} · ${sig.side}`;
    $('r-type').textContent = hint.label;

    const warn = $('r-warn');
    warn.replaceChildren();
    for (const w of warnings) {
      const li = document.createElement('li');
      li.textContent = `⚠ ${w}`;
      warn.append(li);
    }
    warn.hidden = warnings.length === 0;

    const values = $('r-values');
    values.replaceChildren();
    values.append(row('Symbole', sig.symbol, sig.symbol));
    values.append(row('Entrée', sig.entry === null ? 'Au marché' : String(sig.entry),
      sig.entry === null ? undefined : String(sig.entry)));
    values.append(row('Stop Loss', String(sig.sl), String(sig.sl)));
    sig.tps.forEach((tp, i) => values.append(row(`TP${i + 1}`, String(tp), String(tp))));

    const orders = $('r-orders');
    orders.replaceChildren();
    sig.tps.forEach((tp, i) => {
      const li = document.createElement('li');
      li.textContent = `${hint.label} · SL ${sig.sl} · TP ${tp}`;
      orders.append(li);
    });
    $('r-orders-title').textContent = sig.tps.length > 1
      ? `${sig.tps.length} ordres à créer dans MT5 (un par TP)` : 'Ordre à créer dans MT5';

    const summary = [
      `${sig.symbol} ${hint.label}`,
      `SL ${sig.sl}`,
      ...sig.tps.map((tp, i) => `TP${i + 1} ${tp}`),
    ].join('\n');
    const old = $('copy-all');
    const fresh = old.cloneNode(true); // retire les anciens écouteurs
    fresh.addEventListener('click', async () => {
      const ok = await copyText(summary);
      fresh.textContent = ok ? 'Résumé copié ✓' : 'Échec de la copie';
      setTimeout(() => { fresh.textContent = 'Copier le résumé'; }, 1500);
    });
    old.replaceWith(fresh);

    $('result').hidden = false;
  }

  // ---------- Analyse ----------
  function analyse() {
    setError('');
    $('result').hidden = true;

    let sig;
    try {
      sig = P.parseSignal($('signal').value);
    } catch (err) {
      setError(err.message);
      return;
    }

    const raw = $('price').value.trim().replace(',', '.');
    const price = raw === '' ? null : Number(raw);
    if (raw !== '' && !(price > 0)) { setError('Prix actuel invalide.'); return; }

    const hint = P.orderTypeHint(sig, price);
    const refEntry = sig.entry !== null ? sig.entry : price; // au marché : on compare au prix actuel s'il est connu
    const warnings = [...P.sanityCheck({ ...sig, entry: refEntry }), ...hint.warnings];
    render(sig, hint, warnings, price);
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Actions ----------
  $('analyse').addEventListener('click', analyse);

  $('paste').addEventListener('click', async () => {
    try {
      $('signal').value = await navigator.clipboard.readText();
      setError('');
    } catch {
      setError('Accès au presse-papiers refusé : appuie longuement dans la zone et choisis « Coller ».');
    }
  });

  $('clear').addEventListener('click', () => {
    $('signal').value = '';
    $('price').value = '';
    $('result').hidden = true;
    setError('');
  });

  // ---------- Démarrage ----------
  // Signal partagé depuis WhatsApp (Android, application installée) : ?text=...
  const params = new URLSearchParams(location.search);
  const shared = params.get('text') || params.get('title') || '';
  if (shared) {
    $('signal').value = shared.slice(0, 2000);
    history.replaceState(null, '', location.pathname);
    analyse();
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
