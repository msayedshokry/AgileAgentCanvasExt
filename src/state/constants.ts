/**
 * Pure constants used across the extension.
 *
 * This file intentionally has **zero** runtime imports (especially no `vscode`)
 * so that test files can load it via proxyquire without needing to mock the
 * VS Code API.
 */

/**
 * Name of the bundled BMAD resources directory inside the extension
 * (i.e. `resources/<BMAD_RESOURCE_DIR>/`).
 *
 * Every `path.join(extensionPath, 'resources', BMAD_RESOURCE_DIR)` call
 * should reference this constant so a future rename is a one-liner.
 */
export const BMAD_RESOURCE_DIR = '_aac';

/**
 * Default output folder name used by AgileAgentCanvas.
 * Also used as the primary auto-detection target when scanning workspace folders.
 */
export const DEFAULT_OUTPUT_FOLDER = '.agileagentcanvas-context';
