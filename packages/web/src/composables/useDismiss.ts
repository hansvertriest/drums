import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * Closes a panel on Esc and on a click outside it. `trigger` selects what opens it: that toggles
 * by itself. A click inside an artifact never reaches this page, so focus entering a frame counts too.
 */
export function useDismiss(panel: Ref<HTMLElement | undefined>, trigger: string, close: () => void): void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Element && (panel.value?.contains(target) || target.closest(trigger))) return;
    close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  /** The frame only becomes the active element once the blur is over. */
  const onBlur = () =>
    setTimeout(() => {
      if (document.activeElement instanceof HTMLIFrameElement) close();
    });

  onMounted(() => {
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
  });
  onBeforeUnmount(() => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', onBlur);
  });
}
