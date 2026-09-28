/**
 * Firo — one place a day.
 *
 *   first visit   Open → four choices → Forming → When → Keep → Today
 *   every day     Arrive → Today → (Linger) → Days / World
 *
 * Nothing is asked before something is shown. The account is created on the
 * first tap as a guest, so onboarding answers have an owner, and claiming it
 * later ("Keep your DNA?") changes nothing but the sign-in: same id, same
 * profile, same days.
 *
 * The server owns the words (greeting, reason, the month's sentence, the
 * world's question); this file renders them.
 */
(function () {
  'use strict';

  const api = window.firoApi;
  const drawLandscape = window.firoLandscape;
  const root = document.getElementById('app');

  const TIME_ZONE = (function () {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
      return 'UTC';
    }
  })();

  const SESSION_ID = 'web-' + Math.random().toString(36).slice(2, 10);
  const NUMBER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
  const ARRIVED_KEY = 'firo.arrivedOn';
  // Someone who skips all four questions has no profile yet, but has still
  // been through onboarding; they should not be asked again on every visit.
  const ONBOARDED_KEY = 'firo.onboarded';

  const state = {
    screen: 'loading',
    user: null,
    flow: null,
    stepIndex: 0,
    answers: {},
    sketch: [],
    sketchTags: [],
    today: null,
    reveal: false,
    /** Today was just opened from the envelope: let the words arrive. */
    enter: false,
    deciding: null,
    days: null,
    month: null,
    world: null,
    rhythm: null,
    linger: null,
    returnTo: null,
    error: null,
    busy: false,
  };

  // ---------------------------------------------------------------- helpers --

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
      } else if (key.indexOf('on') === 0 && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    });
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

  function readStore(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      /* a remembered arrival is a nicety, not a requirement */
    }
  }

  function localDay() {
    return dayIn(new Date().toISOString());
  }

  function timeOfDayNow() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'day';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  function setTimeOfDay(value) {
    document.body.dataset.tod = value || timeOfDayNow();
    const ground = document.body.dataset.tod === 'evening' || document.body.dataset.tod === 'night'
      ? '#06070b'
      : '#0b0a09';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', ground);
    }
  }

  function arrivalLine(day) {
    const date = new Date(day + 'T12:00:00Z');
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }).format(date);
    const dayMonth = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(date);
    return weekday + ' · ' + dayMonth;
  }

  /** The user's calendar day for an ISO timestamp. */
  function dayIn(iso) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  }

  function shortDate(day) {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(day + 'T12:00:00Z'));
  }

  function monthName(month) {
    return new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(
      new Date(month + '-01T12:00:00Z'),
    );
  }

  function shiftMonth(month, delta) {
    const date = new Date(month + '-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + delta);
    return date.toISOString().slice(0, 7);
  }

  function placeLine(place) {
    if (!place) return '';
    return [place.name, place.region, place.country]
      .filter(function (part, index, all) {
        return part && all.indexOf(part) === index;
      })
      .join(' · ');
  }

  function words(tags) {
    return (tags || [])
      .slice(0, 3)
      .map(function (tag) {
        return tag.replace(/_/g, ' ');
      })
      .join(' · ');
  }

  /**
   * The picture for a place: the photograph when there is one, drawn over its
   * own dominant colour so a slow network shows the right colour rather than
   * a grey hole; otherwise a drawn landscape from the place's tags.
   */
  function scene(media, key, tags, extraClass) {
    const node = el('div', { class: 'scene' + (extraClass ? ' ' + extraClass : '') });
    const ref = media && (media.url ? media : media[0]);
    if (ref && ref.url) {
      if (ref.dominantColor) {
        node.style.background = ref.dominantColor;
      }
      const img = el('img', { src: ref.url, alt: ref.alt || '', decoding: 'async' });
      if (ref.variants && ref.variants.length > 1) {
        img.setAttribute(
          'srcset',
          ref.variants
            .map(function (variant) {
              return variant.url + ' ' + variant.width + 'w';
            })
            .join(', '),
        );
        img.setAttribute('sizes', '(max-width: 480px) 100vw, 480px');
      }
      img.addEventListener('error', function () {
        img.remove();
        node.insertAdjacentHTML('afterbegin', drawLandscape(key, tags));
      });
      node.appendChild(img);
    } else {
      node.innerHTML = drawLandscape(key, tags);
    }
    return node;
  }

  /** A title as one span per word, so the words can arrive one after another. */
  function wordsOf(text) {
    return String(text)
      .split(' ')
      .map(function (word, index) {
        return el('span', { class: 'w', style: '--i: ' + index, text: word + ' ' });
      });
  }

  /**
   * A kept place becomes a light on the map. Show that: a small light leaves
   * the circle and lands on the word "world", which glows for a moment.
   */
  function sendLight(from) {
    const target = root.querySelector('.nav button:last-child');
    if (!target || !from.animate) return;
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const light = el('div', { class: 'light', 'aria-hidden': 'true' });
    light.style.left = a.left + a.width / 2 + 'px';
    light.style.top = a.top + a.height / 2 + 'px';
    document.body.appendChild(light);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    light
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0 },
          { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - 40) + 'px)) scale(0.8)', opacity: 1, offset: 0.55 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.4)', opacity: 0.9, offset: 1 },
        ],
        { duration: 900, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' },
      )
      .finished.then(function () {
        light.remove();
        target.classList.add('lit');
        setTimeout(function () {
          target.classList.remove('lit');
        }, 1400);
      })
      .catch(function () {
        light.remove();
      });
  }

  function go(screen, patch) {
    Object.assign(state, patch || {}, { screen: screen, error: patch && patch.error ? patch.error : null });
    render();
  }

  function render() {
    const screens = {
      loading: loadingScreen,
      open: openScreen,
      signin: signInScreen,
      onboarding: onboardingScreen,
      forming: formingScreen,
      when: whenScreen,
      keep: keepScreen,
      arrive: arriveScreen,
      today: todayScreen,
      linger: lingerScreen,
      days: daysScreen,
      world: worldScreen,
      empty: emptyScreen,
      error: errorScreen,
    };
    const build = screens[state.screen] || errorScreen;
    root.replaceChildren(build());
    window.scrollTo(0, 0);
  }

  function nav(current) {
    function item(key, label) {
      return el('button', {
        type: 'button',
        text: label,
        'aria-current': current === key ? 'page' : null,
        onclick: function () {
          if (key === 'today') showToday(false);
          if (key === 'days') showDays(null);
          if (key === 'world') showWorld();
        },
      });
    }
    return el('nav', { class: 'nav', 'aria-label': 'Firo' }, [
      item('today', 'today'),
      item('days', 'days'),
      item('world', 'world'),
    ]);
  }

  // ------------------------------------------------------------- lifecycle --

  async function boot() {
    setTimeOfDay(timeOfDayNow());
    if (!api.hasSession) {
      return go('open');
    }
    try {
      state.user = await api.me();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        api.setTokens(null);
        return go('open');
      }
      return go('error', { error: error.message });
    }
    try {
      const dna = await api.dna();
      if ((!dna || dna.signalCount === 0) && readStore(ONBOARDED_KEY) !== state.user.id) {
        return startOnboarding();
      }
      await showToday(true);
    } catch (error) {
      go('error', { error: error.message });
    }
  }

  async function startOnboarding() {
    try {
      const flow = await api.onboardingFlow();
      go('onboarding', { flow: flow, stepIndex: 0, answers: {} });
    } catch (error) {
      go('error', { error: error.message });
    }
  }

  /** `fromBoot`: decide between Arrive and Today by whether today was seen. */
  async function showToday(fromBoot) {
    try {
      const today = await api.today(TIME_ZONE);
      state.today = today;
      setTimeOfDay(today.timeOfDay);
      const arrived = readStore(ARRIVED_KEY) === today.day;
      if (fromBoot && !arrived && !today.isFirstDay) {
        return go('arrive');
      }
      writeStore(ARRIVED_KEY, today.day);
      go('today', { reveal: fromBoot });
    } catch (error) {
      if (error.code === 'daily.nothing_to_show') {
        return go('empty');
      }
      go('error', { error: error.message });
    }
  }

  /** After onboarding: the first place, revealed through its clues. */
  async function arriveAtFirstPlace() {
    try {
      const today = await api.today(TIME_ZONE);
      state.today = today;
      setTimeOfDay(today.timeOfDay);
      go(today.clues && today.clues.length ? 'arrive' : 'today', { reveal: true });
    } catch (error) {
      if (error.code === 'daily.nothing_to_show') {
        return go('empty');
      }
      go('error', { error: error.message });
    }
  }

  async function showDays(month) {
    try {
      const days = await api.days(month, TIME_ZONE);
      go('days', { days: days, month: days.month });
    } catch (error) {
      go('error', { error: error.message });
    }
  }

  async function showWorld() {
    try {
      const results = await Promise.all([api.world(), api.rhythm(), api.me()]);
      go('world', { world: results[0], rhythm: results[1], user: results[2] });
    } catch (error) {
      go('error', { error: error.message });
    }
  }

  async function showLinger(source, from) {
    // `source` is today's view, or a slug from the quilt or the world list.
    try {
      let view;
      if (typeof source === 'string') {
        const detail = await api.experience(source);
        view = {
          experience: detail.experience,
          place: detail.place
            ? {
                name: detail.place.name,
                region: detail.region ? detail.region.name : null,
                country: detail.country ? detail.country.name : null,
              }
            : null,
          kept: null,
        };
      } else {
        view = { experience: source.experience, place: source.place, kept: source.kept };
      }
      api.signal('open', view.experience.id, { sessionId: SESSION_ID });
      go('linger', { linger: Object.assign(view, { from: from, openedAt: Date.now() }) });
    } catch (error) {
      go('error', { error: error.message });
    }
  }

  function leaveLinger() {
    const linger = state.linger;
    if (linger) {
      // How long someone stayed with a place is the quietest, most honest
      // signal there is. The server ignores anything too short to mean much.
      api.signal('dwell', linger.experience.id, {
        sessionId: SESSION_ID,
        durationMs: Date.now() - linger.openedAt,
      });
    }
    const from = (linger && linger.from) || 'today';
    if (from === 'days') return showDays(state.month);
    if (from === 'world') return showWorld();
    go('today', { reveal: false });
  }

  // A tab left open overnight should wake up to the new day, not yesterday's.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.today && state.today.day !== localDay()) {
      boot();
    }
  });

  // ---------------------------------------------------------------- screens --

  function loadingScreen() {
    return el('section', { class: 'screen' }, [
      el('div', { class: 'centered' }, [el('div', { class: 'breathe', 'aria-label': 'Loading' })]),
    ]);
  }

  function openScreen() {
    return el('section', { class: 'screen' }, [
      scene(null, 'firo-open-3', ['mountains'], 'reveal sunrise'),
      el('div', { class: 'veil' }),
      el('div', { class: 'bottom-copy' }, [
        el('div', { class: 'kicker', text: 'Firo' }),
        el('h1', { class: 'display lg', text: 'One place a day. Nothing to buy.' }),
        el('p', {
          class: 'quiet',
          text:
            'Every day, Firo chooses one place in the world for you. Not a list, not a feed: ' +
            'one place, and the reason it was chosen for you and not for someone else.',
        }),
        el('p', {
          class: 'whisper',
          text: 'Four small questions, about a minute. The first place is waiting at the end.',
        }),
        el('div', { style: 'margin-top: 10px' }, [
          el('button', {
            type: 'button',
            class: 'primary solid',
            id: 'btn-begin',
            text: state.busy ? 'One moment…' : 'Begin',
            disabled: state.busy,
            onclick: begin,
          }),
        ]),
        el('button', {
          type: 'button',
          class: 'linkish',
          text: 'I already have an account',
          onclick: function () {
            go('signin');
          },
        }),
        state.error ? el('p', { class: 'error', text: state.error }) : null,
      ]),
    ]);
  }

  async function begin() {
    state.busy = true;
    render();
    try {
      const result = await api.startGuest();
      api.setTokens(result.tokens);
      state.user = result.user;
      state.busy = false;
      await startOnboarding();
    } catch (error) {
      state.busy = false;
      go('open', { error: error.message });
    }
  }

  function signInScreen() {
    const error = el('p', { class: 'error', id: 'signin-error', text: state.error || '' });
    const form = el('form', { class: 'form', novalidate: true }, [
      field('signin-email', 'Email', 'email', 'username'),
      field('signin-password', 'Password', 'password', 'current-password'),
      error,
      el('div', {}, [el('button', { type: 'submit', class: 'primary solid', text: 'Sign in' })]),
    ]);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      error.textContent = '';
      try {
        const result = await api.login(
          document.getElementById('signin-email').value.trim(),
          document.getElementById('signin-password').value,
        );
        api.setTokens(result.tokens);
        await boot();
      } catch (err) {
        error.textContent =
          err.code === 'auth.invalid_credentials'
            ? 'That email and password do not match an account.'
            : err.message;
      }
    });

    return el('section', { class: 'screen page' }, [
      el('div', {}, [
        el('button', { type: 'button', class: 'back', text: '‹ Back', onclick: function () { go('open'); } }),
      ]),
      el('div', { class: 'page-head', style: 'margin-top: 8vh' }, [
        el('h1', { class: 'display', text: 'Welcome back.' }),
        el('p', { class: 'quiet', text: 'Your taste profile is waiting where you left it.' }),
      ]),
      form,
    ]);
  }

  function field(id, label, type, autocomplete) {
    return el('div', { class: 'field' }, [
      el('label', { for: id, text: label }),
      el('input', { id: id, type: type, autocomplete: autocomplete, required: true }),
    ]);
  }

  function onboardingScreen() {
    const steps = state.flow.steps;
    const step = steps[state.stepIndex];
    const picked = state.answers[step.id] || [];
    const eitherOr = step.type === 'either_or';
    const count = step.options.length;
    const layout = count === 2 ? 'n2' : count <= 4 ? 'n4' : 'n6';

    const choices = el(
      'div',
      {
        class:
          'choices ' + layout + (picked.length ? ' has-pick' : '') + (state.deciding ? ' deciding' : ''),
      },
      step.options.map(function (option) {
        const on = picked.indexOf(option.id) >= 0;
        return el(
          'button',
          {
            type: 'button',
            class: 'choice' + (state.deciding === option.id ? ' chosen' : ''),
            'data-option': option.id,
            'aria-pressed': on ? 'true' : 'false',
            onclick: function () {
              choose(step, option.id);
            },
          },
          [
            scene(option.image, option.id, option.tags),
            el('div', { class: 'shade' }),
            el('span', { class: 'cap', text: option.label }),
          ],
        );
      }),
    );

    const total = NUMBER_WORDS[steps.length - 1] || String(steps.length);
    return el('section', { class: 'screen ob' }, [
      el('div', { class: 'ob-head' }, [
        el('div', {
          class: 'kicker',
          text: (NUMBER_WORDS[state.stepIndex] || state.stepIndex + 1) + ' of ' + total.toLowerCase(),
        }),
        el('h1', { class: 'display', text: step.title }),
        step.subtitle ? el('p', { class: 'whisper', text: step.subtitle }) : null,
      ]),
      choices,
      el('div', { class: 'ob-foot' }, [
        el('button', {
          type: 'button',
          class: 'linkish',
          text: 'skip',
          onclick: function () {
            delete state.answers[step.id];
            nextStep();
          },
        }),
        eitherOr
          ? el('span', { text: 'tap the one that pulls you' })
          : el('button', {
              type: 'button',
              class: 'primary',
              id: 'btn-next',
              text: state.stepIndex === steps.length - 1 ? 'Show me' : 'Continue',
              disabled: picked.length < (step.minSelect || 1),
              onclick: nextStep,
            }),
      ]),
    ]);
  }

  function choose(step, optionId) {
    const current = state.answers[step.id] || [];
    if (step.type === 'either_or') {
      state.answers[step.id] = [optionId];
      state.deciding = optionId;
      render();
      // A single pick needs no Continue: let the choice register, then move on.
      setTimeout(function () {
        state.deciding = null;
        nextStep();
      }, 650);
      return;
    }
    state.answers[step.id] =
      current.indexOf(optionId) >= 0
        ? current.filter(function (id) {
            return id !== optionId;
          })
        : current.concat([optionId]);
    render();
  }

  async function nextStep() {
    if (state.stepIndex < state.flow.steps.length - 1) {
      state.stepIndex += 1;
      return render();
    }
    const answers = Object.keys(state.answers)
      .filter(function (stepId) {
        return state.answers[stepId].length > 0;
      })
      .map(function (stepId) {
        return { stepId: stepId, selectedOptionIds: state.answers[stepId] };
      });

    if (state.user) {
      writeStore(ONBOARDED_KEY, state.user.id);
    }
    if (answers.length === 0) {
      return go('forming', { sketch: [], sketchTags: [] });
    }
    try {
      const result = await api.submitOnboarding(answers);
      go('forming', {
        sketch: result.sketch || [],
        sketchTags: (result.profile.topTastes || []).map(function (taste) {
          return taste.tag;
        }),
      });
    } catch (error) {
      go('error', { error: error.message });
    }
  }

  function formingScreen() {
    const hasSketch = state.sketch.length > 0;
    return el('section', { class: 'screen' }, [
      el('div', { class: 'centered' }, [
        el('div', { class: 'kicker', text: hasSketch ? "We're getting a sense of you" : 'No rush' }),
        hasSketch
          ? el(
              'div',
              { class: 'words' },
              state.sketch.map(function (word) {
                return el('span', { text: word });
              }),
            )
          : el('h1', { class: 'display', text: "We'll learn as you go." }),
        el('p', {
          class: 'quiet',
          style: 'max-width: 24ch; margin-top: 14px',
          text: hasSketch
            ? "That's a first sketch, rough on purpose. Every place you keep, or pass by, " +
              'sharpens it — and in a few weeks it will know things about you that you never said.'
            : 'Each place you keep, or pass by, teaches Firo a little more about you.',
        }),
        el('p', {
          class: 'whisper',
          style: 'margin-top: 10px',
          text: 'Two small things left, then your first place.',
        }),
        el('button', {
          type: 'button',
          class: 'primary',
          id: 'btn-forming',
          style: 'margin-top: 22px',
          text: 'Continue',
          onclick: function () {
            go('when', { returnTo: null });
          },
        }),
      ]),
    ]);
  }

  function whenScreen() {
    const current = state.rhythm ? state.rhythm.mode : null;
    function option(mode, label, detail) {
      return el(
        'button',
        {
          type: 'button',
          class: 'option',
          'data-mode': mode,
          'aria-pressed': current === mode ? 'true' : 'false',
          onclick: async function () {
            try {
              state.rhythm = await api.setRhythm(mode, TIME_ZONE);
            } catch (error) {
              /* the preference can be set later from World; never block the ritual on it */
            }
            if (state.returnTo === 'world') return showWorld();
            go('keep', { returnTo: null });
          },
        },
        [el('span', { text: label }), el('span', { text: detail })],
      );
    }
    return el('section', { class: 'screen page' }, [
      el('div', { class: 'spacer' }),
      el('div', { class: 'page-head' }, [
        el('h1', { class: 'display', text: 'When should your place arrive?' }),
        el('p', {
          class: 'quiet',
          text:
            'Once a day, one quiet line. Never the name of the place, only a hint of it: ' +
            '“Somewhere cold and quiet, today.” The rest is yours to open when you like.',
        }),
      ]),
      el('div', { class: 'options' }, [
        option('morning', 'With the morning', '7:30'),
        option('evening', 'In the evening', '21:00'),
        option('none', "I'll come by myself", 'no notifications'),
      ]),
      el('p', {
        class: 'whisper',
        text: 'Change it any time. Firo will never send you anything else: no offers, no reminders, no streaks.',
      }),
      el('div', { class: 'spacer' }),
    ]);
  }

  function keepScreen() {
    const error = el('p', { class: 'error', id: 'keep-error' });
    const signInInstead = el('button', {
      type: 'button',
      class: 'linkish',
      hidden: true,
      text: 'Sign in to that account instead',
      onclick: function () {
        go('signin');
      },
    });
    const form = el('form', { class: 'form', novalidate: true }, [
      field('keep-email', 'Email', 'email', 'email'),
      field('keep-password', 'Password (8 or more characters)', 'password', 'new-password'),
      error,
      signInInstead,
      el('div', {}, [el('button', { type: 'submit', class: 'primary solid', text: 'Keep it' })]),
    ]);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      error.textContent = '';
      signInInstead.hidden = true;
      try {
        const result = await api.claim({
          email: document.getElementById('keep-email').value.trim(),
          password: document.getElementById('keep-password').value,
        });
        api.setTokens(result.tokens);
        state.user = result.user;
        if (state.returnTo === 'world') return showWorld();
        await arriveAtFirstPlace();
      } catch (err) {
        if (err.code === 'identity.email_taken') {
          signInInstead.hidden = false;
        }
        const fields = err.details && err.details.fields;
        error.textContent = Array.isArray(fields) && fields.length
          ? fields
              .map(function (f) {
                return f.path === 'password'
                  ? 'The password needs at least 8 characters.'
                  : f.path === 'email'
                    ? 'That email does not look complete.'
                    : f.message;
              })
              .join(' ')
          : err.message;
      }
    });

    return el('section', { class: 'screen' }, [
      el('div', { class: 'linger-pic', style: 'flex-basis: 34%' }, [
        scene(null, 'keep-' + (state.user ? state.user.id : 'x'), state.sketchTags.length ? state.sketchTags : ['cold']),
      ]),
      el('div', { class: 'linger-body', style: 'gap: 14px' }, [
        el('h1', { class: 'display', text: 'Keep your DNA?' }),
        el('p', {
          class: 'quiet',
          text:
            'Everything Firo just learned about you lives only on this phone for now. ' +
            'Add an email and it follows you anywhere, along with every place you keep from today on. ' +
            'Or don’t — it will still be here tomorrow.',
        }),
        form,
        el('button', {
          type: 'button',
          class: 'linkish',
          id: 'btn-not-now',
          text: state.returnTo === 'world' ? 'Not now' : 'Not now — show me my first place',
          onclick: function () {
            if (state.returnTo === 'world') return showWorld();
            arriveAtFirstPlace();
          },
        }),
      ]),
    ]);
  }

  /**
   * The envelope. The place is already on screen, dark and out of focus, and
   * develops under the thumb like a print in a tray: press and hold for 1.2 s,
   * let go early and it sinks back. Double-tap opens too, for anyone who can't
   * hold; with reduced motion a single tap opens; a keyboard opens with Enter.
   */
  function arriveScreen() {
    const today = state.today;
    const experience = today.experience;
    const HOLD_MS = 1200;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const picture = scene(experience.media, experience.id, experience.tags, 'develop');
    const ring = el('div', { class: 'hold', 'aria-hidden': 'true' });
    const copy = el('div', { class: 'centered arrive-copy' }, [
      el('div', { class: 'kicker', text: arrivalLine(today.day) }),
      el('h1', { class: 'display lg', text: today.greeting }),
      el(
        'div',
        { class: 'clues', id: 'clues' },
        (today.clues || []).map(function (clue, index) {
          return el('p', { class: 'clue', style: '--d: ' + (1.4 + index * 1.7) + 's', text: clue });
        }),
      ),
      ring,
      el('p', {
        class: 'whisper clue',
        style: '--d: ' + (1.4 + (today.clues || []).length * 1.7) + 's; margin-top: 22px',
        text: reduced ? 'tap to see where' : 'hold to see where',
      }),
    ]);

    let fill = 0;
    let startedAt = null;
    let frame = null;
    let opened = false;
    let lastTap = 0;

    // --fill lives on the screen itself; the picture, the veil and the ring
    // all read it.
    let section = null;
    function paint(value) {
      fill = Math.max(0, Math.min(1, value));
      if (section) section.style.setProperty('--fill', fill.toFixed(3));
    }

    function open() {
      if (opened) return;
      opened = true;
      cancelAnimationFrame(frame);
      paint(1);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(12);
        } catch (error) {
          /* no haptics here */
        }
      }
      copy.classList.add('dissolve');
      writeStore(ARRIVED_KEY, today.day);
      // The same picture is drawn again by Today, so the hand-off is invisible.
      setTimeout(function () {
        go('today', { reveal: false, enter: true });
      }, 420);
    }

    function tick(now) {
      const progress = (now - startedAt) / HOLD_MS;
      if (progress >= 1) return open();
      paint(progress);
      frame = requestAnimationFrame(tick);
    }

    function down(event) {
      if (opened || reduced) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startedAt = performance.now() - fill * HOLD_MS;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    }

    function up() {
      if (opened || reduced) return;
      cancelAnimationFrame(frame);
      const from = fill;
      const t0 = performance.now();
      (function sink(now) {
        const value = from * (1 - Math.min(1, (now - t0) / 400));
        paint(value);
        if (value > 0) frame = requestAnimationFrame(sink);
      })(t0);
    }

    const area = el('button', {
      type: 'button',
      class: 'tap-area',
      id: 'btn-arrive',
      'aria-label': 'Open today’s place',
      onpointerdown: down,
      onpointerup: up,
      onpointercancel: up,
      onpointerleave: up,
      onclick: function () {
        const now = performance.now();
        if (reduced || now - lastTap < 350) open();
        lastTap = now;
      },
      onkeydown: function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      },
    });
    area.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });

    section = el('section', { class: 'screen arrive', style: '--fill: 0' }, [
      picture,
      el('div', { class: 'veil develop-veil' }),
      copy,
      area,
    ]);
    return section;
  }

  function todayScreen() {
    const today = state.today;
    const experience = today.experience;

    const keep = el('button', {
      type: 'button',
      class: 'keep',
      id: 'btn-keep',
      'aria-pressed': today.kept ? 'true' : 'false',
      'aria-label': today.kept ? 'Kept. Tap to let it go.' : 'Keep this place',
      onclick: async function () {
        const next = !today.kept;
        today.kept = next;
        keep.setAttribute('aria-pressed', String(next));
        label.textContent = next ? 'kept' : 'keep';
        try {
          if (next) {
            await api.keep(experience.id);
            api.signal('save', experience.id, { sessionId: SESSION_ID });
          } else {
            await api.unkeep(experience.id);
            api.signal('unsave', experience.id, { sessionId: SESSION_ID });
          }
        } catch (error) {
          today.kept = !next;
          keep.setAttribute('aria-pressed', String(!next));
          label.textContent = !next ? 'kept' : 'keep';
        }
      },
    });
    const label = el('div', { class: 'keep-label', text: today.kept ? 'kept' : 'keep' });
    keep.addEventListener('click', function () {
      keep.classList.remove('rippling');
      void keep.offsetWidth; // restart the ripple on every tap
      keep.classList.add('rippling');
      if (keep.getAttribute('aria-pressed') === 'true') {
        sendLight(keep);
      }
    });

    const section = el('section', { class: 'screen' + (state.enter ? ' seamless' : '') }, [
      scene(experience.media, experience.id, experience.tags, state.reveal ? 'reveal' : null),
      el('div', { class: 'veil' }),
      el('div', { class: 'topbar' }, [el('span', { text: 'Today' }), el('span', { text: shortDate(today.day) })]),
      keep,
      label,
      el('div', { class: 'today-copy' + (state.enter ? ' enter' : ''), id: 'today-copy' }, [
        el('div', { class: 'kicker', text: placeLine(today.place) }),
        el('h1', { class: 'display', id: 'today-title' }, wordsOf(experience.title)),
        el('p', { class: 'quiet', text: experience.summary }),
        today.reason ? el('p', { class: 'whisper', id: 'today-reason', text: today.reason }) : null,
        el('button', {
          type: 'button',
          class: 'more',
          id: 'btn-more',
          text: 'there’s more to this place ↑',
          onclick: function () {
            showLinger(today, 'today');
          },
        }),
      ]),
      nav('today'),
    ]);
    state.enter = false;

    // Swipe up to linger, the gesture the "read more ↑" points at.
    let startY = null;
    section.addEventListener('touchstart', function (event) {
      startY = event.touches[0].clientY;
    }, { passive: true });
    section.addEventListener('touchend', function (event) {
      if (startY !== null && startY - event.changedTouches[0].clientY > 70) {
        showLinger(today, 'today');
      }
      startY = null;
    });
    return section;
  }

  function lingerScreen() {
    const linger = state.linger;
    const experience = linger.experience;
    const facts = [
      experience.bestSeason ? ['Best in', experience.bestSeason] : null,
      ['Feels like', words(experience.tags)],
      linger.place ? ['Where', placeLine(linger.place)] : null,
    ].filter(Boolean);

    return el('section', { class: 'screen' }, [
      el('div', { class: 'linger-pic' }, [
        scene(experience.media, experience.id, experience.tags),
        el('div', { class: 'topbar' }, [
          el('button', { type: 'button', class: 'back', id: 'btn-back', text: '‹ back', onclick: leaveLinger }),
          el('span', {}),
        ]),
      ]),
      el('div', { class: 'linger-body' }, [
        el('h1', { class: 'display sm', id: 'linger-title', text: experience.title }),
        el('p', { class: 'story', text: experience.story || experience.summary }),
        el(
          'div',
          { class: 'facts' },
          facts.map(function (fact) {
            return el('div', { class: 'fact' }, [el('span', { text: fact[0] }), el('span', { text: fact[1] })]);
          }),
        ),
        linger.from === 'today' && state.today && state.today.tomorrow
          ? el('div', { class: 'tomorrow' }, [
              el('div', { class: 'kicker', text: 'Tomorrow' }),
              el('p', { class: 'display sm', id: 'tomorrow-line', text: state.today.tomorrow }),
            ])
          : null,
        el('p', {
          class: 'whisper',
          text: 'Nothing to book here, on purpose. Just a place worth knowing exists.',
        }),
      ]),
    ]);
  }

  function daysScreen() {
    const view = state.days;
    const month = view.month;
    const currentMonth = view.today.slice(0, 7);
    const byDay = {};
    view.days.forEach(function (cell) {
      byDay[cell.day] = cell;
    });

    const first = new Date(month + '-01T12:00:00Z');
    const offset = (first.getUTCDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();

    const cells = [];
    for (let i = 0; i < offset; i++) {
      cells.push(el('div', { class: 'cell pad' }));
    }
    // Days before the account existed are not "missed"; they are just empty.
    const joined = state.user && state.user.createdAt ? dayIn(state.user.createdAt) : null;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = month + '-' + String(d).padStart(2, '0');
      const cell = byDay[day];
      if (!cell && joined && day < joined) {
        cells.push(el('div', { class: 'cell pad' }));
      } else if (cell) {
        const colour = cell.dominantColor;
        const node = el(
          'button',
          {
            type: 'button',
            class: 'cell' + (cell.kept ? ' kept' : '') + (day === view.today ? ' today-cell' : ''),
            title: cell.title,
            'aria-label': shortDate(day) + ': ' + cell.title + (cell.kept ? ', kept' : ''),
            onclick: function () {
              showLinger(cell.slug, 'days');
            },
          },
          colour ? null : scene(null, cell.experienceId, cell.tags),
        );
        if (colour) {
          node.style.background = colour;
        }
        cells.push(node);
      } else {
        cells.push(el('div', { class: 'cell ' + (day > view.today ? 'future' : 'missed') }));
      }
    }

    // A first month starts at the week the user arrived, not with empty rows.
    while (cells.length >= 7 && cells.slice(0, 7).every(isPad)) {
      cells.splice(0, 7);
    }

    const elapsed = month === currentMonth ? Number(view.today.slice(8, 10)) : daysInMonth;
    const counted = cells.filter(function (node) {
      return !node.classList.contains('pad') && !node.classList.contains('future');
    }).length;
    return el('section', { class: 'screen page' }, [
      el('div', { class: 'page-head' }, [
        el('div', { class: 'kicker', text: 'Your days' }),
        el('h1', { class: 'display', text: 'Your ' + monthName(month) }),
        el('p', {
          class: 'quiet',
          text:
            'Every day you opened Firo, in the colour of the place it gave you. ' +
            'Given enough days, it stops looking like a calendar and starts looking like a portrait.',
        }),
      ]),
      el('div', { class: 'month-nav' }, [
        el('button', {
          type: 'button',
          text: '‹ ' + monthName(shiftMonth(month, -1)),
          onclick: function () {
            showDays(shiftMonth(month, -1));
          },
        }),
        el('button', {
          type: 'button',
          text: monthName(shiftMonth(month, 1)) + ' ›',
          disabled: month >= currentMonth,
          onclick: function () {
            showDays(shiftMonth(month, 1));
          },
        }),
      ]),
      el('div', { class: 'weekdays', 'aria-hidden': 'true' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d) {
        return el('span', { text: d });
      })),
      el(
        'div',
        { class: 'quilt', id: 'quilt' },
        cells.map(function (node, index) {
          node.style.setProperty('--i', index);
          return node;
        }),
      ),
      el('p', {
        class: 'legend',
        text: view.days.length + ' of ' + Math.min(elapsed, counted) + ' days · a dot means kept',
      }),
      el('p', { class: 'insight', id: 'insight', text: view.insight }),
      el('div', { class: 'spacer' }),
      nav('days'),
    ]);
  }

  function isPad(node) {
    return node.classList.contains('pad');
  }

  function worldMap(places) {
    const land = window.WORLD_LAND_PATH || '';
    const pins = places
      .map(function (place, index) {
        const x = ((place.lng + 180) * 2).toFixed(1);
        const y = ((90 - place.lat) * 2).toFixed(1);
        const order = ' style="--i: ' + index + '"';
        return (
          '<circle class="pin-halo" cx="' + x + '" cy="' + y + '" r="12"' + order + '/>' +
          '<circle class="pin" cx="' + x + '" cy="' + y + '" r="4"' + order + '/>'
        );
      })
      .join('');
    // Cropped to the inhabited band (70°N to 56°S) so the pins are not lost in
    // Antarctica and the Arctic ocean.
    return el('div', {
      class: 'map',
      html:
        '<svg viewBox="0 40 720 252" role="img" aria-label="Map of the places you have kept">' +
        '<path class="land" d="' + land + '"/>' + pins + '</svg>',
    });
  }

  function worldScreen() {
    const world = state.world;
    const user = state.user;
    const rhythm = state.rhythm;

    let question = null;
    if (world.surpriseTomorrow) {
      question = el('div', { class: 'question' }, [
        el('p', { class: 'display sm', text: 'Tomorrow will be somewhere different. Sleep well.' }),
        el('div', { class: 'row' }, [
          el('button', {
            type: 'button',
            class: 'linkish',
            text: 'Actually, surprise me another day',
            onclick: async function () {
              await api.setTomorrow(false, null);
              showWorld();
            },
          }),
        ]),
      ]);
    } else if (world.question) {
      question = el('div', { class: 'question' }, [
        el('p', { class: 'display sm', id: 'world-question', text: world.question }),
        el('div', { class: 'row' }, [
          el('button', {
            type: 'button',
            class: 'primary solid',
            id: 'btn-surprise',
            text: 'Yes',
            onclick: async function () {
              await api.setTomorrow(true, world.surpriseToward);
              showWorld();
            },
          }),
        ]),
      ]);
    }

    const rhythmText = !rhythm || rhythm.mode === 'none'
      ? 'Firo sends you nothing. You come by yourself.'
      : 'Your place arrives ' + (rhythm.mode === 'morning' ? 'with the morning' : 'in the evening') +
        (rhythm.notifyAt ? ', at ' + rhythm.notifyAt : '') + '.';

    return el('section', { class: 'screen page' }, [
      el('div', { class: 'page-head' }, [
        el('div', { class: 'kicker', text: 'Your world' }),
        el('h1', { class: 'display', id: 'world-headline', text: world.headline }),
        el('p', { class: 'quiet', text: world.detail }),
      ]),
      worldMap(world.places),
      world.places.length
        ? el(
            'div',
            { class: 'facts', style: 'border-top: 0; padding-top: 0' },
            world.places.map(function (place) {
              return el(
                'button',
                {
                  type: 'button',
                  class: 'fact',
                  style: 'text-align: left',
                  onclick: function () {
                    showLinger(place.slug, 'world');
                  },
                },
                [el('span', { text: place.title }), el('span', { class: 'quiet', text: place.placeName || '' })],
              );
            }),
          )
        : null,
      question,
      world.hint ? el('p', { class: 'whisper', id: 'world-hint', text: world.hint }) : null,
      el('div', { class: 'settings' }, [
        el('div', {}, [
          rhythmText + ' ',
          el('button', {
            type: 'button',
            text: 'Change',
            onclick: function () {
              go('when', { returnTo: 'world' });
            },
          }),
        ]),
        user && user.isGuest
          ? el('div', {}, [
              'Everything Firo knows about you lives only on this phone. ',
              el('button', {
                type: 'button',
                id: 'btn-keep-dna',
                text: 'Keep it',
                onclick: function () {
                  go('keep', { returnTo: 'world' });
                },
              }),
            ])
          : el('div', {}, [
              'Signed in as ' + (user ? user.email || '@' + user.handle : '') + '. ',
              el('button', {
                type: 'button',
                text: 'Sign out',
                onclick: async function () {
                  await api.logout();
                  state.user = null;
                  go('open');
                },
              }),
            ]),
      ]),
      el('div', { class: 'spacer' }),
      nav('world'),
    ]);
  }

  function emptyScreen() {
    return el('section', { class: 'screen' }, [
      el('div', { class: 'centered' }, [
        el('h1', { class: 'display', text: 'Nothing to show yet.' }),
        el('p', { class: 'quiet', text: 'The catalogue is empty. Publish a place from the console, then come back.' }),
      ]),
    ]);
  }

  function errorScreen() {
    return el('section', { class: 'screen' }, [
      el('div', { class: 'centered' }, [
        el('h1', { class: 'display sm', text: 'Something went quiet.' }),
        el('p', { class: 'quiet', text: state.error || 'Firo could not load just now.' }),
        el('button', { type: 'button', class: 'primary', text: 'Try again', onclick: boot }),
      ]),
    ]);
  }

  render();
  boot();
})();
