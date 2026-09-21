# Suivi de projet — Fiche-Écriture

> Fichier de reprise de session. À lire en premier avant toute nouvelle modification.
> Dernière mise à jour : 2026-09-21.

## Quoi

Site 100% statique (HTML/CSS/JS vanilla, aucun build, aucun framework) dans
`/home/barbatruc/Desktop/Fiche-Ecriture`, pour créer et imprimer des fiches
d'écriture pour élèves de primaire (réglure façon Seyès, mots à copier avec
répétitions en pointillé à repasser). Sauvegarde locale (localStorage),
export PDF via impression navigateur. Fonctionne hors-ligne (polices
embarquées en `.woff2`).

Dépôt git + GitHub Pages : https://github.com/Xenhoxi/fiche-ecriture → https://xenhoxi.github.io/fiche-ecriture/ (branche `main`, déploiement à chaque `git push`). Deux images de référence fournies
par l'utilisateur restent à la racine (`Exemple ligne.jpeg`,
`fiche actuelle.jpeg`) — pures références visuelles, pas utilisées par le
code, à garder sauf demande contraire.

## Architecture des fichiers

```
index.html              squelette : sidebar (éditeur) + zone d'aperçu
css/base.css             design system (couleurs, boutons, sliders, toggle)
css/editor.css           sidebar, cartes de ligne, accordéon
css/print.css            @media print
css/sheet.css            page imprimable (.fiche-page), conteneur de ligne (.ligne-ecriture)
js/model.js               FE.Model — modèle de données, defaults, validation/migration
js/fonts-catalog.js        FE.Fonts — catalogue polices (Caveat, Patrick Hand, Dancing Script)
js/storage.js               FE.Storage — CRUD localStorage des fiches
js/dotted-text.js            FE.DottedText — génère le SVG de chaque ligne (mots + repères de réglure)
js/render.js                  FE.Render — construit le DOM de la fiche, calcule les métriques de ligne
js/ui-controls.js              FE.UI — sidebar, binding des événements
js/main.js                      bootstrap, mise à l'échelle responsive de l'aperçu
fonts/                            .woff2 embarqués + fonts.css + LICENSES.txt + LICENSE-Marelle.txt
```

Scripts classiques (`<script src="...">`, PAS de `type="module"`) — exprès,
pour que `index.html` s'ouvre directement en double-clic (`file://`) sans
serveur, Chrome bloquant les modules ES sous `file://`.

## Modèle de données (`js/model.js`)

```js
sheet = { id, name, createdAt, updatedAt, consigne, settings, lines[] }
settings = { fontId, fontSizeMm: 8, fontStyle: "normal"|"italic", repetitions: 6, dashSizeMm: 2 }
line = { id, text, overrides: <settings partiel> }
```

`FE.Model.resolveLineSettings(sheet, line)` fait le merge overrides ← settings.
Un champ `lineStyle` a existé historiquement (dotted/outline/solid) puis a
été **supprimé** (plus qu'un seul style de pointillé) — `validateSheet`
le supprime des anciennes fiches au chargement pour ne pas planter.

## État actuel du rendu (important pour reprendre)

### Réglure (4 repères par ligne, dans `computeRowMetrics` de `render.js`)

```js
ascenderH = fontSizeMm * 1.0
descenderH = fontSizeMm * 0.55
gapH = max(1.5, fontSizeMm * 0.3)
topY = 0                        // pointillé fin — plafond des hampes
coreTopY = ascenderH * 0.5      // pointillé fin — haut du corps de lettre (x-height)
baselineY = ascenderH           // TRAIT PLEIN — où le mot repose
bottomY = ascenderH + descenderH // pointillé fin — plancher des jambages
rowHeightMm = ascenderH + descenderH + gapH
```

Chaque ligne est **autonome** (pas de grille de page à recaler) : la hauteur
suit continûment `fontSizeMm`, sans palier — c'était un bug signalé
("trop de lignes ajoutées") avant ce calcul continu.

Les 4 repères sont dessinés en `<line>` SVG **dans `dotted-text.js`,
`drawRulingLines()`, APRÈS le texte** (donc par-dessus, pas en fond CSS).
C'était un vrai bug corrigé : dessinées en fond, elles étaient invisibles
sous l'encre du mot modèle. Couleur `#2f5fa8`, épaisseurs `0.16mm` (fines,
pointillées `"1.4,1.3"`) et `0.38mm` (pleine, baseline). Ne pas re-épaissir
sans raison : une tentative à `0.35/0.9mm` a été jugée "moins qualitative"
par l'utilisateur et annulée.

### Texte à tracer (`dotted-text.js`)

- 1ère occurrence de chaque ligne = **modèle plein**, toujours collée à
  gauche (`x=0`, jamais centrée — c'était un bug corrigé).
- Occurrences suivantes = **contour tracé en pointillé** (`stroke-dasharray`
  sur le glyphe, `fill:none`), PAS un motif de remplissage. Historique des
  essais (dans l'ordre) :
  1. contour pointillé (dédoublé pour polices à trait épais) → rejeté,
  2. motif de remplissage par tuile SVG (`<pattern>`) → jugé "mécanique",
     eu un bug de couverture (le pas de la grille suivait la taille du
     tiret → trous en haut du mot à grande taille) → corrigé puis rejeté
     quand même,
  3. **retour au contour pointillé (technique 1)**, choix actuel et validé.
  - `strokeWidthMm = max(0.2, dashSizeMm * 0.28)`
  - `dashArray = (dashSizeMm*1.1) + "," + (dashSizeMm*0.75)`
  - `dashSizeMm` = slider utilisateur "Taille des pointillés" (0.8–5mm),
    indépendant de la taille de police.
- Anti-chevauchement : si le mot est plus large que son emplacement idéal
  (police trop grande pour le nb de répétitions), l'espacement s'élargit et
  le nombre d'occurrences affichées diminue plutôt que de superposer du
  texte illisible.

### Police / italique

Bug trouvé et corrigé : une règle CSS dans `sheet.css`
(`.ligne-ecriture text { font-family: var(--line-font-family, 'Caveat'); ... }`)
écrasait systématiquement les attributs SVG posés en JS, car ces custom
properties n'étaient jamais définies nulle part. Supprimé de la CSS — ne
JAMAIS remettre de `font-family`/`font-style` sur `.ligne-ecriture text`.

### Polices Marelle (ajoutées 2026-09-21)

4 polices du Ministère (SIL OFL) : Marelle, Marelle 2 (hampes courtes),
Marelle Bâton, Marelle Bâton 2. Police par défaut des nouvelles fiches.
Sources `.ttf`/`.otf` + PDF spécimen dans `marelle-ttf/` et
`Marelle_Specimen.pdf` (ignorés par git, non utilisés par le code).

- **On n'utilise PAS les variantes `LIGNES`** (réglure incluse dans le glyphe) :
  lettre et lignes y sont fusionnées en un seul contour, donc impossible
  de pointiller la lettre sans pointiller les lignes. On charge les
  polices sans lignes et `drawRulingLines()` trace la réglure avec les
  mêmes proportions, relevées dans les LIGNES (upm 2000) : 6 lignes à
  +2880/+1920/+960/**0**/-960/-1920, soit un pas de 0,48 em = x-height ;
  la base (0) est la 4e ligne, seule pleine.
- `FE.Fonts.catalog` : `ruling: "marelle"` déclenche cette réglure dans
  `computeRowMetrics(fontSizeMm, font)` (hauteur de ligne = 2,4 em + gap) ;
  `italic: false` masque le toggle Italique et force `normal`.
  Polices sans `ruling` (Caveat, etc.) gardent l'ancienne réglure à 4 repères.
- `FONT_SCALE = 1.35` (`FE.Render`) : em = Taille × 1.35, comme avant.
- Contour pointillé des polices `ruling` : épaisseur plafonnée à
  `em × 0.02`, sinon les 2 bords du trait fin fusionnent en bloc illisible.
- `main.js` `reloadIfFontsPending` : une police n'est téléchargée qu'à son
  premier usage → re-rendu après `document.fonts.load`, sinon la mesure
  du mot (fallback) fait chevaucher les répétitions.
- Rendu Caveat en contour pointillé : semble très chargé (constaté
  2026-09-21, non modifié).

### UI (`ui-controls.js`)

- Réglages globaux et personnalisation par ligne partagent le même
  générateur de champs `buildSettingsFields()` : Police (select), Taille
  (slider), Répétitions (slider), Taille des pointillés (slider), Italique
  (toggle). Plus de sélecteur de "style de ligne" (retiré avec le point
  précédent).
- Panneau de personnalisation par ligne : bouton icône ⚙ compact (plus de
  lien texte "Personnaliser cette ligne"), **accordéon** (ouvrir une ligne
  referme les autres) pour éviter le scroll avec beaucoup de lignes. Lien
  "↺ Revenir aux réglages globaux" visible seulement si la ligne a des
  overrides actifs.
- Responsive : `.fiche-page` mis à l'échelle via `transform: scale()` en JS
  (`main.js`) si le conteneur est trop étroit ; `print.css` neutralise ce
  transform à l'impression.

## Méthode de test qui marche (à réutiliser)

- Serveur local : `python3 -m http.server 8934 --directory "/home/barbatruc/Desktop/Fiche-Ecriture"`,
  puis `pkill -f "http.server 8934"` en fin de session.
- Test d'impression **sans ouvrir la vraie boîte de dialogue** (risque de
  geler l'automatisation navigateur sur une dialog native) : injecter
  `css/print.css` comme feuille de style normale + `display:none` sur
  `.no-print` via JS, puis screenshot.
- **Piège rencontré plusieurs fois** : l'outil de capture d'écran/zoom du
  navigateur est parfois flaky (timeout puis résultat blanc/périmé au retry
  immédiat suivant). Ne pas conclure à un bug de rendu sur une seule capture
  suspecte. Méthode fiable de vérification au pixel près : sérialiser le
  `<svg>` de la ligne, le dessiner dans un `<canvas>` offscreen à une échelle
  mm→px connue, et lire `getImageData()` aux coordonnées mm exactes. Cette
  méthode a confirmé à plusieurs reprises que le code était correct alors
  qu'une capture d'écran suggérait le contraire.

## Points ouverts pour la prochaine session

- Le contour pointillé peut encore sembler légèrement "dédoublé" sur
  Caveat (police à trait épais) pour de petites valeurs de `dashSizeMm` —
  s'atténue en augmentant le slider. Pas signalé comme problème au dernier
  échange, à surveiller si ça revient.
- Jamais testé un vrai `window.print()` (dialogue natif) — seulement la
  simulation CSS. Un test réel par l'utilisateur serait utile.
- Pas de suite de tests automatisés, tout est vérifié manuellement à chaque
  session.

## Pour reprendre demain

1. Lire ce fichier.
2. Relire `js/model.js`, `js/render.js`, `js/dotted-text.js`, `js/ui-controls.js`,
   `css/sheet.css` pour se remettre en tête l'état exact du code (les
   constantes ci-dessus peuvent avoir légèrement bougé si retouchées).
3. Relancer le serveur local et tester dans le navigateur avant toute
   nouvelle modification, avec la méthode de vérification pixel si un doute
   porte sur la visibilité/position d'un élément graphique.
