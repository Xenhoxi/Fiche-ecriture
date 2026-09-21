window.FE = window.FE || {};

FE.Render = (function () {
  "use strict";

  // Doit rester cohérent avec --page-margin (15mm 12mm) dans css/sheet.css.
  var PAGE = {
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 15,
    marginSideMm: 12
  };
  PAGE.contentWidthMm = PAGE.widthMm - PAGE.marginSideMm * 2;

  // Réglure façon Seyès à 4 repères (pas de bandes colorées) : une ligne
  // fine en haut (jusqu'où monter pour les hampes), une ligne fine à
  // mi-hauteur (haut du corps de lettre, x-height), une ligne PLEINE à la
  // base du mot (là où il repose), une ligne fine en bas (jusqu'où
  // descendre pour les jambages). Proportionnelle à la taille choisie ;
  // chaque ligne est autonome (pas de grille de page à recaler), donc la
  // hauteur suit directement et continûment la taille de police.
  function computeRowMetrics(fontSizeMm) {
    var ascenderH = fontSizeMm * 1.0;
    var descenderH = fontSizeMm * 0.55;
    var gapH = Math.max(1.5, fontSizeMm * 0.3);
    return {
      topY: 0,
      coreTopY: ascenderH * 0.5,
      baselineY: ascenderH,
      bottomY: ascenderH + descenderH,
      rowHeightMm: ascenderH + descenderH + gapH
    };
  }

  function buildConsigneBlock(sheet) {
    var text = (sheet.consigne || "").trim();
    if (!text) return null;
    var wrap = document.createElement("div");
    wrap.className = "fiche-consigne";
    var title = document.createElement("p");
    title.className = "fiche-consigne-title";
    title.textContent = "Consigne";
    var body = document.createElement("p");
    body.className = "fiche-consigne-text";
    body.textContent = text;
    wrap.appendChild(title);
    wrap.appendChild(body);
    return wrap;
  }

  function buildNameHeading(sheet) {
    var name = (sheet.name || "").trim();
    if (!name) return null;
    var h = document.createElement("h2");
    h.className = "fiche-name-heading";
    h.textContent = name;
    return h;
  }

  function renderSheet(sheet, previewEl) {
    previewEl.innerHTML = "";

    var page = document.createElement("div");
    page.className = "fiche-page";
    // Attaché tout de suite : la mesure du texte SVG (getComputedTextLength,
    // utilisée par FE.DottedText) exige que les éléments fassent partie du
    // document, sous peine de mesures fausses (police de repli, taille par
    // défaut) car les styles/polices ne sont pas résolus sur un DOM détaché.
    previewEl.appendChild(page);

    var heading = buildNameHeading(sheet);
    if (heading) page.appendChild(heading);

    var consigne = buildConsigneBlock(sheet);
    if (consigne) page.appendChild(consigne);

    if (!sheet.lines || sheet.lines.length === 0) {
      var empty = document.createElement("p");
      empty.className = "fiche-empty-hint";
      empty.textContent = "Ajoutez des lignes dans le panneau de gauche pour commencer votre fiche.";
      page.appendChild(empty);
    } else {
      sheet.lines.forEach(function (line) {
        var resolved = FE.Model.resolveLineSettings(sheet, line);
        var metrics = computeRowMetrics(resolved.fontSizeMm);

        var row = document.createElement("div");
        row.className = "ligne-ecriture";
        row.style.height = metrics.rowHeightMm + "mm";
        page.appendChild(row);

        FE.DottedText.layoutLine(row, line.text.trim(), resolved, PAGE.contentWidthMm, metrics.rowHeightMm, metrics);
      });
    }

    return page;
  }

  return {
    PAGE: PAGE,
    computeRowMetrics: computeRowMetrics,
    renderSheet: renderSheet
  };
})();
