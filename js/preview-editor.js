window.FE = window.FE || {};

// Interaction directe avec l'aperçu de la fiche :
//  - sélection d'un bloc (une ligne de la fiche) ;
//  - édition du texte sur place (champ superposé au mot modèle), du titre et
//    de la consigne ;
//  - barre flottante de réglages du bloc sélectionné.
//
// Tout ce qui est superposé vit dans #selection-layer, hors des pages : jamais
// imprimé, sans effet sur la mise en page. Le rendu reconstruit tout le DOM des
// pages à chaque changement : `refresh()` re-place donc les cadres après chaque
// rendu. La barre flottante, elle, n'est PAS reconstruite à chaque rendu (sinon
// un curseur en cours de glissement serait détruit sous la souris).
FE.PreviewEditor = (function () {
  "use strict";

  var MM_TO_PX = 96 / 25.4;

  var previewEl = null;
  var layerEl = null;
  var boxesEl = null;
  var barEl = null;
  var getSheet = null;
  var onChange = null;
  var onLiveRender = null;   // redessine la page sans créer de pas d'annulation

  var selectedLineId = null;
  var barLineId = null;      // ligne dont la barre affiche actuellement les réglages
  var barPointerDown = false; // curseur en cours de manipulation dans la barre
  var editing = null;        // { kind: "line"|"title"|"consigne", el, done }
  var addingConsigne = false;
  var wasSelectedOnDown = false;

  var addRowEl = null;       // « + Ajouter une ligne », sous le dernier bloc
  var toolsEl = null;        // « + » et poignée ⠿ affichés au survol d'un bloc
  var menuEl = null;         // menu du bloc (poignée cliquée sans glisser)
  var dropEl = null;         // trait d'insertion pendant un glisser-déposer
  var hoverId = null;
  var hoverTimer = 0;
  var drag = null;           // { id, x, y, startX, startY, moved, raf }

  // ---- utilitaires ----

  function findLine(id) {
    var lines = getSheet().lines;
    for (var i = 0; i < lines.length; i++) if (lines[i].id === id) return lines[i];
    return null;
  }

  function blocksOf(lineId) {
    return Array.prototype.filter.call(previewEl.querySelectorAll(".fiche-bloc"), function (b) {
      return b.getAttribute("data-line-id") === lineId;
    });
  }

  // Rapport d'échelle de l'aperçu (transform: scale() quand la fenêtre est étroite).
  function previewScale() {
    var pages = previewEl.querySelector(".fiche-pages");
    if (!pages || !pages.offsetWidth) return 1;
    return pages.getBoundingClientRect().width / pages.offsetWidth;
  }

  function relRect(el) {
    var o = layerEl.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height };
  }

  function renderLive() {
    onLiveRender();
  }

  function renderOptions() {
    return { forceConsigne: addingConsigne };
  }

  // ---- cadres de sélection + barre ----

  function drawBoxes() {
    boxesEl.innerHTML = "";
    if (!selectedLineId) return;
    // Un cadre par fragment : un bloc coupé entre deux pages en a deux.
    blocksOf(selectedLineId).forEach(function (block) {
      var r = relRect(block);
      var box = document.createElement("div");
      box.className = "selection-box";
      box.style.left = (r.left - 4) + "px";
      box.style.top = (r.top - 4) + "px";
      box.style.width = (r.width + 8) + "px";
      box.style.height = (r.height + 8) + "px";
      boxesEl.appendChild(box);
    });
  }

  function positionBar() {
    if (!barLineId || barPointerDown) return;
    var blocks = blocksOf(barLineId);
    if (!blocks.length) return;
    var last = relRect(blocks[blocks.length - 1]);
    var layerW = layerEl.getBoundingClientRect().width;
    var left = Math.max(0, Math.min(last.left, layerW - barEl.offsetWidth));
    barEl.style.left = left + "px";
    barEl.style.top = (last.top + last.height + 12) + "px";
  }

  // Place « + Ajouter une ligne » juste sous le dernier bloc (ou sous l'invite
  // de fiche vide), à la largeur du contenu de la page.
  function positionAddRow() {
    var blocks = previewEl.querySelectorAll(".fiche-bloc");
    var anchor = blocks.length ? blocks[blocks.length - 1] : previewEl.querySelector(".fiche-empty-hint");
    if (!anchor) { addRowEl.hidden = true; return; }
    var r = relRect(anchor);
    addRowEl.hidden = false;
    addRowEl.style.left = r.left + "px";
    addRowEl.style.top = (r.top + r.height + 12) + "px";
    addRowEl.style.width = r.width + "px";
  }

  function refresh() {
    if (selectedLineId && !findLine(selectedLineId)) {
      selectedLineId = null;
      hideBar();
    }
    drawBoxes();
    positionBar();
    positionTools();
    positionAddRow();
    if (editing) positionEditor();
  }

  function hideBar() {
    barLineId = null;
    barEl.hidden = true;
    barEl.innerHTML = "";
  }

  function markCustom(fields, overrides) {
    Array.prototype.forEach.call(fields.querySelectorAll("[data-setting]"), function (f) {
      f.classList.toggle("is-custom", Object.prototype.hasOwnProperty.call(overrides, f.dataset.setting));
    });
  }

  function moveLine(line, delta) {
    if (!line) return;
    var lines = getSheet().lines;
    var i = lines.indexOf(line);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= lines.length) return;
    lines[i] = lines[j];
    lines[j] = line;
    onChange();
    buildBar();
  }

  function deleteLine(line) {
    if (!line) return;
    var lines = getSheet().lines;
    lines.splice(lines.indexOf(line), 1);
    selectedLineId = null;
    hideBar();
    onChange();
  }

  // (Re)construit la barre pour la ligne sélectionnée : titre, champs
  // de réglages (valeurs résolues ; celles qui diffèrent des réglages globaux
  // sont marquées d'un point), lien « revenir aux réglages globaux ».
  function buildBar() {
    var line = selectedLineId && findLine(selectedLineId);
    if (!line) { hideBar(); return; }
    barLineId = line.id;
    barEl.hidden = false;
    barEl.innerHTML = "";

    var head = document.createElement("div");
    head.className = "floating-bar-head";
    var title = document.createElement("span");
    title.className = "floating-bar-title";
    title.textContent = "Réglages de ce bloc";
    head.appendChild(title);

    var fields = document.createElement("div");
    fields.className = "floating-bar-fields";

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "small floating-bar-reset";
    resetBtn.textContent = "↺ Revenir aux réglages globaux";

    function updateReset() {
      resetBtn.hidden = Object.keys(line.overrides).length === 0;
      markCustom(fields, line.overrides);
    }

    FE.UI.buildSettingsFields(fields, FE.Model.resolveLineSettings(getSheet(), line), function (key, value) {
      line.overrides[key] = value;
      updateReset();
      onChange("l:" + line.id + ":" + key); // même clé = un seul pas d'annulation par geste
    });

    resetBtn.addEventListener("click", function () {
      line.overrides = {};
      onChange();
      buildBar();
    });
    updateReset();

    barEl.appendChild(head);
    barEl.appendChild(fields);
    barEl.appendChild(resetBtn);
    positionBar();
  }

  // Resynchronise la barre (valeurs héritées des réglages globaux). Sans effet
  // si la barre est masquée.
  function syncBar() {
    if (barLineId && !barPointerDown) buildBar();
  }

  function select(lineId) {
    var changed = lineId !== selectedLineId;
    selectedLineId = lineId;
    if (changed) {
      if (editing) finishEdit(false); // changer de bloc enregistre la saisie
      if (lineId) {
        buildBar();
        var first = blocksOf(lineId)[0];
        if (first && first.scrollIntoView) first.scrollIntoView({ block: "nearest" });
      } else {
        hideBar();
      }
    }
    drawBoxes();
    positionBar();
    positionTools();
  }

  // ---- édition sur place ----

  function canvasMetrics(family, fontPx, italic) {
    var ctx = document.createElement("canvas").getContext("2d");
    ctx.font = (italic ? "italic " : "") + fontPx + "px '" + family + "'";
    var m = ctx.measureText("Hg");
    var asc = m.fontBoundingBoxAscent;
    var desc = m.fontBoundingBoxDescent;
    if (!asc && !desc) { asc = fontPx * 0.8; desc = fontPx * 0.2; }
    return { asc: asc, desc: desc };
  }

  // Géométrie du champ selon ce qu'on édite (coordonnées relatives à la couche).
  function editorGeometry() {
    var scale = previewScale();
    var e = editing;
    if (e.kind === "line") {
      var line = findLine(e.id);
      if (!line) return null;
      var block = blocksOf(e.id)[0];
      if (!block) return null;
      var row = block.querySelector(".ligne-ecriture");
      var resolved = FE.Model.resolveLineSettings(getSheet(), line);
      var font = FE.Fonts.getById(resolved.fontId);
      var metrics = FE.Render.computeRowMetrics(resolved.fontSizeMm, font);
      var fontPx = resolved.fontSizeMm * FE.Render.FONT_SCALE * MM_TO_PX * scale;
      var italic = resolved.fontStyle === "italic" && FE.Fonts.supportsItalic(resolved.fontId);
      var cm = canvasMetrics(font.family, fontPx, italic);
      var r = relRect(row);
      var border = 2;
      // Le mot doit reposer sur la même ligne de base que le modèle. Le texte
      // d'un champ est centré verticalement et coupé à sa zone de contenu : on
      // agrandit donc celle-ci jusqu'au bas de la rangée (pour ne pas couper
      // les jambages) en recalculant `top` pour que la ligne de base ne bouge pas.
      var baselineY = r.top + metrics.baselineY * MM_TO_PX * scale;
      var toRowBottom = r.top + r.height - baselineY;
      var glyphH = cm.asc + cm.desc;
      var inner = Math.max(fontPx * 1.7, 2 * toRowBottom - glyphH + 2 * cm.asc);
      var top = baselineY - border - ((inner - glyphH) / 2 + cm.asc);
      return {
        left: r.left - border, top: top, width: r.width + border * 2, height: inner + border * 2,
        family: "'" + font.family + "', cursive", fontPx: fontPx,
        fontStyle: italic ? "italic" : "normal", fontWeight: "400", lineHeight: inner + "px", padding: "0"
      };
    }
    var target = previewEl.querySelector(e.kind === "title" ? ".fiche-name-heading" : ".fiche-consigne-text");
    if (!target) return null;
    var cs = getComputedStyle(target);
    var tr = relRect(target);
    var px = parseFloat(cs.fontSize) * scale;
    // Le champ épouse exactement la zone du texte (bordure 2px + padding 4px
    // en plus), pour que les retours à la ligne tombent aux mêmes endroits.
    var edge = 4 + 2;
    return {
      left: tr.left - edge, top: tr.top - edge, width: tr.width + edge * 2, height: Math.max(tr.height, px * 1.4) + edge * 2,
      family: cs.fontFamily, fontPx: px, fontStyle: "normal", fontWeight: cs.fontWeight,
      lineHeight: e.kind === "title" ? "1.2" : "1.4", padding: "4px", grow: true
    };
  }

  // Titre / consigne : pendant la saisie, l'ancien texte de la page est masqué
  // (sinon il transparaît sous le champ) ; le nouveau est répercuté en direct
  // sur la page, qui se réagence (la consigne peut prendre plusieurs lignes).
  function markEditingTarget() {
    if (!editing || editing.kind === "line") return;
    var t = previewEl.querySelector(editing.kind === "title" ? ".fiche-name-heading" : ".fiche-consigne");
    if (t) t.classList.add("is-editing");
  }

  function positionEditor() {
    var g = editorGeometry();
    if (!g) { finishEdit(true); return; }
    var s = editing.el.style;
    s.left = g.left + "px";
    s.top = g.top + "px";
    s.width = g.width + "px";
    // Titre / consigne : la hauteur suit le contenu (plusieurs lignes possibles).
    s.height = g.grow ? "auto" : g.height + "px";
    s.minHeight = g.grow ? g.height + "px" : "";
    s.fontFamily = g.family;
    s.fontSize = g.fontPx + "px";
    s.fontStyle = g.fontStyle;
    s.fontWeight = g.fontWeight;
    s.lineHeight = g.lineHeight;
    s.padding = g.padding;
    markEditingTarget();
  }

  function currentValue(kind, id) {
    if (kind === "line") return findLine(id).text;
    return kind === "title" ? getSheet().name : getSheet().consigne;
  }

  // Zone de saisie : un <div contenteditable> plutôt qu'un <input>, car Chrome
  // rogne le texte d'un <input> à sa zone de contenu (les jambages des lettres
  // seraient coupés). Texte brut uniquement.
  function readValue(el, multiline) {
    var v = el.textContent.replace(/\u00a0/g, " ");
    return multiline ? v.replace(/\n+$/, "") : v.replace(/[\r\n]+/g, " ");
  }

  function startEdit(kind, id) {
    if (editing) finishEdit(false);
    var multiline = kind === "consigne";
    var el = document.createElement("div");
    // Titre et consigne peuvent passer à la ligne (le titre reste sur une ligne
    // de saisie : Entrée valide toujours).
    el.className = "inline-editor" + (kind !== "line" ? " is-multiline" : "");
    el.setAttribute("data-placeholder", kind === "line" ? "Écrivez un mot…" : (kind === "title" ? "Titre de la fiche" : "Écrivez la consigne…"));
    el.contentEditable = "plaintext-only";
    var plain = el.contentEditable === "plaintext-only";
    if (!plain) el.contentEditable = "true"; // navigateurs sans plaintext-only
    el.spellcheck = false;
    el.textContent = currentValue(kind, id);
    editing = { kind: kind, id: id, el: el, done: false, multiline: multiline, original: el.textContent };
    // La zone de consigne doit rester affichée même si on efface tout le texte.
    if (kind === "consigne") addingConsigne = true;
    if (kind === "line") {
      blocksOf(id).forEach(function (b) { b.classList.add("is-editing"); });
    }
    layerEl.appendChild(el);
    positionEditor();
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishEdit(true); }
      else if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
        // Entrée valide ; Maj+Entrée = retour à la ligne (consigne seulement).
        e.preventDefault(); e.stopPropagation(); finishEdit(false);
      } else if (e.key === "Enter" && !plain) { e.preventDefault(); document.execCommand("insertText", false, "\n"); }
    });
    if (kind !== "line") {
      el.addEventListener("input", function () {
        var sheet = getSheet();
        sheet[kind === "title" ? "name" : "consigne"] = readValue(el, multiline);
        renderLive();
      });
    }
    if (!plain) {
      el.addEventListener("paste", function (e) {
        e.preventDefault();
        var t = (e.clipboardData || window.clipboardData).getData("text");
        document.execCommand("insertText", false, t);
      });
    }
    el.addEventListener("blur", function () { finishEdit(false); });
  }

  // Termine l'édition en cours : `cancel` abandonne la saisie (titre/consigne :
  // la valeur d'origine est rétablie), sinon la valeur est enregistrée puis la
  // fiche est redessinée.
  function finishEdit(cancel) {
    var e = editing;
    if (!e || e.done) return;
    e.done = true;
    editing = null;
    var value = readValue(e.el, e.multiline);
    if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
    if (e.kind === "line") {
      blocksOf(e.id).forEach(function (b) { b.classList.remove("is-editing"); });
    } else {
      Array.prototype.forEach.call(previewEl.querySelectorAll(".is-editing"), function (n) { n.classList.remove("is-editing"); });
    }

    var changed = false;
    if (e.kind === "line") {
      var line = findLine(e.id);
      if (!cancel && line && line.text !== value) { line.text = value; changed = true; }
    } else {
      // Titre / consigne : la page a déjà suivi la saisie en direct ; on fixe
      // la valeur finale (ou l'originale si annulé) et on redessine toujours.
      getSheet()[e.kind === "title" ? "name" : "consigne"] = cancel ? e.original : value;
      changed = true;
    }
    addingConsigne = false;
    if (changed) onChange();
  }

  function addConsigne() {
    addingConsigne = true;
    onChange();
    startEdit("consigne", null);
  }

  function addLine() {
    var line = FE.Model.createDefaultLine("");
    getSheet().lines.push(line);
    onChange();
    select(line.id);
    startEdit("line", line.id);
  }

  // ---- opérations sur les lignes (menu, clavier, glisser-déposer) ----

  function indexOfLine(id) {
    var lines = getSheet().lines;
    for (var i = 0; i < lines.length; i++) if (lines[i].id === id) return i;
    return -1;
  }

  // Insère une ligne vide à `index`, la sélectionne et ouvre sa saisie.
  function insertLineAt(index) {
    var line = FE.Model.createDefaultLine("");
    getSheet().lines.splice(index, 0, line);
    onChange();
    select(line.id);
    startEdit("line", line.id);
  }

  function duplicateLine(id) {
    var i = indexOfLine(id);
    if (i < 0) return;
    var copy = JSON.parse(JSON.stringify(getSheet().lines[i]));
    copy.id = FE.Model.uuid();
    getSheet().lines.splice(i + 1, 0, copy);
    onChange();
    select(copy.id);
  }

  // ---- outils au survol : « + » (insérer dessous) et poignée ⠿ ----
  // Poignée : glisser = déplacer le bloc ; simple clic = menu du bloc.

  // Le bloc qui porte les outils : celui qu'on survole, sinon la ligne
  // sélectionnée (les outils restent donc tant qu'une ligne est sélectionnée).
  function toolsId() {
    return hoverId || selectedLineId;
  }

  function positionTools() {
    if (drag && drag.moved) return; // pendant un glissement, les outils ne bougent pas
    var id = toolsId();
    var blocks = id ? blocksOf(id) : [];
    if (!blocks.length) { toolsEl.hidden = true; return; }
    var r = relRect(blocks[0]);
    toolsEl.hidden = false;
    toolsEl.style.left = (r.left - toolsEl.offsetWidth - 8) + "px";
    toolsEl.style.top = (r.top + 2) + "px";
  }

  function setHover(id) {
    clearTimeout(hoverTimer);
    if (drag) return;
    if (id !== hoverId) { hoverId = id; closeMenu(); }
    positionTools();
  }

  function scheduleHoverEnd() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      if (drag || menuEl && !menuEl.hidden) return;
      hoverId = null;
      positionTools(); // retour à la ligne sélectionnée, ou masqué s'il n'y en a pas
    }, 220);
  }

  // La barre de réglages est masquée pendant un glissement et tant que le menu
  // est ouvert : elle recouvrirait le trait d'insertion / le menu.
  function setBarObscured(hidden) {
    barEl.style.visibility = hidden ? "hidden" : "";
  }

  function closeMenu() {
    if (menuEl) menuEl.hidden = true;
    if (!drag) setBarObscured(false);
  }

  function openMenu(id) {
    select(id);
    var i = indexOfLine(id);
    if (i < 0) return;
    menuEl.innerHTML = "";
    [["Insérer une ligne au-dessus", function () { insertLineAt(i); }],
     ["Insérer une ligne en dessous", function () { insertLineAt(i + 1); }],
     ["Dupliquer", function () { duplicateLine(id); }],
     ["Supprimer", function () { deleteLine(findLine(id)); }, true]].forEach(function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = item[0];
      if (item[2]) b.className = "danger";
      b.addEventListener("click", function () { closeMenu(); item[1](); });
      menuEl.appendChild(b);
    });
    var h = relRect(toolsEl.querySelector(".block-handle"));
    setBarObscured(true);
    menuEl.hidden = false;
    menuEl.style.left = h.left + "px";
    menuEl.style.top = (h.top + h.height + 6) + "px";
  }

  // ---- glisser-déposer ----

  // Où insérer si on lâche à la hauteur `y` (coordonnées écran) ? Renvoie
  // { index, top, left, width } : index dans la liste SANS la ligne déplacée,
  // et la position du trait d'insertion (coordonnées de la couche).
  function dropTarget(y, draggedId) {
    var lines = getSheet().lines.filter(function (l) { return l.id !== draggedId; });
    if (!lines.length) return null;
    var spans = lines.map(function (l) {
      var blocks = blocksOf(l.id);
      if (!blocks.length) return null;
      var first = blocks[0].getBoundingClientRect();
      var last = blocks[blocks.length - 1].getBoundingClientRect();
      return { first: blocks[0], top: first.top, bottom: last.bottom };
    });
    for (var i = 0; i < lines.length; i++) {
      if (!spans[i]) continue;
      if (y < (spans[i].top + spans[i].bottom) / 2) {
        var r = relRect(spans[i].first);
        return { index: i, top: r.top - 3, left: r.left, width: r.width };
      }
    }
    for (var k = lines.length - 1; k >= 0; k--) {
      if (!spans[k]) continue;
      var blocks = blocksOf(lines[k].id);
      var lr = relRect(blocks[blocks.length - 1]);
      return { index: lines.length, top: lr.top + lr.height + 3, left: lr.left, width: lr.width };
    }
    return null;
  }

  // Met à jour la cible d'insertion et le trait qui la montre.
  function updateDropIndicator() {
    var t = dropTarget(drag.y, drag.id);
    drag.target = t;
    if (t) {
      dropEl.hidden = false;
      dropEl.style.left = t.left + "px";
      dropEl.style.top = t.top + "px";
      dropEl.style.width = t.width + "px";
    } else {
      dropEl.hidden = true;
    }
  }

  // Boucle d'animation : défilement automatique près des bords de la fenêtre
  // (le trait d'insertion se recale à chaque image, la page ayant bougé).
  function dragTick() {
    if (!drag) return;
    if (drag.moved) {
      if (drag.y < 70) window.scrollBy(0, -16);
      else if (drag.y > window.innerHeight - 70) window.scrollBy(0, 16);
      updateDropIndicator();
    }
    drag.raf = requestAnimationFrame(dragTick);
  }

  function endDrag(commit) {
    if (!drag) return;
    var d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    dropEl.hidden = true;
    setBarObscured(false);
    document.body.classList.remove("is-dragging-block");
    blocksOf(d.id).forEach(function (b) { b.classList.remove("is-dragging"); });
    if (!d.moved) {
      if (commit) openMenu(d.id); // simple clic sur la poignée
      return;
    }
    if (commit) d.target = dropTarget(d.y, d.id);
    if (commit && d.target) {
      var lines = getSheet().lines;
      var from = indexOfLine(d.id);
      var line = lines.splice(from, 1)[0];
      lines.splice(d.target.index, 0, line);
      if (from !== d.target.index) onChange();
    }
    hoverId = null;
    positionTools();
  }

  function onHandleDown(e) {
    if (e.button !== 0 || !toolsId()) return;
    e.preventDefault();
    var handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* pointeur synthétique */ }
    drag = { id: toolsId(), x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, target: null, raf: 0 };
    select(drag.id);
    drag.raf = requestAnimationFrame(dragTick);
  }

  function onHandleMove(e) {
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 4) {
      drag.moved = true;
      closeMenu();
      setBarObscured(true);
      document.body.classList.add("is-dragging-block");
      blocksOf(drag.id).forEach(function (b) { b.classList.add("is-dragging"); });
    }
    if (drag.moved) updateDropIndicator();
  }

  // ---- événements ----

  function onMouseDown(e) {
    var block = e.target.closest ? e.target.closest(".fiche-bloc") : null;
    if (block) {
      var id = block.getAttribute("data-line-id");
      wasSelectedOnDown = id === selectedLineId;
      select(id);
    } else {
      wasSelectedOnDown = false;
      if (!(e.target.closest && e.target.closest(".add-consigne-hint"))) select(null);
    }
  }

  // Un clic hors de la feuille (fond gris, panneau de gauche…) désélectionne :
  // la barre de réglages, le cadre et les outils disparaissent. Restent
  // « dedans » : les pages, la barre, les outils, le menu, le champ de saisie
  // et le bouton d'ajout.
  function onDocumentMouseDown(e) {
    if (!selectedLineId) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".fiche-page, .floating-bar, .block-tools, .block-menu, .inline-editor, .add-line-row")) return;
    select(null);
  }

  function onClick(e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest(".add-consigne-hint")) { addConsigne(); return; }
    if (t.closest(".fiche-name-heading")) { select(null); startEdit("title", null); return; }
    if (t.closest(".fiche-consigne")) { select(null); startEdit("consigne", null); return; }
    var block = t.closest(".fiche-bloc");
    // Second clic sur un bloc déjà sélectionné : on édite son texte.
    if (block && wasSelectedOnDown) startEdit("line", block.getAttribute("data-line-id"));
  }

  function onKeyDown(e) {
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.target && e.target.closest && e.target.closest(".inline-editor")) return;
    if (e.key === "Escape" && drag) { endDrag(false); return; }
    if (e.key === "Escape" && menuEl && !menuEl.hidden) { closeMenu(); return; }
    if (e.key === "Escape" && selectedLineId) select(null);
    else if (e.key === "Enter" && selectedLineId && !editing) {
      e.preventDefault();
      startEdit("line", selectedLineId);
    } else if (e.key === "Delete" && selectedLineId && !editing) {
      e.preventDefault();
      deleteLine(findLine(selectedLineId));
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && selectedLineId && !editing) {
      e.preventDefault();
      moveLine(findLine(selectedLineId), e.key === "ArrowUp" ? -1 : 1);
    }
  }

  function init(preview, layer, sheetGetter, changeCallback, liveRenderCallback) {
    previewEl = preview;
    layerEl = layer;
    getSheet = sheetGetter;
    onChange = changeCallback;
    onLiveRender = liveRenderCallback || changeCallback;

    boxesEl = document.createElement("div");
    layerEl.appendChild(boxesEl);
    barEl = document.createElement("div");
    barEl.className = "floating-bar";
    barEl.hidden = true;
    layerEl.appendChild(barEl);

    // Pendant qu'un curseur de la barre est tenu, on ne la déplace pas (la
    // hauteur du bloc change avec le réglage et la barre fuirait sous la souris).
    barEl.addEventListener("pointerdown", function () { barPointerDown = true; });
    document.addEventListener("pointerup", function () {
      if (!barPointerDown) return;
      barPointerDown = false;
      positionBar();
    });

    toolsEl = document.createElement("div");
    toolsEl.className = "block-tools";
    toolsEl.hidden = true;
    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "block-plus";
    plus.textContent = "+";
    plus.title = "Ajouter une ligne en dessous";
    plus.setAttribute("aria-label", "Ajouter une ligne en dessous");
    plus.addEventListener("click", function () {
      var i = indexOfLine(toolsId());
      if (i >= 0) insertLineAt(i + 1);
    });
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "block-handle";
    handle.textContent = "⠿";
    handle.title = "Glisser pour déplacer · clic pour le menu";
    handle.setAttribute("aria-label", "Déplacer ou ouvrir le menu du bloc");
    handle.addEventListener("pointerdown", onHandleDown);
    handle.addEventListener("pointermove", onHandleMove);
    handle.addEventListener("pointerup", function () { endDrag(true); });
    handle.addEventListener("pointercancel", function () { endDrag(false); });
    toolsEl.appendChild(plus);
    toolsEl.appendChild(handle);
    toolsEl.addEventListener("mouseenter", function () { clearTimeout(hoverTimer); });
    toolsEl.addEventListener("mouseleave", scheduleHoverEnd);
    layerEl.appendChild(toolsEl);

    menuEl = document.createElement("div");
    menuEl.className = "block-menu";
    menuEl.hidden = true;
    layerEl.appendChild(menuEl);
    // Un clic ailleurs referme le menu.
    document.addEventListener("pointerdown", function (e) {
      if (menuEl.hidden) return;
      if (menuEl.contains(e.target) || toolsEl.contains(e.target)) return;
      closeMenu();
    }, true);

    dropEl = document.createElement("div");
    dropEl.className = "drop-indicator";
    dropEl.hidden = true;
    layerEl.appendChild(dropEl);

    previewEl.addEventListener("mouseover", function (e) {
      var block = e.target.closest ? e.target.closest(".fiche-bloc") : null;
      if (block) setHover(block.getAttribute("data-line-id"));
      else scheduleHoverEnd();
    });
    previewEl.addEventListener("mouseleave", scheduleHoverEnd);

    previewEl.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousedown", onDocumentMouseDown);
    previewEl.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);

    addRowEl = layerEl.querySelector(".add-line-row");
    var addBtn = document.getElementById("btn-add-line");
    if (addBtn) addBtn.addEventListener("click", addLine);
  }

  return {
    init: init,
    refresh: refresh,
    select: select,
    syncBar: syncBar,
    renderOptions: renderOptions,
    cancelEdit: function () { finishEdit(true); },
    getSelectedId: function () { return selectedLineId; }
  };
})();
