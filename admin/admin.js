/**
 * The Firo operator console.
 *
 * A hash router over six views. State is deliberately shallow — each view
 * fetches what it needs and renders from the response, so nothing on screen can
 * drift out of step with the server. (The product client caches more; a console
 * showing a stale number is worse than one that takes an extra 80ms.)
 */
(function () {
  'use strict';

  const api = window.firoAdminApi;
  const ui = window.ui;
  const el = ui.el;

  const ALL_TAGS = [
    'adventure', 'luxury', 'culture', 'nature', 'photography', 'food', 'hiking',
    'road_trip', 'nightlife', 'wildlife', 'architecture', 'history', 'camping',
    'minimalism', 'cold', 'warm', 'water', 'mountains', 'desert', 'solitude',
    'social', 'beach', 'island', 'city',
  ];
  const BUDGET_BANDS = ['budget', 'moderate', 'premium', 'luxury'];
  const STATUSES = ['draft', 'published', 'archived'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const loginSection = document.getElementById('login');
  const consoleSection = document.getElementById('console');
  const viewNode = document.getElementById('view');

  /** Cleanup for whatever the current view started (streams, timers). */
  let teardown = null;

  // --- session -------------------------------------------------------------

  async function boot() {
    document.getElementById('login-base').value = api.baseUrl;
    document.getElementById('login-form').addEventListener('submit', onLogin);
    document.getElementById('sign-out').addEventListener('click', signOut);
    window.addEventListener('hashchange', route);

    if (!api.accessToken) {
      return showLogin();
    }
    try {
      const me = await api.me();
      if (!me.roles.includes('admin')) {
        // A valid token for a non-admin is not an error to retry — it is the
        // wrong account. Say so rather than looping on 403s.
        return showLogin('That account does not have the admin role.');
      }
      showConsole(me);
    } catch (error) {
      showLogin(error.status === 401 ? null : error.message);
    }
  }

  function showLogin(message) {
    consoleSection.hidden = true;
    loginSection.hidden = false;
    const errorNode = document.getElementById('login-error');
    errorNode.textContent = message || '';
    errorNode.hidden = !message;
  }

  function showConsole(me) {
    loginSection.hidden = true;
    consoleSection.hidden = false;
    document.getElementById('whoami').textContent = '@' + me.handle;
    if (!location.hash) {
      location.hash = '#/overview';
    }
    route();
  }

  async function onLogin(event) {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      api.baseUrl = document.getElementById('login-base').value.trim();
      const result = await api.login(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value,
      );
      if (!result.user.roles.includes('admin')) {
        api.setTokens(null);
        return showLogin('That account does not have the admin role.');
      }
      api.setTokens(result.tokens);
      showConsole(result.user);
    } catch (error) {
      showLogin(error.message);
    } finally {
      button.disabled = false;
    }
  }

  function signOut() {
    api.setTokens(null);
    location.hash = '';
    showLogin();
  }

  // --- router --------------------------------------------------------------

  const ROUTES = [
    [/^#\/overview$/, viewOverview],
    [/^#\/users$/, viewUsers],
    [/^#\/users\/(.+)$/, viewUserDetail],
    [/^#\/content$/, viewContent],
    [/^#\/content\/new$/, function () { return viewEditor(null); }],
    [/^#\/content\/(.+)$/, viewEditor],
    [/^#\/map$/, viewMap],
    [/^#\/live$/, viewLive],
    [/^#\/audit$/, viewAudit],
  ];

  async function route() {
    if (consoleSection.hidden) {
      return;
    }
    if (teardown) {
      teardown();
      teardown = null;
    }

    const hash = location.hash || '#/overview';
    document.querySelectorAll('.tabs a').forEach(function (link) {
      link.classList.toggle('active', hash.startsWith(link.getAttribute('href')));
    });

    for (const [pattern, handler] of ROUTES) {
      const match = hash.match(pattern);
      if (match) {
        viewNode.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
        try {
          const content = await handler(match[1]);
          viewNode.replaceChildren(content);
        } catch (error) {
          if (error.status === 401) {
            return signOut();
          }
          viewNode.replaceChildren(
            el('div', { class: 'panel error-panel' }, [
              el('h3', { text: 'Could not load this view' }),
              el('p', { text: describe(error) }),
              el('p', { class: 'muted small', text: error.code || '' }),
            ]),
          );
        }
        return;
      }
    }
    location.hash = '#/overview';
  }

  // --- overview ------------------------------------------------------------

  async function viewOverview() {
    const data = await api.overview();

    return el('div', { class: 'stack' }, [
      el('div', { class: 'stats' }, [
        ui.stat('Users', ui.number(data.users.total), '+' + data.users.newLast7d + ' this week'),
        ui.stat('Active (7d)', ui.number(data.users.activeLast7d), 'saved or browsed'),
        ui.stat('Taste profiles', ui.number(data.engagement.dnaProfiles), 'Explorer DNA built'),
        ui.stat('Saves', ui.number(data.engagement.saves), 'all time'),
        ui.stat('Signals (24h)', ui.number(data.engagement.signalsLast24h), 'what DNA learns from'),
        ui.stat(
          'Catalogue',
          ui.number(data.content.published),
          data.content.draft + ' draft · ' + data.content.archived + ' archived',
        ),
      ]),

      data.users.suspended > 0
        ? el('p', { class: 'notice', text: data.users.suspended + ' account(s) suspended.' })
        : null,

      el('div', { class: 'grid-2' }, [
        el('div', { class: 'panel' }, [ui.trendChart(data.signupsByDay, 'Signups')]),
        el('div', { class: 'panel' }, [ui.trendChart(data.signalsByDay, 'Activity')]),
      ]),

      el('div', { class: 'grid-2' }, [
        el('div', { class: 'panel' }, [
          el('h3', { text: 'What the population likes' }),
          el('p', {
            class: 'muted small',
            text: 'Averaged across the profiles that hold an opinion. This is the dial to watch when tuning the feed.',
          }),
          data.topTags.length
            ? el(
                'div',
                { class: 'taste-list' },
                data.topTags.map(function (row) {
                  return tasteBar(
                    row.tag,
                    row.net,
                    row.profiles + (row.profiles === 1 ? ' profile' : ' profiles'),
                  );
                }),
              )
            : ui.empty('No taste profiles yet — nobody has completed onboarding.'),
        ]),
        el('div', { class: 'panel' }, [
          el('h3', { text: 'Most saved' }),
          data.topSaved.length
            ? ui.table(
                ['Experience', 'Saves'],
                data.topSaved.map(function (row) {
                  return el('tr', {}, [
                    el('td', {}, [
                      el('a', { href: '#/content/' + row.experienceId, text: row.title }),
                    ]),
                    el('td', { class: 'num', text: ui.number(row.saves) }),
                  ]);
                }),
              )
            : ui.empty('Nothing has been saved yet.'),
        ]),
      ]),
    ]);
  }

  /** A -1..+1 affinity as a bar that grows left for dislike, right for like. */
  function tasteBar(label, score, hint) {
    const magnitude = Math.min(1, Math.abs(score)) * 50;
    return el('div', { class: 'taste-row' }, [
      el('span', { class: 'taste-label', text: label }),
      el('div', { class: 'taste-track' }, [
        el('div', {
          class: 'taste-fill ' + (score < 0 ? 'negative' : 'positive'),
          style:
            score < 0
              ? 'right:50%;width:' + magnitude + '%'
              : 'left:50%;width:' + magnitude + '%',
        }),
        el('div', { class: 'taste-zero' }),
      ]),
      el('span', { class: 'taste-value', text: score.toFixed(2) }),
      el('span', { class: 'muted small', text: hint || '' }),
    ]);
  }

  // --- users ---------------------------------------------------------------

  async function viewUsers() {
    const search = sessionStorage.getItem('firo.admin.userSearch') || '';
    const page = await api.users({ limit: 50, search: search });

    const input = el('input', {
      type: 'search',
      placeholder: 'handle, email or name',
      value: search,
      class: 'search',
    });
    let debounce;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        sessionStorage.setItem('firo.admin.userSearch', input.value.trim());
        route();
      }, 250);
    });

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [
        el('h2', { text: 'Users' }),
        input,
        el('span', { class: 'muted', text: ui.number(page.total) + ' total' }),
      ]),
      page.rows.length
        ? ui.table(
            ['Handle', 'Email', 'Joined', 'Last active', 'Saves', 'Signals', 'DNA', 'Leans towards', ''],
            page.rows.map(function (row) {
              return el('tr', { class: row.status !== 'active' ? 'row-muted' : '' }, [
                el('td', {}, [
                  el('a', { href: '#/users/' + row.id, text: '@' + row.handle }),
                  row.status !== 'active' ? ui.tag(row.status, 'warn') : null,
                  row.roles.includes('admin') ? ui.tag('admin', 'accent') : null,
                ]),
                el('td', { class: 'dim', text: row.email || '—' }),
                el('td', { text: ui.date(row.createdAt) }),
                el('td', { text: ui.ago(row.lastActiveAt) }),
                el('td', { class: 'num', text: ui.number(row.saveCount) }),
                el('td', { class: 'num', text: ui.number(row.signalCount) }),
                el('td', { class: 'num', text: ui.percent(row.dnaCompleteness) }),
                el(
                  'td',
                  {},
                  row.topTags.length
                    ? row.topTags.map(function (t) {
                        return ui.tag(t);
                      })
                    : [el('span', { class: 'muted', text: 'unknown' })],
                ),
                el('td', {}, [el('a', { class: 'ghost small', href: '#/users/' + row.id, text: 'Open' })]),
              ]);
            }),
          )
        : ui.empty(search ? 'Nobody matches "' + search + '".' : 'No accounts yet.'),
    ]);
  }

  async function viewUserDetail(id) {
    const detail = await api.user(id);
    const user = detail.user;

    const dimensions = detail.dna
      ? Object.keys(detail.dna.dimensions)
          .map(function (key) {
            const dimension = detail.dna.dimensions[key];
            const total = dimension.positive + dimension.negative;
            // Mirrors the server's formula (shrinkage 6) so the console shows
            // the same number the ranker uses.
            return {
              tag: key,
              score: total === 0 ? 0 : (dimension.positive - dimension.negative) / (total + 6),
              confidence: total / (total + 6),
            };
          })
          .sort(function (a, b) {
            return Math.abs(b.score) - Math.abs(a.score);
          })
      : [];

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [
        el('a', { class: 'ghost small', href: '#/users', text: '← Users' }),
        el('h2', { text: '@' + user.handle }),
        user.roles.map(function (role) {
          return ui.tag(role, role === 'admin' ? 'accent' : null);
        }),
        user.status !== 'active' ? ui.tag(user.status, 'warn') : null,
      ]),

      el('div', { class: 'stats' }, [
        ui.stat('Saves', ui.number(user.saveCount)),
        ui.stat('Signals', ui.number(user.signalCount)),
        ui.stat('DNA complete', ui.percent(user.dnaCompleteness)),
        ui.stat('Joined', ui.date(user.createdAt)),
        ui.stat('Last active', ui.ago(user.lastActiveAt)),
      ]),

      el('div', { class: 'panel' }, [
        el('h3', { text: 'Account' }),
        el('p', { class: 'muted small', text: user.email || 'no email' }),
        el('div', { class: 'actions' }, [
          user.status === 'active'
            ? actionButton('Suspend', 'danger', function () {
                return confirmThen(
                  'Suspend @' + user.handle + '?',
                  function () {
                    return api.setUserStatus(user.id, 'suspended');
                  },
                  'Suspended @' + user.handle,
                );
              })
            : actionButton('Reinstate', 'primary', function () {
                return confirmThen(
                  'Reinstate @' + user.handle + '?',
                  function () {
                    return api.setUserStatus(user.id, 'active');
                  },
                  'Reinstated @' + user.handle,
                );
              }),
          user.roles.includes('admin')
            ? actionButton('Revoke admin', 'ghost', function () {
                return confirmThen(
                  'Remove admin from @' + user.handle + '?',
                  function () {
                    return api.setUserRoles(
                      user.id,
                      user.roles.filter(function (role) {
                        return role !== 'admin';
                      }),
                    );
                  },
                  'Admin revoked',
                );
              })
            : actionButton('Make admin', 'ghost', function () {
                return confirmThen(
                  'Give @' + user.handle + ' full console access?',
                  function () {
                    return api.setUserRoles(user.id, user.roles.concat(['admin']));
                  },
                  '@' + user.handle + ' is now an admin',
                );
              }),
        ]),
      ]),

      el('div', { class: 'panel' }, [
        el('h3', { text: 'Explorer DNA' }),
        el('p', {
          class: 'muted small',
          text: 'Score is affinity (−1 to +1). Confidence is how much evidence stands behind it — a low-confidence score is a guess, not a conclusion.',
        }),
        dimensions.length
          ? el(
              'div',
              { class: 'taste-list' },
              dimensions.map(function (row) {
                return tasteBar(row.tag, row.score, Math.round(row.confidence * 100) + '% sure');
              }),
            )
          : ui.empty('No profile yet — this user has not completed onboarding or interacted.'),
      ]),

      el('div', { class: 'grid-2' }, [
        el('div', { class: 'panel' }, [
          el('h3', { text: 'Saved (' + detail.saves.length + ')' }),
          detail.saves.length
            ? ui.table(
                ['Experience', 'Place', 'When'],
                detail.saves.map(function (save) {
                  return el('tr', {}, [
                    el('td', {}, [
                      el('a', { href: '#/content/' + save.experienceId, text: save.title }),
                    ]),
                    el('td', { class: 'dim', text: save.placeName || '—' }),
                    el('td', { text: ui.ago(save.savedAt) }),
                  ]);
                }),
              )
            : ui.empty('Nothing saved yet.'),
        ]),
        el('div', { class: 'panel' }, [
          el('h3', { text: 'Recent signals' }),
          detail.recentSignals.length
            ? ui.table(
                ['Kind', 'Experience', 'Dwell', 'When'],
                detail.recentSignals.map(function (signal) {
                  return el('tr', {}, [
                    el('td', {}, [ui.tag(signal.kind)]),
                    el('td', { class: 'dim', text: signal.title || signal.experienceId || '—' }),
                    el('td', {
                      class: 'num',
                      text: signal.durationMs ? Math.round(signal.durationMs / 1000) + 's' : '—',
                    }),
                    el('td', { text: ui.ago(signal.occurredAt) }),
                  ]);
                }),
              )
            : ui.empty('No signals recorded.'),
        ]),
      ]),

      detail.saves.length
        ? el('div', { class: 'panel' }, [
            el('h3', { text: 'Where they want to go' }),
            ui.worldMap(
              detail.saves.map(function (save) {
                return {
                  title: save.title,
                  lat: save.lat,
                  lng: save.lng,
                  saves: 1,
                  status: 'published',
                };
              }),
              {},
            ),
          ])
        : null,
    ]);
  }

  // --- content -------------------------------------------------------------

  async function viewContent() {
    const search = sessionStorage.getItem('firo.admin.contentSearch') || '';
    const page = await api.content({ limit: 100, search: search });

    const input = el('input', {
      type: 'search',
      placeholder: 'title, slug or summary',
      value: search,
      class: 'search',
    });
    let debounce;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        sessionStorage.setItem('firo.admin.contentSearch', input.value.trim());
        route();
      }, 250);
    });

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [
        el('h2', { text: 'Catalogue' }),
        input,
        el('span', { class: 'muted', text: ui.number(page.total) + ' entries' }),
        el('a', { class: 'primary small', href: '#/content/new', text: '+ New experience' }),
      ]),
      page.rows.length
        ? ui.table(
            ['Title', 'Place', 'Tags', 'Budget', 'Wow', 'Gem', 'Saves', 'Status', ''],
            page.rows.map(function (row) {
              const e = row.experience;
              return el('tr', { class: e.status === 'published' ? '' : 'row-muted' }, [
                el('td', {}, [
                  el('a', { href: '#/content/' + e.id, text: e.title }),
                  el('div', { class: 'muted small', text: e.slug }),
                ]),
                el('td', { class: 'dim', text: (row.placeName || '—') + (row.countryCode ? ' · ' + row.countryCode : '') }),
                el(
                  'td',
                  {},
                  e.tags.slice(0, 4).map(function (t) {
                    return ui.tag(t);
                  }),
                ),
                el('td', { class: 'dim', text: e.budgetBand }),
                el('td', { class: 'num', text: e.wowScore.toFixed(2) }),
                el('td', { class: 'num', text: e.hiddenGemScore.toFixed(2) }),
                el('td', { class: 'num', text: ui.number(row.saveCount) }),
                el('td', {}, [ui.tag(e.status, e.status === 'published' ? 'accent' : 'draft')]),
                el('td', {}, [el('a', { class: 'ghost small', href: '#/content/' + e.id, text: 'Edit' })]),
              ]);
            }),
          )
        : ui.empty('Nothing matches.'),
    ]);
  }

  async function viewEditor(id) {
    const [page, places, mapPoints] = await Promise.all([
      id ? api.content({ limit: 200 }) : Promise.resolve({ rows: [] }),
      api.places(),
      api.mapPoints(),
    ]);

    const found = id
      ? page.rows.find(function (row) {
          return row.experience.id === id;
        })
      : null;
    if (id && !found) {
      throw Object.assign(new Error('No experience with id "' + id + '".'), {
        code: 'admin.experience_not_found',
      });
    }
    const existing = found ? found.experience : null;


    const form = el('form', { class: 'panel form' });
    const fields = {};

    function field(name, label, input, hint) {
      fields[name] = input;
      return el('div', { class: 'field' }, [
        el('label', { text: label, for: 'f-' + name }),
        input,
        hint ? el('p', { class: 'muted small', text: hint }) : null,
      ]);
    }

    function textInput(name, value, attrs) {
      return el('input', Object.assign({ id: 'f-' + name, value: value == null ? '' : value }, attrs || {}));
    }

    const tagBoxes = ALL_TAGS.map(function (t) {
      const checked = existing ? existing.tags.includes(t) : false;
      const box = el('input', { type: 'checkbox', value: t, checked: checked });
      return el('label', { class: 'check' }, [box, el('span', { text: t })]);
    });

    const monthBoxes = MONTHS.map(function (label, index) {
      const checked = existing ? (existing.seasonMask & (1 << index)) !== 0 : true;
      const box = el('input', { type: 'checkbox', value: String(index + 1), checked: checked });
      return el('label', { class: 'check' }, [box, el('span', { text: label })]);
    });

    form.append(
      el('h2', { text: existing ? 'Edit experience' : 'New experience' }),
      existing ? el('p', { class: 'muted small', text: existing.id }) : null,

      field(
        'placeId',
        'Place',
        el(
          'select',
          { id: 'f-placeId', required: true },
          places.map(function (place) {
            const label =
              place.name +
              (place.regionName ? ', ' + place.regionName : '') +
              (place.countryCode ? ' (' + place.countryCode + ')' : '');
            return el('option', {
              value: place.id,
              text: label,
              selected: existing ? place.id === existing.placeId : false,
            });
          }),
        ),
        'Places are reference data, seeded with the catalogue. Coordinates default to the place unless you override them.',
      ),
      field('title', 'Title', textInput('title', existing && existing.title, { required: true, maxlength: 140 })),
      field(
        'slug',
        'Slug',
        textInput('slug', existing && existing.slug, {
          required: true,
          pattern: '[a-z0-9]+(-[a-z0-9]+)*',
        }),
        'Appears in the URL. Lowercase words separated by hyphens, and unique.',
      ),
      field(
        'summary',
        'Summary',
        el('textarea', { id: 'f-summary', rows: 2, maxlength: 280, required: true, text: (existing && existing.summary) || '' }),
        'The single emotional line on the card. 10–280 characters.',
      ),
      field(
        'story',
        'Story',
        el('textarea', { id: 'f-story', rows: 6, maxlength: 8000, text: (existing && existing.story) || '' }),
        'Optional longer body.',
      ),

      el('div', { class: 'field' }, [
        el('label', { text: 'Tags' }),
        el('p', {
          class: 'muted small',
          text: 'These are the exact dimensions Explorer DNA scores — they are how this gets matched to a person. Pick what is true, not what sounds good.',
        }),
        el('div', { class: 'checks' }, tagBoxes),
      ]),

      el('div', { class: 'field' }, [
        el('label', { text: 'Best months' }),
        el('div', { class: 'checks' }, monthBoxes),
      ]),

      el('div', { class: 'grid-3' }, [
        field(
          'budgetBand',
          'Budget',
          el(
            'select',
            { id: 'f-budgetBand' },
            BUDGET_BANDS.map(function (band) {
              return el('option', {
                value: band,
                text: band,
                selected: existing ? existing.budgetBand === band : band === 'moderate',
              });
            }),
          ),
        ),
        field('difficulty', 'Difficulty (1–5)', textInput('difficulty', existing ? existing.difficulty : 1, {
          type: 'number', min: 1, max: 5, step: 1,
        })),
        field(
          'status',
          'Status',
          el(
            'select',
            { id: 'f-status' },
            STATUSES.map(function (status) {
              return el('option', {
                value: status,
                text: status,
                selected: existing ? existing.status === status : status === 'draft',
              });
            }),
          ),
        ),
      ]),

      el('div', { class: 'grid-2' }, [
        field(
          'wowScore',
          'Wow score (0–1)',
          textInput('wowScore', existing ? existing.wowScore : 0.5, { type: 'number', min: 0, max: 1, step: 0.05 }),
          'How strong a "stop scrolling" moment this is. Drives ranking — inflating it here inflates it for everyone.',
        ),
        field(
          'hiddenGemScore',
          'Hidden gem (0–1)',
          textInput('hiddenGemScore', existing ? existing.hiddenGemScore : 0.5, { type: 'number', min: 0, max: 1, step: 0.05 }),
          '1 means almost nobody knows about it. Drives the novelty lever.',
        ),
      ]),

      field(
        'mediaUrl',
        'Image URL',
        textInput('mediaUrl', existing && existing.media[0] ? existing.media[0].url : '', { type: 'url' }),
        'Optional. One image for now; the media pipeline lands later.',
      ),

      el('p', { class: 'error', id: 'form-error', hidden: true }),

      el('div', { class: 'actions' }, [
        el('button', { type: 'submit', class: 'primary', text: existing ? 'Save changes' : 'Create' }),
        el('a', { class: 'ghost', href: '#/content', text: 'Cancel' }),
        existing
          ? actionButton('Delete', 'danger', function () {
              return confirmThen(
                'Delete "' + existing.title + '"? This also removes it from everyone who saved it. Archiving is usually what you want.',
                function () {
                  return api.deleteExperience(existing.id);
                },
                'Deleted',
                '#/content',
              );
            })
          : null,
      ]),
    );

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const errorNode = form.querySelector('#form-error');
      errorNode.hidden = true;

      const tags = tagBoxes
        .map(function (label) {
          return label.querySelector('input');
        })
        .filter(function (box) {
          return box.checked;
        })
        .map(function (box) {
          return box.value;
        });

      if (tags.length === 0) {
        errorNode.textContent = 'Pick at least one tag — without tags this can never be recommended.';
        errorNode.hidden = false;
        return;
      }

      const months = monthBoxes
        .map(function (label) {
          return label.querySelector('input');
        })
        .filter(function (box) {
          return box.checked;
        })
        .map(function (box) {
          return Number(box.value);
        });

      const mediaUrl = fields.mediaUrl.value.trim();
      const body = {
        placeId: fields.placeId.value,
        slug: fields.slug.value.trim(),
        title: fields.title.value.trim(),
        summary: fields.summary.value.trim(),
        story: fields.story.value.trim() || null,
        tags: tags,
        months: months.length === 12 ? [] : months,
        budgetBand: fields.budgetBand.value,
        difficulty: Number(fields.difficulty.value),
        wowScore: Number(fields.wowScore.value),
        hiddenGemScore: Number(fields.hiddenGemScore.value),
        status: fields.status.value,
        media: mediaUrl
          ? [{ id: 'img_' + fields.slug.value.trim(), url: mediaUrl, dominantColor: null, width: null, height: null, attribution: null }]
          : [],
      };

      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const saved = existing
          ? await api.updateExperience(existing.id, body)
          : await api.createExperience(body);
        ui.toast((existing ? 'Saved ' : 'Created ') + saved.title, 'ok');
        location.hash = '#/content';
      } catch (error) {
        errorNode.textContent = describe(error);
        errorNode.hidden = false;
        button.disabled = false;
      }
    });

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [el('a', { class: 'ghost small', href: '#/content', text: '← Catalogue' })]),
      form,
      existing
        ? el('div', { class: 'panel' }, [
            el('h3', { text: 'On the map' }),
            ui.worldMap(
              mapPoints.filter(function (point) {
                return point.experienceId === existing.id;
              }),
              {},
            ),
          ])
        : null,
    ]);
  }

  // --- map -----------------------------------------------------------------

  async function viewMap() {
    const points = await api.mapPoints();
    const saved = points.filter(function (point) {
      return point.saves > 0;
    });

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [
        el('h2', { text: 'The world' }),
        el('span', {
          class: 'muted',
          text: points.length + ' experiences · ' + saved.length + ' with saves',
        }),
      ]),
      el('div', { class: 'panel' }, [
        ui.worldMap(points, {
          onSelect: function (point) {
            location.hash = '#/content/' + point.experienceId;
          },
        }),
      ]),
      el('div', { class: 'panel' }, [
        el('h3', { text: 'Coverage' }),
        el('p', {
          class: 'muted small',
          text: 'Clusters here are the shape of the catalogue, not of the world. Empty regions are where the feed has nothing to offer someone.',
        }),
        ui.table(
          ['Experience', 'Saves', 'Status'],
          points
            .slice()
            .sort(function (a, b) {
              return b.saves - a.saves;
            })
            .slice(0, 25)
            .map(function (point) {
              return el('tr', {}, [
                el('td', {}, [
                  el('a', { href: '#/content/' + point.experienceId, text: point.title }),
                ]),
                el('td', { class: 'num', text: ui.number(point.saves) }),
                el('td', {}, [ui.tag(point.status, point.status === 'published' ? 'accent' : 'draft')]),
              ]);
            }),
        ),
      ]),
    ]);
  }

  // --- live ----------------------------------------------------------------

  async function viewLive() {
    const initial = await api.activity(null, 50);
    const list = el('div', { class: 'feed' });
    const status = el('span', { class: 'muted small', text: 'connecting…' });

    const seen = new Set();
    function push(event, atTop) {
      const key = event.kind + '|' + event.userId + '|' + event.at;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      const row = el('div', { class: 'feed-row feed-' + event.kind }, [
        el('span', { class: 'feed-time', text: ui.ago(event.at) }),
        el('a', { class: 'feed-who', href: '#/users/' + event.userId, text: '@' + event.handle }),
        el('span', { class: 'feed-what', text: event.label }),
      ]);
      if (atTop) {
        list.prepend(row);
        // Only new arrivals flash; replaying the backlog as "new" would make
        // a quiet system look busy.
        row.classList.add('fresh');
        setTimeout(function () {
          row.classList.remove('fresh');
        }, 1200);
      } else {
        list.append(row);
      }
      while (list.childElementCount > 200) {
        list.lastElementChild.remove();
      }
    }

    initial.forEach(function (event) {
      push(event, false);
    });

    let stream = null;
    let pollTimer = null;
    let latest = initial.length ? initial[0].at : new Date().toISOString();

    function startPolling(reason) {
      status.textContent = 'polling every 5s' + (reason ? ' (' + reason + ')' : '');
      pollTimer = setInterval(async function () {
        try {
          const events = await api.activity(latest, 50);
          events
            .slice()
            .reverse()
            .forEach(function (event) {
              latest = event.at > latest ? event.at : latest;
              push(event, true);
            });
        } catch (error) {
          status.textContent = 'disconnected — ' + error.message;
        }
      }, 5000);
    }

    stream = api.openStream({
      onEvent: function (name, data) {
        if (name === 'activity') {
          latest = data.at > latest ? data.at : latest;
          push(data, true);
          status.textContent = 'live';
        } else if (name === 'hello') {
          status.textContent = 'live';
        }
      },
      onClose: function (error) {
        // Streaming can be blocked by a proxy that buffers responses. Falling
        // back keeps the view useful instead of silently freezing.
        if (!pollTimer) {
          startPolling(error ? 'stream unavailable' : 'stream closed');
        }
      },
    });

    teardown = function () {
      if (stream) {
        stream.close();
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [
        el('h2', { text: 'Live' }),
        el('span', { class: 'dot-live' }),
        status,
      ]),
      el('div', { class: 'panel' }, [
        el('p', {
          class: 'muted small',
          text: 'Every signup, save and interaction as it happens. This is the recommendation engine being fed.',
        }),
        list,
      ]),
    ]);
  }

  // --- audit ---------------------------------------------------------------

  async function viewAudit() {
    const entries = await api.audit(100);

    return el('div', { class: 'stack' }, [
      el('div', { class: 'toolbar' }, [el('h2', { text: 'Audit log' })]),
      el('div', { class: 'panel' }, [
        el('p', {
          class: 'muted small',
          text: 'Every change made from this console, with the row before and after. Deleting content is reversible only from here.',
        }),
        entries.length
          ? ui.table(
              ['When', 'Who', 'Action', 'Target', 'Change'],
              entries.map(function (entry) {
                return el('tr', {}, [
                  el('td', { text: ui.ago(entry.at) }),
                  el('td', { text: '@' + entry.actorHandle }),
                  el('td', {}, [ui.tag(entry.action, entry.action.endsWith('deleted') ? 'warn' : null)]),
                  el('td', { class: 'dim', text: entry.targetId || '—' }),
                  el('td', {}, [
                    el('details', {}, [
                      el('summary', { class: 'muted small', text: 'before / after' }),
                      el('pre', { class: 'diff', text: JSON.stringify({ before: entry.before, after: entry.after }, null, 2) }),
                    ]),
                  ]),
                ]);
              }),
            )
          : ui.empty('Nothing has been changed from the console yet.'),
      ]),
    ]);
  }

  // --- shared actions ------------------------------------------------------

  /**
   * Turns an ApiError into something a person can act on.
   *
   * The API returns per-field detail on a validation failure; showing only
   * "Request validation failed" throws that away and leaves the operator
   * guessing which of twenty inputs is wrong.
   */
  function describe(error) {
    const fields = error.details && error.details.fields;
    if (Array.isArray(fields) && fields.length) {
      return fields
        .map(function (field) {
          return (field.path || field.field || 'field') + ': ' + field.message;
        })
        .join(' · ');
    }
    return error.message;
  }

  function actionButton(label, kind, handler) {
    const button = el('button', { type: 'button', class: kind, text: label });
    button.addEventListener('click', async function () {
      button.disabled = true;
      try {
        await handler();
      } catch (error) {
        ui.toast(describe(error), 'error');
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  async function confirmThen(question, action, successMessage, redirect) {
    if (!window.confirm(question)) {
      return;
    }
    await action();
    ui.toast(successMessage, 'ok');
    if (redirect) {
      location.hash = redirect;
    } else {
      route();
    }
  }

  boot();
})();
