// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeScript } from './index.js';

/** Stands in for the app: the bridge's `window.parent` in the test is a fake with `postMessage`. */
function boot(html: string) {
  const posted: Array<Record<string, unknown>> = [];
  const host = { postMessage: vi.fn((m: Record<string, unknown>) => posted.push(m)) };
  vi.stubGlobal('parent', host);
  document.body.innerHTML = html;
  new Function(bridgeScript)();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const fromHost = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: host as never }));
  const change = (name: string, value: string) => {
    const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const lastAnswers = () => posted.filter((m) => m.type === 'answers').at(-1)?.answers;
  return { posted, fromHost, change, lastAnswers };
}

beforeEach(() => {
  document.documentElement.className = '';
});

describe('the bridge script', () => {
  it('says ready once the document is loaded', () => {
    expect(boot('').posted).toEqual([{ type: 'ready', source: 'drums-artifact' }]);
  });

  it('reports only changed values, with the data-label of the container', () => {
    const { change, lastAnswers } = boot(
      `<div data-label="Provider"><input name="psp" value="Adyen"></div><input name="other" value="same">`,
    );
    change('psp', 'Stripe');
    expect(lastAnswers()).toEqual([{ name: 'psp', label: 'Provider', value: 'Stripe' }]);
    change('psp', 'Adyen');
    expect(lastAnswers()).toEqual([]);
  });

  it('restores saved answers and locks read-only versions', () => {
    const { fromHost, posted } = boot(`<input name="psp" value="Adyen">`);
    fromHost({ source: 'drums-host', type: 'init', answers: [{ name: 'psp', value: 'Stripe' }], readOnly: true, changes: false });
    const input = document.querySelector('input')!;
    expect(input.value).toBe('Stripe');
    expect(input.disabled).toBe(true);
    expect(posted.filter((m) => m.type === 'answers')).toEqual([]);
  });

  it('drops a restored answer whose control is gone from this version', () => {
    const { fromHost, lastAnswers } = boot(`<input name="psp" value="Adyen">`);
    fromHost({ source: 'drums-host', type: 'init', answers: [{ name: 'gone', value: 'x' }], readOnly: false, changes: false });
    expect(lastAnswers()).toEqual([]);
  });

  it('switches change highlighting on and off', () => {
    const { fromHost } = boot('');
    fromHost({ source: 'drums-host', type: 'changes', on: true });
    expect(document.documentElement.classList.contains('chg-on')).toBe(true);
    fromHost({ source: 'drums-host', type: 'changes', on: false });
    expect(document.documentElement.classList.contains('chg-on')).toBe(false);
  });

  it('keeps links from taking the frame away, but not in-page anchors', () => {
    boot('<a id="out" href="https://example.com">x</a><a id="in" href="#s">y</a>');
    const click = (id: string) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      document.getElementById(id)!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click('out')).toBe(true);
    expect(click('in')).toBe(false);
  });

  it('ignores messages from anyone but the app', () => {
    const { posted } = boot('');
    window.dispatchEvent(
      new MessageEvent('message', { data: { source: 'drums-host', type: 'changes', on: true }, source: window as never }),
    );
    expect(document.documentElement.classList.contains('chg-on')).toBe(false);
    expect(posted).toHaveLength(1);
  });
});
