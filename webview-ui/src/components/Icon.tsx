/**
 * Icon component — clean inline SVG icons replacing all emoji usage.
 *
 * Every icon renders as a 1em-sized inline SVG that inherits the parent's
 * `color` via `currentColor`, so it works seamlessly in both light and
 * dark themes without any extra CSS.
 */

export type IconName =
  // Artifact type icons
  | 'vision'          // was 🎯
  | 'requirement'     // was 📋
  | 'nfr'             // non-functional requirement
  | 'additional-req'  // additional requirement
  | 'epic'            // was ⚡
  | 'story'           // was 📝
  | 'use-case'        // was 👤
  | 'prd'             // was 📄 / 📑
  | 'architecture'    // was 🏗️
  | 'architecture-decision' // ADR / decision
  | 'system-component'      // component / cube
  | 'product-brief'   // was 📊
  | 'test-case'       // was 🧪
  | 'test-strategy'   // was 📐
  | 'task'            // story task / checklist
  | 'risk'            // risk / warning triangle
  // Action icons
  | 'info'            // was ℹ️
  | 'sparkle'         // was ✨
  | 'crystal-ball'    // was 🔮
  | 'split'           // was 🔀
  | 'chevron-down'    // was ▼
  | 'chevron-right'   // was ▶
  | 'close'           // was ✕
  | 'plus'            // was +
  // Theme icons
  | 'moon'            // was 🌙
  | 'sun'             // was ☀️
  | 'settings'        // was ⚙️
  // Modal / search icons
  | 'search'          // was 🔍
  | 'folder'          // was 📁
  | 'wrench'          // was 🛠️
  // Misc
  | 'pop-out'         // was ⤢
  | 'workflow'        // was ⚡ (in workflow FAB — reuses epic bolt with slight distinction)
  | 'rocket'          // start development
  | 'refresh'         // reload / sync indicator
  | 'docs'            // documentation / book
  | 'empty-canvas'    // decorative icon for empty state
  // Export / Import / Help
  | 'download'        // export / download arrow
  | 'upload'          // import / upload arrow
  | 'help'            // question-mark circle
  | 'keyboard'        // keyboard shortcuts
  | 'chat';           // chat bubble / ask

interface IconProps {
  name: IconName;
  size?: number | string;
  className?: string;
  title?: string;
}

const paths: Record<IconName, JSX.Element> = {
  // --- Artifact type icons ---
  vision: (
    // Target / crosshair
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </>
  ),
  requirement: (
    // Clipboard with lines
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 1h6v4H9z" fill="none" stroke="currentColor" strokeWidth="2" rx="1" />
      <line x1="9" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  nfr: (
    // Shield with gauge — non-functional / quality attribute
    <>
      <path d="M12 2L4 6v5c0 5.25 3.4 10.15 8 11.4 4.6-1.25 8-6.15 8-11.4V6l-8-4z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="12" x2="12" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'additional-req': (
    // Clipboard with plus sign — additional requirement
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 1h6v4H9z" fill="none" stroke="currentColor" strokeWidth="2" rx="1" />
      <line x1="12" y1="10" x2="12" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  epic: (
    // Lightning bolt
    <path d="M13 2L4 14h5l-1 8 9-12h-5l1-8z" fill="currentColor" />
  ),
  story: (
    // Document / note with pencil
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="2" />
      <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'use-case': (
    // Person silhouette
    <>
      <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  prd: (
    // Document pages
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="2" />
      <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  architecture: (
    // Building / columns
    <>
      <rect x="3" y="10" width="5" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="3" width="5" height="18" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="17" y="7" width="5" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  'architecture-decision': (
    // Scale / balance — ADR decision
    <>
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 7l8-4 8 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 7c0 3 2 5 4 5s4-2 4-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7c0 3 2 5 4 5s4-2 4-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'system-component': (
    // Cube / module — system component
    <>
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 22V12" stroke="currentColor" strokeWidth="2" />
      <path d="M3 7l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  'product-brief': (
    // Bar chart
    <>
      <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="10" y="6" width="4" height="15" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" />
    </>
  ),
  'test-case': (
    // Flask / test tube
    <>
      <path d="M9 3h6v5l4 9a2 2 0 0 1-1.8 2.9H6.8A2 2 0 0 1 5 17l4-9V3z" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="15" r="1" fill="currentColor" />
      <circle cx="14" cy="13" r="1" fill="currentColor" />
    </>
  ),
  'test-strategy': (
    // Ruler / protractor
    <>
      <path d="M21 3L3 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3L21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3L15 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="6" x2="16" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="9" x2="13" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="12" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="15" x2="7" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  task: (
    // Checkbox / checklist — story task
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12l2.5 3L16 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  risk: (
    // Warning triangle — risk
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </>
  ),
  // --- Action icons ---
  info: (
    // Info circle
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="16" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </>
  ),
  sparkle: (
    // Sparkle / magic wand star
    <>
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" fill="currentColor" />
      <path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z" fill="currentColor" opacity="0.7" />
      <path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5L5 16z" fill="currentColor" opacity="0.5" />
    </>
  ),
  'crystal-ball': (
    // Crystal ball / orb
    <>
      <circle cx="12" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 8a5 5 0 0 1 3-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
    </>
  ),
  split: (
    // Fork / split arrows
    <>
      <line x1="12" y1="5" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <polyline points="7 19 7 14 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 19 17 14 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="10 3 12 5 14 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'chevron-down': (
    <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  'chevron-right': (
    <polyline points="9 6 15 12 9 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  close: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  // --- Theme icons ---
  moon: (
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 12 + 8 * Math.cos(rad);
        const y1 = 12 + 8 * Math.sin(rad);
        const x2 = 12 + 10 * Math.cos(rad);
        const y2 = 12 + 10 * Math.sin(rad);
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
      })}
    </>
  ),
  settings: (
    // Gear
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" strokeWidth="2" />
  ),
  // --- Modal / search icons ---
  search: (
    // Magnifying glass
    <>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  folder: (
    // Folder
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  wrench: (
    // Wrench / spanner
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94L6.73 20.15a2.13 2.13 0 0 1-3-3l6.72-6.72a6 6 0 0 1 7.94-7.94l-3.69 3.81z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  // --- Misc ---
  'pop-out': (
    // External link / pop-out
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" strokeWidth="2" />
      <polyline points="15 3 21 3 21 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  workflow: (
    // Lightning bolt (same as epic but used in Workflow FAB)
    <path d="M13 2L4 14h5l-1 8 9-12h-5l1-8z" fill="currentColor" />
  ),
  rocket: (
    // Rocket ship
    <>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'empty-canvas': (
    // Canvas / artboard placeholder
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 15l5-5 4 4 4-6 5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
    </>
  ),
  'refresh': (
    // Circular refresh arrow
    <>
      <path d="M21 2v6h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 22v-6h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'docs': (
    // Open book / documentation
    <>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'download': (
    // Download / export arrow
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7 10 12 15 17 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'upload': (
    // Upload / import arrow
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 8 12 3 7 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'help': (
    // Question-mark circle
    <>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </>
  ),
  'keyboard': (
    // Keyboard
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="6" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="8" x2="18" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'chat': (
    // Chat bubble / message
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function Icon({ name, size = '1em', className, title }: IconProps) {
  const content = paths[name];
  if (!content) return null;
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={!title}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  );
}

/**
 * Convenience: map Artifact['type'] → IconName.
 * This is the single source of truth that replaces the old TYPE_ICONS emoji map.
 */
export const ARTIFACT_TYPE_ICON: Record<string, IconName> = {
  'vision':                'vision',
  'requirement':           'requirement',
  'nfr':                   'nfr',
  'additional-req':        'additional-req',
  'epic':                  'epic',
  'story':                 'story',
  'use-case':              'use-case',
  'prd':                   'prd',
  'architecture':          'architecture',
  'architecture-decision': 'architecture-decision',
  'system-component':      'system-component',
  'product-brief':         'product-brief',
  'test-case':             'test-case',
  'test-cases':            'test-case',
  'test-coverage':         'test-case',
  'test-strategy':         'test-strategy',
  'test-design':           'test-strategy',
  'test-design-qa':        'test-strategy',
  'test-design-architecture': 'test-strategy',
  'test-review':           'test-case',
  'test-framework':        'test-strategy',
  'test-summary':          'test-case',
  'task':                  'task',
  'risk':                  'risk',
  'risks':                 'risk',
  'definition-of-done':    'requirement',
  'fit-criteria':          'requirement',
  'success-metrics':       'vision',
  'retrospective':         'vision',
  'sprint-status':         'epic',
  'code-review':           'requirement',
  'source-tree':           'architecture',
  // BMM module — additional types
  'change-proposal':       'requirement',
  'readiness-report':      'product-brief',
  'research':              'search',
  'ux-design':             'use-case',
  'tech-spec':             'prd',
  'project-overview':      'product-brief',
  'project-context':       'folder',
  // TEA module — additional types
  'traceability-matrix':   'requirement',
  'ci-pipeline':           'workflow',
  'automation-summary':    'test-case',
  'atdd-checklist':        'task',
  'nfr-assessment':        'nfr',
  // CIS module
  'storytelling':          'story',
  'problem-solving':       'wrench',
  'innovation-strategy':   'rocket',
  'design-thinking':       'vision',
};
