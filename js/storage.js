window.FE = window.FE || {};

FE.Storage = (function () {
  "use strict";

  var KEY = "ficheEcriture:v1:sheets";

  function readAll() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      console.warn("Impossible de lire le stockage local :", e);
      return {};
    }
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      console.warn("Données de fiches corrompues dans le stockage local, réinitialisation.", e);
      return {};
    }
  }

  function writeAll(map) {
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      console.error("Échec de l'enregistrement (stockage local plein ou indisponible) :", e);
      return false;
    }
  }

  function listSheets() {
    var map = readAll();
    return Object.keys(map)
      .map(function (id) {
        var s = map[id];
        return { id: id, name: s.name, updatedAt: s.updatedAt };
      })
      .sort(function (a, b) {
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });
  }

  function getSheet(id) {
    var map = readAll();
    return map[id] ? JSON.parse(JSON.stringify(map[id])) : null;
  }

  function saveSheet(sheet) {
    var map = readAll();
    var now = new Date().toISOString();
    if (!sheet.id) {
      sheet.id = FE.Model.uuid();
      sheet.createdAt = now;
    }
    sheet.updatedAt = now;
    map[sheet.id] = sheet;
    writeAll(map);
    return sheet;
  }

  function deleteSheet(id) {
    var map = readAll();
    delete map[id];
    writeAll(map);
  }

  function duplicateSheet(id, newName) {
    var map = readAll();
    var original = map[id];
    if (!original) return null;
    var copy = JSON.parse(JSON.stringify(original));
    copy.id = null;
    copy.name = newName || (copy.name + " (copie)");
    return saveSheet(copy);
  }

  return {
    listSheets: listSheets,
    getSheet: getSheet,
    saveSheet: saveSheet,
    deleteSheet: deleteSheet,
    duplicateSheet: duplicateSheet
  };
})();
