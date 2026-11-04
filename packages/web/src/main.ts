import { tokensCss } from '@drums/artifact-kit';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './styles/base.css';

function boot(): void {
  const tokens = document.createElement('style');
  tokens.textContent = tokensCss;
  document.head.prepend(tokens);
  createApp(App).use(createPinia()).mount('#app');
}

boot();
