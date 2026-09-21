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
  //
  // Pour les polices Marelle (font.ruling === "marelle"), la réglure suit
  // celle des variantes "LIGNES" officielles : 6 lignes espacées de 0,48 em
  // (une x-height), base = 4e ligne (1,44 em depuis le haut).
  // Rapport corps de lettre / em SVG, partagé avec FE.DottedText.
  var FONT_SCALE = 1.35;

  function computeRowMetrics(fontSizeMm, font) {
    if (font && font.ruling === "marelle") {
      var em = fontSizeMm * FONT_SCALE;
      var step = em * 0.48;
      var lines = [];
      for (var i = 0; i < 6; i++) lines.push({ y: i * step, baseline: i === 3 });
      return {
        topY: 0,
        baselineY: step * 3,
        bottomY: step * 5,
        lines: lines,
        rowHeightMm: step * 5 + Math.max(1.5, fontSizeMm * 0.3)
      };
    }
    var ascenderH = fontSizeMm * 1.0;
    var descenderH = fontSizeMm * 0.55;
    var gapH = Math.max(1.5, fontSizeMm * 0.3);
    return {
      topY: 0,
      coreTopY: ascenderH * 0.5,
      baselineY: ascenderH,
      bottomY: ascenderH + descenderH,
      lines: [
        { y: 0 },
        { y: ascenderH * 0.5 },
        { y: ascenderH, baseline: true },
        { y: ascenderH + descenderH }
      ],
      rowHeightMm: ascenderH + descenderH + gapH
    };
  }

  // `force` : affiche la zone même vide (pendant la saisie d'une nouvelle
  // consigne sur l'aperçu), avec un texte d'invite invisible à l'impression.
  function buildConsigneBlock(sheet, force) {
    var text = (sheet.consigne || "").trim();
    if (!text && !force) return null;
    var wrap = document.createElement("div");
    wrap.className = "fiche-consigne";
    var title = document.createElement("p");
    title.className = "fiche-consigne-title";
    title.textContent = "Consigne";
    var body = document.createElement("p");
    body.className = "fiche-consigne-text";
    body.textContent = text || "Écrivez la consigne…";
    if (!text) wrap.classList.add("is-empty");
    wrap.appendChild(title);
    wrap.appendChild(body);
    return wrap;
  }

  // Le titre est toujours présent (même vide : invite « Titre de la fiche »,
  // invisible à l'impression mais qui garde sa place) pour pouvoir le
  // modifier directement sur l'aperçu.
  function buildNameHeading(sheet) {
    var name = (sheet.name || "").trim();
    var h = document.createElement("h2");
    h.className = "fiche-name-heading";
    h.textContent = name || "Titre de la fiche";
    if (!name) h.classList.add("is-empty");
    return h;
  }

  // Hauteur utile d'une page (mm) : A4 moins les marges haut et bas
  // (--page-margin dans css/sheet.css). Une ligne d'écriture occupe sa
  // hauteur + ROW_GAP_MM (margin-bottom de .ligne-ecriture).
  var CONTENT_HEIGHT_MM = PAGE.heightMm - PAGE.marginTopMm * 2;
  var ROW_GAP_MM = 1;
  var EPSILON_MM = 0.01;

  function mmFromPx(px) {
    return px * 25.4 / 96;
  }

  function createPage(pagesEl) {
    var page = document.createElement("div");
    page.className = "fiche-page";
    // Attaché tout de suite : la mesure du texte SVG (getComputedTextLength,
    // utilisée par FE.DottedText) exige que les éléments fassent partie du
    // document, sous peine de mesures fausses (police de repli, taille par
    // défaut) car les styles/polices ne sont pas résolus sur un DOM détaché.
    pagesEl.appendChild(page);
    return page;
  }

  // Hauteur (mm) déjà occupée en haut de la page 1 par le titre et la consigne
  // (marges basses incluses). Mesurée dans le DOM : le texte de la consigne
  // peut passer à la ligne.
  function measureHeaderMm(page) {
    var last = page.lastElementChild;
    if (!last) return 0;
    var top = page.getBoundingClientRect().top + PAGE.marginTopMm * 96 / 25.4;
    var bottomMargin = parseFloat(getComputedStyle(last).marginBottom) || 0;
    return mmFromPx(last.getBoundingClientRect().bottom - top + bottomMargin);
  }

  // Découpe le texte d'une ligne en rangées d'écriture (voir
  // FE.DottedText.planRows) dans une boîte de mesure temporaire attachée à la
  // page (avec une hauteur : sans elle le SVG n'est pas rendu et la mesure
  // vaut 0).
  function planLine(page, sheet, line) {
    var resolved = FE.Model.resolveLineSettings(sheet, line);
    var metrics = computeRowMetrics(resolved.fontSizeMm, FE.Fonts.getById(resolved.fontId));
    var text = line.text.trim();
    var rows = [];
    if (text) {
      var probe = document.createElement("div");
      probe.className = "ligne-ecriture";
      probe.style.height = "10mm";
      page.appendChild(probe);
      rows = FE.DottedText.planRows(probe, text, resolved, PAGE.contentWidthMm);
      page.removeChild(probe);
    } else {
      // Ligne vide : lineCount lignes réglées vierges.
      for (var i = 0; i < Math.max(1, resolved.lineCount || 1); i++) rows.push({ text: "", kind: "full" });
    }
    return { line: line, resolved: resolved, metrics: metrics, rows: rows };
  }

  function buildBlock(page, item, rows) {
    var block = document.createElement("div");
    block.className = "fiche-bloc";
    block.setAttribute("data-line-id", item.line.id);
    page.appendChild(block);
    // Bloc encore vide : invite « Écrivez un mot… » (écran seulement, hors flux).
    if (!item.line.text.trim() && rows[0] === item.rows[0]) {
      var hint = document.createElement("span");
      hint.className = "fiche-bloc-placeholder no-print";
      hint.textContent = "Écrivez un mot…";
      hint.style.top = item.metrics.baselineY + "mm";
      block.appendChild(hint);
    }
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "ligne-ecriture";
      row.style.height = item.metrics.rowHeightMm + "mm";
      block.appendChild(row);
      FE.DottedText.layoutLine(row, r.text, item.resolved, PAGE.contentWidthMm, item.metrics.rowHeightMm, item.metrics, r.kind);
    });
  }

  // Construit la fiche en pages A4 empilées. Le titre et la consigne ne sont
  // qu'en page 1. Un bloc (une ligne de la fiche et toutes ses rangées) n'est
  // jamais coupé : il passe entier à la page suivante s'il ne tient pas ; seul
  // un bloc plus grand qu'une page est coupé rangée par rangée.
  // opts.forceConsigne : voir buildConsigneBlock.
  function renderSheet(sheet, previewEl, opts) {
    opts = opts || {};
    previewEl.innerHTML = "";

    var pagesEl = document.createElement("div");
    pagesEl.className = "fiche-pages";
    previewEl.appendChild(pagesEl);

    var page = createPage(pagesEl);

    var heading = buildNameHeading(sheet);
    if ((sheet.consigne || "").trim() === "" && !opts.forceConsigne) {
      // Pas de consigne : petit lien pour en ajouter une (écran seulement,
      // en position absolue : aucun impact sur la mise en page).
      var hint = document.createElement("button");
      hint.type = "button";
      hint.className = "add-consigne-hint no-print";
      hint.textContent = "+ Consigne";
      heading.appendChild(hint);
    }
    page.appendChild(heading);

    var consigne = buildConsigneBlock(sheet, opts.forceConsigne);
    if (consigne) page.appendChild(consigne);

    if (!sheet.lines || sheet.lines.length === 0) {
      var empty = document.createElement("p");
      empty.className = "fiche-empty-hint";
      empty.textContent = "Cliquez sur « + Ajouter une ligne » ci-dessous pour commencer votre fiche.";
      page.appendChild(empty);
      return pagesEl;
    }

    var remaining = CONTENT_HEIGHT_MM - measureHeaderMm(page);
    var pageHasBlock = false;

    sheet.lines.forEach(function (line) {
      var item = planLine(page, sheet, line);
      var rowStep = item.metrics.rowHeightMm + ROW_GAP_MM;
      var blockHeight = item.rows.length * rowStep;

      // Le bloc ne tient pas dans ce qu'il reste de la page : page suivante.
      // Sauf s'il est plus grand qu'une page entière (il faudra de toute façon
      // le couper) : on le commence là où on en est, rangée par rangée.
      if (blockHeight > remaining + EPSILON_MM && blockHeight <= CONTENT_HEIGHT_MM && pageHasBlock) {
        page = createPage(pagesEl);
        remaining = CONTENT_HEIGHT_MM;
        pageHasBlock = false;
      }

      var rows = item.rows;
      while (rows.length) {
        var fit = Math.max(1, Math.floor((remaining + EPSILON_MM) / rowStep));
        var chunk = rows.slice(0, fit);
        buildBlock(page, item, chunk);
        pageHasBlock = true;
        remaining -= chunk.length * rowStep;
        rows = rows.slice(chunk.length);
        if (rows.length) {
          page = createPage(pagesEl);
          remaining = CONTENT_HEIGHT_MM;
          pageHasBlock = false;
        }
      }
    });

    return pagesEl;
  }

  return {
    PAGE: PAGE,
    FONT_SCALE: FONT_SCALE,
    computeRowMetrics: computeRowMetrics,
    renderSheet: renderSheet
  };
})();
