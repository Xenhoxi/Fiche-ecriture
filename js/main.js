window.FE = window.FE || {};

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var previewEl = document.getElementById("fiche-preview");

    var appState = {
      sheet: FE.Model.createDefaultSheet()
    };

    // Mise à l'échelle responsive : la fiche est dimensionnée en mm
    // physiques (210mm de large) et déborderait sur un petit écran. On la
    // réduit visuellement via transform: scale() sur .fiche-pages, tout en
    // réservant sur #fiche-preview exactement l'empreinte réduite (sinon
    // le transform, purement visuel, laisserait un vide en dessous/à droite
    // correspondant à la taille non réduite). Se fait APRÈS la mesure du
    // texte SVG (qui a lieu au rendu, avant tout transform) : sans impact
    // sur la mise en page interne de la fiche ni sur l'impression (voir
    // print.css qui réinitialise ce transform).
    function updatePreviewScale() {
      var page = previewEl.querySelector(".fiche-pages");
      var wrapper = previewEl.closest(".preview-wrapper");
      if (!page || !wrapper) return;

      page.style.transform = "";
      previewEl.style.width = "";
      previewEl.style.height = "";

      var naturalWidth = page.offsetWidth;
      var naturalHeight = page.offsetHeight;
      var available = wrapper.clientWidth - 24;
      if (!naturalWidth || available >= naturalWidth) return;

      var scale = Math.max(0.25, available / naturalWidth);
      page.style.transformOrigin = "top left";
      page.style.transform = "scale(" + scale + ")";
      previewEl.style.width = (naturalWidth * scale) + "px";
      previewEl.style.height = (naturalHeight * scale) + "px";
    }

    function rerenderPreview(sheet) {
      FE.Render.renderSheet(sheet, previewEl);
      updatePreviewScale();
      FE.PreviewEditor.refresh();
      reloadIfFontsPending(sheet);
    }

    // Une police n'est téléchargée qu'à sa première utilisation : si on vient
    // de la choisir, la mesure du rendu ci-dessus a utilisé une police de
    // repli. On force son chargement puis on refait le rendu une fois prête.
    function reloadIfFontsPending(sheet) {
      if (!document.fonts || !document.fonts.load) return;
      var ids = [sheet.settings.fontId].concat(sheet.lines.map(function (l) {
        return (l.overrides && l.overrides.fontId) || sheet.settings.fontId;
      }));
      var pending = ids.filter(function (id, i) {
        return ids.indexOf(id) === i && !document.fonts.check("16px '" + FE.Fonts.getById(id).family + "'");
      });
      if (!pending.length) return;
      Promise.all(pending.map(function (id) {
        return document.fonts.load("16px '" + FE.Fonts.getById(id).family + "'");
      })).then(function () {
        if (appState.sheet === sheet) {
          FE.Render.renderSheet(sheet, previewEl);
          updatePreviewScale();
          FE.PreviewEditor.refresh();
        }
      }).catch(function () {});
    }

    FE.PreviewEditor.init(previewEl, document.getElementById("selection-layer"), function () { return appState.sheet; });
    FE.UI.init(appState, rerenderPreview);

    // Les polices embarquées (@font-face) se chargent de façon asynchrone.
    // Si le premier rendu a eu lieu avant leur chargement, la mesure du
    // texte (getComputedTextLength) a pu utiliser une police de repli plus
    // étroite, faussant l'espacement des répétitions : on corrige avec un
    // second rendu dès que les polices sont effectivement prêtes.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        rerenderPreview(appState.sheet);
      });
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updatePreviewScale();
        FE.PreviewEditor.refresh();
      }, 120);
    });
  });
})();
