/** Загрузка фото пачкой: по 3 одновременно, порядок — как у файлов (IMG_0001, IMG_0002… — как снимали) */
export async function uploadPhotos(list: FileList | File[], onProgress?: (done: number, total: number) => void) {
  const files = Array.from(list)
    .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
  const urls: (string | null)[] = new Array(files.length).fill(null);
  const errors: string[] = [];
  let done = 0;
  let next = 0;
  onProgress?.(0, files.length);
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      try {
        const fd = new FormData();
        fd.append("file", files[i]);
        const r = await fetch("/api/admin/media", { method: "POST", body: fd }).then((x) => x.json());
        if (r.url) urls[i] = r.url;
        else errors.push(`${files[i].name}: ${r.error ?? "не удалось загрузить"}`);
      } catch {
        errors.push(`${files[i].name}: нет связи`);
      }
      onProgress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  return { urls: urls.filter((u): u is string => !!u), errors };
}
