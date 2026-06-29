---
name: aac-frontend-ui-engineering
description: 'Engineers the implementation of user interfaces: component design, props contracts, state management, accessibility, and performance. Use when building or modifying any UI component, when designing a new component interface, when reviewing frontend code, or when fixing UI performance or accessibility issues. Pairs with aac-ux (which designs the user experience) and aac-create-ux-design (which produces the design spec) by handling the code that brings the design to life.'
---

# Frontend UI Engineering

The code that brings the design to life. A `Button` is not just a styled `<button>` — it is a contract (props), a state machine (pressed / focused / disabled / loading), an accessibility surface (keyboard, screen reader, focus management), and a performance budget (re-renders, bundle size, paint time). This skill is the discipline of building components that meet the contract on all four axes at once.

## Overview

Frontend engineering is the layer where the *design* (from `aac-ux`), the *spec* (from `aac-create-ux-design`), and the *runtime* (the framework, the bundler, the browser) all meet. The work is to make the implementation match the design while honoring the runtime's constraints. The skill is the discipline of *all four axes at once*, not one axis at a time and then the others.

## When to Use

- Building or modifying a UI component
- Designing a new component's props interface
- Reviewing frontend code for correctness, accessibility, or performance
- Diagnosing a UI performance issue (slow render, janky scroll, paint flicker)
- Fixing an accessibility issue (focus trap, missing label, color contrast)
- A UI library or framework is being adopted or migrated
- The frontend is being added to a project that did not have one

**When NOT to use:**

- The work is design-only (mockups, wireframes) — use `aac-ux`
- The work is the design spec only — use `aac-create-ux-design`
- The work is a content or copy change, not a code change
- The component is a one-off in a single page, not a reusable surface

## The Four Axes

Every UI component has four surfaces. Missing any one of them produces a component that *looks* right but fails on a different dimension.

### 1. Contract (the props)

The props are the *interface* the component presents to the rest of the codebase. The contract should be:

- **Small** — fewer props, each load-bearing. A component with 20 props is doing 20 things; a component with 3 is doing 3.
- **Typed** — every prop has a type. `string` is rarely right; the union of the actual values is.
- **Required vs optional** — defaults should not hide required values. If a prop must be set, it is required.
- **Composable** — `children` and `className` (or the framework equivalent) pass through. The component does not own layout.

### 2. State (the lifecycle)

A component has states even when it has no `useState`. The states are: *unmounted* (no DOM), *mounted* (initial render), *interactive* (responding to user), *loading* (waiting for async), *disabled* (user cannot interact), *error* (something failed), *unmounted* (cleanup). Each state has a visual, an a11y label, and a behaviour:

- **Loading** — show a spinner or skeleton, mark the component `aria-busy="true"`, do not block the rest of the page.
- **Disabled** — visually distinct, marked `aria-disabled="true"`, *not* removed from the tab order. (A disabled button is still in the tab order; a hidden one is not.)
- **Error** — the error is announced (`role="alert"` or live region), the input that caused the error gets focus, the message is in plain language, not a stack trace.

The state transitions are explicit. The component does not silently get into a state the design did not name.

### 3. Accessibility (the surface)

The component is accessible by default, not as a follow-up. The a11y checks are in the implementation, not the QA pass:

- **Keyboard** — every interactive element is reachable via Tab, every action is triggerable via Enter or Space, the focus order matches the visual order.
- **Screen reader** — every interactive element has an accessible name, every state change is announced, every error is announced.
- **Focus management** — when a modal opens, focus moves into it; when it closes, focus returns to the trigger. When content is added dynamically, focus is managed or the change is announced.
- **Contrast** — text and interactive elements meet WCAG AA (4.5:1 for text, 3:1 for UI). The component's colors come from the design tokens, which are validated once at the token level, not per-component.
- **Motion** — `prefers-reduced-motion` is respected. Animations that are not decorative have a non-motion fallback.

### 4. Performance (the budget)

A component is fast, then it is correct, then it is feature-complete. The performance budget is set before the implementation:

- **Initial render** — under X ms on the target hardware
- **Re-render** — under Y ms, no full-tree re-renders for a single state change
- **Bundle size** — under Z KB gzipped for the component alone, under W KB for the full page that contains it
- **Paint** — the component's first paint under T ms, no layout shift after the first paint

The budget is met by:
- Memoizing where it matters (props that are referentially stable, components that re-render on parent state)
- Lazy-loading below-the-fold components
- Code-splitting the route or the modal
- Using the framework's optimization primitives (`useMemo`, `React.memo`, `track`, signals) — not fighting the framework

## The Process

### 1. Read the design and the spec

Before writing code, read the design (from `aac-ux`) and the spec (from `aac-create-ux-design`). The component is implementing a design that was decided. The spec is the contract the component must meet.

### 2. Pick the smallest primitive that fits

Most components are not new components. A "feature card" is a composition of `Card`, `Heading`, `Text`, and `Button`. Before writing a new component, look for an existing one that does 80% of the work. The 20% that is new is the new component.

### 3. Write the contract first

Before implementation, write the props interface. The interface is the test surface — every behaviour the component promises is reachable through the props. If a behaviour is not in the props, the component does not do it.

### 4. Implement the states

Implement the states in order: mounted, interactive, loading, disabled, error. Each state has a visual, an a11y label, and a behaviour. The states are tested individually, not just as the "happy path."

### 5. Wire the accessibility

Run the keyboard test: can I reach every interactive element with Tab? Can I trigger every action with Enter/Space? Run the screen reader test: does every element have a name, every state change announce? Run the focus test: when the modal opens, where does focus go? When it closes, does it return?

### 6. Measure the performance

Run the perf budget. If the initial render is over budget, find the cause (large bundle, expensive computation, blocking I/O). Do not ship a component that misses the budget on the target hardware. The user pays the cost of every missed budget.

### 7. Review the four axes

Before merging, walk the four axes:

- Contract: small, typed, composable?
- State: every state explicit, every transition tested?
- Accessibility: keyboard, screen reader, focus, contrast, motion?
- Performance: budget met on the target hardware?

Any unchecked axis is a merge blocker.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It's just a button" | Buttons have 5+ states, an a11y contract, and a focus story. "Just" is doing a lot of work. |
| "We'll add accessibility later" | Retrofitting a11y is more expensive than building it in. The skip is a debt, not a saving. |
| "The design system handles it" | The design system handles the visual layer. The component handles the contract, the state, the runtime. The design system is the input, not the output. |
| "Performance can be optimized later" | Performance budgets are easier to meet during implementation. The cost of fixing perf after a component is in production is much higher. |
| "We don't need to memoize, React is fast" | React is fast until it is not. Memoize where the measurement says it matters, not where you guess. |
| "It's not visible without JS" | Progressive enhancement is a real discipline. The choice to require JS is a choice, not a default. |
| "The user can just refresh" | A user who refreshes is a user who has lost state. The fix for a render bug is a render fix, not a refresh instruction. |
| "Animation makes it feel faster" | Animation makes the user *feel* the wait less. It does not make the wait shorter. Use animation to clarify, not to hide. |
| "We'll add the disabled state if we need it" | Disabled is a state, not a feature. It is needed by every interactive component. Build it. |

## Red Flags

- The component has more than 12 props
- A required prop has a default value (the prop is optional, name it that way)
- The disabled state is "the button is grey" with no `aria-disabled`
- The error state is a `console.error` with no user-facing message
- The component re-renders on every parent state change
- The bundle size of the page that contains the component is over 250 KB gzipped
- The keyboard test fails: Tab does not reach a control, or Enter does not trigger an action
- The screen reader test fails: a button has no accessible name, or a state change is silent
- The component is built without reading the design spec
- The component is built by writing CSS first, props second
- The component's "loading" state is the entire page freezing for 3 seconds

## Verification

Before a UI component is merged:

- [ ] Props interface is small, typed, and composable; `children` passes through
- [ ] Required props are required; optional props have explicit defaults
- [ ] Every state (mounted, interactive, loading, disabled, error) is implemented and tested
- [ ] Keyboard test: every interactive element is reachable and triggerable
- [ ] Screen reader test: every element has an accessible name, every state change is announced
- [ ] Focus management: modals trap focus, content changes move focus correctly
- [ ] Contrast meets WCAG AA on all states (use the design tokens, not raw colors)
- [ ] `prefers-reduced-motion` is respected
- [ ] Performance budget is met on the target hardware (initial render, re-render, bundle, paint)
- [ ] No `console.error` or warning in the browser console
- [ ] Component is built from the design spec, not in parallel to it
