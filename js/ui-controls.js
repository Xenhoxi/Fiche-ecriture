window.FE = window.FE || {};

FE.UI = (function () {
  "use strict";

  var appState = null;
  var rerenderPreview = null;
  var dom = {};

  function qs(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    dom = {
      sheetName: qs("field-sheet-name"),
      consigne: qs("field-consigne"),
      globalSettings: qs("global-settings"),
      linesList: qs("lines-list"),
      addLineBtn: qs("btn-add-line"),
      savedList: qs("saved-sheets-list"),
      saveBtn: qs("btn-save"),
      newBtn: qs("btn-new"),
      printBtn: qs("btn-print")
    };
  }

  function populateFontSelect(selectEl) {
    selectEl.innerHTML = "";
    FE.Fonts.catalog.forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.label;
      selectEl.appendChild(opt);
    });
  }

  function triggerUpdate() {
    rerenderPreview(appState.sheet);
  }

  // ---- Composants de champ réutilisables (réglages globaux + par ligne) ----

  function formatSliderValue(v, unit) {
    var rounded = Math.round(v * 10) / 10;
    return (Number.isInteger(rounded) ? rounded : rounded.toFixed(1)) + " " + unit;
  }

  function buildSliderField(labelText, opts, onChange) {
    var field = document.createElement("div");
    field.className = "field slider-field";
    var label = document.createElement("label");
    label.textContent = labelText;
    var row = document.createElement("div");
    row.className = "slider-row";
    var range = document.createElement("input");
    range.type = "range";
    range.min = opts.min;
    range.max = opts.max;
    range.step = opts.step;
    range.value = opts.value;
    var output = document.createElement("output");
    output.className = "slider-output";
    output.textContent = formatSliderValue(opts.value, opts.unit);
    range.addEventListener("input", function () {
      var v = Number(range.value);
      output.textContent = formatSliderValue(v, opts.unit);
      onChange(v);
    });
    row.appendChild(range);
    row.appendChild(output);
    field.appendChild(label);
    field.appendChild(row);
    return field;
  }

  function buildToggleField(labelText, checked, onChange) {
    var field = document.createElement("label");
    field.className = "toggle-field";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    var track = document.createElement("span");
    track.className = "toggle-track";
    var text = document.createElement("span");
    text.className = "toggle-label-text";
    text.textContent = labelText;
    input.addEventListener("change", function () { onChange(input.checked); });
    field.appendChild(input);
    field.appendChild(track);
    field.appendChild(text);
    return field;
  }

  // Construit le groupe de champs police/taille/répétitions/style/italique,
  // partagé entre les réglages globaux et la personnalisation par ligne.
  function buildSettingsFields(container, values, onChange) {
    container.innerHTML = "";

    var fontField = document.createElement("div");
    fontField.className = "field";
    var fontLabel = document.createElement("label");
    fontLabel.textContent = "Police";
    var fontSelect = document.createElement("select");
    populateFontSelect(fontSelect);
    fontSelect.value = values.fontId;
    fontSelect.addEventListener("change", function () { onChange("fontId", fontSelect.value); });
    fontField.appendChild(fontLabel);
    fontField.appendChild(fontSelect);
    container.appendChild(fontField);

    container.appendChild(buildSliderField("Taille", {
      min: 4, max: 30, step: 0.5, value: values.fontSizeMm, unit: "mm"
    }, function (v) { onChange("fontSizeMm", v); }));

    container.appendChild(buildSliderField("Répétitions", {
      min: 1, max: 20, step: 1, value: values.repetitions, unit: "×"
    }, function (v) { onChange("repetitions", v); }));

    container.appendChild(buildSliderField("Taille des pointillés", {
      min: 0.8, max: 5, step: 0.2, value: values.dashSizeMm, unit: "mm"
    }, function (v) { onChange("dashSizeMm", v); }));

    container.appendChild(buildToggleField("Italique", values.fontStyle === "italic", function (checked) {
      onChange("fontStyle", checked ? "italic" : "normal");
    }));
  }

  // ---- Réglages globaux ----

  function refreshGlobalSettings() {
    dom.sheetName.value = appState.sheet.name;
    dom.consigne.value = appState.sheet.consigne;
    buildSettingsFields(dom.globalSettings, appState.sheet.settings, function (key, value) {
      appState.sheet.settings[key] = value;
      triggerUpdate();
    });
  }

  function bindGlobalFields() {
    dom.sheetName.addEventListener("input", function () {
      appState.sheet.name = dom.sheetName.value;
      triggerUpdate();
    });
    dom.consigne.addEventListener("input", function () {
      appState.sheet.consigne = dom.consigne.value;
      triggerUpdate();
    });
  }

  // ---- Lignes ----

  function buildOverridesPanel(line) {
    var panel = document.createElement("div");
    panel.className = "line-item-overrides-content";

    var fieldsContainer = document.createElement("div");
    panel.appendChild(fieldsContainer);

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "small line-item-reset";
    resetBtn.textContent = "↺ Revenir aux réglages globaux";

    function updateResetVisibility() {
      resetBtn.hidden = Object.keys(line.overrides).length === 0;
    }

    var resolved = FE.Model.resolveLineSettings(appState.sheet, line);
    buildSettingsFields(fieldsContainer, resolved, function (key, value) {
      line.overrides[key] = value;
      updateResetVisibility();
      triggerUpdate();
    });

    resetBtn.addEventListener("click", function () {
      line.overrides = {};
      refreshLines();
      triggerUpdate();
    });
    updateResetVisibility();
    panel.appendChild(resetBtn);

    return panel;
  }

  function buildLineItem(line, index, total) {
    var item = document.createElement("div");
    item.className = "line-item";

    var head = document.createElement("div");
    head.className = "line-item-head";

    var textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = line.text;
    textInput.placeholder = "Mot ou phrase à écrire";
    textInput.addEventListener("input", function () {
      line.text = textInput.value;
      triggerUpdate();
    });

    var actions = document.createElement("div");
    actions.className = "line-item-actions";

    var upBtn = document.createElement("button");
    upBtn.className = "small";
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.title = "Monter";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", function () { moveLine(index, -1); });

    var downBtn = document.createElement("button");
    downBtn.className = "small";
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.title = "Descendre";
    downBtn.disabled = index === total - 1;
    downBtn.addEventListener("click", function () { moveLine(index, 1); });

    var delBtn = document.createElement("button");
    delBtn.className = "small danger";
    delBtn.type = "button";
    delBtn.textContent = "✕";
    delBtn.title = "Supprimer cette ligne";
    delBtn.addEventListener("click", function () {
      appState.sheet.lines.splice(index, 1);
      refreshLines();
      triggerUpdate();
    });

    var settingsBtn = document.createElement("button");
    settingsBtn.className = "small line-item-settings-btn";
    settingsBtn.type = "button";
    settingsBtn.textContent = "⚙";
    settingsBtn.title = "Personnaliser cette ligne";
    settingsBtn.setAttribute("aria-label", "Personnaliser cette ligne");
    settingsBtn.addEventListener("click", function () {
      // Accordéon : ouvrir une ligne referme automatiquement les autres,
      // pour ne pas avoir plusieurs panneaux ouverts à faire défiler.
      var wasExpanded = item.classList.contains("expanded");
      Array.prototype.forEach.call(dom.linesList.querySelectorAll(".line-item.expanded"), function (el) {
        el.classList.remove("expanded");
      });
      if (!wasExpanded) item.classList.add("expanded");
    });

    actions.appendChild(settingsBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(delBtn);

    head.appendChild(textInput);
    head.appendChild(actions);

    var overridesWrap = document.createElement("div");
    overridesWrap.className = "line-item-overrides-wrap";
    var overridesInner = document.createElement("div");
    overridesInner.className = "line-item-overrides-inner";
    overridesInner.appendChild(buildOverridesPanel(line));
    overridesWrap.appendChild(overridesInner);

    item.appendChild(head);
    item.appendChild(overridesWrap);

    return item;
  }

  function moveLine(index, delta) {
    var lines = appState.sheet.lines;
    var newIndex = index + delta;
    if (newIndex < 0 || newIndex >= lines.length) return;
    var tmp = lines[index];
    lines[index] = lines[newIndex];
    lines[newIndex] = tmp;
    refreshLines();
    triggerUpdate();
  }

  function refreshLines() {
    dom.linesList.innerHTML = "";
    var lines = appState.sheet.lines;
    if (lines.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aucune ligne pour le moment.";
      dom.linesList.appendChild(empty);
    }
    lines.forEach(function (line, index) {
      dom.linesList.appendChild(buildLineItem(line, index, lines.length));
    });
  }

  function bindAddLine() {
    dom.addLineBtn.addEventListener("click", function () {
      appState.sheet.lines.push(FE.Model.createDefaultLine(""));
      refreshLines();
      triggerUpdate();
    });
  }

  // ---- Fiches sauvegardées ----

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function loadSheetById(id) {
    var sheet = FE.Storage.getSheet(id);
    if (!sheet) return;
    appState.sheet = FE.Model.validateSheet(sheet);
    refreshAll();
  }

  function refreshSavedList() {
    dom.savedList.innerHTML = "";
    var items = FE.Storage.listSheets();
    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aucune fiche sauvegardée.";
      dom.savedList.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "saved-sheet-item";

      var info = document.createElement("div");
      info.className = "saved-sheet-info";
      var name = document.createElement("div");
      name.className = "saved-sheet-name";
      name.textContent = item.name;
      var date = document.createElement("div");
      date.className = "saved-sheet-date";
      date.textContent = formatDate(item.updatedAt);
      info.appendChild(name);
      info.appendChild(date);

      var actions = document.createElement("div");
      actions.className = "saved-sheet-actions";

      var loadBtn = document.createElement("button");
      loadBtn.className = "small";
      loadBtn.type = "button";
      loadBtn.textContent = "Charger";
      loadBtn.addEventListener("click", function () { loadSheetById(item.id); });

      var dupBtn = document.createElement("button");
      dupBtn.className = "small";
      dupBtn.type = "button";
      dupBtn.textContent = "Dupliquer";
      dupBtn.addEventListener("click", function () {
        FE.Storage.duplicateSheet(item.id);
        refreshSavedList();
      });

      var delBtn = document.createElement("button");
      delBtn.className = "small danger";
      delBtn.type = "button";
      delBtn.textContent = "Suppr.";
      delBtn.addEventListener("click", function () {
        if (window.confirm("Supprimer la fiche \"" + item.name + "\" ? Cette action est irréversible.")) {
          FE.Storage.deleteSheet(item.id);
          refreshSavedList();
        }
      });

      actions.appendChild(loadBtn);
      actions.appendChild(dupBtn);
      actions.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(actions);
      dom.savedList.appendChild(row);
    });
  }

  function bindSaveNewButtons() {
    dom.saveBtn.addEventListener("click", function () {
      FE.Storage.saveSheet(appState.sheet);
      refreshSavedList();
    });
    dom.newBtn.addEventListener("click", function () {
      if (!window.confirm("Créer une nouvelle fiche ? Les modifications non sauvegardées de la fiche actuelle seront perdues.")) return;
      appState.sheet = FE.Model.createDefaultSheet();
      refreshAll();
    });
  }

  function bindPrintButton() {
    dom.printBtn.addEventListener("click", function () {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { window.print(); });
      } else {
        window.print();
      }
    });
  }

  function refreshAll() {
    refreshGlobalSettings();
    refreshLines();
    triggerUpdate();
  }

  function init(state, rerenderFn) {
    appState = state;
    rerenderPreview = rerenderFn;
    cacheDom();
    bindGlobalFields();
    bindAddLine();
    bindSaveNewButtons();
    bindPrintButton();
    refreshAll();
    refreshSavedList();
  }

  return { init: init };
})();
