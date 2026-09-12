/**
 * The end-to-end journey: welcome -> sign up -> onboarding -> DNA -> feed.
 *
 * Deliberately a small state machine with no framework, because the point of
 * this client is to prove the backend flow works, not to be the final app.
 * The premium UI is the last phase of the project.
 */
(function () {
  'use strict';

  const api = window.firoApi;
  const app = document.getElementById('app');
  const apiStatus = document.getElementById('api-status');
  const stepLabel = document.getElementById('step-label');

  // A session id lets the backend apply short-term "right now" intent on top of
  // long-term taste.
  const sessionId = 'web-' + Math.random().toString(36).slice(2, 10);

  const state = {
    screen: 'welcome',
    flow: null,
    stepIndex: 0,
    answers: {},
    profile: null,
    feed: [],
    user: null,
    error: null,
    busy: false,
    // Saved ids live in state rather than being written onto the button, because
    // every setState re-renders and would discard a directly mutated node.
    savedIds: [],
  };

  // --- helpers ---------------------------------------------------------------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(function (entry) {
      const key = entry[0];
      const value = entry[1];
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  async function guard(fn) {
    if (state.busy) return;
    setState({ busy: true, error: null });
    try {
      await fn();
    } catch (error) {
      const message =
        error && error.code === 'network.unreachable'
          ? 'Cannot reach the Firo API. Is the backend running?'
          : (error && error.message) || 'Something went wrong.';
      setState({ error: message });
    } finally {
      setState({ busy: false });
    }
  }

  function errorBanner() {
    if (!state.error) return null;
    return el('div', { class: 'error', text: state.error, role: 'alert' });
  }

  // --- screens ---------------------------------------------------------------

  function welcomeScreen() {
    return el('section', { class: 'screen welcome' }, [
      el('h1', { class: 'wordmark', text: 'Firo' }),
      el('p', {
        class: 'tagline',
        text: 'Discover places that feel made for you.',
      }),
      el('p', { class: 'muted', text: 'Inspire first. Plan second. Book last.' }),
      errorBanner(),
      el('button', {
        class: 'primary',
        id: 'btn-start',
        text: 'Get started',
        onclick: function () {
          setState({ screen: 'signup' });
        },
      }),
    ]);
  }

  function signupScreen() {
    // A throwaway identity keeps the demo one click long while still exercising
    // the real registration endpoint.
    const suffix = Math.random().toString(36).slice(2, 8);
    const emailInput = el('input', {
      id: 'email',
      type: 'email',
      value: 'explorer_' + suffix + '@firo.app',
      autocomplete: 'email',
    });
    const handleInput = el('input', {
      id: 'handle',
      type: 'text',
      value: 'explorer_' + suffix,
      autocomplete: 'username',
    });
    const passwordInput = el('input', {
      id: 'password',
      type: 'password',
      value: 'sup3r-secret-pw',
      autocomplete: 'new-password',
    });

    function submit() {
      guard(async function () {
        const result = await api.register({
          email: emailInput.value.trim(),
          handle: handleInput.value.trim(),
          password: passwordInput.value,
        });
        api.setTokens(result.tokens);
        const flow = await api.onboardingFlow();
        setState({ user: result.user, flow: flow, stepIndex: 0, answers: {}, screen: 'onboarding' });
      });
    }

    return el('section', { class: 'screen' }, [
      el('h2', { text: 'Create your account' }),
      el('p', { class: 'muted', text: 'Pre-filled so you can move straight through.' }),
      errorBanner(),
      el('label', { text: 'Email', for: 'email' }),
      emailInput,
      el('label', { text: 'Handle', for: 'handle' }),
      handleInput,
      el('label', { text: 'Password', for: 'password' }),
      passwordInput,
      el('button', {
        class: 'primary',
        id: 'btn-signup',
        text: state.busy ? 'Creating…' : 'Continue',
        onclick: submit,
      }),
    ]);
  }

  function onboardingScreen() {
    const step = state.flow.steps[state.stepIndex];
    const selected = state.answers[step.id] || [];
    const isLast = state.stepIndex === state.flow.steps.length - 1;
    const canContinue = selected.length >= step.minSelect;

    function toggle(optionId) {
      const current = state.answers[step.id] || [];
      let next;
      if (step.type === 'either_or') {
        next = [optionId]; // a forced choice replaces rather than accumulates
      } else if (current.indexOf(optionId) >= 0) {
        next = current.filter(function (id) {
          return id !== optionId;
        });
      } else {
        next = current.concat([optionId]);
      }
      const answers = Object.assign({}, state.answers);
      answers[step.id] = next;
      setState({ answers: answers });
    }

    function next() {
      if (!canContinue) return;
      if (!isLast) {
        setState({ stepIndex: state.stepIndex + 1 });
        return;
      }
      guard(async function () {
        const answers = state.flow.steps
          .filter(function (s) {
            return (state.answers[s.id] || []).length > 0;
          })
          .map(function (s) {
            return { stepId: s.id, selectedOptionIds: state.answers[s.id] };
          });
        const result = await api.submitOnboarding(answers);
        const feed = await api.feed(12, sessionId);
        setState({ profile: result.profile, feed: feed, screen: 'profile' });
      });
    }

    const cards = step.options.map(function (option) {
      const isOn = selected.indexOf(option.id) >= 0;
      return el(
        'button',
        {
          class: 'option' + (isOn ? ' selected' : ''),
          'data-option': option.id,
          'aria-pressed': isOn ? 'true' : 'false',
          onclick: function () {
            toggle(option.id);
          },
        },
        [
          el('span', { class: 'swatch', style: 'background:' + option.dominantColor }),
          el('span', { class: 'option-label', text: option.label }),
        ],
      );
    });

    return el('section', { class: 'screen' }, [
      el('div', {
        class: 'progress',
        text: 'Step ' + (state.stepIndex + 1) + ' of ' + state.flow.steps.length,
      }),
      el('h2', { text: step.title }),
      step.subtitle ? el('p', { class: 'muted', text: step.subtitle }) : null,
      errorBanner(),
      el('div', { class: 'options' }, cards),
      el('button', {
        class: 'primary',
        id: 'btn-next',
        text: state.busy ? 'Saving…' : isLast ? 'Show me' : 'Continue',
        disabled: canContinue ? null : 'disabled',
        onclick: next,
      }),
    ]);
  }

  function profileScreen() {
    const profile = state.profile;
    const pct = Math.round((profile.completeness || 0) * 100);

    const bars = (profile.topTastes || []).map(function (taste) {
      return el('div', { class: 'taste' }, [
        el('span', { class: 'taste-name', text: taste.tag }),
        el('span', { class: 'bar' }, [
          el('span', {
            class: 'bar-fill',
            style: 'width:' + Math.round(Math.max(0, taste.score) * 100) + '%',
          }),
        ]),
        el('span', { class: 'taste-score', text: taste.score.toFixed(2) }),
      ]);
    });

    return el('section', { class: 'screen' }, [
      el('h2', { text: 'This is your Explorer DNA' }),
      el('p', { class: 'muted', text: 'Built from what you just picked. It keeps learning as you explore.' }),
      el('div', { class: 'completeness', id: 'completeness', text: pct + '% complete' }),
      errorBanner(),
      el('div', { class: 'tastes' }, bars.length ? bars : [el('p', { class: 'muted', text: 'Still learning…' })]),
      el('button', {
        class: 'primary',
        id: 'btn-feed',
        text: 'See what we found for you',
        onclick: function () {
          setState({ screen: 'feed' });
        },
      }),
    ]);
  }

  function feedScreen() {
    const cards = state.feed.map(function (item) {
      const exp = item.experience;
      return el('article', { class: 'card', 'data-experience': exp.id }, [
        el('div', { class: 'card-media', style: 'background:' + (exp.media[0] ? exp.media[0].dominantColor : '#333') }, [
          item.isWildcard ? el('span', { class: 'badge', text: 'a little different' }) : null,
        ]),
        el('div', { class: 'card-body' }, [
          el('h3', { text: exp.title }),
          el('p', { class: 'muted', text: exp.summary }),
          item.reason ? el('p', { class: 'reason', text: item.reason }) : null,
          el('div', { class: 'tags', text: exp.tags.slice(0, 4).join(' · ') }),
          (function () {
            const isSaved = state.savedIds.indexOf(exp.id) >= 0;
            return el('button', {
              class: 'secondary save-btn' + (isSaved ? ' saved' : ''),
              'data-save': exp.id,
              text: isSaved ? 'Saved ✓' : 'Save',
              disabled: isSaved ? 'disabled' : null,
              onclick: function () {
                guard(async function () {
                  await api.save(exp.id);
                  // Saving is also the strongest taste signal we have.
                  await api.signal('save', exp.id, { sessionId: sessionId });
                  setState({ savedIds: state.savedIds.concat([exp.id]) });
                });
              },
            });
          })(),
        ]),
      ]);
    });

    return el('section', { class: 'screen' }, [
      el('h2', { text: 'Made for you' }),
      errorBanner(),
      el('div', { class: 'feed', id: 'feed' }, cards),
      el('button', {
        class: 'secondary',
        id: 'btn-refresh',
        text: 'Refresh feed',
        onclick: function () {
          guard(async function () {
            const feed = await api.feed(12, sessionId);
            setState({ feed: feed });
          });
        },
      }),
    ]);
  }

  // --- render ----------------------------------------------------------------

  function render() {
    const screens = {
      welcome: welcomeScreen,
      signup: signupScreen,
      onboarding: onboardingScreen,
      profile: profileScreen,
      feed: feedScreen,
    };
    app.innerHTML = '';
    app.appendChild(screens[state.screen]());
    stepLabel.textContent = state.screen;
  }

  // --- boot ------------------------------------------------------------------

  (async function boot() {
    render();
    try {
      const health = await api.health();
      apiStatus.textContent = 'API ' + health.status + ' · v' + health.version + ' · ' + health.env;
      apiStatus.className = 'status ok';
    } catch (error) {
      apiStatus.textContent = 'API unreachable at ' + api.baseUrl;
      apiStatus.className = 'status bad';
    }
  })();
})();
