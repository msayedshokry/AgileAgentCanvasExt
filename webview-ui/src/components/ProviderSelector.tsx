import { useState, useEffect, useRef, useCallback } from 'react';
import { vscode } from '../vscodeApi';

export interface AvailableProvider {
    id: string;
    ide: string;
    label: string;
    hint: string;
    available: boolean;
}

interface ProviderSelectorProps {
    /** Compact style for embedding in a small header bar */
    compact?: boolean;
    /** Called whenever the user picks a different provider */
    onChange?: (providerId: string) => void;
}

const ID_LABELS: Record<string, string> = {
    auto: 'Auto',
    copilot: 'Copilot',
    claude: 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    antigravity: 'Antigravity',
    omp: 'Oh My Pi',
    'codex': 'Codex',
    'gemini-cli': 'Gemini CLI',
    aider: 'Aider',
    opencode: 'OpenCode',
    terminal: 'Terminal',
};

// ─── Per-provider icons (official brand marks, inlined as JSX) ─────────────
//
// All icons are inlined as React JSX rather than imported from .svg files.
// Reasons:
//   - Vite's asset pipeline (especially with `?url` and custom *.svg
//     declarations) has caused runtime TDZ errors in the past — see commit
//     history for "Cannot access 'E' before initialization".
//   - Inlining eliminates the asset file, the import, and any URL plumbing,
//     so the component is fully self-contained.
//   - Each icon is rendered with `currentColor` (or a fixed brand colour)
//     so it integrates cleanly with the VS Code theme.
//
// Sources for each brand mark are noted in the JSDoc below.

const ICON_PROPS = {
    width: 14,
    height: 14,
    'aria-hidden': true as const,
    focusable: false as const,
};

/** Official brand-icon switch. */
function iconFor(id: string): JSX.Element {
    switch (id) {
        case 'copilot':
            // simple-icons / githubcopilot.svg (MIT)
            return (
                <svg {...ICON_PROPS} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill="currentColor"
                        d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z"
                    />
                </svg>
            );
        case 'claude':
            // simple-icons / claude.svg (MIT) — Anthropic "spark" mark
            return (
                <svg {...ICON_PROPS} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill="currentColor"
                        d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
                    />
                </svg>
            );
        case 'cursor':
            // simple-icons / cursor.svg (MIT)
            return (
                <svg {...ICON_PROPS} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill="currentColor"
                        d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
                    />
                </svg>
            );
        case 'windsurf':
            // simple-icons / windsurf.svg (MIT)
            return (
                <svg {...ICON_PROPS} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill="currentColor"
                        d="M23.55 5.067c-1.2038-.002-2.1806.973-2.1806 2.1765v4.8676c0 .972-.8035 1.7594-1.7597 1.7594-.568 0-1.1352-.286-1.4718-.7659l-4.9713-7.1003c-.4125-.5896-1.0837-.941-1.8103-.941-1.1334 0-2.1533.9635-2.1533 2.153v4.8957c0 .972-.7969 1.7594-1.7596 1.7594-.57 0-1.1363-.286-1.4728-.7658L.4076 5.1598C.2822 4.9798 0 5.0688 0 5.2882v4.2452c0 .2147.0656.4228.1884.599l5.4748 7.8183c.3234.462.8006.8052 1.3509.9298 1.3771.313 2.6446-.747 2.6446-2.0977v-4.893c0-.972.7875-1.7593 1.7596-1.7593h.003a1.798 1.798 0 0 1 1.4718.7658l4.9723 7.0994c.4135.5905 1.05.941 1.8093.941 1.1587 0 2.1515-.9645 2.1515-2.153v-4.8948c0-.972.7875-1.7594 1.7596-1.7594h.194a.22.22 0 0 0 .2204-.2202v-4.622a.22.22 0 0 0-.2203-.2203Z"
                    />
                </svg>
            );
        case 'gemini-cli':
            // simple-icons / googlegemini.svg (MIT) — 4-pointed star
            return (
                <svg {...ICON_PROPS} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill="currentColor"
                        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
                    />
                </svg>
            );
        case 'omp':
            // omp.sh / favicon.svg — official OMP brand mark (dark rounded
            // square with a colorful π glyph).  Inlined with brand colours
            // because the gradient is part of the brand identity.
            return (
                <svg {...ICON_PROPS} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="omp-grad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#ed4abf" />
                            <stop offset=".5" stopColor="#9b4dff" />
                            <stop offset="1" stopColor="#5ad8e6" />
                        </linearGradient>
                    </defs>
                    <rect width="64" height="64" rx="12" fill="#0f0a14" />
                    <path fill="url(#omp-grad)" d="M14 16h36v8H40v32h-8V24h-6v22h-8V24h-4z" />
                </svg>
            );
        case 'antigravity':
            // Google Antigravity IDE — uses the OpenAI-A-style "A" mark with
            // red/yellow/green/blue blobs.  Inlined brand colours.
            return (
                <svg {...ICON_PROPS} viewBox="0 0 113 113" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <path
                        d="M89.7 93.7c4.67 3.5 11.67 1.17 5.25-5.25C75.7 69.78 79.78 18.45 55.87 18.45S36.03 69.78 16.78 88.45C9.78 95.45 17.37 97.2 22.03 93.7c18.08-12.25 16.92-33.83 33.83-33.83S71.62 81.45 89.7 93.7Z"
                        fill="#3186FF"
                    />
                </svg>
            );
        case 'opencode':
            // opencode.ai / favicon.svg — official OpenCode square mark
            // (dark background + light square inside).
            return (
                <svg {...ICON_PROPS} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <rect width="512" height="512" fill="#131010" />
                    <path d="M320 224V352H192V224H320Z" fill="#5A5858" />
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
                        fill="white"
                    />
                </svg>
            );
        case 'codex':
            // OpenAI's official knot mark — canonical 5-petal woven geometry.
            return (
                <svg {...ICON_PROPS} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path
                        fill="#10A37F"
                        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.053 6.053 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.787a4.5 4.5 0 0 1-.676 8.105V12.43a.79.79 0 0 0-.407-.685zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.682 4.66zM9.776 14.628l-2.02-1.164a.08.08 0 0 1-.038-.057V7.829a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
                    />
                </svg>
            );
        case 'aider':
            // Aider has no compact brand mark — its identity is the green
            // wordmark (Glass TTY monospace, brand colour #14b014).  A
            // 1-letter monogram reads cleanly at icon size.
            return (
                <svg {...ICON_PROPS} viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                    <text
                        x="7"
                        y="10.5"
                        textAnchor="middle"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                        fontWeight="700"
                        fontSize="11"
                        fill="#14b014"
                    >
                        a
                    </text>
                </svg>
            );
        case 'terminal':
            return (
                <svg {...ICON_PROPS} viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 5 7 8 4 11" />
                    <line x1="9" y1="11" x2="12" y2="11" />
                </svg>
            );
        case 'auto':
        default:
            return (
                <svg {...ICON_PROPS} viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8 8 3l5 5" />
                    <path d="M8 3v10" />
                </svg>
            );
    }
}

export function ProviderSelector({ compact = false, onChange }: ProviderSelectorProps) {
    const [providers, setProviders] = useState<AvailableProvider[]>([]);
    const [selected, setSelected] = useState<string>('auto');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch providers from the extension host on mount and whenever the
    // dropdown is opened (so availability reflects the current host state).
    const refresh = useCallback(() => {
        vscode.postMessage({ type: 'getChatProviders' });
    }, []);

    useEffect(() => {
        refresh();
        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') { return; }
            if (msg.type === 'chatProviders' && Array.isArray(msg.providers)) {
                setProviders(msg.providers);
                if (typeof msg.selected === 'string') {
                    setSelected(msg.selected);
                }
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [refresh]);

    // Click-outside to close.
    useEffect(() => {
        if (!open) { return; }
        const onDocClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    const handleSelect = (id: string) => {
        setSelected(id);
        setOpen(false);
        vscode.postMessage({ type: 'selectChatProvider', providerId: id });
        onChange?.(id);
    };

    const current = providers.find(p => p.id === selected);
    const displayLabel = current?.label ?? ID_LABELS[selected] ?? selected;
    const displayIcon = iconFor(selected);

    // Filter to available providers only — the extension backend reports
    // `available: false` for CLIs that aren't installed on PATH or for IDE
    // panels that aren't registered on this host. We hide those entries
    // entirely so the dropdown only shows working options.
    const visibleProviders = providers.filter(p => p.available || p.id === 'auto');

    return (
        <div
            ref={containerRef}
            className={`provider-selector ${compact ? 'compact' : ''} ${open ? 'open' : ''}`}
            title="Select AI provider for canvas actions"
        >
            <button
                type="button"
                className="provider-selector-trigger"
                onClick={() => { refresh(); setOpen(o => !o); }}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="provider-selector-icon">{displayIcon}</span>
                <span className="provider-selector-label">{displayLabel}</span>
                <span className="provider-selector-caret" aria-hidden>▾</span>
            </button>
            {open && (
                <ul className="provider-selector-menu" role="listbox">
                    {visibleProviders.length === 0 && (
                        <li className="provider-selector-empty">No providers installed on this host</li>
                    )}
                    {visibleProviders.map(p => {
                        const label = p.label ?? ID_LABELS[p.id] ?? p.id;
                        const icon = iconFor(p.id);
                        const isSelected = p.id === selected;
                        return (
                            <li key={p.id} role="option" aria-selected={isSelected}>
                                <button
                                    type="button"
                                    className={`provider-selector-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => handleSelect(p.id)}
                                    title={p.hint}
                                >
                                    <span className="provider-selector-icon">{icon}</span>
                                    <span className="provider-selector-item-label">{label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default ProviderSelector;
