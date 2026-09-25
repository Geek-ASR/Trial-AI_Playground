import type { Page } from '../../main';
import { h } from '../dom';

export function aboutPage(): Page {
  const el = h('div', { class: 'page narrow prose-page' },
    h('header', { class: 'page-head' },
      h('h1', null, 'About NeuralCraft'),
      h('p', { class: 'lead' }, 'A free, open-source playground for learning AI by building it — created by Aditya Rekhe.'),
    ),
    h('section', { class: 'prose' },
      h('h2', null, 'The idea'),
      h('p', null, 'Machine learning is made of small, understandable pieces: dot products, averages, gradients, softmax, attention. NeuralCraft turns each piece into a place you can walk to, a few lines of code you write yourself, and a structure that gets built in front of you. Curiosity does the rest.'),
      h('h2', null, 'Principles'),
      h('ul', null,
        h('li', null, h('b', null, 'Free forever.'), ' Every lesson, every feature.'),
        h('li', null, h('b', null, 'No sign-in, no tracking.'), ' Progress is stored in your browser’s local storage. Nothing is sent to a server — there is no server.'),
        h('li', null, h('b', null, 'Real code.'), ' Python runs locally through WebAssembly (Pyodide); JavaScript runs in a sandboxed Web Worker.'),
        h('li', null, h('b', null, 'From scratch.'), ' Implement the ideas before you import them.'),
      ),
      h('h2', null, 'Controls'),
      h('table', { class: 'controls' },
        h('tbody', null,
          row('W A S D / arrows', 'Move'), row('Mouse', 'Look (click the world to capture the mouse)'), row('Space', 'Jump · double-tap to fly'),
          row('Shift', 'Sprint · descend while flying'), row('F', 'Toggle flying'), row('E', 'Open the nearest lesson or lab console'),
          row('Left / right click', 'Break / place block'), row('1–9 · scroll', 'Choose a block'), row('B', 'Code Builder'), row('M', 'Map, labs & teleport'), row('G', 'Nova guides you to your next lesson'), row('V', 'First / third person'), row('P', 'Photo mode'), row('H', 'Back to the Hub'), row('Esc', 'Release the mouse / close panels'),
        ),
      ),
      h('h2', null, 'Your data'),
      h('p', null, 'XP, badges, your code and your world edits are saved in this browser only. Use the buttons on the ', h('a', { href: '#/learn' }, 'Learn page'), ' to export your progress to a file, import it on another device, or reset it.'),
      h('h2', null, 'Open source'),
      h('p', null, 'The whole project — engine, curriculum, blog and roadmap — is on GitHub. Ideas, bug reports and new lessons are welcome.'),
      h('p', null, h('a', { class: 'btn', href: 'https://github.com/Geek-ASR/Trial-AI_Playground', target: '_blank', rel: 'noopener' }, 'View on GitHub')),
      h('h2', null, 'Author'),
      h('p', null, 'NeuralCraft is designed, written and maintained by ', h('a', { href: 'https://github.com/Geek-ASR', target: '_blank', rel: 'noopener' }, 'Aditya Rekhe'), ' (Pune, India).'),
    ),
  );
  return { el, title: 'About' };
}

function row(k: string, v: string) {
  return h('tr', null, h('th', null, h('kbd', null, k)), h('td', null, v));
}
