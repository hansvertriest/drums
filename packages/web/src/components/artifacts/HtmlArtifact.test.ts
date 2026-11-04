import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HtmlArtifact from './renderers/HtmlArtifact.vue';

const props = { content: '<p id="x">hello</p>', answers: [], readOnly: false, changes: false };

describe('HtmlArtifact', () => {
  it('renders in an iframe that may only run scripts', () => {
    const iframe = mount(HtmlArtifact, { props }).get('iframe');
    expect(iframe.attributes('sandbox')).toBe('allow-scripts');
    expect(iframe.attributes('sandbox')).not.toContain('allow-same-origin');
  });

  it('never puts the artifact in the page itself', () => {
    const wrapper = mount(HtmlArtifact, { props, attachTo: document.body });
    expect(document.querySelector('#x')).toBeNull();
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain('<p id="x">hello</p>');
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain('Content-Security-Policy');
    wrapper.unmount();
  });

  it('takes answers only from its own frame', async () => {
    const wrapper = mount(HtmlArtifact, { props, attachTo: document.body });
    const answers = [{ name: 'q', label: 'Q', value: 'x' }];
    const data = { source: 'drums-artifact', type: 'answers', answers };

    window.dispatchEvent(new MessageEvent('message', { data, source: window as never }));
    expect(wrapper.emitted('answers')).toBeUndefined();

    const own = wrapper.get('iframe').element.contentWindow as never;
    window.dispatchEvent(new MessageEvent('message', { data: { ...data, answers: 'junk' }, source: own }));
    expect(wrapper.emitted('answers')).toBeUndefined();

    window.dispatchEvent(new MessageEvent('message', { data, source: own }));
    expect(wrapper.emitted('answers')).toEqual([[answers]]);
    wrapper.unmount();
  });

  it('ignores answers on a read-only version', () => {
    const wrapper = mount(HtmlArtifact, { props: { ...props, readOnly: true }, attachTo: document.body });
    const own = wrapper.get('iframe').element.contentWindow as never;
    const data = { source: 'drums-artifact', type: 'answers', answers: [] };
    window.dispatchEvent(new MessageEvent('message', { data, source: own }));
    expect(wrapper.emitted('answers')).toBeUndefined();
    wrapper.unmount();
  });
});
