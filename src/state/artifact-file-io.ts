import * as vscode from 'vscode';

interface ResolveTargetUriOptions {
    baseUri: vscode.Uri;
    folderName?: string;
    fileName: string;
}

export async function resolveArtifactTargetUri(options: ResolveTargetUriOptions): Promise<vscode.Uri> {
    const { baseUri, folderName, fileName } = options;

    if (!folderName) {
        return vscode.Uri.joinPath(baseUri, fileName);
    }

    const folderUri = vscode.Uri.joinPath(baseUri, folderName);
    try {
        await vscode.workspace.fs.createDirectory(folderUri);
    } catch {
        // Folder might already exist.
    }

    return vscode.Uri.joinPath(folderUri, fileName);
}

export async function writeJsonFile(targetUri: vscode.Uri, payload: unknown): Promise<void> {
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));
}

export async function writeMarkdownCompanion(jsonUri: vscode.Uri, mdFilename: string, markdownContent: string): Promise<vscode.Uri> {
    const parentUri = vscode.Uri.joinPath(jsonUri, '..');
    const mdUri = vscode.Uri.joinPath(parentUri, mdFilename);
    await vscode.workspace.fs.writeFile(mdUri, Buffer.from(markdownContent, 'utf-8'));
    return mdUri;
}
