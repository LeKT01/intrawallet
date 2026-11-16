import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Export only synthetic demo UI comparison results. Never update or commit goldens.
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await inspect(path)
    else {
      const match = entry.name.match(/^(overview|positions|space)-(light|dark)-(390|1440)-actual\.png$/)
      if (!match) continue
      const target = `tests/browser/visual.spec.ts-snapshots/${match[1]}-${match[2]}-${match[3]}-linux.png`
      console.log('IW_SNAPSHOT:' + target + ':' + (await readFile(path)).toString('base64') + ':END_SNAPSHOT')
    }
  }
}
await inspect('visual-comparison')
