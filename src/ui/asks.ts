// A team lead's call, as a card: their face, the problem, two choices (each saying what
// it does) and a clock. It shows wherever you are (at war, at your computer, on your
// floor), since they're messaging you.

import { setFill } from './fill';
import { ASKS, TEAMS } from '../sim/content';
import { co } from './co';
import { answerAsk, askById, askerName, describe } from '../sim/asks';
import type { GameState } from '../sim/state';
import { portraitSvg } from './portraits';

const esc = (text: string) =>
  co(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface AskHooks {
  say(text: string): void;
  bump(which: 'bands' | 'salary'): void;
  sound: { notify(): void; stamp(): void };
}

export class AskCard {
  private root: HTMLElement;
  private shownFor = '';

  constructor(
    private get: () => GameState,
    private hooks: AskHooks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ask-card';
    this.root.id = 'ask-card';
    this.root.hidden = true;
    this.root.setAttribute('role', 'alertdialog');
    this.root.setAttribute('aria-labelledby', 'ask-who');
    this.root.setAttribute('aria-describedby', 'ask-text');
    document.getElementById('app')!.append(this.root);
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-choice]');
      if (!b) return;
      const s = this.get();
      const salary = s.salary;
      const r = answerAsk(s, Number(b.dataset.choice) as 0 | 1);
      if (!r.ok) return;
      this.hooks.sound.stamp();
      this.hooks.say(r.text);
      if (s.salary !== salary) this.hooks.bump('salary');
    });
  }

  render() {
    const s = this.get();
    const cur = s.asks?.current;
    const ask = cur && askById(cur.id);
    if (!cur || !ask) {
      if (!this.root.hidden) this.root.hidden = true;
      this.shownFor = '';
      return;
    }
    const key = `${cur.id}:${cur.until}`;
    if (key !== this.shownFor) {
      this.shownFor = key;
      const team = TEAMS.find((t) => t.id === ask.team)!;
      this.root.innerHTML = `
        <span class="ask-face">${portraitSvg(team.portrait, 'idle')}</span>
        <div class="ask-body">
          <p class="ask-who" id="ask-who"><b>${esc(askerName(s, ask.team))}</b> <small>${esc(team.title)}</small></p>
          <p class="ask-text" id="ask-text">${esc(ask.text)}</p>
          <div class="ask-choices">${ask.choices
            .map(
              (c, i) => `<button type="button" class="ask-choice" data-choice="${i}">
                <b>${esc(c.label)}</b><small>${esc(describe(s, ask, c).join(' · '))}</small></button>`,
            )
            .join('')}</div>
          <div class="psst-clock ask-clock" aria-hidden="true"><span></span></div>
        </div>`;
      this.root.hidden = false;
      this.hooks.sound.notify();
    }
    const fill = this.root.querySelector<HTMLElement>('.ask-clock span');
    setFill(fill, (cur.until - s.time) / ASKS.seconds);
  }
}
