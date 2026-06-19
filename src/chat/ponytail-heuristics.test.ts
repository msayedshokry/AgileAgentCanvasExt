// Unit tests for ponytail-heuristics.ts
// Verifies the PONYTAIL_HEURISTICS constant exports correctly and contains
// all mandatory hierarchy items, core rules, and verification requirements.

import { describe, it, expect } from 'vitest';
import { PONYTAIL_HEURISTICS } from './ponytail-heuristics';

describe('PONYTAIL_HEURISTICS', () => {
    // ─── Export correctness ─────────────────────────────────────────────────

    it('exports as a non-empty string', () => {
        expect(typeof PONYTAIL_HEURISTICS).toBe('string');
        expect(PONYTAIL_HEURISTICS.length).toBeGreaterThan(100);
    });

    it('starts with the expected header', () => {
        expect(PONYTAIL_HEURISTICS).toContain('## Ponytail — Minimalist Engineering Principles (ALWAYS ACTIVE)');
    });

    // ─── Mandatory hierarchy items ──────────────────────────────────────────

    it('contains the mandatory hierarchy preamble', () => {
        expect(PONYTAIL_HEURISTICS).toContain(
            'Before writing ANY code, solution, or artifact, work through this mandatory hierarchy:'
        );
    });

    it('contains Necessity (hierarchy item 1)', () => {
        expect(PONYTAIL_HEURISTICS).toContain('1. **Necessity**');
        expect(PONYTAIL_HEURISTICS).toContain('YAGNI');
    });

    it('contains Standard Library (hierarchy item 2)', () => {
        expect(PONYTAIL_HEURISTICS).toContain('2. **Standard Library**');
        expect(PONYTAIL_HEURISTICS).toContain('standard library');
    });

    it('contains Native Platform (hierarchy item 3)', () => {
        expect(PONYTAIL_HEURISTICS).toContain('3. **Native Platform**');
    });

    it('contains Existing Dependencies (hierarchy item 4)', () => {
        expect(PONYTAIL_HEURISTICS).toContain('4. **Existing Dependencies**');
    });

    it('contains Simplicity (hierarchy item 5)', () => {
        expect(PONYTAIL_HEURISTICS).toContain('5. **Simplicity**');
        expect(PONYTAIL_HEURISTICS).toContain('Can this be one line?');
    });

    it('contains Implementation (hierarchy item 6)', () => {
        expect(PONYTAIL_HEURISTICS).toContain('6. **Implementation**');
        expect(PONYTAIL_HEURISTICS).toContain('minimum code that works');
    });

    // ─── Core Rules section ─────────────────────────────────────────────────

    it('contains the Core Rules section', () => {
        expect(PONYTAIL_HEURISTICS).toContain('### Core Rules');
    });

    it('contains the prefer-deletion rule', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Prefer deletion over addition');
    });

    it('contains the prefer-boring rule', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Prefer boring over clever');
    });

    it('contains the challenge-complex-requests rule', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Challenge complex requests');
        expect(PONYTAIL_HEURISTICS).toContain('Do you actually need');
    });

    it('contains the ponytail comment convention', () => {
        expect(PONYTAIL_HEURISTICS).toContain('// ponytail:');
        expect(PONYTAIL_HEURISTICS).toContain('MUST name the ceiling');
    });

    // ─── NOT Lazy About section ─────────────────────────────────────────────

    it('contains the NOT Lazy About section', () => {
        expect(PONYTAIL_HEURISTICS).toContain('### NOT Lazy About');
    });

    it('lists input validation as non-negotiable', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Input validation at trust boundaries');
    });

    it('lists error handling as non-negotiable', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Error handling that prevents data loss');
    });

    it('lists security and accessibility as non-negotiable', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Security and accessibility');
    });

    it('lists calibration as non-negotiable', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Calibration required by real hardware');
    });

    it('lists explicit user requests as non-negotiable', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Anything explicitly requested by the user');
    });

    // ─── Verification section ───────────────────────────────────────────────

    it('contains the Verification section', () => {
        expect(PONYTAIL_HEURISTICS).toContain('### Verification');
    });

    it('requires a runnable check for non-trivial logic', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Non-trivial logic MUST leave one runnable check');
    });

    it('states trivial one-liners require no test', () => {
        expect(PONYTAIL_HEURISTICS).toContain('Trivial one-liners require no test');
    });
});
