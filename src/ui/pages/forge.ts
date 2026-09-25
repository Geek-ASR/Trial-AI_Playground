import type { Page } from '../../main';
import { forgeView } from '../components/forgeView';
import { h } from '../dom';

export function forgePage(): Page {
  const forge = forgeView();
  const el = h('div', { class: 'page' },
    forge.el,
    h('p', { class: 'muted small' }, 'Tip: in the 3D world, walk to the ⚒ crystal in Neural Peaks to see the boundary painted onto the display pad as you train.'),
  );
  return { el, title: 'Neural Forge', destroy: forge.destroy };
}
