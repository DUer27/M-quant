# Model Explanation Implementation Plan

> **For agentic workers:** Use native execution in this session, with independent review before completion. The user approved the recommended design and requested a working preview.

**Goal:** Move long mathematical explanations out of operational pages into a contextual, read-only model explanation workspace.

**Architecture:** Keep the existing native ES modules, shared MathML renderers and return-mapping API. A pure explanation renderer selects either draft parameters or the actual frozen model configuration; the existing controller owns navigation and state refresh.

**Tech Stack:** JavaScript ES modules, semantic HTML, existing CSS variables, native MathML, Node test runner, Python unittest, DOM integration checks and browser inspection.

**Spec:** The approved recommendation in this conversation: independent explanation page, contextual entry points, original configuration remains editable in the backtest page, plain-language introduction followed by optional formulas and symbol definitions.

## Global Constraints

- Preserve the `cc` repository and `v1.1` baseline; implement in the running M-quant checkout.
- Do not change statistical algorithms, service endpoints or persisted model parameters.
- Main factor detail defaults to existing research evidence and retains data warnings.
- Mapping, portfolio and attribution retain operations and outputs, with lightweight explanation entry points.
- Never silently substitute draft settings for frozen model settings.
- An unbound registered factor must not inherit another factor's coefficient.
- No new framework or runtime dependency; no GitHub push or merge.

## Review Focus

- Open, navigate and return without losing the original scroll position or unsaved form values.
- Draft edits and stale reports remain clearly distinguished in both operational and explanation views.
- An unavailable schema/report produces a useful empty state without invented model results.
- Formula content and symbol descriptions remain paired and confined to the explanation view.
- Keyboard focus, unique IDs, responsive layout and escaped external names remain intact.

## Tasks

- [x] Add behavior tests for frozen/draft selection, missing snapshots, unbound factors, escaping and selected-parameter formulas; run them before implementation.
- [x] Add the independent navigation/view shell, responsive directory and lightweight source-page links.
- [x] Implement the pure explanation renderer and controller navigation/return-state integration.
- [x] Restore factor evidence as the default and remove long formula injection from operational pages.
- [x] Run the existing Node/Python suites, syntax checks, DOM navigation/dirty-state checks and browser visual inspection.
- [x] Obtain independent code review, fix material findings and document the working preview.
