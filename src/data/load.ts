import type { Catalog, DataBundle, FeltList, MapData, Meta } from '../core/types';

/**
 * 從網站的 data/ 目錄載入四個 JSON。所有計算都在瀏覽器裡完成，不會送出使用者輸入的任何內容。
 * base 預設為 Vite 的 BASE_URL（部署到 GitHub Pages 時是 /<repo 名稱>/）。
 */
export async function loadData(base: string = import.meta.env.BASE_URL): Promise<DataBundle> {
  const get = async <T>(name: string): Promise<T> => {
    const res = await fetch(`${base}data/${name}`);
    if (!res.ok) throw new Error(`無法載入 ${name}（HTTP ${res.status}）`);
    return (await res.json()) as T;
  };
  const [catalog, felt, map, meta] = await Promise.all([
    get<Catalog>('catalog.json'),
    get<FeltList>('felt.json'),
    get<MapData>('map.json'),
    get<Meta>('meta.json'),
  ]);
  return { catalog, felt, map, meta };
}
