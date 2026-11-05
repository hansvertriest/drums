import { ref, type Ref } from 'vue';
import { useUi } from '../stores/ui';

const KEY_STEPS: Record<string, number> = { ArrowLeft: -24, ArrowRight: 24 };

/** Dragging the rail's edge, or the arrow keys on it. */
export function useRailResize(rail: Ref<HTMLElement | undefined>) {
  const ui = useUi();
  const dragging = ref(false);

  /** Captured, so the drag goes on over the artifact frames. */
  const start = (event: PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging.value = true;
  };
  const move = (event: PointerEvent) => {
    if (dragging.value && rail.value) ui.setRailWidth(event.clientX - rail.value.getBoundingClientRect().left);
  };
  const end = () => {
    dragging.value = false;
  };
  const key = (event: KeyboardEvent) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    ui.setRailWidth(ui.railWidth + step);
  };

  return { dragging, start, move, end, key };
}
