window.FE = window.FE || {};

// Annuler / rétablir + sauvegarde automatique du brouillon.
//
// Une pile d'instantanés JSON de la fiche. `commit(key)` est appelé après
// chaque modification : deux commits successifs de même `key` dans un court
// délai (ex. un curseur qu'on tire = des dizaines d'événements) fusionnent en
// UNE entrée ; sans `key` (ajout, suppression, déplacement, saisie validée…)
// chaque commit crée une entrée. Un commit identique à l'état courant est ignoré.
//
// Le brouillon (fiche en cours) est écrit dans le stockage local après un
// court délai, et restauré à l'ouverture (voir main.js).
FE.History = (function () {
  "use strict";

  var MAX_ENTRIES = 100;
  var COALESCE_MS = 1200;
  var DRAFT_DELAY_MS = 500;

  var getSheet = null;
  var applySheet = null;
  var stack = [];       // instantanés (chaînes JSON)
  var index = -1;       // position courante dans la pile
  var lastKey = null;
  var lastTime = 0;
  var draftTimer = 0;
  var draftStatus = { state: "idle", at: null }; // idle | saved | error
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) { fn(); });
  }

  function snapshot() {
    return JSON.stringify(getSheet());
  }

  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, DRAFT_DELAY_MS);
  }

  function saveDraftNow() {
    clearTimeout(draftTimer);
    var ok = FE.Storage.saveDraft(getSheet());
    draftStatus = { state: ok ? "saved" : "error", at: new Date() };
    notify();
  }

  function init(opts) {
    getSheet = opts.getSheet;
    applySheet = opts.applySheet;
  }

  // Repart d'une fiche « neuve » (ouverture, fiche chargée ou nouvelle) : la
  // pile est vidée et le brouillon aligné dessus.
  function reset() {
    stack = [snapshot()];
    index = 0;
    lastKey = null;
    saveDraftNow();
  }

  function commit(key) {
    var snap = snapshot();
    if (snap === stack[index]) return;
    var now = Date.now();
    if (key && key === lastKey && now - lastTime < COALESCE_MS && index > 0) {
      // même geste continu : on remplace l'entrée courante
      stack[index] = snap;
      stack.length = index + 1;
    } else {
      stack.length = index + 1; // une nouvelle modification efface le « rétablir »
      stack.push(snap);
      if (stack.length > MAX_ENTRIES) stack.shift();
      index = stack.length - 1;
    }
    lastKey = key || null;
    lastTime = now;
    scheduleDraftSave();
    notify();
  }

  function go(delta) {
    var target = index + delta;
    if (target < 0 || target >= stack.length) return false;
    index = target;
    lastKey = null;
    applySheet(JSON.parse(stack[index]));
    scheduleDraftSave();
    notify();
    return true;
  }

  return {
    init: init,
    reset: reset,
    commit: commit,
    undo: function () { return go(-1); },
    redo: function () { return go(1); },
    canUndo: function () { return index > 0; },
    canRedo: function () { return index < stack.length - 1; },
    getDraftStatus: function () { return draftStatus; },
    subscribe: function (fn) { listeners.push(fn); }
  };
})();
