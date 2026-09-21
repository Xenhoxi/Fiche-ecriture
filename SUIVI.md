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

Dépôt git (branche `main`) + GitHub Pages : https://github.com/Xenhoxi/fiche-ecriture → https://xenhoxi.github.io/fiche-ecriture/ (branche `main`, déploiement à chaque `git push`). Deux images de référence fournies
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
js/skeleton.js                 FE.Skeleton — ligne centrale des lettres (pointillé simple)
js/preview-editor.js            FE.PreviewEditor — sélection d'un bloc sur l'aperçu (couche #selection-layer)
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
settings = { fontId, fontSizeMm: 8, fontStyle: "normal"|"italic", repetitions: 6, lineCount: 1, dotStyle: "single"|"double", dashSizeMm: 2 }
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
- Répartition (commit `0bb358a`, fusionné dans `main` par `e5bed45`) : quand
  les répétitions demandées dépassent ce qui tient, celles qui restent
  sont réparties sur TOUTE la largeur (`slotWidth = largeur / visibleCount`)
  au lieu d'être collées à gauche avec un vide à droite. Pour annuler
  seulement ça : `git revert -m 1 e5bed45` (ou repartir de `c68b0ea`,
  Marelle seul). La branche `repartition-repetitions` existe aussi.

### Refonte « édition sur l'aperçu » — branche `edition-sur-apercu` (plan : `~/.claude/plans/pasted-content-id-6291-q2-velvet-pearl.md`)

Objectif : éditer directement sur l'aperçu façon Notion. 4 étapes, un commit
chacune, `main` intact jusqu'à validation. **Étape 1 faite** (blocs, pages
multiples, sélection). À faire : 2 édition sur place + barre flottante (panneau
gauche réduit), 3 glisser-déposer + ajout/suppression au survol, 4
annuler/rétablir + brouillon auto.

- `renderSheet` produit `.fiche-pages` > N `.fiche-page` (210×297mm fixes) >
  `.fiche-bloc[data-line-id]` > `.ligne-ecriture`. Titre + consigne en page 1
  seulement (hauteur mesurée dans le DOM). Un bloc n'est jamais coupé ; s'il est
  plus grand qu'une page il est coupé rangée par rangée (plusieurs `.fiche-bloc`
  avec le même id). Hauteur utile 267mm ; rangée = `rowHeightMm` + 1mm.
- Sélection : clic sur un bloc → cadre dans `#selection-layer` (frère de
  `#fiche-preview` dans `.preview-stage`, `.no-print`, jamais imprimé).
  `FE.PreviewEditor.refresh()` est rappelé après chaque rendu/redimensionnement.
  Échap ou clic hors bloc désélectionne.
- `main.js` : la mise à l'échelle porte sur `.fiche-pages` (le conteneur de
  toutes les pages). Impression : `break-after: page`, testée par un vrai
  `--print-to-pdf` Chrome (pas seulement la simulation CSS).
- Le panneau gauche est encore complet (réduit à l'étape 2).

### Retour à la ligne et nombre de lignes (2026-09-21, non commité)

- `FE.DottedText.planRows()` découpe le texte en fragments : un fragment doit
  tenir 2× dans la largeur (modèle + ≥1 répétition pointillée), sinon retour
  à la ligne au dernier espace. Un mot seul trop large n'est pas coupé : une
  ligne `model` (modèle seul) puis une ligne `dots` (pointillés seuls).
- Réglage `lineCount` (slider « Nombre de lignes », 1–10, global + par ligne) :
  nombre MINIMUM de lignes par entrée ; complétées par des lignes `dots`
  (fragments repris en boucle). Le retour à la ligne peut dépasser `lineCount`.
- `layoutLine(..., kind)` : `"full"` | `"model"` | `"dots"`.
- Piège : la mesure (`getComputedTextLength`) exige un SVG attaché ET un
  conteneur avec une hauteur (sinon 0) ; ne pas vider le conteneur avant la
  fin des mesures. Elle vaut aussi 0 tant que la police n'est pas chargée
  (rattrapé par `reloadIfFontsPending`).

### Pointillé simple / double (2026-09-21, non commité)

- `dotStyle` (toggle « Pointillés doubles », global + par ligne), défaut
  `"single"`. `"double"` = ancien rendu (contour du glyphe pointillé, donc
  2 traits par jambage). `"single"` = un seul trait pointillé au centre.
- `js/skeleton.js` (`FE.Skeleton.compute`) : mot dessiné sur canvas (12 px/mm),
  aminci par Zhang-Suen, pixels chaînés en polylignes (Douglas-Peucker,
  tol. 0,8 px) → `d` de <path> en mm relatif à (début du mot, base), mis en
  cache par (texte, police, taille, italique) et NON caché tant que la police
  n'est pas chargée. Placé par `translate` dans `makeCenterLine`
  (`dotted-text.js`). Pointillé : dash 0,22×d / gap 0,85×d (réglé au feeling : plus court = trop de points brouillons, plus long = trop de noir), trait 0,3–0,6 mm.
- Le modèle plein reste le vrai texte ; seules les répétitions utilisent le
  squelette.

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
  puis l'arrêter en fin de session. Attention : `pkill -f` lancé dans la
  même commande shell tue le shell (code 144), le lancer seul.
- Test headless Chrome : `google-chrome --headless=new --no-sandbox
  --force-device-scale-factor=2.5 --virtual-time-budget=4000
  --screenshot=out.png http://localhost:8934/index.html`, puis recadrer
  avec PIL. Pour piloter l'UI, servir une copie temporaire de `index.html`
  avec un `<script>` injecté (à supprimer ensuite).
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
- Le modèle (1ère occurrence) est collé à gauche alors que les répétitions
  sont centrées dans leur emplacement : l'écart modèle → 1ère répétition
  est un peu plus large que les autres. Pas signalé comme gênant.
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
