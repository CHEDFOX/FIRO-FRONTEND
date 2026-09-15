/**
 * Rendering helpers for the console: DOM building, formatting, and the two
 * visualisations (trend bars and the world map).
 *
 * No framework and no chart library. The console is a handful of tables and
 * two drawings; a dependency tree would cost more than it saves, and every
 * value on screen can be traced to the line that produced it.
 */
(function () {
  'use strict';

  /** Builds an element. Text children are escaped by construction. */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) {
        return;
      }
      if (key === 'class') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key === 'html') {
        node.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'dataset') {
        Object.assign(node.dataset, value);
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    });
    // Flattened: a caller that maps over a list produces a nested array, and
    // appendChild(array) throws — which showed up as a blank view, not an error
    // anywhere near the mistake.
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) {
      return;
    }
    if (Array.isArray(children)) {
      children.forEach(function (child) {
        append(node, child);
      });
      return;
    }
    node.appendChild(typeof children === 'string' ? document.createTextNode(children) : children);
  }

  function svg(tag, attrs, children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, String(attrs[key]));
    });
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function number(value) {
    return typeof value === 'number' ? value.toLocaleString() : '—';
  }

  function percent(value) {
    return typeof value === 'number' ? Math.round(value * 100) + '%' : '—';
  }

  /** Short relative time: the console is read at a glance. */
  function ago(iso) {
    if (!iso) {
      return 'never';
    }
    const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (seconds < 60) {
      return Math.floor(seconds) + 's ago';
    }
    if (seconds < 3600) {
      return Math.floor(seconds / 60) + 'm ago';
    }
    if (seconds < 86400) {
      return Math.floor(seconds / 3600) + 'h ago';
    }
    return Math.floor(seconds / 86400) + 'd ago';
  }

  function date(iso) {
    return iso ? new Date(iso).toISOString().slice(0, 10) : '—';
  }

  function stat(label, value, hint) {
    return el('div', { class: 'stat' }, [
      el('span', { class: 'stat-value', text: value }),
      el('span', { class: 'stat-label', text: label }),
      hint ? el('span', { class: 'stat-hint', text: hint }) : null,
    ]);
  }

  function tag(text, kind) {
    return el('span', { class: 'chip' + (kind ? ' chip-' + kind : ''), text: text });
  }

  function table(headers, rows) {
    return el('div', { class: 'table-wrap' }, [
      el('table', {}, [
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            headers.map(function (header) {
              return el('th', { text: header });
            }),
          ),
        ),
        el('tbody', {}, rows),
      ]),
    ]);
  }

  function empty(message) {
    return el('p', { class: 'muted empty', text: message });
  }

  /**
   * A 30-day bar chart.
   *
   * Bars, not a line: these are counts per day, and a line between two days
   * implies values in between that do not exist.
   */
  function trendChart(series, label) {
    const width = 100;
    const height = 28;
    const max = Math.max(1, ...series.map((point) => point.count));
    const barWidth = width / series.length;

    const bars = series.map(function (point, index) {
      const barHeight = (point.count / max) * height;
      return svg('rect', {
        x: (index * barWidth).toFixed(2),
        y: (height - barHeight).toFixed(2),
        width: Math.max(0.6, barWidth - 0.35).toFixed(2),
        height: Math.max(point.count > 0 ? 0.6 : 0, barHeight).toFixed(2),
        class: point.count > 0 ? 'bar' : 'bar bar-zero',
      });
    });

    const total = series.reduce(function (sum, point) {
      return sum + point.count;
    }, 0);

    return el('div', { class: 'chart' }, [
      el('div', { class: 'chart-head' }, [
        el('span', { text: label }),
        el('span', { class: 'muted', text: number(total) + ' in 30 days' }),
      ]),
      svg(
        'svg',
        { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none', class: 'chart-svg' },
        bars,
      ),
      el('div', { class: 'chart-axis' }, [
        el('span', { text: series[0] ? series[0].day : '' }),
        el('span', { text: series.length ? series[series.length - 1].day : '' }),
      ]),
    ]);
  }

  /**
   * The world map.
   *
   * Equirectangular, drawn in SVG over embedded coastlines — no tiles and no
   * map library, so it renders identically offline, on a laptop behind a
   * corporate proxy, and in a screenshot. It answers the question the console
   * actually asks ("where is the catalogue, and where are people saving?"),
   * which needs continents and relative position, not streets.
   */
  function worldMap(points, options) {
    const opts = options || {};
    const width = 720;
    const height = 360; // 2:1, the equirectangular aspect
    const maxSaves = Math.max(1, ...points.map((point) => point.saves || 0));

    const project = function (lat, lng) {
      return { x: ((lng + 180) / 360) * width, y: ((90 - lat) / 180) * height };
    };

    const graticule = [];
    for (let lng = -180; lng <= 180; lng += 30) {
      const x = ((lng + 180) / 360) * width;
      graticule.push(
        svg('line', { x1: x, y1: 0, x2: x, y2: height, class: lng === 0 ? 'grid-major' : 'grid' }),
      );
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * height;
      graticule.push(
        svg('line', { x1: 0, y1: y, x2: width, y2: y, class: lat === 0 ? 'grid-major' : 'grid' }),
      );
    }

    const dots = points.map(function (point) {
      const at = project(point.lat, point.lng);
      // Area, not radius, scales with saves — a radius-scaled dot exaggerates
      // a popular place by its square.
      const radius = 3 + Math.sqrt((point.saves || 0) / maxSaves) * 9;
      const circle = svg('circle', {
        cx: at.x.toFixed(1),
        cy: at.y.toFixed(1),
        r: radius.toFixed(1),
        class: 'pin pin-' + (point.status || 'published') + (point.saves ? ' pin-saved' : ''),
      });
      circle.appendChild(
        svg('title', {}, [
          document.createTextNode(
            point.title + ' — ' + (point.saves || 0) + ' save' + (point.saves === 1 ? '' : 's'),
          ),
        ]),
      );
      if (opts.onSelect) {
        circle.addEventListener('click', function () {
          opts.onSelect(point);
        });
        circle.classList.add('clickable');
      }
      return circle;
    });

    return el('div', { class: 'map' }, [
      svg('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'map-svg' }, [
        svg('rect', { x: 0, y: 0, width: width, height: height, class: 'map-bg' }),
        // Land first, graticule over it, pins on top — so a pin is never lost
        // behind a coastline.
        window.WORLD_LAND_PATH
          ? svg('path', { d: window.WORLD_LAND_PATH, class: 'map-land' })
          : svg('g', {}),
        ...graticule,
        ...dots,
      ]),
      el('div', { class: 'map-legend' }, [
        el('span', {}, [tag('published'), ' in the catalogue']),
        el('span', {}, [tag('draft', 'draft'), ' not yet live']),
        el('span', { class: 'muted', text: 'dot size = saves' }),
      ]),
    ]);
  }

  function toast(message, kind) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.className = 'toast' + (kind ? ' toast-' + kind : '');
    node.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      node.hidden = true;
    }, 4000);
  }

  window.ui = {
    el: el,
    svg: svg,
    number: number,
    percent: percent,
    ago: ago,
    date: date,
    stat: stat,
    tag: tag,
    table: table,
    empty: empty,
    trendChart: trendChart,
    worldMap: worldMap,
    toast: toast,
  };
})();
