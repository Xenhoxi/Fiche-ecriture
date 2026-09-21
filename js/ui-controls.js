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
      globalSettings: qs("global-settings"),
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
    var italicField = null;
    fontSelect.addEventListener("change", function () {
      if (italicField) italicField.hidden = !FE.Fonts.supportsItalic(fontSelect.value);
      onChange("fontId", fontSelect.value);
    });
    fontField.dataset.setting = "fontId";
    fontField.appendChild(fontLabel);
    fontField.appendChild(fontSelect);
    container.appendChild(fontField);

    function tagged(key, field) {
      field.dataset.setting = key;
      container.appendChild(field);
      return field;
    }

    tagged("fontSizeMm", buildSliderField("Taille", {
      min: 4, max: 30, step: 0.5, value: values.fontSizeMm, unit: "mm"
    }, function (v) { onChange("fontSizeMm", v); }));

    tagged("repetitions", buildSliderField("Répétitions", {
      min: 1, max: 20, step: 1, value: values.repetitions, unit: "×"
    }, function (v) { onChange("repetitions", v); }));

    tagged("lineCount", buildSliderField("Nombre de lignes", {
      min: 1, max: 10, step: 1, value: values.lineCount, unit: ""
    }, function (v) { onChange("lineCount", v); }));

    tagged("dashSizeMm", buildSliderField("Taille des pointillés", {
      min: 0.8, max: 5, step: 0.2, value: values.dashSizeMm, unit: "mm"
    }, function (v) { onChange("dashSizeMm", v); }));

    tagged("dotStyle", buildToggleField("Pointillés doubles (contour des lettres)", values.dotStyle === "double", function (checked) {
      onChange("dotStyle", checked ? "double" : "single");
    }));

    italicField = buildToggleField("Italique", values.fontStyle === "italic", function (checked) {
      onChange("fontStyle", checked ? "italic" : "normal");
    });
    italicField.hidden = !FE.Fonts.supportsItalic(values.fontId);
    tagged("fontStyle", italicField);
  }

  // ---- Réglages globaux ----

  function refreshGlobalSettings() {
    buildSettingsFields(dom.globalSettings, appState.sheet.settings, function (key, value) {
      appState.sheet.settings[key] = value;
      triggerUpdate();
      // La barre de réglages d'un bloc affiche aussi les valeurs héritées.
      FE.PreviewEditor.syncBar();
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
    FE.PreviewEditor.select(null);
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
      FE.PreviewEditor.select(null);
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
    triggerUpdate();
    FE.PreviewEditor.syncBar();
  }

  function init(state, rerenderFn) {
    appState = state;
    rerenderPreview = rerenderFn;
    cacheDom();
    bindSaveNewButtons();
    bindPrintButton();
    refreshAll();
    refreshSavedList();
  }

  return { init: init, buildSettingsFields: buildSettingsFields };
})();
