window.FE = window.FE || {};

// Interaction directe avec l'aperçu de la fiche : sélection d'un bloc (une
// ligne de la fiche) par clic. Le contour de sélection est dessiné dans une
// couche superposée (#selection-layer), hors des pages, pour ne jamais être
// imprimé ni perturber la mise en page. Le rendu reconstruit tout le DOM à
// chaque changement : `refresh()` re-place donc le contour après chaque rendu.
FE.PreviewEditor = (function () {
  "use strict";

  var previewEl = null;
  var layerEl = null;
  var getSheet = null;
  var selectedLineId = null;

  function blocksOf(lineId) {
    return Array.prototype.filter.call(previewEl.querySelectorAll(".fiche-bloc"), function (b) {
      return b.getAttribute("data-line-id") === lineId;
    });
  }

  // Redessine le contour (un cadre par fragment : un bloc coupé entre deux
  // pages en a deux). Position relative à la couche, donc valable même quand
  // l'aperçu est réduit par transform: scale().
  function refresh() {
    layerEl.innerHTML = "";
    if (!selectedLineId) return;
    var exists = getSheet().lines.some(function (l) { return l.id === selectedLineId; });
    if (!exists) { selectedLineId = null; return; }

    var origin = layerEl.getBoundingClientRect();
    blocksOf(selectedLineId).forEach(function (block) {
      var r = block.getBoundingClientRect();
      var box = document.createElement("div");
      box.className = "selection-box";
      box.style.left = (r.left - origin.left - 4) + "px";
      box.style.top = (r.top - origin.top - 4) + "px";
      box.style.width = (r.width + 8) + "px";
      box.style.height = (r.height + 8) + "px";
      layerEl.appendChild(box);
    });
  }

  function select(lineId) {
    selectedLineId = lineId;
    refresh();
  }

  function onClick(e) {
    var block = e.target.closest ? e.target.closest(".fiche-bloc") : null;
    select(block ? block.getAttribute("data-line-id") : null);
  }

  function init(preview, layer, sheetGetter) {
    previewEl = preview;
    layerEl = layer;
    getSheet = sheetGetter;
    previewEl.addEventListener("click", onClick);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && selectedLineId) select(null);
    });
  }

  return {
    init: init,
    refresh: refresh,
    select: select,
    getSelectedId: function () { return selectedLineId; }
  };
})();
