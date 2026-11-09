import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const br = promisify(brotliCompress);
const gz = promisify(gzip);

export async function compressClient(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await compressClient(file)));
    } else if (entry.isFile() && /\.(?:html|css|js)$/.test(entry.name)) {
      const source = await readFile(file);
      const [brotli, zipped] = await Promise.all([
        br(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
        gz(source, { level: 9 }),
      ]);
      await Promise.all([writeFile(file + '.br', brotli), writeFile(file + '.gz', zipped)]);
      result.push({ file, raw: source.length, br: brotli.length, gzip: zipped.length });
    }
  }
  return result;
}
