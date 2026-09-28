/**
 * A drawn landscape for a place that has no photograph yet.
 *
 * The catalogue starts without images, and a flat colour block in a
 * full-screen, photograph-led app reads as broken. This paints a quiet scene
 * from the place's own tags — fjord blues for cold and high, amber dunes for
 * desert, a dusk skyline for cities — seeded by the experience id, so a place
 * looks the same every time it appears and different from its neighbours.
 *
 * It is plainly an illustration, not a pretend photograph: soft gradients and
 * layered ridges, no detail. The moment a real image is uploaded in the
 * console, the photograph replaces it.
 */
(function () {
  'use strict';

  const W = 400;
  const H = 600;

  /** Small, fast, deterministic PRNG (mulberry32), seeded from a string hash. */
  function seeded(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Palettes by mood, chosen by the first matching group in this order: a
   * desert is a desert even when cold, and a black-sand beach in Iceland is
   * cold before it is a beach.
   */
  const MOODS = [
    {
      when: ['desert'],
      kind: 'dunes',
      sky: ['#2b1b2e', '#b4552f', '#f2a45b', '#f6d29c'],
      far: ['#c67a3a', '#7a3d1c'],
      near: ['#e0994f', '#8f4a22'],
      sun: 'rgba(255,220,160,.55)',
    },
    {
      when: ['city', 'nightlife'],
      kind: 'skyline',
      sky: ['#14101c', '#2e2340', '#6a4a5e', '#c08a5a'],
      far: ['#2a2030', '#1a1420'],
      near: ['#120e16', '#0b080e'],
      sun: 'rgba(255,190,120,.35)',
    },
    {
      when: ['cold', 'mountains'],
      kind: 'peaks',
      sky: ['#1a2a44', '#3a5a86', '#b48a80', '#d5a58c'],
      far: ['#2a3444', '#141b25'],
      near: ['#1a212c', '#0a0d12'],
      sun: 'rgba(255,225,205,.35)',
    },
    {
      when: ['beach', 'island', 'warm'],
      kind: 'coast',
      sky: ['#5f93c4', '#9cc3e0', '#e9dcc8', '#f3e6d0'],
      far: ['#2f6f8f', '#1a4b66'],
      near: ['#e9dcc3', '#c9b593'],
      sun: 'rgba(255,245,220,.6)',
    },
    {
      when: ['nature', 'wildlife', 'culture', 'history'],
      kind: 'hills',
      sky: ['#1d2b1f', '#3f6b47', '#89ad7a', '#cfdcae'],
      far: ['#2e4a34', '#1a2c1e'],
      near: ['#1a2a1e', '#0d1510'],
      sun: 'rgba(235,245,210,.45)',
    },
    {
      when: ['water', 'solitude'],
      kind: 'peaks',
      sky: ['#1a2a44', '#3a5a86', '#b48a80', '#d5a58c'],
      far: ['#2a3444', '#141b25'],
      near: ['#1a212c', '#0a0d12'],
      sun: 'rgba(255,225,205,.35)',
    },
  ];

  const DEFAULT_MOOD = {
    kind: 'peaks',
    sky: ['#221d2b', '#4a3f5a', '#9c8290', '#cbb2a8'],
    far: ['#2c2635', '#1a1620'],
    near: ['#16121b', '#0c0a0f'],
    sun: 'rgba(255,230,215,.3)',
  };

  function moodFor(tags) {
    const set = new Set(tags || []);
    for (const mood of MOODS) {
      if (mood.when.some((tag) => set.has(tag))) {
        return mood;
      }
    }
    return DEFAULT_MOOD;
  }

  /** A ridgeline across the width: a gentle random walk, closed to the bottom. */
  function ridge(random, baseY, amplitude, roughness) {
    const points = [];
    let y = baseY + (random() - 0.5) * amplitude;
    const step = W / 10;
    for (let x = -step; x <= W + step; x += step) {
      y += (random() - 0.5) * amplitude * roughness;
      y = Math.max(baseY - amplitude, Math.min(baseY + amplitude, y));
      points.push([x, y]);
    }
    let d = 'M' + points[0][0] + ' ' + H + ' L' + points[0][0] + ' ' + points[0][1].toFixed(1);
    for (let i = 1; i < points.length; i++) {
      // Quadratic smoothing through midpoints keeps the line soft, not jagged.
      const [px, py] = points[i - 1];
      const [cx, cy] = points[i];
      d += ' Q' + px + ' ' + py.toFixed(1) + ' ' + ((px + cx) / 2).toFixed(1) + ' ' + ((py + cy) / 2).toFixed(1);
    }
    const last = points[points.length - 1];
    return d + ' L' + last[0] + ' ' + H + ' Z';
  }

  /** Sharper peaks for mountains: fewer points, taller swings. */
  function peaks(random, baseY, amplitude) {
    let d = 'M-20 ' + H + ' L-20 ' + baseY;
    let x = -20;
    while (x < W + 20) {
      const width = 50 + random() * 70;
      const top = baseY - amplitude * (0.35 + random() * 0.65);
      d += ' L' + (x + width / 2).toFixed(1) + ' ' + top.toFixed(1);
      d += ' L' + (x + width).toFixed(1) + ' ' + (baseY - random() * amplitude * 0.2).toFixed(1);
      x += width;
    }
    return d + ' L' + (W + 20) + ' ' + H + ' Z';
  }

  function skyline(random, baseY) {
    let d = 'M0 ' + H + ' L0 ' + baseY;
    let x = 0;
    while (x < W) {
      const width = 18 + random() * 34;
      const top = baseY - 30 - random() * 150;
      d += ' L' + x.toFixed(1) + ' ' + top.toFixed(1) + ' L' + (x + width).toFixed(1) + ' ' + top.toFixed(1);
      x += width + random() * 4;
    }
    return d + ' L' + W + ' ' + baseY + ' L' + W + ' ' + H + ' Z';
  }

  function gradient(id, stops, vertical) {
    const attrs = vertical === false ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
    return (
      '<linearGradient id="' + id + '" ' + attrs + '>' +
      stops
        .map(function (color, i) {
          return '<stop offset="' + (i / (stops.length - 1)).toFixed(2) + '" stop-color="' + color + '"/>';
        })
        .join('') +
      '</linearGradient>'
    );
  }

  /**
   * Returns an SVG string. `key` seeds the shapes (use the experience id);
   * `tags` choose the mood.
   */
  function landscape(key, tags) {
    const random = seeded(String(key || 'firo'));
    const mood = moodFor(tags);
    const uid = 'l' + Math.floor(random() * 1e9).toString(36);

    const sunX = 60 + random() * 280;
    const sunY = 170 + random() * 110;

    let far;
    let near;
    if (mood.kind === 'peaks') {
      far = peaks(random, 390, 170);
      near = ridge(random, 470, 40, 0.8);
    } else if (mood.kind === 'dunes') {
      far = ridge(random, 400, 60, 0.6);
      near = ridge(random, 470, 50, 0.7);
    } else if (mood.kind === 'skyline') {
      far = skyline(random, 470);
      near = ridge(random, 520, 14, 0.5);
    } else if (mood.kind === 'coast') {
      // Sea as a flat band, then a curving shore in front.
      far = 'M0 ' + H + ' L0 380 L' + W + ' 380 L' + W + ' ' + H + ' Z';
      near = ridge(random, 500, 50, 0.5);
    } else {
      far = ridge(random, 380, 70, 0.9);
      near = ridge(random, 460, 55, 0.8);
    }

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs>' +
      gradient(uid + 's', mood.sky) +
      gradient(uid + 'f', mood.far) +
      gradient(uid + 'n', mood.near) +
      '<radialGradient id="' + uid + 'g"><stop offset="0" stop-color="' + mood.sun + '"/>' +
      '<stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>' +
      gradient(uid + 'h', ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(8,8,10,.55)']) +
      '</defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#' + uid + 's)"/>' +
      // Each layer is named so the stylesheet can let the scene breathe: the
      // sun swells slowly, the ridges drift against each other, the haze moves.
      '<circle class="sun" cx="' + sunX.toFixed(1) + '" cy="' + sunY.toFixed(1) + '" r="170" fill="url(#' + uid + 'g)"/>' +
      '<path class="far" d="' + far + '" fill="url(#' + uid + 'f)"/>' +
      '<path class="near" d="' + near + '" fill="url(#' + uid + 'n)"/>' +
      '<rect class="haze" width="' + W + '" height="' + H + '" fill="url(#' + uid + 'h)"/>' +
      '</svg>'
    );
  }

  window.firoLandscape = landscape;
})();
