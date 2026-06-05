/**
 * Skill promoter — identifies heavily-used skills and proposes them
 * for promotion to first-class LM tools.
 *
 * This module runs analysis against skill usage stats and generates
 * promotion proposals written to `.agileagentcanvas-context/promotion-proposals/`.
 *
 * Reuses `toolTelemetry` from src/chat/tool-telemetry.ts as the data source
 * until a real `catalogueService` is implemented in src/state/catalogue-service.ts.
 */

// ─── Catalogue service (minimal implementation using telemetry) ────────────────
import { toolTelemetry } from '../chat/tool-telemetry';

interface Skill {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    avgTokenSavings?: number;
    exampleInvocation?: string;
}

const catalogueService = {
    listSkills: async (): Promise<Skill[]> => {
        // Get unique tool names from telemetry that look "skill-like" (e.g., called > 5 times)
        const stats = toolTelemetry.getStats(7 * 24 * 60 * 60 * 1000);
        return Object.entries(stats.byTool)
            .filter(([_, s]) => s.count >= 5)
            .map(([name, s]) => ({
                name: name.replace('agileagentcanvas_', '').replace(/_/g, '-'),
                description: `Promoted from telemetry: called ${s.count} times in last 7 days`,
                inputSchema: undefined,
                avgTokenSavings: 300,
                exampleInvocation: `agileagentcanvas_${name.replace(/_/g, '_')}(...)`,
            }));
    },
    getUsageStats: async (name: string, _days: number): Promise<{ callsPerWeek: number; successRate: number }> => {
        const stats = toolTelemetry.getStats(7 * 24 * 60 * 60 * 1000);
        const toolName = `agileagentcanvas_${name.replace(/-/g, '_')}`;
        const s = stats.byTool[toolName];
        return s ? { callsPerWeek: s.count, successRate: 1 - (s.errors / s.count) } : { callsPerWeek: 0, successRate: 0 };
    },
};

// ─── Local types ─────────────────────────────────────────────────────────────

interface Skill {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    avgTokenSavings?: number;
    exampleInvocation?: string;
}

interface ToolSpec {
    name: string;
    modelDescription: string;
    inputSchema: Record<string, unknown>;
    estimatedTokenSavings: number;
    exampleInvocation: string;
}

export interface PromotionProposal {
    skillName: string;
    callsPerWeek: number;
    successRate: number;
    proposedToolSpec: ToolSpec;
    reason: string;
}

// ─── SkillPromoter ───────────────────────────────────────────────────────────

export class SkillPromoter {
    /**
     * Analyze skill usage and generate promotion proposals for skills that
     * are called >10x/week with >80% success rate.
     */
    async analyzeAndPropose(): Promise<PromotionProposal[]> {
        const skills = await catalogueService.listSkills();
        const proposals: PromotionProposal[] = [];

        for (const skill of skills) {
            const stats = await catalogueService.getUsageStats(skill.name, 7);
            if (stats.callsPerWeek > 10 && stats.successRate > 0.8) {
                proposals.push({
                    skillName: skill.name,
                    callsPerWeek: stats.callsPerWeek,
                    successRate: stats.successRate,
                    proposedToolSpec: this.skillToToolSpec(skill),
                    reason: `Called ${stats.callsPerWeek}x/week with ${(stats.successRate * 100).toFixed(0)}% success`,
                });
            }
        }

        return proposals;
    }

    private skillToToolSpec(skill: Skill): ToolSpec {
        return {
            name: `agileagentcanvas_${skill.name.replace(/-/g, '_')}`,
            modelDescription: skill.description,
            inputSchema: skill.inputSchema ?? { type: 'object', properties: {} },
            estimatedTokenSavings: skill.avgTokenSavings ?? 300,
            exampleInvocation: skill.exampleInvocation ?? '',
        };
    }
}

export const skillPromoter = new SkillPromoter();
