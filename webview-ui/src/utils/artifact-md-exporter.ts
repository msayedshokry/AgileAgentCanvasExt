/**
 * artifact-md-exporter.ts (webview)
 *
 * Converts an Artifact object to formatted Markdown for live in-panel preview.
 * This module lives in the webview bundle and uses the Artifact type directly.
 */
import type { Artifact } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heading(level: 1 | 2 | 3, text: string): string {
    return `${'#'.repeat(level)} ${text}\n\n`;
}

function frontmatter(artifact: Artifact): string {
    const lines = [
        '---',
        `id: ${artifact.id}`,
        `type: ${artifact.type}`,
        `status: ${artifact.status || 'draft'}`,
    ];
    if ((artifact.metadata as any)?.priority) {
        lines.push(`priority: ${(artifact.metadata as any).priority}`);
    }
    lines.push('---\n');
    return lines.join('\n');
}

function bulletList(items: string[], indent = ''): string {
    if (!items || items.length === 0) return '_None_\n';
    return items.map(i => `${indent}- ${String(i)}`).join('\n') + '\n';
}

function keyValueTable(rows: { key: string; value: string }[]): string {
    if (!rows || rows.length === 0) return '';
    const header = '| Field | Value |\n|---|---|\n';
    return header + rows.map(r => `| **${r.key}** | ${r.value} |`).join('\n') + '\n';
}

function renderValue(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) {
        if (val.length === 0) return '';
        // Array of primitives
        if (typeof val[0] !== 'object') return val.map(v => `- ${v}`).join('\n');
        // Array of objects — try to render as table rows
        return val.map(v => `- ${JSON.stringify(v)}`).join('\n');
    }
    return JSON.stringify(val, null, 2);
}

// ---------------------------------------------------------------------------
// Type-specific section renderers
// ---------------------------------------------------------------------------

function renderStory(meta: any): string {
    let md = '';

    // User Story table
    const us = meta?.userStory;
    if (us) {
        md += heading(2, 'User Story');
        md += '| As a | I want | So that |\n|---|---|---|\n';
        md += `| ${us.asA || ''} | ${us.iWant || ''} | ${us.soThat || ''} |\n\n`;
    }

    // Acceptance Criteria
    const ac: any[] = meta?.acceptanceCriteria || [];
    if (ac.length > 0) {
        md += heading(2, 'Acceptance Criteria');
        ac.forEach((c, i) => {
            if (c.criterion) {
                md += `**AC ${i + 1}:** ${c.criterion}\n\n`;
            } else {
                md += `**AC ${i + 1}**\n\n`;
                if (c.given) md += `- **Given:** ${c.given}\n`;
                if (c.when) md += `- **When:** ${c.when}\n`;
                if (c.then) md += `- **Then:** ${c.then}\n`;
                if (c.and?.length) c.and.forEach((a: string) => { md += `- **And:** ${a}\n`; });
                md += '\n';
            }
        });
    }

    // Tasks
    const tasks: any[] = meta?.tasks || [];
    if (tasks.length > 0) {
        md += heading(2, 'Tasks');
        tasks.forEach(t => {
            const check = t.completed ? 'x' : ' ';
            md += `- [${check}] ${t.description}\n`;
            (t.subtasks || []).forEach((s: any) => {
                const sc = s.completed ? 'x' : ' ';
                md += `  - [${sc}] ${s.description}\n`;
            });
        });
        md += '\n';
    }

    // Story points / priority
    const extras = [];
    if (meta?.storyPoints) extras.push({ key: 'Story Points', value: String(meta.storyPoints) });
    if (meta?.priority) extras.push({ key: 'Priority', value: meta.priority });
    if (meta?.assignee) extras.push({ key: 'Assignee', value: meta.assignee });
    if (extras.length) md += keyValueTable(extras) + '\n';

    // Dependencies
    const deps = meta?.dependencies;
    if (deps?.blockedBy?.length) {
        md += heading(2, 'Blocked By');
        md += bulletList(deps.blockedBy.map((d: any) => (typeof d === 'string' ? d : d.storyId)));
    }

    return md;
}

function renderEpic(meta: any): string {
    let md = '';
    if (meta?.goal) { md += heading(2, 'Goal'); md += `${meta.goal}\n\n`; }
    if (meta?.valueDelivered) { md += heading(2, 'Value Delivered'); md += `${meta.valueDelivered}\n\n`; }
    if (meta?.acceptanceSummary) { md += heading(2, 'Acceptance Summary'); md += `${meta.acceptanceSummary}\n\n`; }

    const fr: string[] = meta?.functionalRequirements || [];
    if (fr.length > 0) { md += heading(2, 'Functional Requirements'); md += bulletList(fr); }

    const nfr: string[] = meta?.nonFunctionalRequirements || [];
    if (nfr.length > 0) { md += heading(2, 'Non-Functional Requirements'); md += bulletList(nfr); }

    const ar: string[] = meta?.additionalRequirements || [];
    if (ar.length > 0) { md += heading(2, 'Additional Requirements'); md += bulletList(ar); }

    // Use Cases
    const ucs: any[] = meta?.useCases || [];
    if (ucs.length > 0) {
        md += heading(2, `Use Cases (${ucs.length})`);
        ucs.forEach(uc => { md += `### ${uc.id || ''}: ${uc.title || ''}\n${uc.summary || ''}\n\n`; });
    }

    // Risks — can be array directly or wrapped object {items:[]}
    const risksRaw = meta?.risks;
    const risks: any[] = Array.isArray(risksRaw) ? risksRaw : (risksRaw?.items || risksRaw?.risks || []);
    if (risks.length > 0) {
        md += heading(2, 'Risks');
        md += '| Risk | Probability | Impact | Mitigation |\n|---|---|---|---|\n';
        risks.forEach(r => { md += `| ${r.risk || ''} | ${r.probability || ''} | ${r.impact || ''} | ${r.mitigation || ''} |\n`; });
        md += '\n';
    }

    // Success Metrics — {codeQuality[], operational[], customerImpact[], deployment[]}
    const sm = meta?.successMetrics;
    if (sm && typeof sm === 'object') {
        const allMetrics: any[] = [
            ...(sm.codeQuality || []),
            ...(sm.operational || []),
            ...(sm.customerImpact || []),
            ...(sm.deployment || []),
        ];
        if (allMetrics.length > 0) {
            md += heading(2, 'Success Metrics');
            md += '| Metric | Target |\n|---|---|\n';
            allMetrics.forEach((m: any) => { md += `| ${m.metric || ''} | ${m.target || ''} |\n`; });
            md += '\n';
        }
    }

    // Definition of Done — {items:[{id, criterion, category, completed, required}], qualityGates:[...], acceptanceSummary}
    const dod = meta?.definitionOfDone;
    if (dod) {
        md += heading(2, 'Definition of Done');
        // Support both rich object and legacy string[]
        if (Array.isArray(dod)) {
            dod.forEach((item: any) => {
                const text = typeof item === 'string' ? item : item.criterion || item.item || String(item);
                const done = typeof item === 'object' && item.completed ? '✓' : '○';
                md += `- ${done} ${text}\n`;
            });
            md += '\n';
        } else {
            const items: any[] = dod.items || [];
            if (items.length > 0) {
                items.forEach((item: any) => {
                    const done = item.completed ? '✓' : '○';
                    const req = item.required === false ? ' _(optional)_' : '';
                    md += `- ${done} **${item.criterion || item.item || ''}**${req}`;
                    if (item.category) md += ` \`${item.category}\``;
                    md += '\n';
                });
                md += '\n';
            }
            const qg: any[] = dod.qualityGates || [];
            if (qg.length > 0) {
                md += heading(3, 'Quality Gates');
                qg.forEach((g: any) => {
                    const done = g.passed ? '✓' : '○';
                    md += `- ${done} ${g.gate || g.criterion || ''}\n`;
                });
                md += '\n';
            }
            if (dod.acceptanceSummary) { md += `**Acceptance:** ${dod.acceptanceSummary}\n\n`; }
        }
    }

    // Fit Criteria — {functional:[{criterion, verified}], nonFunctional:[], security:[]}
    const fc = meta?.fitCriteria;
    if (fc && typeof fc === 'object') {
        const categories = [
            { label: 'Functional', items: fc.functional || [] },
            { label: 'Non-Functional', items: fc.nonFunctional || [] },
            { label: 'Security', items: fc.security || [] },
            { label: 'Performance', items: fc.performance || [] },
            { label: 'Usability', items: fc.usability || [] },
        ].filter(c => c.items.length > 0);
        if (categories.length > 0) {
            md += heading(2, 'Fit Criteria');
            categories.forEach(cat => {
                if (categories.length > 1) md += `**${cat.label}**\n`;
                cat.items.forEach((c: any) => {
                    const done = c.verified ? '✓' : '○';
                    md += `- ${done} ${c.criterion || ''}\n`;
                });
                md += '\n';
            });
        }
    }

    // Technical Summary — {architecturePattern, components:[{name, responsibility, changes}], filesChanged:[...]}
    const ts = meta?.technicalSummary;
    if (ts && typeof ts === 'object') {
        md += heading(2, 'Technical Summary');
        if (ts.architecturePattern) md += `**Architecture Pattern:** ${ts.architecturePattern}\n\n`;
        if (ts.overview) md += `${ts.overview}\n\n`;
        if (ts.patterns?.length) md += `**Patterns:** ${ts.patterns.join(', ')}\n\n`;
        if (ts.techStack?.length) md += `**Tech Stack:** ${ts.techStack.join(', ')}\n\n`;
        const comps: any[] = ts.components || [];
        if (comps.length > 0) {
            md += heading(3, 'Components');
            md += '| Component | Responsibility | Changes |\n|---|---|---|\n';
            comps.forEach((c: any) => { md += `| **${c.name || ''}** | ${c.responsibility || ''} | ${c.changes || ''} |\n`; });
            md += '\n';
        }
        const files: any[] = ts.filesChanged || [];
        if (files.length > 0) {
            md += heading(3, 'Files Changed');
            files.forEach((f: any) => { md += `- \`${f.path || ''}\` _(${f.action || ''})_ — ${f.description || ''}\n`; });
            md += '\n';
        }
    }

    // Effort Estimate — {totalSprints, totalDays, breakdown:[{phase, duration, description}]}
    const ee = meta?.effortEstimate;
    if (ee && typeof ee === 'object') {
        md += heading(2, 'Effort Estimate');
        const eeRows: { key: string; value: string }[] = [];
        if (ee.storyPoints !== undefined) eeRows.push({ key: 'Story Points', value: String(ee.storyPoints) });
        if (ee.sprints !== undefined) eeRows.push({ key: 'Sprints', value: String(ee.sprints) });
        if (ee.totalSprints !== undefined) eeRows.push({ key: 'Total Sprints', value: String(ee.totalSprints) });
        if (ee.totalDays !== undefined) eeRows.push({ key: 'Total Days', value: String(ee.totalDays) });
        if (ee.confidence) eeRows.push({ key: 'Confidence', value: ee.confidence });
        if (eeRows.length) md += keyValueTable(eeRows) + '\n';
        const breakdown: any[] = ee.breakdown || [];
        if (breakdown.length > 0) {
            md += '| Phase | Duration | Notes |\n|---|---|---|\n';
            breakdown.forEach((b: any) => { md += `| ${b.phase || ''} | ${b.duration || ''} | ${b.description || ''} |\n`; });
            md += '\n';
        }
    }

    // Dependencies (string array)
    const deps: string[] = meta?.dependencies || [];
    if (deps.length > 0) { md += heading(2, 'Dependencies'); md += bulletList(deps); }

    // Epic Dependencies — {upstream:[{epicId, reason}], downstream:[{epicId, reason}]}
    const epicDeps = meta?.epicDependencies;
    if (epicDeps && typeof epicDeps === 'object') {
        const upstream: any[] = epicDeps.upstream || epicDeps.blockedBy || [];
        const downstream: any[] = epicDeps.downstream || [];
        if (upstream.length > 0) {
            md += heading(2, 'Blocked By / Upstream');
            upstream.forEach((d: any) => {
                const id = typeof d === 'string' ? d : (d.epicId || d.storyId || '');
                const reason = typeof d === 'object' && d.reason ? ` — ${d.reason}` : '';
                md += `- Epic ${id}${reason}\n`;
            });
            md += '\n';
        }
        if (downstream.length > 0) {
            md += heading(2, 'Enables / Downstream');
            downstream.forEach((d: any) => {
                const id = typeof d === 'string' ? d : (d.epicId || '');
                const reason = typeof d === 'object' && d.reason ? ` — ${d.reason}` : '';
                md += `- Epic ${id}${reason}\n`;
            });
            md += '\n';
        }
    }

    // Implementation Notes
    const notes: string[] = meta?.implementationNotes || [];
    if (notes.length > 0) { md += heading(2, 'Implementation Notes'); md += bulletList(notes); }

    // Story roll-up
    const rollup: { key: string; value: string }[] = [];
    if (meta?.totalStoryPoints !== undefined) rollup.push({ key: 'Total Story Points', value: String(meta.totalStoryPoints) });
    if (meta?.totalStoryCount !== undefined) rollup.push({ key: 'Total Stories', value: String(meta.totalStoryCount) });
    if (meta?.doneStoryCount !== undefined) rollup.push({ key: 'Done Stories', value: String(meta.doneStoryCount) });
    if (rollup.length) md += keyValueTable(rollup) + '\n';

    return md;
}

function renderRequirement(meta: any): string {
    let md = '';
    if (meta?.rationale) {
        md += heading(2, 'Rationale');
        md += `${meta.rationale}\n\n`;
    }
    if (meta?.type) md += `**Type:** ${meta.type}  \n`;
    if (meta?.priority) md += `**Priority:** ${meta.priority}  \n`;
    if (meta?.verificationMethod) md += `**Verification:** ${meta.verificationMethod}\n\n`;

    const ac: any[] = meta?.acceptanceCriteria || [];
    if (ac.length > 0) {
        md += heading(2, 'Acceptance Criteria');
        ac.forEach((c, i) => {
            md += c.criterion
                ? `${i + 1}. ${c.criterion}\n`
                : `${i + 1}. Given ${c.given || ''}, when ${c.when || ''}, then ${c.then || ''}\n`;
        });
        md += '\n';
    }
    return md;
}

function renderUseCase(meta: any): string {
    let md = '';
    if (meta?.primaryActor) md += `**Primary Actor:** ${meta.primaryActor}  \n`;
    if (meta?.trigger) md += `**Trigger:** ${meta.trigger}\n\n`;

    if (meta?.preconditions?.length) {
        md += heading(2, 'Preconditions');
        md += bulletList(meta.preconditions);
    }

    const mainFlow: any[] = meta?.mainFlow || [];
    if (mainFlow.length > 0) {
        md += heading(2, 'Main Flow');
        mainFlow.forEach(s => { md += `${s.step}. **[${s.actor || 'System'}]** ${s.action}\n`; });
        md += '\n';
    }

    if (meta?.postconditions?.length) {
        md += heading(2, 'Postconditions');
        md += bulletList(meta.postconditions);
    }
    return md;
}

function renderArchitecture(meta: any): string {
    let md = '';

    const components: any[] = meta?.systemComponents || [];
    if (components.length > 0) {
        md += heading(2, 'System Components');
        md += '| Component | Type | Description |\n|---|---|---|\n';
        components.forEach((c: any) => { md += `| **${c.name}** | ${c.type || ''} | ${c.description || ''} |\n`; });
        md += '\n';
    }

    const adrs: any[] = meta?.decisions || [];
    if (adrs.length > 0) {
        md += heading(2, 'Architecture Decisions');
        adrs.forEach((d: any) => {
            md += `### ${d.id}: ${d.title}\n`;
            md += `**Status:** ${d.status || ''}  \n`;
            md += `**Context:** ${d.context || ''}  \n`;
            md += `**Decision:** ${d.decision || ''}\n\n`;
        });
    }
    return md;
}

function renderProductBrief(meta: any): string {
    if (!meta) return '';
    let md = '';

    // Tagline / version
    const top = [];
    if (meta.tagline) top.push({ key: 'Tagline', value: meta.tagline });
    if (meta.version) top.push({ key: 'Version', value: meta.version });
    if (top.length) md += keyValueTable(top) + '\n';

    // Vision
    const v = meta.vision;
    if (v) {
        md += heading(2, 'Vision');
        if (v.statement) md += `**Statement:** ${v.statement}\n\n`;
        if (v.mission) md += `**Mission:** ${v.mission}\n\n`;
        if (v.problemStatement) md += `**Problem:** ${v.problemStatement}\n\n`;
        if (v.proposedSolution) md += `**Solution:** ${v.proposedSolution}\n\n`;
        if (v.uniqueValueProposition) md += `**UVP:** ${v.uniqueValueProposition}\n\n`;
        if (v.problemDetails?.length) {
            md += heading(3, 'Problem Details');
            v.problemDetails.forEach((p: any) => {
                md += `- **${p.problem}**`;
                if (p.impact) md += ` — Impact: ${p.impact}`;
                md += '\n';
            });
            md += '\n';
        }
        if (v.differentiators?.length) {
            md += heading(3, 'Differentiators');
            v.differentiators.forEach((d: any) => {
                md += `- ${d.differentiator}`;
                if (d.competitiveAdvantage) md += ` *(${d.competitiveAdvantage})*`;
                md += '\n';
            });
            md += '\n';
        }
    }

    // Target Users
    const tu: any[] = meta.targetUsers || [];
    if (tu.length > 0) {
        md += heading(2, `Target Users (${tu.length})`);
        tu.forEach((u: any) => {
            md += `### ${u.persona}\n`;
            if (u.description) md += `${u.description}\n\n`;
            const dem = u.demographics;
            if (dem) {
                const demParts = [dem.role, dem.industry, dem.age, dem.experience].filter(Boolean);
                if (demParts.length) md += `*${demParts.join(' · ')}*\n\n`;
            }
            if (u.goals?.length) { md += `**Goals:** ${u.goals.map((g: any) => g.goal).join('; ')}\n\n`; }
            if (u.needs?.length) { md += `**Needs:** ${u.needs.map((n: any) => n.need).join('; ')}\n\n`; }
            if (u.painPoints?.length) { md += `**Pain Points:** ${u.painPoints.map((p: any) => p.painPoint).join('; ')}\n\n`; }
        });
    }

    // Market Context
    const mc = meta.marketContext;
    if (mc) {
        md += heading(2, 'Market Context');
        if (mc.overview) md += `${mc.overview}\n\n`;
        if (mc.targetMarket) md += `**Target Market:** ${mc.targetMarket}\n\n`;
        const ms = mc.marketSize;
        if (ms) { md += `**Market Size** — TAM: ${ms.tam || '-'} | SAM: ${ms.sam || '-'} | SOM: ${ms.som || '-'}\n\n`; }
        if (mc.trends?.length) {
            md += heading(3, 'Trends');
            mc.trends.forEach((t: any) => {
                md += `- ${t.trend}`;
                if (t.impact) md += ` — ${t.impact}`;
                md += '\n';
            });
            md += '\n';
        }
        if (mc.competitors?.length) {
            md += heading(3, 'Competitors');
            md += '| Name | Description | Strengths | Weaknesses |\n|---|---|---|---|\n';
            mc.competitors.forEach((c: any) => {
                md += `| **${c.name}** | ${c.description || ''} | ${(c.strengths || []).join(', ')} | ${(c.weaknesses || []).join(', ')} |\n`;
            });
            md += '\n';
        }
    }

    // Key Features
    const kf: any[] = meta.keyFeatures || [];
    if (kf.length > 0) {
        md += heading(2, 'Key Features');
        md += '| Feature | Description | Priority | Complexity |\n|---|---|---|---|\n';
        kf.forEach((f: any) => {
            md += `| **${f.name}** | ${f.description || ''} | ${f.priority || ''} | ${f.complexity || ''} |\n`;
        });
        md += '\n';
    }

    // Scope
    const scope = meta.scope;
    if (scope) {
        if (scope.overview) { md += heading(2, 'Scope'); md += `${scope.overview}\n\n`; }
        if (scope.inScope?.length) {
            md += heading(3, 'In Scope');
            scope.inScope.forEach((i: any) => {
                md += `- ${i.item}${i.priority ? ` *(${i.priority})*` : ''}\n`;
            });
            md += '\n';
        }
        if (scope.outOfScope?.length) {
            md += heading(3, 'Out of Scope');
            scope.outOfScope.forEach((i: any) => {
                md += `- ${i.item}${i.reason ? ` — ${i.reason}` : ''}\n`;
            });
            md += '\n';
        }
        const mvp = scope.mvpDefinition;
        if (mvp) {
            md += heading(3, 'MVP Definition');
            if (mvp.description) md += `${mvp.description}\n\n`;
            if (mvp.features?.length) { md += `**Features:** ${mvp.features.join(', ')}\n\n`; }
            if (mvp.successCriteria?.length) { md += `**Success Criteria:**\n`; md += bulletList(mvp.successCriteria); }
        }
    }

    // Success Metrics
    const sm: any[] = meta.successMetrics || [];
    if (sm.length > 0) {
        md += heading(2, 'Success Metrics');
        md += '| Metric | Target | Category |\n|---|---|---|---|\n';
        sm.forEach((m: any) => { md += `| ${m.metric} | ${m.target || ''} | ${m.category || ''} |\n`; });
        md += '\n';
    }

    // Constraints & Assumptions
    const con: any[] = meta.constraints || [];
    if (con.length > 0) {
        md += heading(2, 'Constraints');
        con.forEach((c: any) => { md += `- **${c.constraint}**${c.impact ? ` — ${c.impact}` : ''}\n`; });
        md += '\n';
    }

    const asmpt: any[] = meta.assumptions || [];
    if (asmpt.length > 0) {
        md += heading(2, 'Assumptions');
        asmpt.forEach((a: any) => { md += `- ${a.assumption}${a.risk ? ` *(risk: ${a.risk})*` : ''}\n`; });
        md += '\n';
    }

    // Risks
    const pRisks: any[] = meta.risks || [];
    if (pRisks.length > 0) {
        md += heading(2, 'Risks');
        md += '| Risk | Probability | Impact | Mitigation |\n|---|---|---|---|\n';
        pRisks.forEach((r: any) => { md += `| ${r.risk} | ${r.probability || ''} | ${r.impact || ''} | ${r.mitigation || ''} |\n`; });
        md += '\n';
    }

    // Dependencies
    const deps: any[] = meta.dependencies || [];
    if (deps.length > 0) {
        md += heading(2, 'Dependencies');
        deps.forEach((d: any) => { md += `- ${d.dependency}${d.status ? ` *(${d.status})*` : ''}\n`; });
        md += '\n';
    }

    // Timeline
    const tl = meta.timeline;
    if (tl) {
        md += heading(2, 'Timeline');
        if (tl.overview) md += `${tl.overview}\n\n`;
        if (tl.milestones?.length) {
            md += heading(3, 'Milestones');
            md += '| Milestone | Target Date | Description |\n|---|---|---|\n';
            tl.milestones.forEach((m: any) => { md += `| **${m.milestone}** | ${m.targetDate || ''} | ${m.description || ''} |\n`; });
            md += '\n';
        }
        if (tl.phases?.length) {
            md += heading(3, 'Phases');
            tl.phases.forEach((p: any) => {
                md += `- **${p.phase}**${p.duration ? ` (${p.duration})` : ''}\n`;
                if (p.objectives?.length) p.objectives.forEach((o: string) => { md += `  - ${o}\n`; });
            });
            md += '\n';
        }
    }

    // Stakeholders
    const sh: any[] = meta.stakeholders || [];
    if (sh.length > 0) {
        md += heading(2, 'Stakeholders');
        md += '| Role | Name | Involvement |\n|---|---|---|\n';
        sh.forEach((s: any) => { md += `| ${s.role} | ${s.name || ''} | ${s.involvement || ''} |\n`; });
        md += '\n';
    }

    // Additional Context
    const ac = meta.additionalContext;
    if (ac) {
        if (ac.background) { md += heading(2, 'Background'); md += `${ac.background}\n\n`; }
        if (ac.notes?.length) { md += heading(2, 'Notes'); md += bulletList(ac.notes); }
        if (ac.openQuestions?.length) {
            md += heading(2, 'Open Questions');
            ac.openQuestions.forEach((q: any) => {
                md += `- ${q.question}${q.status ? ` *(${q.status})*` : ''}\n`;
            });
            md += '\n';
        }
    }

    return md;
}

function renderGeneric(artifact: Artifact): string {
    const meta = artifact.metadata as Record<string, unknown> | undefined;
    if (!meta) return '';
    let md = '';
    const skip = new Set(['epicId', 'epicTitle', 'testCases', 'subGroups', 'labels']);
    for (const [key, val] of Object.entries(meta)) {
        if (skip.has(key) || val === null || val === undefined || val === '') continue;
        const rendered = renderValue(val);
        if (!rendered) continue;
        const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        md += heading(2, title);
        md += `${rendered}\n\n`;
    }
    return md;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function convertArtifactToMarkdown(artifact: Artifact): string {
    const title = artifact.title || 'Untitled';
    const meta = artifact.metadata as any;

    let md = '';
    md += frontmatter(artifact);
    md += heading(1, title);

    if (artifact.description) {
        md += `> ${artifact.description.replace(/\n/g, '\n> ')}\n\n`;
    }

    switch (artifact.type) {
        case 'story':
            md += renderStory(meta);
            break;
        case 'epic':
            md += renderEpic(meta);
            break;
        case 'requirement':
        case 'nfr':
        case 'additional-req':
            md += renderRequirement(meta);
            break;
        case 'use-case':
            md += renderUseCase(meta);
            break;
        case 'architecture':
            md += renderArchitecture(meta);
            break;
        case 'prd':
        case 'product-brief':
            md += renderProductBrief(meta);
            break;
        default:
            md += renderGeneric(artifact);
            break;
    }

    return md;
}
