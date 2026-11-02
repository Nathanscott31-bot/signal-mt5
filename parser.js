(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SignalParser = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Lecture d'un signal de trading (WhatsApp, Telegram...).
   * Sans dépendance, utilisable dans le navigateur et dans Node.
   * Le même comportement existe en Python (A-pont-pc/pont/parser.py) ;
   * les deux sont vérifiés par partage/parser_cases.json.
   */

  // Noms courants -> symbole. (« OR » est volontairement absent : c'est un mot anglais courant.)
  const ALIASES = {
    GOLD: 'XAUUSD', XAU: 'XAUUSD', SILVER: 'XAGUSD', XAG: 'XAGUSD',
    US30: 'US30', DOW: 'US30', DJ30: 'US30',
    NAS100: 'NAS100', NASDAQ: 'NAS100', US100: 'US100',
    SPX500: 'SPX500', US500: 'US500',
    BTC: 'BTCUSD', BITCOIN: 'BTCUSD', ETH: 'ETHUSD',
    OIL: 'USOIL', WTI: 'USOIL',
  };

  // Un mot de 6 lettres n'est pris pour un symbole que si les deux moitiés sont des codes connus.
  const CODES = new Set([
    'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
    'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNH', 'CNY', 'RUB', 'INR', 'BRL', 'THB', 'ILS', 'KRW',
    'XAU', 'XAG', 'XPT', 'XPD', 'BTC', 'ETH', 'LTC', 'XRP', 'BCH', 'ADA', 'SOL', 'DOT',
  ]);

  const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
  const SL_RE = new RegExp(String.raw`\b(?:SL|STOP\s*LOSS|STOPLOSS)\s*[:@=\-]?\s*${NUM}`, 'g');
  // Le chiffre d'index (TP1, TP 2) ne doit pas être collé au prix qui suit.
  const TP_RE = new RegExp(
    String.raw`\b(?:TP|TAKE\s*PROFIT)(?:\s*\d(?![\d.,]))?\s*[:@=\-]?\s*${NUM}`, 'g');
  const DIR_RE = /\b(BUY|SELL)\s*(LIMIT|STOP)?\b/g;
  // Nombre isolé (pas collé à une lettre), qui n'est ni un pourcentage, ni des lots, ni des pips.
  // Écrit sans « lookbehind » (incompatible avec les iPhone sous iOS 16.3 et moins) : le nombre est le groupe 1.
  const ENTRY_RE = /(?:^|[^A-Z\d.])(\d+(?:[.,]\d+)?)(?![A-Z\d])(?!\s*(?:%|LOTS?\b|PIPS?\b|POINTS?\b|PTS\b))/g;
  const MAX_TPS = 5;

  const toNumber = (s) => parseFloat(s.replace(',', '.'));

  function normalise(raw) {
    let t = raw.toUpperCase().replace(/[^\x00-\x7F]/g, ' '); // retire les emojis et accents
    t = t.replace(/\b(ACHAT|ACHETER)\b/g, 'BUY').replace(/\b(VENTE|VENDRE)\b/g, 'SELL');
    t = t.replace(/\b([A-Z]{3})\s*\/\s*([A-Z]{3})\b/g,
      (m, a, b) => (CODES.has(a) && CODES.has(b) ? a + b : m));
    return t;
  }

  function findSymbol(text) {
    for (const w of text.match(/[A-Z0-9]{2,10}/g) || []) {
      if (ALIASES[w]) return ALIASES[w];
      if (/^[A-Z]{6}$/.test(w) && CODES.has(w.slice(0, 3)) && CODES.has(w.slice(3))) return w;
      if (/^[A-Z]{2,4}\d{2,3}$/.test(w) && !/^(TP|SL)/.test(w)) return w; // US30, GER40, UK100...
    }
    return null;
  }

  function parseSignal(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Le signal est vide.');
    if (raw.length > 2000) throw new Error('Le signal est trop long.');
    const text = normalise(raw);

    const dirs = [...text.matchAll(DIR_RE)];
    if (!dirs.length) throw new Error('Direction BUY / SELL introuvable.');
    if (new Set(dirs.map((m) => m[1])).size > 1) {
      throw new Error('Plusieurs directions (BUY et SELL) trouvées : vérifie le message.');
    }
    const kinds = new Set(dirs.map((m) => m[2]).filter(Boolean));
    if (kinds.size > 1) throw new Error('Plusieurs types d\'ordre (LIMIT et STOP) trouvés : vérifie le message.');
    const side = dirs[0][1];
    const kind = kinds.size ? [...kinds][0] : null;

    const symbol = findSymbol(text);
    if (!symbol) throw new Error('Symbole introuvable (ex. XAUUSD, EURUSD).');

    const slMatch = [...text.matchAll(SL_RE)][0];
    if (!slMatch) throw new Error('Stop Loss (SL) introuvable.');
    const sl = toNumber(slMatch[1]);

    const tps = [...text.matchAll(TP_RE)].map((m) => toNumber(m[1]));
    if (!tps.length) throw new Error('Take Profit (TP) introuvable.');
    if (tps.length > MAX_TPS) throw new Error(`Trop de Take Profit (maximum ${MAX_TPS}).`);

    // Prix d'entrée : premier nombre restant une fois SL, TP et symbole retirés.
    let rest = text.replace(SL_RE, ' ').replace(TP_RE, ' ').replace(new RegExp(symbol, 'g'), ' ');
    for (const [alias, target] of Object.entries(ALIASES)) {
      if (target === symbol) rest = rest.replace(new RegExp(`\\b${alias}\\b`, 'g'), ' ');
    }
    let entry = null;
    if (!/\b(NOW|MARKET|MAINTENANT)\b/.test(rest)) {
      const first = [...rest.matchAll(ENTRY_RE)].map((m) => toNumber(m[1])).find((v) => v > 0);
      if (first !== undefined) entry = first;
    }
    return { symbol, side, kind, entry, sl, tps };
  }

  /** Incohérences visibles sans connaître le prix du marché. */
  function sanityCheck(sig) {
    const warnings = [];
    const buy = sig.side === 'BUY';
    for (const tp of sig.tps) {
      if (buy ? tp <= sig.sl : tp >= sig.sl) {
        warnings.push(`TP ${tp} du mauvais côté du SL ${sig.sl} pour un ${sig.side}.`);
      }
    }
    if (sig.entry !== null) {
      if (buy ? !(sig.sl < sig.entry) : !(sig.sl > sig.entry)) {
        warnings.push(`Pour un ${sig.side}, le SL ${sig.sl} doit être ${buy ? 'sous' : 'au-dessus de'} l'entrée ${sig.entry}.`);
      }
      for (const tp of sig.tps) {
        if (buy ? !(tp > sig.entry) : !(tp < sig.entry)) {
          warnings.push(`Pour un ${sig.side}, le TP ${tp} doit être ${buy ? 'au-dessus de' : 'sous'} l'entrée ${sig.entry}.`);
        }
      }
    }
    return warnings;
  }

  /** Type d'ordre à choisir dans MT5. currentPrice est optionnel. */
  function orderTypeHint(sig, currentPrice) {
    const buy = sig.side === 'BUY';
    if (sig.entry === null) return { type: 'market', label: `${sig.side} au marché`, warnings: [] };
    const hasPrice = Number.isFinite(currentPrice) && currentPrice > 0;
    if (!hasPrice) {
      if (sig.kind) {
        return { type: sig.kind.toLowerCase(), label: `${sig.side} ${sig.kind} @ ${sig.entry}`, warnings: [] };
      }
      return { type: null, label: `${sig.side} @ ${sig.entry} : le type dépend du prix actuel`, warnings: [] };
    }
    if (Math.abs(sig.entry - currentPrice) <= currentPrice * 0.0001) {
      return { type: 'market', label: `${sig.side} au marché (le prix est déjà à l'entrée)`, warnings: [] };
    }
    const below = sig.entry < currentPrice;
    const inferred = (buy ? below : !below) ? 'limit' : 'stop';
    const warnings = [];
    if (sig.kind && sig.kind.toLowerCase() !== inferred) {
      warnings.push(`Le message dit ${sig.side} ${sig.kind}, mais avec un prix actuel de ${currentPrice} ce serait un ${sig.side} ${inferred.toUpperCase()}.`);
    }
    return { type: inferred, label: `${sig.side} ${inferred.toUpperCase()} @ ${sig.entry}`, warnings };
  }

  return { parseSignal, sanityCheck, orderTypeHint, ALIASES };
}));
