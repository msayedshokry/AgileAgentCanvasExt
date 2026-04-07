const fs = require('fs');
const file = 'd:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/src/workflow/workflow-executor.ts';
let content = fs.readFileSync(file, 'utf8');

const injection = `
    {
        id: 'codebase-mapper',
        name: 'Codebase Mapper',
        description: 'Map architectural boundaries and trace data flow',
        module: 'bmm',
        phase: '4-review',
        path: 'bmm/workflows/4-review/codebase-mapper/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['epic', 'architecture'],
        tags: ['review', 'architecture', 'codebase', 'mapping']
    },
    {
        id: 'assumptions-analyzer',
        name: 'Assumptions Analyzer',
        description: 'Extract and evaluate hidden technical/business assumptions',
        module: 'bmm',
        phase: '4-review',
        path: 'bmm/workflows/4-review/assumptions-analyzer/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['epic', 'story'],
        tags: ['review', 'assumptions', 'risk']
    },
    {
        id: 'tradeoff-advisor',
        name: 'Trade-off Advisor',
        description: '5-column matrix (Option/Pros/Cons/Risk/Verdict) for tech choices',
        module: 'bmm',
        phase: '4-review',
        path: 'bmm/workflows/4-review/tradeoff-advisor/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['architecture'],
        tags: ['review', 'architecture', 'tradeoffs']
    },
    {
        id: 'execution-task-protocol',
        name: 'Execution Task Protocol',
        description: 'Strict execution deviation and auth-gate rules',
        module: 'bmm',
        phase: '4-review',
        path: 'bmm/workflows/4-review/execution-task-protocol/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['story'],
        tags: ['review', 'execution', 'protocol']
    },
    {
        id: 'test-classification',
        name: 'Test Classification Strategy',
        description: 'Heuristic-based pre-test triage strategy (TDD/E2E/Skip)',
        module: 'bmm',
        phase: '4-review',
        path: 'bmm/workflows/4-review/test-classification/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['test-strategy'],
        tags: ['review', 'testing', 'classification', 'strategy']
    },
`;

content = content.replace("    // BMM MODULE - Quick Flow (2 workflows)", injection + "    // BMM MODULE - Quick Flow (2 workflows)");
fs.writeFileSync(file, content);
console.log('patched');
