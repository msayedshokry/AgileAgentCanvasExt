# scripts/audit-processes.ps1
# Read-only diagnostic: list every node/cucumber/ts-node/esbuild/tsc/vscode/electron/antigravity
# process with full CommandLine, ParentProcessId, StartTime, WorkingSet, Path.
# Flags any whose CommandLine references the project root or the .test-traces- pattern.

$ErrorActionPreference = 'SilentlyContinue'
$project = 'D:\PersonalDev\AgileAgentCanvas\AgileAgentCanvasExt'
$projectAlt = 'AgileAgentCanvas'
$tracePat = 'test-traces|trace-recorder|cucumber|tmpdir|os\.tmpdir'

$names = @('node.exe','tsc.exe','ts-node.exe','tsx.exe','esbuild.exe',
           'cucumber-js.exe','java.exe','chrome.exe','electron.exe',
           'Code.exe','antigravity.exe','devenv.exe')

Write-Host "=== A) ALL relevant processes (any CommandLine, truncated) ==="
$all = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in $names -or $_.Name -like '*Code*' -or $_.Name -like '*antigravity*' -or $_.Name -like '*electron*'
} | Select-Object ProcessId,Name,ParentProcessId,CreationDate,CommandLine

if ($all) {
    $all | ForEach-Object {
        $cl = if ($_.CommandLine) { $_.CommandLine } else { '<no cmdline>' }
        $trunc = if ($cl.Length -gt 250) { $cl.Substring(0,250) + '...' } else { $cl }
        [PSCustomObject]@{
            PID       = $_.ProcessId
            Name      = $_.Name
            PPID      = $_.ParentProcessId
            Started   = $_.CreationDate
            CmdLine   = $trunc
        }
    } | Sort-Object Started | Format-Table -AutoSize -Wrap | Out-String -Width 4096 | Write-Host
} else {
    Write-Host "(no matches)"
}

Write-Host ""
Write-Host "=== B) Processes whose CommandLine references the project / test-traces / cucumber / tmpdir ==="
$flagged = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and ($_.CommandLine -match $projectAlt -or $_.CommandLine -match $tracePat)
} | Select-Object ProcessId,Name,ParentProcessId,CreationDate,CommandLine

if ($flagged) {
    $flagged | ForEach-Object {
        $cl = $_.CommandLine
        $trunc = if ($cl.Length -gt 400) { $cl.Substring(0,400) + '...' } else { $cl }
        [PSCustomObject]@{
            PID     = $_.ProcessId
            Name    = $_.Name
            PPID    = $_.ParentProcessId
            Started = $_.CreationDate
            CmdLine = $trunc
        }
    } | Format-Table -AutoSize -Wrap | Out-String -Width 4096 | Write-Host
} else {
    Write-Host "(none)"
}

Write-Host ""
Write-Host "=== C) Detailed table for every node.exe (PID, PPID, StartTime, WS_MB, Path, CmdLine) ==="
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | ForEach-Object {
    $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
    if (-not $p) { return }
    $cl = if ($_.CommandLine) { $_.CommandLine } else { '<none>' }
    $trunc = if ($cl.Length -gt 220) { $cl.Substring(0,220) + '...' } else { $cl }
    [PSCustomObject]@{
        PID       = $_.ProcessId
        PPID      = $_.ParentProcessId
        Started   = $p.StartTime
        WS_MB     = [math]::Round($p.WorkingSet64/1MB,1)
        Path      = $p.Path
        CmdLine   = $trunc
    }
} | Sort-Object Started | Format-Table -AutoSize -Wrap | Out-String -Width 4096 | Write-Host

Write-Host ""
Write-Host "=== D) All Code/Antigravity/Electron processes (VS Code, Antigravity, etc.) ==="
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like '*Code*' -or $_.Name -like '*antigravity*' -or $_.Name -like '*electron*' -or $_.Name -eq 'chrome.exe'
} | ForEach-Object {
    $cl = if ($_.CommandLine) { $_.CommandLine } else { '<none>' }
    $trunc = if ($cl.Length -gt 200) { $cl.Substring(0,200) + '...' } else { $cl }
    [PSCustomObject]@{
        PID     = $_.ProcessId
        PPID    = $_.ParentProcessId
        Name    = $_.Name
        CmdLine = $trunc
    }
} | Format-Table -AutoSize -Wrap | Out-String -Width 4096 | Write-Host

Write-Host ""
Write-Host "=== E) Total process count + node.exe count ==="
$total = (Get-CimInstance Win32_Process).Count
$nodeCount = (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' }).Count
$codeCount = (Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*Code*' -or $_.Name -like '*antigravity*' }).Count
Write-Host ("total processes: {0}" -f $total)
Write-Host ("node.exe count:  {0}" -f $nodeCount)
Write-Host ("code-like count: {0}" -f $codeCount)
