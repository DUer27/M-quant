import { mountMarketDataPanel } from './market-data.js';
import { mountIntradayTrial } from './intraday-trial.js';
import { mountStockLibrary } from './stock-library.js';

export function mountDataCollectionCenter({ mountDaily = mountMarketDataPanel, mountIntraday = mountIntradayTrial } = {}) {
  const root = document.querySelector('#data-collection-view');
  if (!root) return;
  const buttons = [...root.querySelectorAll('[data-collection-target]')];
  const panes = [...root.querySelectorAll('[data-collection-pane]')];
  const intradayPanel = root.querySelector('#intraday-trial-panel');
  let selected = 'monitor';
  const visible = () => !document.hidden && root.classList.contains('active');
  const daily = mountDaily({ isVisible: () => visible() && selected === 'daily' });
  const stocks=mountStockLibrary({isVisible:()=>visible()&&selected==='stocks'});
  const intraday = mountIntraday({ isVisible: () => visible() && !['daily','stocks'].includes(selected),
    isChartVisible: () => visible() && selected === 'charts', isQualityVisible:()=>visible()&&selected==='quality' });

  function refresh() {
    if (!visible()) return;
    if (selected === 'daily') daily?.refresh();
    else if(selected==='stocks')stocks?.refresh();
    else intraday?.refresh();
  }
  function select(name) {
    if (!buttons.some((button) => button.dataset.collectionTarget === name)) return;
    selected = name;
    for (const button of buttons) {
      const active = button.dataset.collectionTarget === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const pane of panes) pane.hidden = pane.dataset.collectionPane !== name;
    intradayPanel.hidden = ['daily','stocks'].includes(name);
    refresh();
  }
  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => select(button.dataset.collectionTarget));
    button.addEventListener('keydown', (event) => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') target = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = buttons.length - 1;
      if (target === undefined) return;
      event.preventDefault(); buttons[target].focus(); select(buttons[target].dataset.collectionTarget);
    });
  }
  window.addEventListener('platform:viewchange', refresh);
  document.addEventListener('visibilitychange', refresh);
  select(selected);
  return { select, refresh };
}
