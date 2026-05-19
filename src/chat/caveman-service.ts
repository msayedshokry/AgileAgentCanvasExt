import * as vscode from 'vscode';

export type CavemanIntensity = 'lite' | 'full' | 'ultra' | 'wenyan';

const VALID_INTENSITIES: CavemanIntensity[] = ['lite', 'full', 'ultra', 'wenyan'];

const INTENSITY_DESCRIPTIONS: Record<CavemanIntensity, string> = {
    lite: 'Lite — drops filler and hedging, keeps basic grammar',
    full: 'Full — drops articles, filler, pleasantries; fragments OK (default)',
    ultra: 'Ultra — maximum compression; abbreviate everything, arrows for causality',
    wenyan: 'Wenyan — classical Chinese literary terse (ultra-minimal poetic form)'
};

const INTENSITY_PROMPT_SUFFIX: Record<CavemanIntensity, string> = {
    lite: `
## Caveman Mode (Lite)
Drop filler words, hedging, and pleasantries. Keep sentences short. Use direct language. Technical accuracy must remain 100%. Code blocks unchanged.`,
    full: `
## Caveman Mode (Full)
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging
- Fragments OK. Short synonyms preferred (big not extensive, fix not "implement a solution for")
- Abbreviate common terms (DB/auth/config/req/res/fn/impl)
- Strip conjunctions. Use arrows for causality (X -> Y)
- One word when one word enough
- Technical terms stay exact. Code blocks unchanged. Errors quoted exact
- Pattern: [thing] [action] [reason]. [next step].

Auto-Clarity Exception: temporarily drop caveman for security warnings, irreversible action confirmations, multi-step sequences where fragment order risks misread, or when user asks to clarify. Resume caveman after clear part done.`,
    ultra: `
## Caveman Mode (Ultra)
Max compression. Smart caveman on steroids.

Rules:
- No articles. No filler. No pleasantries. No hedging. No conjunctions.
- Abbreviate aggressively (cfg not config, fn not function, err not error, impl not implement)
- Arrows for causality (X -> Y). Equal signs for equivalence (A = B)
- Fragments required. One word = best word.
- Pattern: [noun] [verb] [reason]. [next].
- Technical terms exact. Code blocks unchanged. Errors quoted exact.
- Auto-Clarity Exception ONLY for irreversible ops or security warnings.`,
    wenyan: `
## Caveman Mode (Wenyan)
Classical Chinese literary terse. Ultra-minimal poetic form.

Rules:
- No particles. No filler. No modern pleasantries.
- Use classical Chinese sentence structure: [subject] [verb] [object]. Omit all else.
- Technical terms in English stay exact. Code blocks unchanged.
- Pattern: 述事简. 释因明. (State briefly. Explain cause clearly.)
- Auto-Clarity Exception for irreversible ops or security warnings.`
};

export class CavemanService {
    private static readonly ENABLED_KEY = 'caveman.enabled';
    private static readonly INTENSITY_KEY = 'caveman.intensity';

    constructor(private context: vscode.ExtensionContext) {}

    isEnabled(): boolean {
        return this.context.globalState.get<boolean>(CavemanService.ENABLED_KEY, false);
    }

    getIntensity(): CavemanIntensity {
        const raw = this.context.globalState.get<string>(CavemanService.INTENSITY_KEY, 'full');
        return VALID_INTENSITIES.includes(raw as CavemanIntensity) ? (raw as CavemanIntensity) : 'full';
    }

    async setEnabled(enabled: boolean): Promise<void> {
        await this.context.globalState.update(CavemanService.ENABLED_KEY, enabled);
    }

    async setIntensity(intensity: string): Promise<boolean> {
        if (!VALID_INTENSITIES.includes(intensity as CavemanIntensity)) {
            return false;
        }
        await this.context.globalState.update(CavemanService.INTENSITY_KEY, intensity);
        return true;
    }

    async toggle(): Promise<boolean> {
        const next = !this.isEnabled();
        await this.setEnabled(next);
        return next;
    }

    getSystemPromptSuffix(): string | null {
        if (!this.isEnabled()) {
            return null;
        }
        return INTENSITY_PROMPT_SUFFIX[this.getIntensity()];
    }

    getStatusMarkdown(): string {
        const enabled = this.isEnabled();
        const intensity = this.getIntensity();
        const desc = INTENSITY_DESCRIPTIONS[intensity];

        if (!enabled) {
            return `## 🗿 Caveman Mode\n\nStatus: **OFF**\n\nToggle on with \`/caveman on\` or \`/caveman lite|full|ultra|wenyan\`.`;
        }

        return `## 🗿 Caveman Mode\n\nStatus: **ON** (${intensity})\n\n${desc}\n\nToggle off with \`/caveman off\` or \`/caveman stop\`.`;
    }

    async pickIntensity(): Promise<CavemanIntensity | undefined> {
        const items = VALID_INTENSITIES.map((i) => ({
            label: i.charAt(0).toUpperCase() + i.slice(1),
            description: INTENSITY_DESCRIPTIONS[i],
            intensity: i
        }));

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select caveman intensity level',
            title: '🗿 Caveman Mode Intensity'
        });

        return picked?.intensity;
    }
}

export function getCavemanService(): CavemanService | undefined {
    // Lazy singleton — set by extension.ts during activation
    return (global as any).__agileagentcanvas_caveman_service as CavemanService | undefined;
}

export function setCavemanService(service: CavemanService): void {
    (global as any).__agileagentcanvas_caveman_service = service;
}
