import { ImageType, MAX_IMAGE_BYTES, MAX_IMAGES } from '@drums/protocol';
import { ref } from 'vue';

export interface PendingImage {
  id: number;
  type: ImageType;
  /** The data URL, for the preview and to send. */
  url: string;
}

/** Images pasted into the composer, waiting to go with the next message. Text pastes as it always did. */
export function usePastedImages(report: (message: string) => void) {
  const images = ref<PendingImage[]>([]);
  let nextId = 0;
  /** Files still being read count too, or one paste of many files would pass the limit. */
  let reading = 0;

  const add = (file: File, type: ImageType) => {
    reading++;
    const reader = new FileReader();
    reader.onload = () => images.value.push({ id: nextId++, type, url: reader.result as string });
    reader.onloadend = () => reading--;
    reader.readAsDataURL(file);
  };

  const paste = (event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.files ?? [])].filter((file) => ImageType.safeParse(file.type).success);
    if (files.length === 0) return;
    event.preventDefault();
    for (const file of files) {
      if (images.value.length + reading >= MAX_IMAGES) return report(`At most ${MAX_IMAGES} images per message.`);
      if (file.size > MAX_IMAGE_BYTES) report(`${file.name} is over ${MAX_IMAGE_BYTES / 1_000_000} MB.`);
      else add(file, ImageType.parse(file.type));
    }
  };

  const remove = (id: number) => {
    images.value = images.value.filter((image) => image.id !== id);
  };

  /** Empties the list and hands over what was in it, as the API wants it. `restore` puts it back if sending fails. */
  const take = () => {
    const taken = images.value;
    images.value = [];
    return {
      upload: taken.map(({ type, url }) => ({ type, data: url.slice(url.indexOf(',') + 1) })),
      restore: () => {
        images.value = [...taken, ...images.value];
      },
    };
  };

  return { images, paste, remove, take };
}
