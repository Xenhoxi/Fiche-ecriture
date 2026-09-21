# Suivi de projet — Fiche-Écriture

> Fichier de reprise de session. À lire en premier avant toute nouvelle modification.
> Dernière mise à jour : 2026-09-21 (fin de session).

## État du dépôt — À LIRE EN PREMIER

- **`main`** (= `origin/main`, GitHub Pages : https://xenhoxi.github.io/fiche-ecriture/) :
  contient MAINTENANT la refonte « édition directe sur l'aperçu » (fusion
  `0274553` de `edition-sur-apercu`, faite sur demande explicite de l'utilisateur
  le 2026-09-21 pour pouvoir la tester en ligne), en plus du retour à la ligne, du
  « Nombre de lignes », du pointillé simple/double et des polices Marelle.
- **`edition-sur-apercu`** : conservée (poussée sur `origin`), non supprimée ;
  identique à `main` au moment de la fusion. Les nouveautés se font désormais sur
  une nouvelle branche ou sur `main` selon ce que demande l'utilisateur.
- Ce qui a été fusionné : pages multiples, édition sur place (texte, titre,
  consigne), barre flottante de réglages, glisser-déposer, ajout/duplication/
  suppression au survol, annuler/rétablir + brouillon automatique, bouton
  « + Ajouter une ligne » sous la dernière ligne, outils persistants +
  désélection hors feuille, curseur de taille fluide (détails plus bas).
- **À faire : essai réel par l'utilisateur sur le site en ligne** (souris,
  clavier, impression réelle) — tout a été vérifié seulement en headless.
  Pour revenir en arrière si besoin : `git revert -m 1 0274553` (ou repartir de
  `a533e25`, l'ancienne `main`). Pages met 1–2 min à se mettre à jour après un
  push ; `localStorage` est propre à chaque adresse (les fiches enregistrées sur
  `localhost` ou `file://` n'apparaissent pas sur le site en ligne).

## Quoi

Site 100% statique (HTML/CSS/JS vanilla, aucun build, aucun framework) dans
`/home/barbatruc/Desktop/Fiche-Ecriture`, pour créer et imprimer des fiches
d'écriture pour élèves de primaire (réglure façon Seyès, mots à copier avec
répétitions en pointillé à repasser). Sauvegarde locale (localStorage),
export PDF via impression navigateur. Fonctionne hors-ligne (polices
embarquées en `.woff2`).

Dépôt git (branche `main`) + GitHub Pages : https://github.com/Xenhoxi/fiche-ecriture → https://xenhoxi.github.io/fiche-ecriture/ (branche `main`, déploiement à chaque push sur `main`). Deux images de référence fournies
par l'utilisateur restent à la racine (`Exemple ligne.jpeg`,
`fiche actuelle.jpeg`) — pures références visuelles, pas utilisées par le
code, à garder sauf demande contraire.

## Architecture des fichiers

```
index.html              squelette : sidebar réduite + zone d'aperçu (pages) + #selection-layer
css/base.css             design system (couleurs, boutons, sliders, toggle)
css/editor.css           sidebar, édition sur l'aperçu (barre flottante, outils/menu de bloc, champ de saisie, trait d'insertion)
css/print.css            @media print
css/sheet.css            page imprimable (.fiche-page), conteneur de ligne (.ligne-ecriture)
js/model.js               FE.Model — modèle de données, defaults, validation/migration
js/fonts-catalog.js        FE.Fonts — catalogue polices (Caveat, Patrick Hand, Dancing Script)
js/storage.js               FE.Storage — CRUD localStorage des fiches
js/history.js                   FE.History — annuler/rétablir + brouillon auto
js/skeleton.js                 FE.Skeleton — ligne centrale des lettres (pointillé simple)
js/preview-editor.js            FE.PreviewEditor — édition directe sur l'aperçu (sélection, saisie sur place, barre flottante, outils, menu, glisser-déposer)
js/dotted-text.js            FE.DottedText — génère le SVG de chaque ligne (mots + repères de réglure)
js/render.js                  FE.Render — construit le DOM de la fiche, calcule les métriques de ligne
js/ui-controls.js              FE.UI — sidebar réduite (réglages globaux, fiches sauvegardées, impression, annuler/rétablir), générateur de champs de réglages
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
chacune. **Étapes 1 à 4 faites** (blocs, pages
multiples, sélection ; édition sur place, barre flottante, panneau gauche
réduit ; glisser-déposer, ajout/suppression ; annuler/rétablir + brouillon
auto), plus les retouches listées dans « État du dépôt ». **Fusionné dans
`main` le 2026-09-21** (reste : essai réel par l'utilisateur).

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
- **Étape 2** : panneau gauche réduit (réglages globaux, fiches sauvegardées,
  impression) ; nom/consigne/lignes s'éditent sur l'aperçu.
  - Second clic (ou Entrée) sur un bloc sélectionné → `div contenteditable`
    superposé au mot modèle (texte brut). Entrée valide, Échap annule, changer
    de bloc / cliquer ailleurs enregistre. Titre et consigne : clic direct ;
    lien « + Consigne » (écran seulement) quand elle est vide ; consigne
    multiligne : Entrée valide, Maj+Entrée = retour à la ligne. TOUT l'ancien texte du bloc (modèle +
    répétitions, `text` et `path` SVG, tous les fragments/rangées) est masqué
    pendant la saisie (`.is-editing`) ; le champ est semi-transparent (réglure
    visible).
    Titre et consigne (`kind !== "line"`) : saisie **en direct** — chaque frappe
    met `sheet.name` / `sheet.consigne` à jour et redessine la page via le 5e
    argument de `PreviewEditor.init` (`onLiveRender`, SANS pas d'annulation ni
    brouillon) ; le champ a `height:auto` + `min-height` (grandit avec le
    contenu) et épouse le padding box du texte (mêmes retours à la ligne) ;
    l'ancien texte de la page est masqué (`.is-editing` sur `.fiche-name-heading`
    / `.fiche-consigne`, ré-appliqué à chaque rendu par `markEditingTarget`).
    `addingConsigne` reste vrai pendant toute la saisie (la zone ne disparaît pas
    si on efface tout). Échap restaure la valeur d'origine (`editing.original`) ;
    un seul pas d'annulation à la validation.
  - **Ne pas utiliser `<input>`/`<textarea>`** : Chrome rogne leur texte à la
    zone de contenu (jambages coupés). La ligne de base du champ est calée par
    `canvasMetrics()` + `line-height` (demi-interligne) dans `editorGeometry()`.
  - Barre flottante (`.floating-bar`, sous le bloc) : réutilise
    `FE.UI.buildSettingsFields` (`data-setting` sur chaque champ) ; un « • »
    marque les réglages propres au bloc ; ↑ ↓ ✕ (déplacement/suppression, à
    remplacer par le glisser-déposer à l'étape 3). Elle n'est PAS reconstruite
    à chaque rendu (un curseur tenu serait détruit) : `syncBar()` la
    resynchronise après un changement de réglages globaux ; elle ne bouge pas
    tant qu'un curseur est tenu (`barPointerDown`).
  - « + Ajouter une ligne » (`#btn-add-line`, dans `#selection-layer`) est posé par
    `positionAddRow()` juste SOUS LE DERNIER BLOC, sur la page où il se trouve, à la
    largeur du contenu (pas sous toute la pile de pages) ; sous l'invite si la fiche
    est vide. Recalé à chaque `refresh()`.
  - Piège : le keydown Entrée d'un champ doit `stopPropagation()`, sinon le
    gestionnaire global (Entrée = éditer le bloc sélectionné) le rouvre.
  - Sélection sur `mousedown` (avant le blur du champ en cours), démarrage de
    l'édition sur `click` si le bloc était déjà sélectionné au `mousedown`.
  - `renderSheet(sheet, previewEl, opts)` : `opts.forceConsigne` (via
    `FE.PreviewEditor.renderOptions()`).
- **Étape 3** (tout dans `preview-editor.js`, styles en fin de `css/editor.css`) :
  - `.block-tools` (à gauche du bloc, `toolsId()` = bloc survolé, sinon ligne
    SÉLECTIONNÉE : ils restent tant qu'une ligne est sélectionnée). Un clic hors
    de la feuille (fond gris, panneau de gauche ; pas les pages, barre, outils,
    menu, champ de saisie, bouton d'ajout) désélectionne : cadre, barre et outils
    disparaissent (`onDocumentMouseDown`). Contenu (grille 2×2) : « + » (insère dessous) et
    poignée ⠿, puis en dessous dupliquer (icône SVG) et ✕ rouge (supprimer) ; ces
    boutons agissent sur `toolsId()` (survolé sinon sélectionné). Poignée : glisser = déplacer (pointer events, capture sur la
    poignée) ; simple clic (< 4 px) = `.block-menu` (insérer au-dessus /
    dessous, dupliquer, supprimer). Clavier : Suppr supprime le bloc
    sélectionné, Alt+↑/↓ le déplace, Échap annule un glissement / ferme le menu.
  - Glissement : `dropTarget(y, id)` (liste SANS le bloc déplacé, coupe au
    milieu de l'empreinte verticale de chaque ligne, blocs coupés entre deux
    pages inclus) → trait `.drop-indicator` ; la cible est recalculée à chaque
    mouvement ET au relâchement (la boucle `requestAnimationFrame` ne sert
    qu'au défilement automatique près des bords). Piège : `endDrag` remet
    `drag = null` avant de recalculer → passer l'id en paramètre.
  - La barre de réglages est masquée (`setBarObscured`) pendant un glissement
    et tant que le menu est ouvert. Les ↑ ↓ ✕ de la barre ont été retirés.
  - Blocs vides : invite « Écrivez un mot… » (`.fiche-bloc-placeholder`,
    `no-print`, hors flux).
  - Test headless : requêter le DOM au moment de l'action (un rendu après
    chargement des polices remplace tout, les références sont périmées).

- **Étape 4** :
  - `FE.History` (`js/history.js`, sans DOM) : pile d'instantanés JSON (max 100).
    `commit(key)` : même `key` dans les 1,2 s = fusion en une entrée (curseur
    tiré = 1 pas ; clés `g:<réglage>` global, `l:<idLigne>:<réglage>` par
    bloc) ; sans clé = 1 entrée. Un commit identique à l'état courant est
    ignoré ; un nouveau commit efface le « rétablir ».
  - Points d'appel : callback `onChange(key)` de `FE.PreviewEditor` (défini
    dans `main.js` : rendu + `History.commit(key)`) et réglages globaux dans
    `ui-controls.js`. `History.reset()` après ouverture / fiche chargée /
    nouvelle fiche (pile vidée).
  - Ctrl+Z, Ctrl+Y, Ctrl+Maj+Z (`ui-controls.js` `bindHistory`) sauf dans un
    champ de texte / le champ de saisie sur place (annulation native du
    navigateur) ; boutons Annuler/Rétablir en haut du panneau.
  - Brouillon : `FE.Storage.saveDraft/loadDraft` (clé
    `ficheEcriture:v1:draft`), écrit 500 ms après chaque commit et à chaque
    `reset()`, restauré au démarrage (`main.js`, via `validateSheet`). Distinct
    des fiches nommées (`Enregistrer`). L'annulation ne survit pas au
    rechargement (seule la fiche est restaurée).
  - Test headless avec persistance : deux lancements Chrome avec le même
    `--user-data-dir` (localStorage partagé), le 2e avec `#reload`.

### Retour à la ligne et nombre de lignes (2026-09-21)

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

### Pointillé simple / double (2026-09-21)

- `dotStyle` (toggle « Pointillés doubles », global + par ligne), défaut
  `"single"`. `"double"` = ancien rendu (contour du glyphe pointillé, donc
  2 traits par jambage). `"single"` = un seul trait pointillé au centre.
- `js/skeleton.js` (`FE.Skeleton.compute`) : mot dessiné sur canvas à une taille
  de RÉFÉRENCE fixe (em = 160 px), aminci par Zhang-Suen, pixels chaînés en
  polylignes (Douglas-Peucker, tol. 0,8 px) exprimées en unités d'em. Ce calcul
  lourd est fait UNE FOIS par (texte, police, italique) (`shapes`, NON mis en
  cache tant que la police n'est pas chargée) ; `compute` ne fait ensuite
  qu'une mise à l'échelle par la taille (`pathCache`). **Ne pas remettre la
  taille dans la clé du calcul lourd** : il coûtait 165–750 ms par cran de
  taille de police et rendait le curseur saccadé (maintenant ~13 ms/cran).
  Placé par `translate` dans `makeCenterLine`
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

### UI (`ui-controls.js` + `preview-editor.js`)

- Le panneau de gauche est **réduit** : annuler/rétablir + état du brouillon,
  réglages globaux, fiches sauvegardées (Nouvelle / Enregistrer / Charger /
  Dupliquer / Suppr.), impression. Plus de liste de lignes, plus d'accordéon ni de
  ⚙ : tout s'édite sur l'aperçu (détails dans la section « Refonte » ci-dessus).
- Réglages globaux et barre flottante d'un bloc partagent le même générateur de
  champs `FE.UI.buildSettingsFields()` (Police, Taille, Répétitions, Nombre de
  lignes, Taille des pointillés, Pointillés doubles, Italique ; chaque champ porte
  `data-setting`). Lien « ↺ Revenir aux réglages globaux » visible seulement si le
  bloc a des overrides ; « • » marque les réglages propres au bloc.
- Responsive : `.fiche-pages` mis à l'échelle via `transform: scale()` en JS
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
- Impression réelle : `google-chrome --headless=new --no-sandbox
  --no-pdf-header-footer --print-to-pdf=out.pdf URL` applique vraiment
  `@media print` (plus fiable que la simulation CSS) ; compter les pages du PDF,
  `pdftoppm -r 60 -png` pour les regarder. Attention : un élément de test
  (`<pre>` de journal) ajouté à la page s'imprime aussi.
- **Mesures de performance** : avec `--virtual-time-budget`, `performance.now()`
  est virtuel (tout à 0 ms). Pour chronométrer, lancer SANS budget virtuel :
  `timeout 40 google-chrome --headless=new --no-sandbox --enable-logging=stderr
  --v=0 URL 2>&1 | grep CONSOLE` et `console.log` les résultats.
- Piloter l'UI par script injecté : `dispatchEvent` de `mousedown`/`mouseup`/`click`
  (clic), `PointerEvent` (glisser ; `setPointerCapture` échoue sur un pointeur
  synthétique → déjà entouré d'un try/catch), `KeyboardEvent` (le `default` d'une
  frappe synthétique n'insère PAS de texte : écrire `textContent` puis
  `dispatchEvent(new Event("input"))`). **Requêter le DOM au moment de l'action** :
  un rendu déclenché par `document.fonts.ready` remplace tout le DOM et périme les
  références. Attendre `document.fonts.load("10px Marelle")` avant toute mesure de
  texte (sinon largeur 0).
- localStorage persistant entre deux lancements headless : même
  `--user-data-dir=/tmp/xxx` (le supprimer ensuite).
- **Piège rencontré plusieurs fois** : l'outil de capture d'écran/zoom du
  navigateur est parfois flaky (timeout puis résultat blanc/périmé au retry
  immédiat suivant). Ne pas conclure à un bug de rendu sur une seule capture
  suspecte. Méthode fiable de vérification au pixel près : sérialiser le
  `<svg>` de la ligne, le dessiner dans un `<canvas>` offscreen à une échelle
  mm→px connue, et lire `getImageData()` aux coordonnées mm exactes. Cette
  méthode a confirmé à plusieurs reprises que le code était correct alors
  qu'une capture d'écran suggérait le contraire.

## Points ouverts pour la prochaine session

- Décision prise : la branche a été fusionnée dans `main` pour être testée en ligne
  (la question « tester sans merge » est donc caduque).
- **Rien n'a été essayé avec une vraie souris / un vrai clavier** : glisser-déposer,
  saisie sur place (Maj+Entrée), curseurs, menu — tout a été vérifié par événements
  synthétiques en headless. Un essai réel par l'utilisateur est le prochain test utile.
- Jamais testé un vrai `window.print()` (dialogue natif) — seulement `--print-to-pdf`.
- « Nouvelle fiche » / « Charger » non testés de bout en bout (boîte `confirm`
  native impossible à piloter en headless) ; le reste de l'historique l'est.
- Pointillé simple vérifié visuellement seulement avec Marelle (Caveat, Patrick
  Hand, Dancing Script non regardés). Sur Caveat, le contour double peut sembler
  « dédoublé » pour de petits `dashSizeMm`.
- Questions posées à l'utilisateur, sans réponse : un clic dans le panneau de
  gauche désélectionne le bloc (voulu ?) ; la barre de réglages recouvre le bouton
  « + Ajouter une ligne » quand la dernière ligne est sélectionnée.
- Curseur de taille : ~13 ms/cran depuis que le squelette est mis à l'échelle, avec
  quelques pics à 47–85 ms non élucidés ; la 1re apparition d'un mot coûte encore
  un calcul de squelette (~100+ ms).
- L'annulation (historique) ne survit pas au rechargement (seul le brouillon de la
  fiche est restauré).
- Le modèle (1ère occurrence) est collé à gauche alors que les répétitions sont
  centrées dans leur emplacement : écart modèle → 1ère répétition un peu plus large.
  Pas signalé comme gênant.
- Pas de suite de tests automatisés, tout est vérifié manuellement à chaque session.

## Pour reprendre

1. Lire ce fichier (surtout « État du dépôt »). Vérifier `git branch --show-current`
   et `git status` (la refonte est dans `main`).
2. Relire, selon le sujet : `js/preview-editor.js` (édition sur l'aperçu),
   `js/render.js` (pagination), `js/history.js`, `js/dotted-text.js`,
   `js/skeleton.js`, `js/ui-controls.js`, `css/sheet.css`, `css/editor.css`.
3. Ne pas publier (push sur `main`) sans demande explicite : chaque push sur `main`
   met à jour le site en ligne.
4. Relancer le serveur local et tester dans le navigateur avant toute nouvelle
   modification (méthode ci-dessus), l'arrêter en fin de session.
