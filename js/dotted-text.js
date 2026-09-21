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

  // Trait central pointillé d'une occurrence : `d` est en mm relatif à
  // (début du mot, ligne de base), on le place par translation.
  function makeCenterLine(d, x, baselineY, dashSizeMm) {
    return el("path", {
      d: d,
      transform: "translate(" + x + " " + baselineY + ")",
      fill: "none",
      stroke: "#1a1a1a",
      "stroke-width": Math.max(0.3, Math.min(0.6, dashSizeMm * 0.22)),
      "stroke-dasharray": (dashSizeMm * 0.22).toFixed(2) + "," + (dashSizeMm * 0.85).toFixed(2),
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
  }

  function measureNode(node, text, fontSizeMm) {
    try {
      return node.getComputedTextLength();
    } catch (e) {
      return text.length * fontSizeMm * 0.6; // repli si la mesure échoue
    }
  }

  // Découpe le texte en lignes d'écriture. Un fragment doit pouvoir contenir
  // le modèle ET au moins une répétition en pointillé (2 × sa largeur) : sinon
  // on renvoie à la ligne au dernier espace possible. Un mot seul trop large
  // pour cela n'est pas coupé : le modèle prend sa ligne, la répétition
  // pointillée passe sur la suivante. Puis on complète avec des lignes de
  // pointillés seuls jusqu'à `resolved.lineCount` lignes (les fragments
  // reviennent en boucle). Renvoie [{ text, kind }].
  // `container` doit être attaché au document (mesure du texte).
  function planRows(container, text, resolved, availableWidthMm) {
    var font = FE.Fonts.getById(resolved.fontId);
    var fontSizeMm = resolved.fontSizeMm * FE.Render.FONT_SCALE;
    var italic = resolved.fontStyle === "italic" && FE.Fonts.supportsItalic(resolved.fontId);
    var minGapMm = Math.max(1, resolved.fontSizeMm * 0.15);
    var svg = createLineSvg(container, availableWidthMm, 1);
    var cache = {};

    function width(t) {
      if (cache[t] === undefined) {
        var n = makeTextNode(t, 0, 0, font.family, fontSizeMm, italic, "solid");
        svg.appendChild(n);
        cache[t] = measureNode(n, t, fontSizeMm);
        svg.removeChild(n);
      }
      return cache[t];
    }
    function fitsTwice(t) { return width(t) * 2 + minGapMm <= availableWidthMm; }

    var words = text.split(/\s+/).filter(Boolean);
    var fragments = [];
    var current = "";
    words.forEach(function (word) {
      var candidate = current ? current + " " + word : word;
      if (!current || fitsTwice(candidate)) {
        current = candidate;
      } else {
        fragments.push(current);
        current = word;
      }
    });
    if (current) fragments.push(current);

    var rows = [];
    fragments.forEach(function (frag) {
      if (fitsTwice(frag)) {
        rows.push({ text: frag, kind: "full" });
      } else {
        rows.push({ text: frag, kind: "model" });
        rows.push({ text: frag, kind: "dots" });
      }
    });
    var wanted = Math.max(1, resolved.lineCount || 1);
    for (var i = 0; rows.length < wanted && fragments.length; i++) {
      rows.push({ text: fragments[i % fragments.length], kind: "dots" });
    }
    container.innerHTML = "";
    return rows;
  }

  // Construit et positionne les répétitions du texte sur la ligne, puis les
  // repères de réglure. `metrics` (mm depuis le haut du bloc) est calculé
  // par FE.Render selon la taille choisie, pour que le mot et les repères
  // soient cohérents entre eux.
  // Doit être appelé APRÈS que le SVG soit attaché au document (pour que
  // getComputedTextLength() renvoie une mesure correcte).
  // `kind` : "full" (modèle + pointillés, défaut), "model" (modèle seul) ou
  // "dots" (pointillés seuls, pour les lignes d'entraînement supplémentaires).
  function layoutLine(container, text, resolved, availableWidthMm, rowHeightMm, metrics, kind) {
    kind = kind || "full";
    var font = FE.Fonts.getById(resolved.fontId);
    var fontSizeMm = resolved.fontSizeMm * FE.Render.FONT_SCALE; // ajustement visuel corps de lettre vs em SVG
    var repetitions = kind === "model" ? 1 : Math.max(1, resolved.repetitions);
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
    var wordWidth = measureNode(measurer, text, fontSizeMm);
    svg.removeChild(measurer);

    var idealSlotWidth = availableWidthMm / repetitions;
    var minGapMm = Math.max(1, resolved.fontSizeMm * 0.15);

    // Si le mot est plus large que son emplacement idéal (police trop
    // grande pour le nombre de répétitions demandé), on élargit l'espace
    // entre occurrences pour éviter qu'elles se superposent illisiblement
    // — quitte à en afficher moins que demandé.
    var slotWidth = Math.max(idealSlotWidth, wordWidth + minGapMm);
    var visibleCount = Math.max(1, Math.min(repetitions, Math.floor(availableWidthMm / slotWidth)));
    // Répétitions en trop tronquées : on répartit alors celles qui tiennent
    // sur toute la largeur, au lieu de les coller à gauche en laissant un
    // vide à droite.
    slotWidth = availableWidthMm / visibleCount;
    var startPadding = Math.max(0, (slotWidth - wordWidth) / 2);

    // Pointillé simple : ligne centrale des lettres (calculée une seule fois).
    var centerD = kind !== "model" && resolved.dotStyle !== "double"
      ? FE.Skeleton.compute(text, font.family, fontSizeMm, italic)
      : "";

    for (var i = 0; i < visibleCount; i++) {
      var mode = i === 0 && kind !== "dots" ? "solid" : "outline";
      // Le mot modèle (1ère occurrence) reste toujours collé à gauche,
      // jamais centré dans son emplacement — seules les occurrences à
      // repasser sont centrées dans le leur.
      var x = i === 0 && kind !== "dots" ? 0 : (i * slotWidth + startPadding);
      if (mode === "outline" && resolved.dotStyle !== "double") {
        svg.appendChild(makeCenterLine(centerD, x, metrics.baselineY, resolved.dashSizeMm));
        continue;
      }
      var node = makeTextNode(text, x, metrics.baselineY, font.family, fontSizeMm, italic, mode, strokeWidthMm, dashArray);
      svg.appendChild(node);
    }

    drawRulingLines(svg, availableWidthMm, metrics);
  }

  return {
    layoutLine: layoutLine,
    planRows: planRows
  };
})();
