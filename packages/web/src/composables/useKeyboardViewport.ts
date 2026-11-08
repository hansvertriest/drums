import { onBeforeUnmount, onMounted } from 'vue';
import { useUi } from '../stores/ui';

/** Less than this is browser chrome, not a keyboard. */
const KEYBOARD_MIN_PX = 120;

/**
 * iPhone keeps the page at full height under the keyboard, so the composer would end up behind it.
 * While the keyboard is up, the app takes the height that is still visible.
 */
export function useKeyboardViewport(): void {
  const ui = useUi();

  const update = () => {
    const viewport = window.visualViewport;
    // Pinch zoom shrinks the visual viewport too.
    if (!viewport || viewport.scale > 1.01) return;
    const up = window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
    ui.keyboardHeight = up ? Math.round(viewport.height) : undefined;
    if (up) window.scrollTo(0, 0);
  };

  onMounted(() => {
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
  });
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
  });
}
