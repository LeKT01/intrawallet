import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const output = new URL('../dist/', import.meta.url)
const files = ['index.html', 'manifest.webmanifest', ...await readdir(new URL('assets/', output)).then(names => names.map(name => 'assets/' + name)),
  ...await readdir(new URL('app-icons/', output)).then(names => names.map(name => 'app-icons/' + name))].sort()
const hash = createHash('sha256')
for (const path of files) hash.update(path).update(await readFile(new URL(path, output)))
const source = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8')
hash.update(source)
await writeFile(new URL('sw.js', output), source
  .replace('__CACHE_VERSION__', JSON.stringify(hash.digest('hex').slice(0, 20)))
  .replace('__SHELL_FILES__', JSON.stringify(files)))
