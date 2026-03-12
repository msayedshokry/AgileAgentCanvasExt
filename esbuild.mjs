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
    external: ['vscode'], // vscode is provided by the host
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

async function main() {
    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[esbuild] Watching for changes...');
    } else {
        await esbuild.build(buildOptions);
        copyPdfkitFontData();
        console.log('[esbuild] Extension bundled successfully');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
