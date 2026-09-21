window.FE = window.FE || {};

// Catalogue des polices disponibles pour le texte des fiches.
// `family` doit correspondre exactement au font-family déclaré dans fonts/fonts.css.
FE.Fonts = {
  catalog: [
    { id: "caveat", family: "Caveat", label: "Caveat (cursive)" },
    { id: "patrick-hand", family: "Patrick Hand", label: "Patrick Hand (écriture bâton)" },
    { id: "dancing-script", family: "Dancing Script", label: "Dancing Script (cursive)" }
  ],

  getById: function (id) {
    var found = this.catalog.filter(function (f) { return f.id === id; })[0];
    return found || this.catalog[0];
  }
};
