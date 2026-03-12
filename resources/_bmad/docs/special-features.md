# Special Features Guide

This document describes special features in the BMAD system that enhance collaboration, creativity, and learning capabilities.

## Table of Contents

1. [Party Mode](#party-mode)
2. [Brainstorming Workflow](#brainstorming-workflow)
3. [Teach Me Testing](#teach-me-testing)
4. [Team Configurations](#team-configurations)
5. [Agent Customization](#agent-customization)

---

## Party Mode

Party Mode enables multi-agent collaborative discussions where multiple BMAD agents engage in natural conversation together.

### What is Party Mode?

Party Mode is an orchestration system that brings together diverse BMAD agents for collaborative group discussions. Instead of talking to one agent at a time, users can pose questions to the entire team and receive perspectives from multiple experts simultaneously.

### Key Features

- **Multi-Agent Conversations**: 2-3 relevant agents respond to each topic
- **Personality Preservation**: Each agent maintains their unique communication style
- **Natural Cross-Talk**: Agents can reference and build on each other's points
- **Intelligent Selection**: System selects most relevant agents based on topic
- **Direct Addressing**: Users can address specific agents by name

### How to Use

From any agent menu that supports Party Mode:

```
[PM] Start Party Mode
```

Once activated:
- Pose any question or topic
- Multiple agents will respond with their perspectives
- Address specific agents by name for targeted responses
- Use exit triggers to end: `*exit`, `goodbye`, `end party`, `quit`

### Example Interaction

```
User: What's the best approach for a new e-commerce feature?

🏗️ Winston (Architect): From an architecture perspective, I'd recommend 
starting with a clear API contract and considering how this integrates 
with your existing payment infrastructure...

📋 John (PM): Let me push back on jumping to architecture. What problem 
are we solving? Who's the user? We need to validate the WHY first...

🎨 Sally (UX Designer): I'm with John - let me paint you a picture of 
how users currently experience checkout frustration...
```

### Configuration

Party Mode uses the agent manifest (`_config/agent-manifest.csv`) to determine which agents are available. The manifest includes:

| Field | Description |
|-------|-------------|
| name | Agent identifier |
| displayName | Agent's persona name |
| icon | Visual emoji identifier |
| role | Capabilities summary |
| identity | Background/expertise |
| communicationStyle | How they communicate |
| principles | Decision-making philosophy |

### Location

- Workflow: `core/workflows/party-mode/workflow.md`
- Steps: `core/workflows/party-mode/steps/`

---

## Brainstorming Workflow

The Brainstorming workflow provides structured creative ideation guided by an expert facilitator.

### What is Brainstorming?

A guided creative session where Carson (the Brainstorming Coach) facilitates breakthrough ideation using proven techniques from improv coaching and systematic innovation.

### Key Features

- **Expert Facilitation**: Carson brings 20+ years of facilitation experience
- **Creative Techniques**: Uses "YES AND" building, wild idea celebration
- **Psychological Safety**: Creates environment where all ideas are valued
- **Structured Innovation**: Balances creative freedom with productive outcomes

### How to Use

Access through the CIS (Creative Innovation Strategies) module or any agent that includes brainstorming:

```
[BS] Guide me through Brainstorming any topic
```

### Facilitator Style

Carson's communication style:
- High energy and enthusiastic
- Builds on ideas with "YES AND"
- Celebrates wild thinking
- Uses humor and play as innovation tools

### Principles

1. Psychological safety unlocks breakthroughs
2. Wild ideas today become innovations tomorrow
3. Humor and play are serious innovation tools

### Location

- Agent: `cis/agents/brainstorming-coach.md`
- Workflow: `core/workflows/brainstorming/workflow.md`

---

## Teach Me Testing

Teach Me Testing is a comprehensive learning workflow that provides structured testing education through the TEA (Test Engineering & Architecture) module.

### What is Teach Me Testing?

A multi-session learning companion that teaches testing progressively through a structured 7-session curriculum. Designed for everyone from hobbyist beginners to experienced VPs.

### Key Features

- **7-Session Curriculum**: 30-90 minutes per session
- **Multi-Session Persistence**: Progress saved across days/weeks
- **Role-Based Learning**: Customized content for QA, Dev, Lead, VP
- **Knowledge Validation**: Quizzes after each session (70% passing)
- **Artifact Generation**: Session notes, completion certificate
- **Non-Linear Navigation**: Jump to any session based on experience

### Curriculum

| Session | Topic | Duration |
|---------|-------|----------|
| 1 | Quick Start - TEA Lite intro | 30 min |
| 2 | Core Concepts - Risk-based testing | 45 min |
| 3 | Architecture - Fixtures, patterns | 60 min |
| 4 | Test Design - Risk assessment | 60 min |
| 5 | ATDD & Automate - TDD workflows | 60 min |
| 6 | Quality & Trace - Review workflows | 45 min |
| 7 | Advanced Patterns - Knowledge exploration | Ongoing |

### How to Use

Access through the TEA module:

```
[TMT] Teach Me Testing
```

The workflow will:
1. Check for existing progress (resume if found)
2. Assess your role and experience level
3. Present session menu with completion status
4. Guide you through selected sessions
5. Generate completion certificate when done

### Progress Tracking

Progress is saved to: `{test_artifacts}/teaching-progress/{user_name}-tea-progress.yaml`

Progress file tracks:
- User role and experience level
- Sessions completed with scores
- Learning artifacts generated
- Next recommended session

### Location

- Workflow: `tea/workflows/testarch/teach-me-testing/`
- Steps: 12 CREATE mode steps + EDIT + VALIDATE modes
- Data: Curriculum, role paths, quiz questions

---

## Team Configurations

Team configurations bundle multiple agents together for specific project contexts.

### What are Teams?

Teams are predefined collections of agents optimized for particular workflow scenarios. Instead of loading individual agents, you can load an entire team suited for your project phase.

### Team File Formats

#### Bundle Definition (YAML)

```yaml
# team-fullstack.yaml
bundle:
  name: Team Plan and Architect
  icon: 🚀
  description: Team capable of project analysis, design, and architecture.
agents:
  - analyst
  - architect
  - pm
  - sm
  - ux-designer
party: "./default-party.csv"
```

#### Party Manifest (CSV)

The `default-party.csv` file defines all agents available for Party Mode, including:
- Agent identifiers and display names
- Roles and communication styles
- Module affiliations and file paths

### Available Teams

| Module | Teams |
|--------|-------|
| BMM | `team-fullstack.yaml`, `default-party.csv` |
| TEA | `default-party.csv` |
| CIS | `default-party.csv` |

### Team Structure

```
{module}/teams/
├── default-party.csv    # All agents for Party Mode
└── team-{name}.yaml     # Custom team bundles
```

### Creating Custom Teams

1. Create a new YAML file in `{module}/teams/`
2. Define bundle metadata (name, icon, description)
3. List agent identifiers to include
4. Reference party manifest for Party Mode support

---

## Agent Customization

Customize agent behavior through configuration files.

### What is Agent Customization?

Override default agent personalities, communication styles, or principles for specific projects without modifying core agent files.

### Customization Files

Located in: `_config/agents/`

Format: `{module}-{agent-name}.customize.yaml`

Example: `cis-brainstorming-coach.customize.yaml`

### Customization Options

```yaml
# Example customization file
name: brainstorming-coach
overrides:
  communication_style: "More structured and analytical"
  principles:
    - "Balance creativity with practicality"
    - "Document all ideas systematically"
  additional_context: |
    For this project, focus on enterprise constraints
    and regulatory requirements.
```

### How Customization Works

1. Agent loads base personality from agent file
2. System checks for matching customization file
3. Customizations merge with/override base settings
4. Agent operates with modified personality

### Use Cases

- Adjust formality for enterprise vs startup contexts
- Add project-specific knowledge to agent context
- Modify communication style for team preferences
- Include domain-specific principles

### Location

- Customization files: `_config/agents/*.customize.yaml`
- Agent definitions: `{module}/agents/*.md`

---

## Summary

| Feature | Purpose | Access |
|---------|---------|--------|
| Party Mode | Multi-agent collaboration | `[PM]` menu option |
| Brainstorming | Guided creative ideation | `[BS]` menu option |
| Teach Me Testing | Testing education curriculum | `[TMT]` menu option |
| Team Configurations | Bundled agent sets | Module teams folder |
| Agent Customization | Personality overrides | `_config/agents/` |

These features extend BMAD beyond single-agent interactions into collaborative, educational, and customizable experiences.
