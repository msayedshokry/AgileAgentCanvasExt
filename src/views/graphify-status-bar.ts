import * as vscode from 'vscode';
import { detectGraphify, clearGraphifyCache } from '../integrations/graphify';
import { loadGraph } from '../integrations/graphify/graph-loader';
import { createLogger } from '../utils/logger';

const logger = createLogger('graphify-status-bar');

let _item: vscode.StatusBarItem | undefined;
let _refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Create and register the graphify status bar item.
 * Returns the StatusBarItem so it can be pushed to context.subscriptions.
 */
export function createGraphifyStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    _item = vscode.window.createStatusBarItem(
        'agileagentcanvas.graphifyStatus',
        vscode.StatusBarAlignment.Right,
        90  // priority: just left of language mode indicator
    );
    _item.name = 'Graphify Knowledge Graph';
    context.subscriptions.push(_item);

    _refresh();
    return _item;
}

/**
 * Force a status bar refresh — call after bootstrap / update / rebuild.
 */
export function refreshGraphifyStatusBar(workspaceRoot?: string): void {
    if (workspaceRoot) {
        clearGraphifyCache(workspaceRoot);
    }
    _scheduleRefresh(0);
}

// ─── Internals ───────────────────────────────────────────────────────────────

function _scheduleRefresh(delayMs = 300): void {
    if (_refreshTimer) { clearTimeout(_refreshTimer); }
    _refreshTimer = setTimeout(() => _refresh(), delayMs);
}

function _refresh(): void {
    if (!_item) { return; }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!root) {
        _item.hide();
        return;
    }

    const status = detectGraphify(root);

    // Icon + label based on recommendation
    const { icon, label, tooltip, command } = _resolveDisplay(root, status.recommendation, status.graphPresent, status.wired, status.builtAtCommit);

    _item.text = `${icon} ${label}`;
    _item.tooltip = tooltip;
    _item.command = command;
    _item.show();

    logger.debug(`Status bar updated: ${label} (${status.recommendation})`);
}

interface Display {
    icon: string;
    label: string;
    tooltip: string;
    command: string;
}

function _resolveDisplay(
    root: string,
    rec: string,
    graphPresent: boolean,
    wired: boolean,
    builtAtCommit?: string
): Display {
    switch (rec) {
        case 'unavailable':
        case 'install':
            return {
                icon: '$(graph)',
                label: 'graphify: install',
                tooltip: 'graphify CLI not found. Click to bootstrap (will install automatically).',
                command: 'agileagentcanvas.graphify.bootstrap'
            };

        case 'bootstrap':
            return {
                icon: '$(graph)',
                label: 'graphify: bootstrap',
                tooltip: 'graphify is installed but no knowledge graph exists yet. Click to build the graph.',
                command: 'agileagentcanvas.graphify.bootstrap'
            };

        case 'wire': {
            const nodeCount = _getNodeCount(root);
            const countLabel = nodeCount !== null ? ` · ${nodeCount} nodes` : '';
            return {
                icon: '$(graph)',
                label: `graphify${countLabel}`,
                tooltip: 'Knowledge graph ready but not wired into Copilot instructions. Click to open report.',
                command: 'agileagentcanvas.graphify.openReport'
            };
        }

        case 'ready': {
            const nodeCount = _getNodeCount(root);
            const countLabel = nodeCount !== null ? ` · ${nodeCount}` : '';
            const commitSuffix = builtAtCommit ? `\nBuilt at: ${builtAtCommit.slice(0, 7)}` : '';
            return {
                icon: '$(graph)',
                label: `graphify${countLabel}`,
                tooltip: `Knowledge graph is active and wired.\nNodes: ${nodeCount ?? '?'}${commitSuffix}\nClick to open GRAPH_REPORT.md`,
                command: 'agileagentcanvas.graphify.openReport'
            };
        }

        default:
            return {
                icon: '$(graph)',
                label: 'graphify',
                tooltip: 'Graphify knowledge graph. Click to open report.',
                command: 'agileagentcanvas.graphify.openReport'
            };
    }
}

function _getNodeCount(root: string): number | null {
    try {
        const graph = loadGraph(root);
        return graph?.nodes?.length ?? null;
    } catch {
        return null;
    }
}
