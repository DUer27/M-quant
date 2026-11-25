import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../platform/quant-factor-platform/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../platform/quant-factor-platform/assets/app.js', import.meta.url), 'utf8');
const mapping = readFileSync(new URL('../platform/quant-factor-platform/assets/return-mapping.js', import.meta.url), 'utf8');

function nodeFromTag(tag) {
  const attributes = Object.fromEntries([...tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
  const classes = new Set((attributes.class || '').split(/\s+/));
  return {
    id: attributes.id,
    dataset: Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])),
    hidden: 'hidden' in attributes,
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    },
    setAttribute: (name, value) => { attributes[name] = value; },
    getAttribute: (name) => attributes[name],
  };
}

function declaration(source, name) {
  return source.match(new RegExp(`^function ${name}\\(.*?^\\}`, 'ms'))[0];
}

function navigation() {
  const elements = {
    views: [...html.matchAll(/<div\b[^>]*\bid="[^"]+-view"[^>]*>/g)].map(([tag]) => nodeFromTag(tag)),
    navButtons: [...html.matchAll(/<button\b[^>]*\bdata-view-target="[^"]+"[^>]*>/g)].map(([tag]) => nodeFromTag(tag)),
    subnavButtons: [...html.matchAll(/<button\b[^>]*\bdata-subview-target="[^"]+"[^>]*>/g)].map(([tag]) => nodeFromTag(tag)),
    subnavs: [...html.matchAll(/<div\b[^>]*\bdata-view-subnav="[^"]+"[^>]*>/g)].map(([tag]) => nodeFromTag(tag)),
  };
  const document = {
    activeElement: elements.navButtons.find((button) => button.dataset.viewTarget === 'model-explanation'),
    querySelector: (selector) => {
      if (selector === '.view.active') return elements.views.find((view) => view.classList.contains('active'));
      const target = selector.match(/^\[data-(view|subview)-target="([^"]+)"\]$/);
      return target?.[1] === 'view'
        ? elements.navButtons.find((button) => button.dataset.viewTarget === target[2])
        : elements.subnavButtons.find((button) => button.dataset.subviewTarget === target?.[2]);
    },
  };
  const context = { elements, document, window: { scrollX: 0, scrollY: 900 } };
  // Exercise the existing navigation and origin capture against the page's real controls.
  runInNewContext([
    app.match(/^const viewGroups = \{.*?^\};/ms)[0],
    app.match(/^const activeGroupViews = \{.*?^\};/ms)[0],
    declaration(app, 'groupForView'), declaration(app, 'showView'),
    'const state = {};', declaration(mapping, 'rememberExplanationOrigin'), declaration(mapping, 'jump'),
    'globalThis.controls = { state, showView, rememberExplanationOrigin, jump };',
  ].join('\n'), context);
  for (const button of [...elements.navButtons, ...elements.subnavButtons]) {
    button.click = () => context.controls.showView(button.dataset.viewTarget || button.dataset.subviewTarget);
  }
  return { elements, ...context.controls };
}

function activeViews(elements) {
  return elements.views.filter((view) => view.classList.contains('active')).map((view) => view.id);
}

function assertResearchNavigation(elements) {
  assert.deepEqual(activeViews(elements), ['research-agent-view']);
  assert.equal(elements.navButtons.find((button) => button.dataset.viewTarget === 'research-strategy').classList.contains('active'), true);
  assert.equal(elements.subnavs.find((subnav) => subnav.dataset.viewSubnav === 'research-strategy').hidden, false);
  assert.equal(elements.subnavButtons.find((button) => button.dataset.subviewTarget === 'research-agent').getAttribute('aria-selected'), 'true');
}

test('the first page displays only the research agent', () => {
  assertResearchNavigation(navigation().elements);
});

test('the research group opens the research agent before another subpage is selected', () => {
  const { elements, jump } = navigation();
  jump('dashboard');
  jump('research-strategy');
  assertResearchNavigation(elements);
});

test('returning from explanation retains the research agent and its navigation group', () => {
  const { elements, state, rememberExplanationOrigin, jump } = navigation();
  rememberExplanationOrigin();
  jump('model-explanation');
  assert.deepEqual(activeViews(elements), ['model-explanation-view']);
  jump(state.explanationOrigin.view);
  assertResearchNavigation(elements);
  assert.equal(state.explanationOrigin.y, 900);
});
