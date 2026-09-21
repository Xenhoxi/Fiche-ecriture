window.FE = window.FE || {};

// Ligne centrale ("squelette") d'un mot, pour le pointillé SIMPLE : tracer le
// contour d'un glyphe donne deux traits (les deux bords de chaque jambage),
// alors qu'on veut un seul trait au milieu de la lettre.
//
// Méthode : le mot est dessiné sur un canvas, aminci à 1 pixel d'épaisseur
// (Zhang-Suen), puis les pixels sont chaînés en polylignes simplifiées. Le
// résultat est en mm, relatif à l'origine (x = début du mot, y = ligne de
// base), et se dessine tel quel en <path> avec un stroke-dasharray.
FE.Skeleton = (function () {
  "use strict";

  function thin(img, w, h) {
    // Zhang-Suen. img : Uint8Array (0/1), bord de 1 px toujours vide.
    var changed = true;
    var toClear = [];
    while (changed) {
      changed = false;
      for (var pass = 0; pass < 2; pass++) {
        toClear.length = 0;
        for (var y = 1; y < h - 1; y++) {
          for (var x = 1; x < w - 1; x++) {
            var i = y * w + x;
            if (!img[i]) continue;
            var p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
            var p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
            var b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (b < 2 || b > 6) continue;
            var a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
                    (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
            if (a !== 1) continue;
            if (pass === 0) {
              if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
            } else {
              if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
            }
            toClear.push(i);
          }
        }
        if (toClear.length) changed = true;
        for (var k = 0; k < toClear.length; k++) img[toClear[k]] = 0;
      }
    }
  }

  var NB = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

  function neighbors(img, w, i) {
    var out = [];
    for (var n = 0; n < 8; n++) {
      var j = i + NB[n][1] * w + NB[n][0];
      if (img[j]) out.push(j);
    }
    return out;
  }

  // Chaîne les pixels du squelette en polylignes [[x,y], ...] (en px).
  function tracePaths(img, w) {
    var visited = new Uint8Array(img.length);
    var paths = [];

    function pt(i) { return [i % w, Math.floor(i / w)]; }

    function walk(start, first) {
      var path = [pt(start), pt(first)];
      var prev = start, cur = first;
      visited[cur] = 1;
      for (;;) {
        if (neighbors(img, w, cur).length > 2) break; // jonction : le tracé s'arrête
        var nbs = neighbors(img, w, cur).filter(function (j) { return j !== prev && !visited[j]; });
        if (nbs.length === 0) break;
        // préfère les voisins orthogonaux (évite de couper les coins)
        nbs.sort(function (a, b) {
          var da = Math.abs(a - cur) === 1 || Math.abs(a - cur) === w ? 0 : 1;
          var db = Math.abs(b - cur) === 1 || Math.abs(b - cur) === w ? 0 : 1;
          return da - db;
        });
        var next = nbs[0];
        path.push(pt(next));
        prev = cur;
        cur = next;
        visited[cur] = 1;
      }
      paths.push(path);
    }

    var i, n, k, nbs;
    // Départs : extrémités puis jonctions.
    for (n = 1; n <= 2; n++) {
      for (i = 0; i < img.length; i++) {
        if (!img[i]) continue;
        var deg = neighbors(img, w, i).length;
        if (n === 1 ? deg !== 1 : deg <= 2) continue;
        nbs = neighbors(img, w, i);
        for (k = 0; k < nbs.length; k++) {
          if (!visited[nbs[k]]) walk(i, nbs[k]);
        }
      }
    }
    // Boucles fermées restantes (ex. « o »).
    for (i = 0; i < img.length; i++) {
      if (img[i] && !visited[i]) {
        nbs = neighbors(img, w, i);
        visited[i] = 1;
        if (nbs.length) {
          walk(i, nbs[0]);
          paths[paths.length - 1].push(pt(i)); // referme
        }
      }
    }
    return paths;
  }

  // Douglas-Peucker.
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    var maxD = 0, idx = 0;
    var a = pts[0], b = pts[pts.length - 1];
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    for (var i = 1; i < pts.length - 1; i++) {
      var d = len === 0
        ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1])
        : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol) return [a, b];
    var l = simplify(pts.slice(0, idx + 1), tol);
    var r = simplify(pts.slice(idx), tol);
    return l.slice(0, -1).concat(r);
  }

  // Le squelette d'un mot est calculé UNE FOIS par (texte, police, italique), à
  // une taille de référence, en unités d'em (1 = la taille de la police) : la
  // ligne centrale d'une lettre a la même forme à toutes les tailles. Changer
  // la taille ne coûte donc qu'une mise à l'échelle (quelques ms) au lieu de
  // redessiner et amincir tout le mot (jusqu'à plusieurs centaines de ms, ce
  // qui rendait le curseur de taille saccadé).
  var REF_EM_PX = 160;
  var shapes = {};      // clé (texte|police|italique) -> polylignes en unités d'em
  var pathCache = {};   // clé + taille -> attribut `d`
  var pathCacheSize = 0;

  function outline(text, family, italic) {
    var key = [text, family, italic].join("|");
    if (shapes[key]) return shapes[key];

    var spec = (italic ? "italic " : "") + REF_EM_PX + "px '" + family + "', cursive";
    // Police pas encore chargée : mesure faussée, on ne met pas en cache (un
    // nouveau rendu suit le chargement de la police).
    var ready = !document.fonts || document.fonts.check(spec);

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    ctx.font = spec;
    var textW = Math.ceil(ctx.measureText(text).width);
    var pad = Math.ceil(REF_EM_PX * 0.6);
    var w = textW + pad * 2;
    var h = Math.ceil(REF_EM_PX * 2.4);
    var baseline = Math.ceil(REF_EM_PX * 1.3);
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.font = spec;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#000";
    ctx.fillText(text, pad, baseline);

    var data = ctx.getImageData(0, 0, w, h).data;
    var img = new Uint8Array(w * h);
    for (var i = 0; i < img.length; i++) img[i] = data[i * 4 + 3] > 127 ? 1 : 0;
    for (var x = 0; x < w; x++) { img[x] = 0; img[(h - 1) * w + x] = 0; }
    for (var y = 0; y < h; y++) { img[y * w] = 0; img[y * w + w - 1] = 0; }

    thin(img, w, h);

    var paths = tracePaths(img, w).map(function (p) {
      return simplify(p, 0.8).map(function (q) {
        return [(q[0] - pad) / REF_EM_PX, (q[1] - baseline) / REF_EM_PX];
      });
    });

    if (ready) shapes[key] = paths;
    return paths;
  }

  // Renvoie l'attribut `d` d'un <path> en mm, origine = (début du mot, ligne
  // de base). `fontSizeMm` est la taille de l'em (celle du font-size SVG).
  function compute(text, family, fontSizeMm, italic) {
    var paths = outline(text, family, italic);
    var key = [text, family, italic, fontSizeMm].join("|");
    if (pathCache[key] !== undefined) return pathCache[key];

    var d = paths.map(function (p) {
      return p.map(function (q, n) {
        return (n === 0 ? "M" : "L") +
          (q[0] * fontSizeMm).toFixed(2) + " " + (q[1] * fontSizeMm).toFixed(2);
      }).join(" ");
    }).join(" ");

    if (shapes[[text, family, italic].join("|")]) {
      if (pathCacheSize > 400) { pathCache = {}; pathCacheSize = 0; }
      pathCache[key] = d;
      pathCacheSize++;
    }
    return d;
  }

  return { compute: compute };
})();
