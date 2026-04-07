---
description: Audit UX design against strict dimensions on a 0-10 scale
---

# Design Dimension Audit Workflow

This workflow rates UX designs quantitatively to prevent mediocre aesthetics ("AI slop") and ensure intuitive interactions.

## 1. The 0-10 Rating
Rate the UX plan (1 = Unusable, 5 = Generic/Mediocre, 10 = Best-in-class) across these dimensions:
- **Visual Hierarchy**: Is the most important element immediately obvious?
- **Interaction States**: Are hover, active, empty, loading, and error states defined?
- **Information Architecture**: Is the navigation model clear and flat enough?
- **User Journey Friction**: How many clicks to value?
- **AI Slop Risk**: Does it rely too heavily on generic Bootstrap/Tailwind defaults without opinionated typography, spacing, or color?

## 2. Define the Target 10
For any dimension scoring `< 10`, write a concrete sentence describing exactly what a `10` would look like for this specific feature. Use precise layout and visual terminology.

## 3. Path to Perfection
Output a set of amendments (or update the UX document directly) to bridge the gap between the current score and the `Target 10` definition. Output as `design-audit.md` if producing a new artifact.
