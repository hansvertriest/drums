import { tokensCss } from '@drums/artifact-kit';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { useUi } from './stores/ui';
import { useWorkspaces } from './stores/workspaces';
import './styles/base.css';

function boot(): void {
  const tokens = document.createElement('style');
  tokens.textContent = tokensCss;
  document.head.prepend(tokens);
  const app = createApp(App).use(createPinia());
  app.mount('#app');
  void useWorkspaces().boot().catch(useUi().report);
}

boot();
