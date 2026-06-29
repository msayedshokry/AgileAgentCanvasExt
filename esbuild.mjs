import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', 'node-pty', 'headroom-ai'], // vscode provided by host; node-pty is native; headroom-ai ships alongside
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: !production,
    minify: production,
    // Keep tsc for type-checking only; esbuild handles emit
    tsconfig: './tsconfig.json',
};

/**
 * Copy pdfkit font data files (.afm) to dist/data/ so they can be found
 * at runtime.  PDFKit's built-in font loader reads:
 *   fs.readFileSync(__dirname + '/data/Helvetica.afm', 'utf8')
 * When bundled, __dirname is the dist/ folder, so we need the files there.
 */
function copyPdfkitFontData() {
    const src = join(__dirname, 'node_modules', 'pdfkit', 'js', 'data');
    const dest = join(__dirname, 'dist', 'data');
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log('[esbuild] Copied pdfkit font data → dist/data/');
}

/**
 * Copy headroom-ai into dist/ so it can be required at runtime.
 * headroom-ai is externalized because its peer-dep adapter imports
 * (@anthropic-ai/sdk, openai, ai) confuse esbuild's bundler.
 * Shipping it alongside keeps require.resolve() working in .vsix installs.
 */
function copyHeadroomAi() {
    const src = join(__dirname, 'node_modules', 'headroom-ai');
    const dest = join(__dirname, 'dist', 'node_modules', 'headroom-ai');
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log('[esbuild] Copied headroom-ai → dist/node_modules/headroom-ai/');
}

/**
 * Copy the node-pty native addon into dist/ so it can be required at
 * runtime.  node-pty is a native C++ addon; esbuild cannot bundle it.
 * We externalize the import and ship the pre-built binary alongside.
 * The binary must be rebuilt against Electron 30.x headers (via
 * @electron/rebuild in the packaging step) before this copy runs.
 */
function copyNodePty() {
    const src = join(__dirname, 'node_modules', 'node-pty');
    const dest = join(__dirname, 'dist', 'node_modules', 'node-pty');
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log('[esbuild] Copied node-pty → dist/node_modules/node-pty/');
}

async function main() {
    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[esbuild] Watching for changes...');
    } else {
        await esbuild.build(buildOptions);
        copyPdfkitFontData();
        copyHeadroomAi();
        copyNodePty();
        console.log('[esbuild] Extension bundled successfully');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
