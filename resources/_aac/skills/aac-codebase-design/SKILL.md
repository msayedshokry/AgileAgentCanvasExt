---
name: aac-codebase-design
description: 'Shared design vocabulary and principles for designing deep modules. Use when designing a new interface, evaluating the shape of a module, deciding what to hide behind a seam, or any time the discussion turns to "is this the right interface?". Defines the words: module, interface, depth, seam, adapter, leverage, locality, and the principles that put a lot of behaviour behind a small surface.'
---

# Codebase Design

The design vocabulary for turning shallow modules into deep ones. **Depth** is the goal: a small interface that hides a lot of behaviour. The opposite — an interface nearly as complex as its implementation — is **shallowness**, and it is the default shape of code that grew without design.

Use these terms exactly. The shared vocabulary is what lets future-me, future-you, and a future agent reason about the same code the same way.

## The vocabulary

### Module

A unit of behaviour. A module has an **interface** (what callers see) and an **implementation** (what it does). The measure of a module is not its line count but the **ratio of behaviour to interface**.

### Interface

The surface a module presents to its callers: the public functions, types, and contracts. The interface is the **test surface** — tests exercise behaviour *through* the interface, not around it. When a test reaches past the interface (mocks internal helpers, pokes at private state), the interface is wrong.

### Depth

`depth = behaviour / interface`. A deep module does a lot behind a small surface. `Array.sort` is deep — tiny interface, vast behaviour. A wrapper that re-exports three functions and adds one is shallow — interface is most of the work.

The aim of design is to move *toward* depth, not away from it. A new feature should *deepen* an existing module before it spawns a new one.

### Seam

A boundary where a module's behaviour can be replaced without changing its callers. An interface is a candidate seam; an **adapter** is a seam made real. Seams are the unit of testability and the unit of substitution.

### Adapter

A thin module that translates between two interfaces. Adapters are where most of the mess should live, because they let the deep modules on either side stay clean.

**The one-adapter rule**: one adapter between A and B is a *hypothetical* seam — you might still be over-designing. Two adapters between A and B is a *real* seam — the duplication tells you the seam is load-bearing. Before extracting a second adapter, look for the first one to delete.

### Leverage

The ratio of how much the codebase gets out of a module versus how much the module costs to maintain. A change to a leveraged module ripples to many callers; a change to an isolated module does not. When in doubt, put the change where leverage is highest.

### Locality

The property that the code you need to read to understand a behaviour sits *together* — same file, same function, same cluster of helpers. A behaviour scattered across seven files has low locality; a refactor that pulls it together has high locality.

**Locality beats purity.** A pure function extracted for testability but called from one place is *worse* than an inline block: the test surface is gained, but the reader has to chase the function. If extraction is making the code harder to read, fold it back in.

## The principles

### The deletion test

When you suspect a module is shallow, ask: **would deleting it concentrate complexity, or just move it?**

- *Concentrate* — the module is doing real work; keep it.
- *Just move* — the module is indirection without value; delete it and let the caller hold the code directly.

The deletion test is the cheapest design review there is. It catches the most common shallowness: thin wrappers, re-export shims, and "helpers" that have one caller.

### The interface is the test surface

If a behaviour is not reachable through the public interface, it is not part of the design — it is internal. Internal helpers are fine; internal behaviour that callers depend on is a bug. When the test forces you to expose a private helper, the helper should be public, or the test is testing the wrong thing.

### Small interfaces, deep modules

Default to fewer, smaller public surfaces. A module with 30 public functions is doing 30 things; a module with 3 is doing 3. If the 30 are all real, split the module. If they are not, delete them.

### Pushing complexity down

When a caller knows too much about how a module works, push the knowledge *into* the module. The caller should not have to assemble state, sequence calls, or clean up after the module — the module should. The cleanest caller code is the code that does not exist because the module absorbed it.

## How to use this skill

This skill is reference. Reach for it when:

- Designing a new interface and asking "what should the shape be?"
- Reviewing a module that *feels* off and not knowing why
- Deciding whether to extract a helper, a wrapper, or a new module
- Naming the conversation — when "should we add a layer?" comes up, the answer is usually "first run the deletion test on what's already there"

It is not a process. There is no step 1. It is vocabulary you hold while you work, and principles you apply when the work forces a choice.
