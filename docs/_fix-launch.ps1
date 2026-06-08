$file = 'docs/routa-integration-implementation-plan.md'
$content = Get-Content $file -Raw

# Fix #1: Replace the launchWorkflow body (line 1300-1310 area)
# The issue was the regex was too complex. Use a simpler marker-based approach.
$oldLaunchBody = "    const model = await getModel();"
$newLaunchBody = "    // E1 STUB: logger.info(`[E1-STUB] Workflow ` + '`' + '${workflowId}`' + ` + '`' + ` would launch for artifact ` + '`' + '${artifact?.id || `' + "'" + 'unknown' + "'" + '}`' + ` + '`' + ` (deferred to Epic 2)` + '`' + `);"

# Actually, let me use a different approach - find and replace specific lines
$lines = $content -split "`r?`n"

for ($i = 0; $i -lt $lines.Count; $i++) {
    # Fix: replace the comment before getModel
    if ($lines[$i] -match "// Uses the existing executeWithTools") {
        $lines[$i] = '    // E1 STUB — workflow launch is deferred to Epic 2.'
        $lines[$i+1] = '    // const model = await getModel();'
        $lines[$i+2] = '    // if (!model) throw new Error(''No AI model available'');'
        $lines[$i+3] = '    // await this.executor.executeLaneTransition(model, workflowId, artifact, this.store, stream, token);'
        $lines[$i+4] = '    logger.info(`[E1-STUB] Workflow "${workflowId}" would launch for "${artifact?.id || ''unknown''}" (deferred to Epic 2)`);'
    }
    # Fix: update comment in the launchWorkflow doc
    if ($lines[$i] -match "The model is obtained from the global AI") {
        $lines[$i] = '    // E1 STUB — workflow launch is deferred to Epic 2. In Epic 2:'
        $lines[$i+1] = '    // const executor = getWorkflowExecutor();'
        $lines[$i+2] = '    // await executor.executeLaneTransition(workflowId, artifact, this.store, stream, token);'
    }
}

$content = $lines -join "`r`n"
Set-Content -Path $file -Value $content -NoNewline
Write-Output "LAUNCH_FIX_APPLIED"
