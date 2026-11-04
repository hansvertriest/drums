import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import App from './App.vue';

const shell = () => mount(App, { global: { plugins: [createPinia()] } });

describe('App', () => {
  it('shows the header with the logo and a disabled Send', () => {
    const header = shell().get('header');
    expect(header.get('[aria-label="drums"]').text()).toBe('d');
    expect(header.get('button').text()).toContain('Send');
    expect(header.get('button').attributes('disabled')).toBeDefined();
  });

  it('shows the strip with New workspace', () => {
    expect(shell().get('aside').text()).toContain('New workspace');
  });

  it('shows an empty stage', () => {
    expect(shell().get('main').text()).toContain('Nothing here yet');
  });
});
