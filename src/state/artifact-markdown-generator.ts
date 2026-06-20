import { BmadArtifacts, Epic, Story } from '../types';

/**
 * ArtifactMarkdownGenerator — extracted from ArtifactStore.
 * Pure functions that convert BMAD artifacts to markdown strings.
 * Zero store dependencies — operates solely on passed-in data.
 */

/**

 * Generate markdown version of vision artifact

 */

export function generateVisionMarkdown(state: BmadArtifacts): string {

    if (!state.vision) return '';

    const v = state.vision;

    let md = `# ${v.productName || state.projectName} - Vision\n\n`;

    // Vision statement

    const statement = v.vision?.statement || v.valueProposition || '';

    if (statement) {

        md += `## Vision Statement\n\n${statement}\n\n`;

    }

    // Problem statement

    const problem = v.vision?.problemStatement || v.problemStatement || '';

    if (problem) {

        md += `## Problem Statement\n\n${problem}\n\n`;

    }

    // Proposed solution

    const solution = v.vision?.proposedSolution || v.valueProposition || '';

    if (solution) {

        md += `## Proposed Solution\n\n${solution}\n\n`;

    }

    // Target users

    const users = v.targetUsers || [];

    if (users.length > 0) {

        md += `## Target Users\n\n`;

        for (const u of users) {

            if (typeof u === 'string') {

                md += `- ${u}\n`;

            } else {

                md += `- **${u.segment || 'User'}**`;

                if (u.description) md += `: ${u.description}`;

                md += '\n';

            }

        }

        md += '\n';

    }

    // Success metrics

    const metrics = v.successMetrics || v.successCriteria || [];

    if (metrics.length > 0) {

        md += `## Success Metrics\n\n`;

        for (const m of metrics) {

            if (typeof m === 'string') {

                md += `- ${m}\n`;

            } else {

                md += `- **${m.name || 'Metric'}**`;

                if (m.target) md += `: ${m.target}`;

                md += '\n';

            }

        }

        md += '\n';

    }

    return md;

}
/**

 * Generate markdown for a single epic (used for per-epic .md companions)

 */

export function generateSingleEpicMarkdown(epic: any, state: BmadArtifacts): string {

    let md = `# Epic ${epic.id}: ${epic.title || 'Untitled Epic'}\n\n`;

    md += `**Status:** ${epic.status || 'draft'}\n\n`;

    if (epic.goal) {

        md += `## Goal\n\n${epic.goal}\n\n`;

    }

    if (epic.description) {

        md += `## Description\n\n${epic.description}\n\n`;

    }

    const stories = epic.stories || [];

    if (stories.length > 0) {

        md += `## Stories (${stories.length})\n\n`;

        for (const story of stories) {

            if (typeof story === 'string') {

                md += `- ${story}\n`;

            } else {

                md += `### ${story.id || ''}: ${story.title || 'Untitled Story'}\n\n`;

                md += `**Status:** ${story.status || 'draft'}`;

                if (story.storyPoints) md += ` | **Points:** ${story.storyPoints}`;

                md += '\n\n';

                if (story.userStory) md += `${story.userStory}\n\n`;

                if (story.acceptanceCriteria?.length) {

                    md += `**Acceptance Criteria:**\n`;

                    for (const ac of story.acceptanceCriteria) {

                        if (typeof ac === 'string') {

                            md += `- ${ac}\n`;

                        } else {

                            md += `- ${ac.description || ac.criterion || JSON.stringify(ac)}\n`;

                        }

                    }

                    md += '\n';

                }

            }

        }

    }

    return md;

}
/**

 * Generate markdown version of epics

 */

export function generateEpicsMarkdown(state: BmadArtifacts): string {

    let md = `# ${state.projectName} - Epic Breakdown\n\n`;

    md += `## Overview\n\n`;

    md += `This document provides the complete epic and story breakdown.\n\n`;

    // Requirements inventory

    if (state.requirements) {

        md += `## Requirements Inventory\n\n`;

        md += `### Functional Requirements\n\n`;

        state.requirements.functional.forEach(fr => {

            md += `- **${fr.id}**: ${fr.title} - ${fr.description}\n`;

        });

        md += '\n';

    }

    // Epics

    md += `## Epics\n\n`;

    state.epics?.forEach((epic, index) => {

        md += `### Epic ${index + 1}: ${epic.title}\n\n`;

        md += `**Goal:** ${epic.goal}\n\n`;

        

        if (epic.valueDelivered) {

            md += `**Value Delivered:** ${epic.valueDelivered}\n\n`;

        }

        if (epic.functionalRequirements?.length) {

            md += `**Requirements Covered:** ${epic.functionalRequirements.join(', ')}\n\n`;

        }

        // Use cases (if enhanced)

        if (epic.useCases?.length) {

            md += `#### Use Cases\n\n`;

            epic.useCases.forEach(uc => {

                md += `**${uc.title}**\n`;

                md += `${uc.scenario?.context || ''}\n`;

                md += `- Without: ${uc.scenario?.before || ''}\n`;

                md += `- With: ${uc.scenario?.after || ''}\n`;

                md += `- Impact: ${uc.scenario?.impact || ''}\n\n`;

            });

        }

        // Stories

        md += `#### Stories\n\n`;

        epic.stories?.forEach((story, sIndex) => {

            md += `##### Story ${index + 1}.${sIndex + 1}: ${story.title}\n\n`;

            md += `As a ${story.userStory.asA},\n`;

            md += `I want ${story.userStory.iWant},\n`;

            md += `So that ${story.userStory.soThat}.\n\n`;

            

            md += `**Acceptance Criteria:**\n\n`;

            story.acceptanceCriteria.forEach(ac => {

                if (ac.criterion) {

                    md += `- ${ac.criterion}\n`;

                } else {

                    md += `- **Given** ${ac.given}\n`;

                    md += `  **When** ${ac.when}\n`;

                    md += `  **Then** ${ac.then}\n`;

                    if (ac.and?.length) {

                        ac.and.forEach(a => md += `  **And** ${a}\n`);

                    }

                }

                md += '\n';

            });

        });

        md += '---\n\n';

    });

    return md;

}
/**

 * Generate markdown version of product brief

 */

export function generateProductBriefMarkdown(state: BmadArtifacts): string {

    const pb = state.productBrief;

    if (!pb) return '';

    let md = `# ${pb.productName || state.projectName} - Product Brief\n\n`;

    if (pb.tagline) md += `> ${pb.tagline}\n\n`;

    if (pb.version) md += `**Version:** ${pb.version}  \n`;

    md += `**Status:** ${pb.status || 'draft'}\n\n`;

    // Vision

    if (pb.vision) {

        md += `## Vision\n\n`;

        if (pb.vision.statement) md += `${pb.vision.statement}\n\n`;

        if (pb.vision.mission) md += `**Mission:** ${pb.vision.mission}\n\n`;

        if (pb.vision.problemStatement) {

            md += `### Problem Statement\n\n${pb.vision.problemStatement}\n\n`;

        }

        if (pb.vision.problemDetails?.length) {

            md += `### Problem Details\n\n`;

            pb.vision.problemDetails.forEach(pd => {

                md += `- **${pd.problem}**\n`;

                if (pd.impact) md += `  - Impact: ${pd.impact}\n`;

                if (pd.affectedUsers) md += `  - Affected Users: ${pd.affectedUsers}\n`;

                if (pd.currentSolutions) md += `  - Current Solutions: ${pd.currentSolutions}\n`;

            });

            md += '\n';

        }

        if (pb.vision.proposedSolution) {

            md += `### Proposed Solution\n\n${pb.vision.proposedSolution}\n\n`;

        }

        if (pb.vision.solutionApproach?.length) {

            md += `### Solution Approach\n\n`;

            pb.vision.solutionApproach.forEach(sa => {

                md += `- **${sa.aspect}**: ${sa.description || ''}\n`;

                if (sa.rationale) md += `  - Rationale: ${sa.rationale}\n`;

            });

            md += '\n';

        }

        if (pb.vision.uniqueValueProposition) {

            md += `### Unique Value Proposition\n\n${pb.vision.uniqueValueProposition}\n\n`;

        }

        if (pb.vision.differentiators?.length) {

            md += `### Differentiators\n\n`;

            pb.vision.differentiators.forEach(d => {

                md += `- **${d.differentiator}**`;

                if (d.competitiveAdvantage) md += ` — ${d.competitiveAdvantage}`;

                md += '\n';

            });

            md += '\n';

        }

    }

    // Target Users

    if (pb.targetUsers?.length) {

        md += `## Target Users\n\n`;

        pb.targetUsers.forEach(user => {

            md += `### ${user.persona}\n\n`;

            if (user.description) md += `${user.description}\n\n`;

            if (user.demographics) {

                const demo = user.demographics;

                const parts = [demo.role, demo.age, demo.industry, demo.experience].filter(Boolean);

                if (parts.length) md += `**Demographics:** ${parts.join(' | ')}\n\n`;

            }

            if (user.technicalProficiency) {

                md += `**Technical Proficiency:** ${user.technicalProficiency}\n\n`;

            }

            if (user.goals?.length) {

                md += `**Goals:**\n`;

                user.goals.forEach(g => {

                    md += `- ${g.goal}${g.priority ? ` (${g.priority})` : ''}\n`;

                });

                md += '\n';

            }

            if (user.needs?.length) {

                md += `**Needs:**\n`;

                user.needs.forEach(n => {

                    md += `- ${n.need}${n.importance ? ` [${n.importance}]` : ''}\n`;

                });

                md += '\n';

            }

            if (user.painPoints?.length) {

                md += `**Pain Points:**\n`;

                user.painPoints.forEach(p => {

                    md += `- ${p.painPoint}${p.severity ? ` [${p.severity}]` : ''}\n`;

                });

                md += '\n';

            }

            if (user.behaviors?.length) {

                md += `**Behaviors:** ${user.behaviors.join(', ')}\n\n`;

            }

            if (user.motivations?.length) {

                md += `**Motivations:** ${user.motivations.join(', ')}\n\n`;

            }

            if (user.frustrations?.length) {

                md += `**Frustrations:** ${user.frustrations.join(', ')}\n\n`;

            }

        });

    }

    // Market Context

    if (pb.marketContext) {

        md += `## Market Context\n\n`;

        const mc = pb.marketContext;

        if (mc.overview) md += `${mc.overview}\n\n`;

        if (mc.targetMarket) md += `**Target Market:** ${mc.targetMarket}\n\n`;

        if (mc.marketSize) {

            md += `**Market Size:**\n`;

            if (mc.marketSize.tam) md += `- TAM: ${mc.marketSize.tam}\n`;

            if (mc.marketSize.sam) md += `- SAM: ${mc.marketSize.sam}\n`;

            if (mc.marketSize.som) md += `- SOM: ${mc.marketSize.som}\n`;

            md += '\n';

        }

        if (mc.trends?.length) {

            md += `### Market Trends\n\n`;

            mc.trends.forEach(t => {

                md += `- **${t.trend}**${t.impact ? ` — ${t.impact}` : ''}\n`;

            });

            md += '\n';

        }

        if (mc.competitiveLandscape) {

            md += `### Competitive Landscape\n\n${mc.competitiveLandscape}\n\n`;

        }

        if (mc.competitors?.length) {

            md += `### Competitors\n\n`;

            mc.competitors.forEach(c => {

                md += `#### ${c.name}\n\n`;

                if (c.description) md += `${c.description}\n\n`;

                if (c.strengths?.length) md += `**Strengths:** ${c.strengths.join(', ')}\n\n`;

                if (c.weaknesses?.length) md += `**Weaknesses:** ${c.weaknesses.join(', ')}\n\n`;

            });

        }

    }

    // Success Metrics

    if (pb.successMetrics?.length) {

        md += `## Success Metrics\n\n`;

        md += `| Metric | Target | Timeframe | Category |\n|---|---|---|---|\n`;

        pb.successMetrics.forEach(m => {

            md += `| ${m.metric} | ${m.target || '-'} | ${m.timeframe || '-'} | ${m.category || '-'} |\n`;

        });

        md += '\n';

    }

    // Scope

    if (pb.scope) {

        md += `## Scope\n\n`;

        if (pb.scope.overview) md += `${pb.scope.overview}\n\n`;

        if (pb.scope.inScope?.length) {

            md += `### In Scope\n\n`;

            pb.scope.inScope.forEach(s => {

                md += `- **${s.item}**${s.priority ? ` [${s.priority}]` : ''}${s.rationale ? ` — ${s.rationale}` : ''}\n`;

            });

            md += '\n';

        }

        if (pb.scope.outOfScope?.length) {

            md += `### Out of Scope\n\n`;

            pb.scope.outOfScope.forEach(s => {

                md += `- ${s.item}${s.reason ? ` — ${s.reason}` : ''}\n`;

            });

            md += '\n';

        }

        if (pb.scope.futureConsiderations?.length) {

            md += `### Future Considerations\n\n`;

            pb.scope.futureConsiderations.forEach(f => {

                md += `- ${f.item}${f.timeframe ? ` (${f.timeframe})` : ''}\n`;

            });

            md += '\n';

        }

        if (pb.scope.mvpDefinition) {

            md += `### MVP Definition\n\n`;

            if (pb.scope.mvpDefinition.description) md += `${pb.scope.mvpDefinition.description}\n\n`;

            if (pb.scope.mvpDefinition.features?.length) {

                md += `**MVP Features:**\n`;

                pb.scope.mvpDefinition.features.forEach(f => md += `- ${f}\n`);

                md += '\n';

            }

            if (pb.scope.mvpDefinition.successCriteria?.length) {

                md += `**Success Criteria:**\n`;

                pb.scope.mvpDefinition.successCriteria.forEach(c => md += `- ${c}\n`);

                md += '\n';

            }

        }

    }

    // Key Features

    if (pb.keyFeatures?.length) {

        md += `## Key Features\n\n`;

        pb.keyFeatures.forEach(f => {

            md += `### ${f.name}${f.priority ? ` [${f.priority}]` : ''}\n\n`;

            if (f.description) md += `${f.description}\n\n`;

            if (f.userBenefit) md += `**User Benefit:** ${f.userBenefit}\n\n`;

            if (f.complexity) md += `**Complexity:** ${f.complexity}\n\n`;

        });

    }

    // Constraints

    if (pb.constraints?.length) {

        md += `## Constraints\n\n`;

        pb.constraints.forEach(c => {

            md += `- **${c.constraint}**${c.type ? ` [${c.type}]` : ''}\n`;

            if (c.impact) md += `  - Impact: ${c.impact}\n`;

            if (c.mitigation) md += `  - Mitigation: ${c.mitigation}\n`;

        });

        md += '\n';

    }

    // Assumptions

    if (pb.assumptions?.length) {

        md += `## Assumptions\n\n`;

        pb.assumptions.forEach(a => {

            md += `- **${a.assumption}**${a.category ? ` [${a.category}]` : ''}\n`;

            if (a.risk) md += `  - Risk: ${a.risk}\n`;

            if (a.validationMethod) md += `  - Validation: ${a.validationMethod}\n`;

        });

        md += '\n';

    }

    // Risks

    if (pb.risks?.length) {

        md += `## Risks\n\n`;

        md += `| Risk | Category | Probability | Impact | Mitigation |\n|---|---|---|---|---|\n`;

        pb.risks.forEach(r => {

            md += `| ${r.risk} | ${r.category || '-'} | ${r.probability || '-'} | ${r.impact || '-'} | ${r.mitigation || '-'} |\n`;

        });

        md += '\n';

    }

    // Timeline

    if (pb.timeline) {

        md += `## Timeline\n\n`;

        if (pb.timeline.overview) md += `${pb.timeline.overview}\n\n`;

        if (pb.timeline.milestones?.length) {

            md += `### Milestones\n\n`;

            pb.timeline.milestones.forEach(m => {

                md += `- **${m.milestone}**${m.targetDate ? ` (${m.targetDate})` : ''}\n`;

                if (m.description) md += `  ${m.description}\n`;

                if (m.deliverables?.length) md += `  Deliverables: ${m.deliverables.join(', ')}\n`;

            });

            md += '\n';

        }

        if (pb.timeline.phases?.length) {

            md += `### Phases\n\n`;

            pb.timeline.phases.forEach(p => {

                md += `- **${p.phase}**${p.duration ? ` (${p.duration})` : ''}\n`;

                if (p.objectives?.length) p.objectives.forEach(o => md += `  - ${o}\n`);

            });

            md += '\n';

        }

    }

    // Stakeholders

    if (pb.stakeholders?.length) {

        md += `## Stakeholders\n\n`;

        md += `| Role | Name | Involvement |\n|---|---|---|\n`;

        pb.stakeholders.forEach(s => {

            md += `| ${s.role} | ${s.name || '-'} | ${s.involvement || '-'} |\n`;

        });

        md += '\n';

    }

    // Additional Context

    if (pb.additionalContext) {

        md += `## Additional Context\n\n`;

        if (pb.additionalContext.background) md += `${pb.additionalContext.background}\n\n`;

        if (pb.additionalContext.openQuestions?.length) {

            md += `### Open Questions\n\n`;

            pb.additionalContext.openQuestions.forEach(q => {

                md += `- ${q.question}${q.status ? ` [${q.status}]` : ''}\n`;

            });

            md += '\n';

        }

        if (pb.additionalContext.notes?.length) {

            md += `### Notes\n\n`;

            pb.additionalContext.notes.forEach(n => md += `- ${n}\n`);

            md += '\n';

        }

    }

    return md;

}
/**

 * Generate markdown version of PRD

 */

export function generatePRDMarkdown(state: BmadArtifacts): string {

    const prd = state.prd;

    if (!prd) return '';

    let md = `# ${prd.productOverview?.productName || state.projectName} - Product Requirements Document\n\n`;

    md += `**Status:** ${prd.status || 'draft'}\n\n`;

    // Product Overview

    if (prd.productOverview) {

        md += `## Product Overview\n\n`;

        const po = prd.productOverview;

        if (po.version) md += `**Version:** ${po.version}\n\n`;

        if (po.purpose) md += `**Purpose:** ${po.purpose}\n\n`;

        if (po.targetAudience) md += `**Target Audience:** ${po.targetAudience}\n\n`;

        if (po.productVision) md += `### Vision\n\n${po.productVision}\n\n`;

        if (po.problemStatement) md += `### Problem Statement\n\n${po.problemStatement}\n\n`;

        if (po.proposedSolution) md += `### Proposed Solution\n\n${po.proposedSolution}\n\n`;

        if (po.valueProposition) md += `### Value Proposition\n\n${po.valueProposition}\n\n`;

        if (po.keyBenefits?.length) {

            md += `### Key Benefits\n\n`;

            po.keyBenefits.forEach(b => md += `- ${b}\n`);

            md += '\n';

        }

    }

    // Project Type

    if (prd.projectType) {

        md += `## Project Type\n\n`;

        const pt = prd.projectType;

        if (pt.type) md += `**Type:** ${pt.type}\n`;

        if (pt.complexity) md += `**Complexity:** ${pt.complexity}\n`;

        if (pt.domainComplexity) md += `**Domain Complexity:** ${pt.domainComplexity}\n`;

        if (pt.technicalComplexity) md += `**Technical Complexity:** ${pt.technicalComplexity}\n`;

        if (pt.integrationComplexity) md += `**Integration Complexity:** ${pt.integrationComplexity}\n`;

        md += '\n';

        if (pt.characteristics?.length) {

            md += `**Characteristics:** ${pt.characteristics.join(', ')}\n\n`;

        }

    }

    // User Personas

    if (prd.userPersonas?.length) {

        md += `## User Personas\n\n`;

        prd.userPersonas.forEach(p => {

            md += `### ${p.name}${p.role ? ` (${p.role})` : ''}\n\n`;

            if (p.description) md += `${p.description}\n\n`;

            if (p.technicalProficiency) md += `**Technical Proficiency:** ${p.technicalProficiency}\n\n`;

            if (p.goals?.length) {

                md += `**Goals:**\n`;

                p.goals.forEach(g => md += `- ${g}\n`);

                md += '\n';

            }

            if (p.painPoints?.length) {

                md += `**Pain Points:**\n`;

                p.painPoints.forEach(pp => md += `- ${pp}\n`);

                md += '\n';

            }

            if (p.primaryTasks?.length) {

                md += `**Primary Tasks:** ${p.primaryTasks.join(', ')}\n\n`;

            }

        });

    }

    // User Journeys

    if (prd.userJourneys?.length) {

        md += `## User Journeys\n\n`;

        prd.userJourneys.forEach(j => {

            md += `### ${j.name}${j.persona ? ` (${j.persona})` : ''}\n\n`;

            if (j.goal) md += `**Goal:** ${j.goal}\n\n`;

            if (j.preconditions?.length) {

                md += `**Preconditions:** ${j.preconditions.join(', ')}\n\n`;

            }

            if (j.steps?.length) {

                md += `**Steps:**\n\n`;

                j.steps.forEach(s => {

                    md += `${s.step}. ${s.action}\n`;

                    if (s.systemResponse) md += `   → ${s.systemResponse}\n`;

                    if (s.outcome) md += `   ✓ ${s.outcome}\n`;

                });

                md += '\n';

            }

            if (j.successCriteria) md += `**Success Criteria:** ${j.successCriteria}\n\n`;

        });

    }

    // Domain Model

    if (prd.domainModel) {

        md += `## Domain Model\n\n`;

        if (prd.domainModel.overview) md += `${prd.domainModel.overview}\n\n`;

        if (prd.domainModel.coreConcepts?.length) {

            md += `### Core Concepts\n\n`;

            prd.domainModel.coreConcepts.forEach(c => {

                md += `#### ${c.name}\n\n`;

                if (c.description) md += `${c.description}\n\n`;

                if (c.attributes?.length) {

                    md += `**Attributes:**\n`;

                    c.attributes.forEach(a => {

                        md += `- \`${a.name}\` (${a.type})${a.required ? ' *required*' : ''}${a.description ? ` — ${a.description}` : ''}\n`;

                    });

                    md += '\n';

                }

                if (c.relationships?.length) {

                    md += `**Relationships:**\n`;

                    c.relationships.forEach(r => {

                        md += `- → ${r.target} [${r.type}]${r.cardinality ? ` (${r.cardinality})` : ''}\n`;

                    });

                    md += '\n';

                }

                if (c.businessRules?.length) {

                    md += `**Business Rules:**\n`;

                    c.businessRules.forEach(r => md += `- ${r}\n`);

                    md += '\n';

                }

            });

        }

        if (prd.domainModel.glossary?.length) {

            md += `### Glossary\n\n`;

            md += `| Term | Definition |\n|---|---|\n`;

            prd.domainModel.glossary.forEach(g => {

                md += `| **${g.term}** | ${g.definition} |\n`;

            });

            md += '\n';

        }

    }

    // Requirements References

    if (prd.functionalRequirementIds?.length) {

        md += `## Functional Requirements\n\n`;

        prd.functionalRequirementIds.forEach(id => md += `- ${id}\n`);

        md += '\n';

    }

    if (prd.nonFunctionalRequirementIds?.length) {

        md += `## Non-Functional Requirements\n\n`;

        prd.nonFunctionalRequirementIds.forEach(id => md += `- ${id}\n`);

        md += '\n';

    }

    // Success Criteria

    if (prd.successCriteria?.length) {

        md += `## Success Criteria\n\n`;

        md += `| Criterion | Category | Target | Timeframe |\n|---|---|---|---|\n`;

        prd.successCriteria.forEach(sc => {

            md += `| ${sc.criterion} | ${sc.category || '-'} | ${sc.target || '-'} | ${sc.timeframe || '-'} |\n`;

        });

        md += '\n';

    }

    // Scope

    if (prd.scope) {

        md += `## Scope\n\n`;

        if (prd.scope.inScope?.length) {

            md += `### In Scope\n\n`;

            prd.scope.inScope.forEach(s => {

                md += `- **${s.item}**${s.priority ? ` [${s.priority}]` : ''}${s.description ? ` — ${s.description}` : ''}\n`;

            });

            md += '\n';

        }

        if (prd.scope.outOfScope?.length) {

            md += `### Out of Scope\n\n`;

            prd.scope.outOfScope.forEach(s => {

                md += `- ${s.item}${s.rationale ? ` — ${s.rationale}` : ''}\n`;

            });

            md += '\n';

        }

        if (prd.scope.assumptions?.length) {

            md += `### Assumptions\n\n`;

            prd.scope.assumptions.forEach(a => {

                md += `- ${a.assumption}${a.validated ? ' ✓' : ''}\n`;

            });

            md += '\n';

        }

        if (prd.scope.dependencies?.length) {

            md += `### Dependencies\n\n`;

            prd.scope.dependencies.forEach(d => {

                md += `- ${d.dependency}${d.type ? ` [${d.type}]` : ''}${d.status ? ` — ${d.status}` : ''}\n`;

            });

            md += '\n';

        }

    }

    // Constraints

    if (prd.constraints?.length) {

        md += `## Constraints\n\n`;

        md += `| Type | Description | Impact | Flexibility |\n|---|---|---|---|\n`;

        prd.constraints.forEach(c => {

            md += `| ${c.type} | ${c.description} | ${c.impact || '-'} | ${c.flexibility || '-'} |\n`;

        });

        md += '\n';

    }

    // Risks

    if (prd.risks?.length) {

        md += `## Risks\n\n`;

        md += `| Risk | Category | Probability | Impact | Mitigation |\n|---|---|---|---|---|\n`;

        prd.risks.forEach(r => {

            md += `| ${r.risk} | ${r.category || '-'} | ${r.probability || '-'} | ${r.impact || '-'} | ${r.mitigation || '-'} |\n`;

        });

        md += '\n';

    }

    // Timeline

    if (prd.timeline) {

        md += `## Timeline\n\n`;

        if (prd.timeline.overview) md += `${prd.timeline.overview}\n\n`;

        if (prd.timeline.phases?.length) {

            prd.timeline.phases.forEach(p => {

                md += `### ${p.name}\n\n`;

                if (p.description) md += `${p.description}\n\n`;

                if (p.startDate || p.endDate) md += `**Period:** ${p.startDate || '?'} — ${p.endDate || '?'}\n\n`;

                if (p.deliverables?.length) {

                    md += `**Deliverables:**\n`;

                    p.deliverables.forEach(d => md += `- ${d}\n`);

                    md += '\n';

                }

            });

        }

    }

    return md;

}
/**

 * Generate markdown version of architecture document

 */

export function generateArchitectureMarkdown(state: BmadArtifacts): string {

    const arch = state.architecture;

    if (!arch) return '';

    let md = `# ${arch.overview?.projectName || state.projectName} - Architecture Document\n\n`;

    md += `**Status:** ${arch.status || 'draft'}\n\n`;

    // Overview

    if (arch.overview) {

        md += `## Overview\n\n`;

        if (arch.overview.architectureStyle) md += `**Architecture Style:** ${arch.overview.architectureStyle}\n\n`;

        if (arch.overview.summary) md += `${arch.overview.summary}\n\n`;

        if (arch.overview.vision) md += `**Vision:** ${arch.overview.vision}\n\n`;

        if (arch.overview.principles?.length) {

            md += `### Architecture Principles\n\n`;

            arch.overview.principles.forEach(p => {

                md += `- **${p.name}**${p.description ? ` — ${p.description}` : ''}\n`;

                if (p.rationale) md += `  - Rationale: ${p.rationale}\n`;

            });

            md += '\n';

        }

    }

    // Context

    if (arch.context) {

        md += `## Context\n\n`;

        if (arch.context.businessContext) md += `### Business Context\n\n${arch.context.businessContext}\n\n`;

        if (arch.context.technicalContext) md += `### Technical Context\n\n${arch.context.technicalContext}\n\n`;

        if (arch.context.qualityAttributes?.length) {

            md += `### Quality Attributes\n\n`;

            md += `| Attribute | Priority | Target |\n|---|---|---|\n`;

            arch.context.qualityAttributes.forEach(q => {

                md += `| ${q.attribute} | ${q.priority || '-'} | ${q.target || '-'} |\n`;

            });

            md += '\n';

        }

        if (arch.context.constraints?.length) {

            md += `### Constraints\n\n`;

            arch.context.constraints.forEach(c => {

                md += `- **${c.constraint}**${c.type ? ` [${c.type}]` : ''}\n`;

                if (c.rationale) md += `  - Rationale: ${c.rationale}\n`;

                if (c.impact) md += `  - Impact: ${c.impact}\n`;

            });

            md += '\n';

        }

    }

    // Tech Stack

    if (arch.techStack) {

        md += `## Technology Stack\n\n`;

        const ts = arch.techStack;

        if (ts.frontend) {

            md += `### Frontend\n\n`;

            if (ts.frontend.framework) md += `- **Framework:** ${ts.frontend.framework}\n`;

            if (ts.frontend.language) md += `- **Language:** ${ts.frontend.language}\n`;

            if (ts.frontend.stateManagement) md += `- **State Management:** ${ts.frontend.stateManagement}\n`;

            if (ts.frontend.styling) md += `- **Styling:** ${ts.frontend.styling}\n`;

            if (ts.frontend.testing) md += `- **Testing:** ${ts.frontend.testing}\n`;

            if (ts.frontend.buildTool) md += `- **Build Tool:** ${ts.frontend.buildTool}\n`;

            if (ts.frontend.rationale) md += `\n${ts.frontend.rationale}\n`;

            md += '\n';

        }

        if (ts.backend) {

            md += `### Backend\n\n`;

            if (ts.backend.framework) md += `- **Framework:** ${ts.backend.framework}\n`;

            if (ts.backend.language) md += `- **Language:** ${ts.backend.language}\n`;

            if (ts.backend.runtime) md += `- **Runtime:** ${ts.backend.runtime}\n`;

            if (ts.backend.apiStyle) md += `- **API Style:** ${ts.backend.apiStyle}\n`;

            if (ts.backend.rationale) md += `\n${ts.backend.rationale}\n`;

            md += '\n';

        }

        if (ts.database) {

            md += `### Database\n\n`;

            if (ts.database.primary) md += `- **Primary:** ${ts.database.primary}\n`;

            if (ts.database.secondary) md += `- **Secondary:** ${ts.database.secondary}\n`;

            if (ts.database.caching) md += `- **Caching:** ${ts.database.caching}\n`;

            if (ts.database.orm) md += `- **ORM:** ${ts.database.orm}\n`;

            if (ts.database.schemaStrategy) md += `- **Schema Strategy:** ${ts.database.schemaStrategy}\n`;

            md += '\n';

        }

        if (ts.infrastructure) {

            md += `### Infrastructure\n\n`;

            if (ts.infrastructure.hosting) md += `- **Hosting:** ${ts.infrastructure.hosting}\n`;

            if (ts.infrastructure.containerization) md += `- **Containerization:** ${ts.infrastructure.containerization}\n`;

            if (ts.infrastructure.orchestration) md += `- **Orchestration:** ${ts.infrastructure.orchestration}\n`;

            if (ts.infrastructure.cicd) md += `- **CI/CD:** ${ts.infrastructure.cicd}\n`;

            if (ts.infrastructure.monitoring) md += `- **Monitoring:** ${ts.infrastructure.monitoring}\n`;

            if (ts.infrastructure.logging) md += `- **Logging:** ${ts.infrastructure.logging}\n`;

            md += '\n';

        }

    }

    // Architecture Decisions

    if (arch.decisions?.length) {

        md += `## Architecture Decisions\n\n`;

        arch.decisions.forEach(d => {

            md += `### ADR-${d.id}: ${d.title}\n\n`;

            md += `**Status:** ${d.status}${d.date ? ` | **Date:** ${d.date}` : ''}\n\n`;

            md += `**Context:** ${d.context}\n\n`;

            md += `**Decision:** ${d.decision}\n\n`;

            if (d.rationale) md += `**Rationale:** ${d.rationale}\n\n`;

            if (d.consequences) {

                if (d.consequences.positive?.length) {

                    md += `**Positive Consequences:**\n`;

                    d.consequences.positive.forEach(c => md += `- ✅ ${c}\n`);

                }

                if (d.consequences.negative?.length) {

                    md += `**Negative Consequences:**\n`;

                    d.consequences.negative.forEach(c => md += `- ⚠️ ${c}\n`);

                }

                md += '\n';

            }

            if (d.alternatives?.length) {

                md += `**Alternatives Considered:**\n`;

                d.alternatives.forEach(a => {

                    md += `- **${a.option}**${a.rejectionReason ? ` — Rejected: ${a.rejectionReason}` : ''}\n`;

                });

                md += '\n';

            }

            md += '---\n\n';

        });

    }

    // Patterns

    if (arch.patterns?.length) {

        md += `## Architecture Patterns\n\n`;

        arch.patterns.forEach(p => {

            md += `### ${p.pattern}${p.category ? ` [${p.category}]` : ''}\n\n`;

            if (p.usage) md += `**Usage:** ${p.usage}\n\n`;

            if (p.implementation) md += `**Implementation:** ${p.implementation}\n\n`;

            if (p.rationale) md += `**Rationale:** ${p.rationale}\n\n`;

        });

    }

    // System Components

    if (arch.systemComponents?.length) {

        md += `## System Components\n\n`;

        arch.systemComponents.forEach(c => {

            md += `### ${c.name}${c.type ? ` (${c.type})` : ''}\n\n`;

            if (c.description) md += `${c.description}\n\n`;

            if (c.technology) md += `**Technology:** ${c.technology}\n\n`;

            if (c.responsibilities?.length) {

                md += `**Responsibilities:**\n`;

                c.responsibilities.forEach(r => md += `- ${r}\n`);

                md += '\n';

            }

            if (c.interfaces?.length) {

                md += `**Interfaces:**\n`;

                c.interfaces.forEach(i => {

                    md += `- \`${i.name}\`${i.type ? ` [${i.type}]` : ''}${i.description ? ` — ${i.description}` : ''}\n`;

                });

                md += '\n';

            }

            if (c.dependencies?.length) {

                md += `**Dependencies:** ${c.dependencies.join(', ')}\n\n`;

            }

        });

    }

    // Project Structure

    if (arch.projectStructure) {

        md += `## Project Structure\n\n`;

        if (arch.projectStructure.description) md += `${arch.projectStructure.description}\n\n`;

        if (arch.projectStructure.monorepo !== undefined) {

            md += `**Monorepo:** ${arch.projectStructure.monorepo ? 'Yes' : 'No'}\n\n`;

        }

        if (arch.projectStructure.structure?.length) {

            md += `\`\`\`\n`;

            arch.projectStructure.structure.forEach(s => {

                md += `${s.path}${s.purpose ? `  # ${s.purpose}` : ''}\n`;

            });

            md += `\`\`\`\n\n`;

        }

        if (arch.projectStructure.namingConventions?.length) {

            md += `### Naming Conventions\n\n`;

            md += `| Type | Convention | Example |\n|---|---|---|\n`;

            arch.projectStructure.namingConventions.forEach(n => {

                md += `| ${n.type} | ${n.convention || '-'} | ${n.example || '-'} |\n`;

            });

            md += '\n';

        }

    }

    // Data Flow

    if (arch.dataFlow) {

        md += `## Data Flow\n\n`;

        if (arch.dataFlow.description) md += `${arch.dataFlow.description}\n\n`;

        if (arch.dataFlow.flows?.length) {

            md += `| Flow | Source | Destination | Protocol |\n|---|---|---|---|\n`;

            arch.dataFlow.flows.forEach(f => {

                md += `| ${f.name} | ${f.source || '-'} | ${f.destination || '-'} | ${f.protocol || '-'} |\n`;

            });

            md += '\n';

        }

    }

    // Security

    if (arch.security) {

        md += `## Security Architecture\n\n`;

        if (arch.security.overview) md += `${arch.security.overview}\n\n`;

        if (arch.security.authentication) {

            md += `### Authentication\n\n`;

            const a = arch.security.authentication;

            if (a.method) md += `- **Method:** ${a.method}\n`;

            if (a.provider) md += `- **Provider:** ${a.provider}\n`;

            if (a.tokenStrategy) md += `- **Token Strategy:** ${a.tokenStrategy}\n`;

            if (a.description) md += `\n${a.description}\n`;

            md += '\n';

        }

        if (arch.security.authorization) {

            md += `### Authorization\n\n`;

            const a = arch.security.authorization;

            if (a.method) md += `**Method:** ${a.method}\n\n`;

            if (a.roles?.length) {

                md += `**Roles:**\n`;

                a.roles.forEach(r => {

                    md += `- **${r.role}**${r.permissions?.length ? `: ${r.permissions.join(', ')}` : ''}\n`;

                });

                md += '\n';

            }

        }

        if (arch.security.dataProtection) {

            md += `### Data Protection\n\n`;

            const dp = arch.security.dataProtection;

            if (dp.atRest) md += `- **At Rest:** ${dp.atRest}\n`;

            if (dp.inTransit) md += `- **In Transit:** ${dp.inTransit}\n`;

            if (dp.sensitiveData) md += `- **Sensitive Data:** ${dp.sensitiveData}\n`;

            if (dp.pii) md += `- **PII Handling:** ${dp.pii}\n`;

            md += '\n';

        }

    }

    // Deployment

    if (arch.deployment) {

        md += `## Deployment\n\n`;

        if (arch.deployment.strategy) md += `**Strategy:** ${arch.deployment.strategy}\n\n`;

        if (arch.deployment.environments?.length) {

            md += `### Environments\n\n`;

            md += `| Environment | Purpose |\n|---|---|\n`;

            arch.deployment.environments.forEach(e => {

                md += `| ${e.name} | ${e.purpose || '-'} |\n`;

            });

            md += '\n';

        }

    }

    // Integrations

    if (arch.integrations?.length) {

        md += `## Integrations\n\n`;

        arch.integrations.forEach(i => {

            md += `### ${i.name}${i.type ? ` (${i.type})` : ''}\n\n`;

            if (i.description) md += `${i.description}\n\n`;

            if (i.protocol) md += `**Protocol:** ${i.protocol}\n`;

            if (i.authentication) md += `**Authentication:** ${i.authentication}\n`;

            if (i.dataFormat) md += `**Data Format:** ${i.dataFormat}\n`;

            if (i.sla) md += `**SLA:** ${i.sla}\n`;

            md += '\n';

        });

    }

    return md;

}
/**

 * Generate markdown version of test cases

 */

export function generateTestCasesMarkdown(state: BmadArtifacts): string {

    const testCases = state.testCases;

    if (!testCases?.length) return '';

    let md = `# ${state.projectName} - Test Cases\n\n`;

    // Summary table

    const byType: Record<string, number> = {};

    const byStatus: Record<string, number> = {};

    testCases.forEach(tc => {

        byType[tc.type] = (byType[tc.type] || 0) + 1;

        byStatus[tc.status] = (byStatus[tc.status] || 0) + 1;

    });

    md += `## Summary\n\n`;

    md += `**Total Test Cases:** ${testCases.length}\n\n`;

    md += `| Type | Count |\n|---|---|\n`;

    Object.entries(byType).forEach(([t, c]) => md += `| ${t} | ${c} |\n`);

    md += '\n';

    md += `| Status | Count |\n|---|---|\n`;

    Object.entries(byStatus).forEach(([s, c]) => md += `| ${s} | ${c} |\n`);

    md += '\n';

    // Group by type

    const types = ['unit', 'integration', 'e2e', 'acceptance'] as const;

    types.forEach(type => {

        const cases = testCases.filter(tc => tc.type === type);

        if (!cases.length) return;

        md += `## ${type.charAt(0).toUpperCase() + type.slice(1)} Tests\n\n`;

        cases.forEach(tc => {

            md += `### ${tc.id}: ${tc.title}\n\n`;

            if (tc.description) md += `${tc.description}\n\n`;

            md += `**Status:** ${tc.status}`;

            if (tc.priority) md += ` | **Priority:** ${tc.priority}`;

            if (tc.storyId) md += ` | **Story:** ${tc.storyId}`;

            if (tc.epicId) md += ` | **Epic:** ${tc.epicId}`;

            md += '\n\n';

            if (tc.preconditions?.length) {

                md += `**Preconditions:**\n`;

                tc.preconditions.forEach(p => md += `- ${p}\n`);

                md += '\n';

            }

            if (tc.steps?.length) {

                md += `**Steps:**\n\n`;

                tc.steps.forEach((step, i) => {

                    if (step.given || step.when || step.then) {

                        // BDD format

                        if (step.given) md += `- **Given** ${step.given}\n`;

                        if (step.when) md += `  **When** ${step.when}\n`;

                        if (step.then) md += `  **Then** ${step.then}\n`;

                        if (step.and?.length) step.and.forEach(a => md += `  **And** ${a}\n`);

                    } else if (step.action) {

                        // Step format

                        md += `${step.step || i + 1}. ${step.action}`;

                        if (step.expectedResult) md += ` → ${step.expectedResult}`;

                        md += '\n';

                    } else if (step.description) {

                        md += `${i + 1}. ${step.description}\n`;

                    }

                });

                md += '\n';

            }

            if (tc.expectedResult) md += `**Expected Result:** ${tc.expectedResult}\n\n`;

            if (tc.tags?.length) md += `**Tags:** ${tc.tags.join(', ')}\n\n`;

            md += '---\n\n';

        });

    });

    return md;

}
/**

 * Generate markdown version of test strategy

 */

export function generateTestStrategyMarkdown(state: BmadArtifacts): string {

    const ts = state.testStrategy;

    if (!ts) return '';

    let md = `# ${state.projectName} - Test Strategy\n\n`;

    md += `**Status:** ${ts.status || 'draft'}\n\n`;

    if (ts.title) md += `## ${ts.title}\n\n`;

    if (ts.scope) md += `## Scope\n\n${ts.scope}\n\n`;

    if (ts.approach) md += `## Approach\n\n${ts.approach}\n\n`;

    if (ts.testTypes?.length) {

        md += `## Test Types\n\n`;

        ts.testTypes.forEach(t => md += `- ${t}\n`);

        md += '\n';

    }

    if (ts.tooling?.length) {

        md += `## Tooling\n\n`;

        ts.tooling.forEach(t => md += `- ${t}\n`);

        md += '\n';

    }

    if (ts.coverageTargets?.length) {

        md += `## Coverage Targets\n\n`;

        md += `| Area | Target |\n|---|---|\n`;

        ts.coverageTargets.forEach(ct => {

            md += `| ${ct.area} | ${ct.target} |\n`;

        });

        md += '\n';

    }

    if (ts.riskAreas?.length) {

        md += `## Risk Areas\n\n`;

        ts.riskAreas.forEach(r => md += `- ${r}\n`);

        md += '\n';

    }

    return md;

}
/**

 * Generate markdown version of test design

 */

export function generateTestDesignMarkdown(td: any, state: BmadArtifacts): string {

    if (!td) return '';

    let md = `# ${state.projectName} - Test Design\n\n`;

    md += `**Status:** ${td.status || 'draft'}\n\n`;

    // Epic info

    if (td.epicInfo) {

        const ei = td.epicInfo;

        md += `## Epic Information\n\n`;

        if (ei.epicId) md += `- **Epic ID:** ${ei.epicId}\n`;

        if (ei.epicTitle) md += `- **Title:** ${ei.epicTitle}\n`;

        if (ei.epicGoal) md += `- **Goal:** ${ei.epicGoal}\n`;

        if (ei.prdReference) md += `- **PRD Reference:** ${ei.prdReference}\n`;

        if (ei.architectureReference) md += `- **Architecture Reference:** ${ei.architectureReference}\n`;

        if (ei.storyCount != null) md += `- **Story Count:** ${ei.storyCount}\n`;

        md += '\n';

    }

    // Summary

    if (td.summary) {

        const s = td.summary;

        md += `## Summary\n\n`;

        if (s.scope) md += `**Scope:** ${s.scope}\n\n`;

        if (s.approach) md += `**Approach:** ${s.approach}\n\n`;

        if (s.riskSummary) md += `**Risk Summary:** ${s.riskSummary}\n\n`;

        if (s.coverageSummary) md += `**Coverage Summary:** ${s.coverageSummary}\n\n`;

        if (s.objectives?.length) {

            md += `### Objectives\n\n`;

            s.objectives.forEach((o: any) => md += `- ${o}\n`);

            md += '\n';

        }

        if (s.testLevels?.length) {

            md += `### Test Levels\n\n`;

            md += `| Level | Purpose | Coverage |\n|---|---|---|\n`;

            s.testLevels.forEach((tl: any) => {

                md += `| ${tl.level || ''} | ${tl.purpose || ''} | ${tl.coverage || ''} |\n`;

            });

            md += '\n';

        }

        if (s.keyDecisions?.length) {

            md += `### Key Decisions\n\n`;

            s.keyDecisions.forEach((d: any) => md += `- ${d}\n`);

            md += '\n';

        }

    }

    // Not in scope

    if (td.notInScope?.length) {

        md += `## Not In Scope\n\n`;

        td.notInScope.forEach((nis: any) => {

            md += `- **${nis.item || 'N/A'}** — ${nis.reason || 'No reason given'}`;

            if (nis.riskAccepted) md += ` (risk accepted)`;

            md += '\n';

        });

        md += '\n';

    }

    // Risk assessment

    if (td.riskAssessment) {

        const ra = td.riskAssessment;

        md += `## Risk Assessment\n\n`;

        if (ra.overview) md += `${ra.overview}\n\n`;

        const renderRisks = (label: string, risks?: any[]) => {

            if (!risks?.length) return;

            md += `### ${label}\n\n`;

            risks.forEach((r: any) => {

                md += `- **${r.riskId || 'N/A'}** [${r.category || ''}]: ${r.description || ''}\n`;

                md += `  - Probability: ${r.probability || '?'} | Impact: ${r.impact || '?'} | Score: ${r.score ?? '?'}\n`;

                if (r.testStrategy) md += `  - Test Strategy: ${r.testStrategy}\n`;

                if (r.mitigation) md += `  - Mitigation: ${r.mitigation}\n`;

            });

            md += '\n';

        };

        renderRisks('High Priority', ra.highPriority);

        renderRisks('Medium Priority', ra.mediumPriority);

        renderRisks('Low Priority', ra.lowPriority);

    }

    // Entry/Exit criteria

    if (td.entryExitCriteria) {

        const eec = td.entryExitCriteria;

        md += `## Entry & Exit Criteria\n\n`;

        if (eec.entry?.length) {

            md += `### Entry Criteria\n\n`;

            eec.entry.forEach((e: any) => {

                md += `- ${e.criterion || ''}`;

                if (e.mandatory) md += ` **(mandatory)**`;

                if (e.verification) md += ` — Verification: ${e.verification}`;

                md += '\n';

            });

            md += '\n';

        }

        if (eec.exit?.length) {

            md += `### Exit Criteria\n\n`;

            eec.exit.forEach((e: any) => {

                md += `- ${e.criterion || ''}`;

                if (e.mandatory) md += ` **(mandatory)**`;

                if (e.threshold) md += ` — Threshold: ${e.threshold}`;

                md += '\n';

            });

            md += '\n';

        }

    }

    // Coverage plan

    if (td.coveragePlan) {

        const cp = td.coveragePlan;

        md += `## Coverage Plan\n\n`;

        if (cp.overview) md += `${cp.overview}\n\n`;

        if (cp.coverageGoals) {

            const cg = cp.coverageGoals;

            md += `### Coverage Goals\n\n`;

            if (cg.codeStatement) md += `- Code Statement: ${cg.codeStatement}\n`;

            if (cg.codeBranch) md += `- Code Branch: ${cg.codeBranch}\n`;

            if (cg.requirementCoverage) md += `- Requirement Coverage: ${cg.requirementCoverage}\n`;

            if (cg.riskCoverage) md += `- Risk Coverage: ${cg.riskCoverage}\n`;

            md += '\n';

        }

        const renderCoverage = (label: string, items?: any[]) => {

            if (!items?.length) return;

            md += `### ${label}\n\n`;

            md += `| ID | Requirement | Level | Type | Approach | Automatable |\n|---|---|---|---|---|---|\n`;

            items.forEach((i: any) => {

                md += `| ${i.id || ''} | ${i.requirement || ''} | ${i.testLevel || ''} | ${i.testType || ''} | ${i.testApproach || ''} | ${i.automatable ?? ''} |\n`;

            });

            md += '\n';

        };

        renderCoverage('P0 — Critical', cp.p0);

        renderCoverage('P1 — High', cp.p1);

        renderCoverage('P2 — Medium', cp.p2);

        renderCoverage('P3 — Low', cp.p3);

    }

    // Test cases (brief listing)

    if (td.testCases?.length) {

        md += `## Test Cases\n\n`;

        md += `| ID | Title | Priority | Type | Level |\n|---|---|---|---|---|\n`;

        td.testCases.forEach((tc: any) => {

            md += `| ${tc.id || ''} | ${tc.title || ''} | ${tc.priority || ''} | ${tc.type || ''} | ${tc.level || ''} |\n`;

        });

        md += '\n';

    }

    // Execution order

    if (td.executionOrder) {

        const eo = td.executionOrder;

        md += `## Execution Order\n\n`;

        if (eo.overview) md += `${eo.overview}\n\n`;

        if (eo.smoke?.length) {

            md += `### Smoke Tests\n\n`;

            eo.smoke.forEach((s: any) => md += `${s.order ?? '?'}. ${s.testId || ''}: ${s.description || ''}\n`);

            md += '\n';

        }

    }

    // Resource estimates

    if (td.resourceEstimates) {

        const re = td.resourceEstimates;

        md += `## Resource Estimates\n\n`;

        if (re.totalEffort) md += `**Total Effort:** ${re.totalEffort}\n\n`;

        if (re.breakdown?.length) {

            md += `| Activity | Effort | Resources | Duration |\n|---|---|---|---|\n`;

            re.breakdown.forEach((b: any) => {

                md += `| ${b.activity || ''} | ${b.effort || ''} | ${b.resources ?? ''} | ${b.duration || ''} |\n`;

            });

            md += '\n';

        }

    }

    // Quality gate criteria

    if (td.qualityGateCriteria?.length) {

        md += `## Quality Gate Criteria\n\n`;

        td.qualityGateCriteria.forEach((qg: any) => {

            md += `- **${qg.criterion || ''}** — Threshold: ${qg.threshold || 'N/A'}`;

            if (qg.mandatory) md += ` **(mandatory)**`;

            md += '\n';

        });

        md += '\n';

    }

    return md;

}

