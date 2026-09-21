window.FE = window.FE || {};

// Construit le rendu SVG d'une ligne d'écriture : la 1ère occurrence du
// texte en plein (modèle à copier, toujours collée à gauche), les
// occurrences suivantes en pointillé (le contour de la lettre est tracé en
// tirets, comme un trait qu'on lève et repose régulièrement) pour que
// l'élève les repasse.
//
// Tout est exprimé en unités mm (viewBox en mm), pour rester cohérent avec
// la mise en page physique de la fiche et éviter toute conversion px/mm
// entre l'aperçu écran et l'impression.
FE.DottedText = (function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  // Crée l'élément <svg> pour une ligne, dimensionné en mm via son viewBox,
  // et l'attache au conteneur fourni (nécessaire pour pouvoir mesurer le
  // texte ensuite avec getComputedTextLength()).
  function createLineSvg(container, availableWidthMm, rowHeightMm) {
    var svg = el("svg", {
      viewBox: "0 0 " + availableWidthMm + " " + rowHeightMm,
      preserveAspectRatio: "none"
    });
    container.innerHTML = "";
    container.appendChild(svg);
    return svg;
  }

  // Dessine les 4 repères (haut, x-height, base, bas) EN DERNIER (donc
  // par-dessus le texte, pas dans le fond) : une ligne placée derrière un
  // mot plein (le modèle) serait invisible là où l'encre la recouvre. Seule
  // la ligne de base est pleine (repère principal, "où le mot repose") ;
  // les 3 autres sont pointillées et plus fines — en pointillés et
  // par-dessus le texte, elles restent visibles y compris "à travers" le
  // mot, sans empêcher de le lire.
  function drawRulingLines(svg, availableWidthMm, metrics) {
    var color = "#2f5fa8";
    metrics.lines.forEach(function (spec) {
      var attrs = {
        x1: 0, y1: spec.y, x2: availableWidthMm, y2: spec.y,
        stroke: color,
        "stroke-width": spec.baseline ? 0.38 : 0.16,
        "stroke-linecap": "round"
      };
      if (!spec.baseline) attrs["stroke-dasharray"] = "1.4,1.3";
      svg.appendChild(el("line", attrs));
    });
  }

  function makeTextNode(text, x, y, fontFamily, fontSizeMm, italic, mode, strokeWidthMm, dashArray) {
    var attrs = {
      x: x,
      y: y,
      "font-family": "'" + fontFamily + "', cursive",
      "font-size": fontSizeMm,
      "font-style": italic ? "italic" : "normal",
      "text-anchor": "start"
    };
    if (mode === "outline") {
      // Trace le contour des lettres en tirets (le trait "se lève et se
      // repose" régulièrement le long de la forme, comme une écriture à la
      // main), plutôt que de remplir la silhouette d'une texture statique.
      attrs.fill = "none";
      attrs.stroke = "#1a1a1a";
      attrs["stroke-width"] = strokeWidthMm;
      attrs["stroke-dasharray"] = dashArray;
      attrs["stroke-linecap"] = "round";
      attrs["stroke-linejoin"] = "round";
    } else {
      attrs.fill = "#1a1a1a";
      attrs.stroke = "none";
    }
    var node = el("text", attrs);
    node.textContent = text;
    return node;
  }

  // Construit et positionne les répétitions du texte sur la ligne, puis les
  // repères de réglure. `metrics` (mm depuis le haut du bloc) est calculé
  // par FE.Render selon la taille choisie, pour que le mot et les repères
  // soient cohérents entre eux.
  // Doit être appelé APRÈS que le SVG soit attaché au document (pour que
  // getComputedTextLength() renvoie une mesure correcte).
  function layoutLine(container, text, resolved, availableWidthMm, rowHeightMm, metrics) {
    var font = FE.Fonts.getById(resolved.fontId);
    var fontSizeMm = resolved.fontSizeMm * FE.Render.FONT_SCALE; // ajustement visuel corps de lettre vs em SVG
    var repetitions = Math.max(1, resolved.repetitions);
    var strokeWidthMm = Math.max(0.2, resolved.dashSizeMm * 0.28);
    // Marelle est à trait fin et régulier : un contour de 0,5 mm y fusionne
    // les deux bords du trait en un bloc illisible, on l'affine donc.
    if (font.ruling) strokeWidthMm = Math.min(strokeWidthMm, fontSizeMm * 0.02);
    var dashArray = (resolved.dashSizeMm * 1.1).toFixed(2) + "," + (resolved.dashSizeMm * 0.75).toFixed(2);

    var italic = resolved.fontStyle === "italic" && FE.Fonts.supportsItalic(resolved.fontId);

    var svg = createLineSvg(container, availableWidthMm, rowHeightMm);

    if (!text) {
      drawRulingLines(svg, availableWidthMm, metrics);
      return;
    }

    // Mesure la largeur réelle du mot dans la police/taille active.
    var measurer = makeTextNode(text, 0, metrics.baselineY, font.family, fontSizeMm, italic, "solid");
    svg.appendChild(measurer);
    var wordWidth = 0;
    try {
      wordWidth = measurer.getComputedTextLength();
    } catch (e) {
      wordWidth = text.length * fontSizeMm * 0.6; // repli si la mesure échoue
    }
    svg.removeChild(measurer);

    var idealSlotWidth = availableWidthMm / repetitions;
    var minGapMm = Math.max(1, resolved.fontSizeMm * 0.15);

    // Si le mot est plus large que son emplacement idéal (police trop
    // grande pour le nombre de répétitions demandé), on élargit l'espace
    // entre occurrences pour éviter qu'elles se superposent illisiblement
    // — quitte à en afficher moins que demandé.
    var slotWidth = Math.max(idealSlotWidth, wordWidth + minGapMm);
    var visibleCount = Math.max(1, Math.min(repetitions, Math.floor(availableWidthMm / slotWidth)));
    var startPadding = Math.max(0, (slotWidth - wordWidth) / 2);

    for (var i = 0; i < visibleCount; i++) {
      var mode = i === 0 ? "solid" : "outline";
      // Le mot modèle (1ère occurrence) reste toujours collé à gauche,
      // jamais centré dans son emplacement — seules les occurrences à
      // repasser sont centrées dans le leur.
      var x = i === 0 ? 0 : (i * slotWidth + startPadding);
      var node = makeTextNode(text, x, metrics.baselineY, font.family, fontSizeMm, italic, mode, strokeWidthMm, dashArray);
      svg.appendChild(node);
    }

    drawRulingLines(svg, availableWidthMm, metrics);
  }

  return {
    layoutLine: layoutLine
  };
})();
