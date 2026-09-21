window.FE = window.FE || {};

FE.Model = (function () {
  "use strict";

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function createDefaultSettings() {
    return {
      fontId: "marelle",
      fontSizeMm: 8,
      fontStyle: "normal", // "normal" | "italic"
      repetitions: 6,
      dashSizeMm: 2 // taille des petits tirés du pointillé à repasser
    };
  }

  function createDefaultLine(text) {
    return {
      id: uuid(),
      text: text || "",
      overrides: {}
    };
  }

  function createDefaultSheet() {
    return {
      id: null,
      name: "Fiche sans titre",
      createdAt: null,
      updatedAt: null,
      consigne: "",
      settings: createDefaultSettings(),
      lines: [
        createDefaultLine("maman"),
        createDefaultLine("papa")
      ]
    };
  }

  // Merges a line's partial overrides onto the sheet's global settings.
  function resolveLineSettings(sheet, line) {
    return Object.assign({}, sheet.settings, line.overrides || {});
  }

  function clampNumber(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  // Ensures a sheet object has sane values, filling in defaults for
  // anything missing or out of range (e.g. after loading old/corrupt data).
  function validateSheet(sheet) {
    if (!sheet || typeof sheet !== "object") return createDefaultSheet();

    var defaults = createDefaultSettings();
    sheet.name = typeof sheet.name === "string" && sheet.name.trim() ? sheet.name : "Fiche sans titre";
    sheet.consigne = typeof sheet.consigne === "string" ? sheet.consigne : "";
    sheet.settings = Object.assign({}, defaults, sheet.settings || {});
    sheet.settings.fontSizeMm = clampNumber(sheet.settings.fontSizeMm, 3, 40, defaults.fontSizeMm);
    sheet.settings.repetitions = Math.round(clampNumber(sheet.settings.repetitions, 1, 30, defaults.repetitions));
    sheet.settings.dashSizeMm = clampNumber(sheet.settings.dashSizeMm, 0.6, 6, defaults.dashSizeMm);
    if (sheet.settings.fontStyle !== "italic") sheet.settings.fontStyle = "normal";
    delete sheet.settings.lineStyle; // ancien réglage, styles "double"/"plein" retirés

    sheet.lines = Array.isArray(sheet.lines) ? sheet.lines : [];
    sheet.lines.forEach(function (line) {
      if (!line.id) line.id = uuid();
      line.text = typeof line.text === "string" ? line.text : "";
      line.overrides = line.overrides && typeof line.overrides === "object" ? line.overrides : {};
      if (line.overrides.fontSizeMm !== undefined) {
        line.overrides.fontSizeMm = clampNumber(line.overrides.fontSizeMm, 3, 40, defaults.fontSizeMm);
      }
      if (line.overrides.repetitions !== undefined) {
        line.overrides.repetitions = Math.round(clampNumber(line.overrides.repetitions, 1, 30, defaults.repetitions));
      }
      if (line.overrides.dashSizeMm !== undefined) {
        line.overrides.dashSizeMm = clampNumber(line.overrides.dashSizeMm, 0.6, 6, defaults.dashSizeMm);
      }
      delete line.overrides.lineStyle; // ancien réglage, styles "double"/"plein" retirés
    });

    return sheet;
  }

  return {
    uuid: uuid,
    createDefaultSettings: createDefaultSettings,
    createDefaultLine: createDefaultLine,
    createDefaultSheet: createDefaultSheet,
    resolveLineSettings: resolveLineSettings,
    validateSheet: validateSheet
  };
})();
