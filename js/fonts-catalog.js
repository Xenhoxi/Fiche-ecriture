window.FE = window.FE || {};

// Catalogue des polices disponibles pour le texte des fiches.
// `family` doit correspondre exactement au font-family déclaré dans fonts/fonts.css.
FE.Fonts = {
  catalog: [
    // Familles Marelle : réglure à 6 lignes espacées d'une x-height (0,48 em),
    // la ligne de base étant la 4e en partant du haut. Proportions relevées
    // sur les variantes "LIGNES" officielles (upm 2000 : lignes à
    // +2880, +1920, +960, 0, -960, -1920). Pas d'italique.
    { id: "marelle", family: "Marelle", label: "Marelle (cursive)", ruling: "marelle", italic: false },
    { id: "marelle-2", family: "Marelle 2", label: "Marelle 2 (cursive, hampes courtes)", ruling: "marelle", italic: false },
    { id: "marelle-baton", family: "Marelle Baton", label: "Marelle Bâton (capitales bâton)", ruling: "marelle", italic: false },
    { id: "marelle-baton-2", family: "Marelle Baton 2", label: "Marelle Bâton 2 (hampes courtes)", ruling: "marelle", italic: false },
    { id: "caveat", family: "Caveat", label: "Caveat (cursive)" },
    { id: "patrick-hand", family: "Patrick Hand", label: "Patrick Hand (écriture bâton)" },
    { id: "dancing-script", family: "Dancing Script", label: "Dancing Script (cursive)" }
  ],

  supportsItalic: function (id) {
    return this.getById(id).italic !== false;
  },

  getById: function (id) {
    var found = this.catalog.filter(function (f) { return f.id === id; })[0];
    return found || this.catalog[0];
  }
};
