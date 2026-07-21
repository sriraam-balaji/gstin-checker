/**
 * Builds a single self-contained HTML file.
 *
 * Everything is inlined because the output is opened straight from disk via
 * file://, where the browser refuses to load external modules and stylesheets
 * as cross-origin requests. One file with no <script src> and no <link> is the
 * only shape that reliably works with a double-click and no toolchain on the
 * target machine.
 */
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(root, 'dist-standalone')
const OUT_FILE = resolve(OUT_DIR, 'gstin-checker.html')

const bundle = await build({
  entryPoints: [resolve(root, 'src/web/standalone.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
})

const js = bundle.outputFiles[0].text
const css = await readFile(resolve(root, 'src/web/styles.css'), 'utf8')
const body = await readFile(resolve(root, 'src/web/standalone-body.html'), 'utf8')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GSTIN Checker</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT_FILE, html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
console.log(`built ${OUT_FILE} (${kb} kB, self-contained)`)

// A stray script/link src would break the file:// use case silently.
if (/<script[^>]+src=/i.test(html) || /<link[^>]+href=/i.test(html)) {
  console.error('ERROR: output references an external file and will not work offline')
  process.exit(1)
}
