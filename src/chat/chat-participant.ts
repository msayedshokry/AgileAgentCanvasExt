import * as vscode from 'vscode';
import * as path from 'path';
import { ArtifactStore, Epic } from '../state/artifact-store';
import { getWorkflowExecutor, WorkflowExecutor } from '../workflow/workflow-executor';
import { sharedToolContext, getToolDefinitions } from './agileagentcanvas-tools';
import { BmadModel, selectModel, streamChatResponse, getNoModelMessage as providerNoModelMessage, ChatMessage } from './ai-provider';
import { getPersonaForArtifactType, formatFullAgentForPrompt, loadAgentPersona, clearPersonaCache, AgentPersona, loadAllAgentPersonas, formatAgentRoster } from './agent-personas';
import { JiraClient } from '../integrations/jira-client';
import {
    getJiraConfig,
    formatEpicsAsMarkdown,
    formatStoriesAsMarkdown,
    mergeJiraIntoArtifacts
} from '../integrations/jira-importer';

/**
 * AgileAgentCanvas Chat Participant - Integrates with VS Code Copilot Chat
 * 
 * This provides the conversational AI interface that works alongside
 * the visual canvas. Users can @agileagentcanvas in chat to interact with the analyst.
 */
export class AgileAgentCanvasChatParticipant {
    private store: ArtifactStore;
    private extensionContext?: vscode.ExtensionContext;

    constructor(store: ArtifactStore, extensionContext?: vscode.ExtensionContext) {
        this.store = store;
        this.extensionContext = extensionContext;
    }

    /**
     * Main handler for chat messages sent to @agileagentcanvas
     */
    async handleChat(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        // Handle specific commands
        if (request.command) {
            return this.handleCommand(request.command, request.prompt, context, stream, token);
        }

        // General conversation with the analyst
        return this.handleConversation(request.prompt, context, stream, token);
    }

    /**
     * Handle specific BMAD commands like /vision, /epics, /stories
     */
    private async handleCommand(
        command: string,
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const handlers: Record<string, () => Promise<vscode.ChatResult>> = {
            'vision': () => this.handleVisionCommand(prompt, context, stream, token),
            'requirements': () => this.handleRequirementsCommand(prompt, context, stream, token),
            'epics': () => this.handleEpicsCommand(prompt, context, stream, token),
            'stories': () => this.handleStoriesCommand(prompt, context, stream, token),
            'enhance': () => this.handleEnhanceCommand(prompt, context, stream, token),
            'refine': () => this.handleRefineCommand(prompt, context, stream, token),
            'dev': () => this.handleDevCommand(prompt, context, stream, token),
            'apply': () => this.handleApplyCommand(prompt, context, stream, token),
            'review': () => this.handleReviewCommand(prompt, context, stream, token),
            'convert-to-json': () => this.handleConvertToJsonCommand(prompt, stream, token),
            'workflows': () => this.handleWorkflowsCommand(prompt, stream, token),
            'continue': () => this.handleContinueCommand(prompt, stream, token),
            'status': () => this.handleStatusCommand(stream),
            'sprint': () => this.handleSprintCommand(prompt, context, stream, token),
            'ux': () => this.handleUxCommand(prompt, context, stream, token),
            'readiness': () => this.handleReadinessCommand(prompt, context, stream, token),
            'party': () => this.handlePartyCommand(prompt, context, stream, token),
            'document': () => this.handleDocumentCommand(prompt, context, stream, token),
            'review-code': () => this.handleReviewCodeCommand(prompt, context, stream, token),
            'ci': () => this.handleCiCommand(prompt, context, stream, token),
            'quick': () => this.handleQuickCommand(prompt, context, stream, token),
            'design-thinking': () => this.handleDesignThinkingCommand(prompt, context, stream, token),
            'innovate': () => this.handleInnovateCommand(prompt, context, stream, token),
            'solve': () => this.handleSolveCommand(prompt, context, stream, token),
            'story-craft': () => this.handleStoryCraftCommand(prompt, context, stream, token),
            'elicit': () => this.handleElicitCommand(prompt, context, stream, token),
            'context': () => this.handleContextCommand(prompt, context, stream, token),
            'write-doc': () => this.handleWriteDocCommand(prompt, context, stream, token),
            'mermaid': () => this.handleMermaidCommand(prompt, context, stream, token),
            'readme': () => this.handleReadmeCommand(prompt, context, stream, token),
            'changelog': () => this.handleChangelogCommand(prompt, context, stream, token),
            'api-docs': () => this.handleApiDocsCommand(prompt, context, stream, token),
            'jira': () => this.handleJiraCommand(prompt, stream)
        };

        const handler = handlers[command];
        if (!handler) {
            stream.markdown(`Unknown command: ${command}. Available commands: vision, requirements, epics, stories, enhance, refine, dev, elicit, apply, review, sprint, ux, readiness, party, document, context, write-doc, mermaid, readme, changelog, api-docs, review-code, ci, quick, design-thinking, innovate, solve, story-craft, convert-to-json, workflows, continue, status`);
            return { metadata: { command: 'error' } };
        }

        return handler();
    }

    /**
     * Get an available language model (supports Copilot, OpenAI, Anthropic, Gemini, Ollama, Antigravity).
     */
    private async getModel(): Promise<BmadModel | null> {
        return selectModel();
    }

    /**
     * Handle general conversation
     */
    private async handleConversation(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        // ── Check for a pending workflow launch from the WorkflowLauncher UI ──
        // When the user picks a workflow from the canvas, launchBmmWorkflow stores
        // the workflow file path on the store and opens chat with the trigger phrase.
        // We intercept it here and route through executeWithTools so the LLM gets
        // the actual workflow file, instructions, schema, and tools — instead of
        // just a natural-language trigger phrase.
        const pendingWorkflow = this.store.getPendingWorkflowLaunch();
        if (pendingWorkflow) {
            this.store.clearPendingWorkflowLaunch();
            return this.executeWorkflowLaunch(pendingWorkflow, prompt, stream, token);
        }

        const model = await this.getModel();
        if (!model) {
            stream.markdown(this.getNoModelMessage());
            return { metadata: { command: 'error' } };
        }

        // ── Ensure tool context is initialized ──────────────────────────────
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        await executor.initialize(projectRoot, extensionPath);

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const systemPrompt = this.getAnalystPersona();
        const artifactContext = this.buildArtifactContext();
        const history = this.buildHistory(context);
        const bmadContext = this.buildBmadMethodologyContext();

        // ── Detect active workflow session (checkpoint resumption) ───────
        // When the LLM stops at a checkpoint during executeWithTools(), the
        // tool loop exits. The user's next @agileagentcanvas message comes here instead
        // of /continue. Inject workflow context so the LLM can resume.
        const activeSession = executor.getCurrentSession();
        const workflowResumeHint = activeSession && activeSession.status === 'active'
            ? `\n\n## Active Workflow Context\n` +
              `You are in the middle of a BMAD workflow session. The user is responding to a checkpoint.\n` +
              `- **Workflow:** ${activeSession.workflowName}\n` +
              `- **Step:** ${activeSession.currentStepNumber}${activeSession.totalSteps ? ` of ${activeSession.totalSteps}` : ''}\n` +
              `- **Artifact:** ${activeSession.artifactType} (${activeSession.artifactId})\n` +
              `- **Workflow Path:** ${activeSession.workflowPath}\n\n` +
              `The user's message below is their response to the checkpoint options you presented. ` +
              `Continue the workflow from where you left off. You have access to tools (agileagentcanvas_read_file, ` +
              `agileagentcanvas_list_directory, agileagentcanvas_update_artifact) to read workflow files and save artifacts.\n` +
              `Remember: honor any remaining checkpoint/pause instructions in the workflow.`
            : '';

        // Include output format awareness so the LLM knows the user's preference
        const outputFormat = vscode.workspace.getConfiguration('agileagentcanvas')
            .get<string>('outputFormat', 'dual');
        const outputFormatHint = (outputFormat === 'dual' || outputFormat === 'json')
            ? `\n\nNote: The user's output format is set to "${outputFormat}". When generating or refining artifacts, ` +
              `always include structured JSON output (not just Markdown). If the user asks you to create or update ` +
              `an artifact, use a BMAD slash command (e.g. /vision, /epics, /stories) for proper JSON persistence, ` +
              `or include a complete JSON code block in your response.`
            : '';

        // For VS Code LM (Copilot etc.) use agentic tool-calling loop so the
        // agent can load config.yaml, read workflow files, list directories, and
        // save artifacts — as required by the BMAD activation instructions.
        if (model.vscodeLm) {
            try {
                const vsMessages: vscode.LanguageModelChatMessage[] = [
                    vscode.LanguageModelChatMessage.User(systemPrompt + outputFormatHint + workflowResumeHint),
                    vscode.LanguageModelChatMessage.User(`BMAD methodology context:\n${bmadContext}`),
                    vscode.LanguageModelChatMessage.User(`Current project state:\n${artifactContext}`),
                    vscode.LanguageModelChatMessage.User(`Conversation history:\n${history}`),
                    vscode.LanguageModelChatMessage.User(`User message: ${prompt}`)
                ];

                const tools = getToolDefinitions();
                const MAX_ROUNDS = 10; // Conversational mode needs fewer rounds than workflow execution
                let rounds = 0;

                while (rounds < MAX_ROUNDS && !token.isCancellationRequested) {
                    rounds++;
                    const response = await model.vscodeLm.sendRequest(vsMessages, { tools }, token);

                    let roundText = '';
                    const toolCalls: vscode.LanguageModelToolCallPart[] = [];

                    for await (const part of response.stream) {
                        if (token.isCancellationRequested) break;
                        if (part instanceof vscode.LanguageModelTextPart) {
                            roundText += part.value;
                            stream.markdown(part.value);
                        } else if (part instanceof vscode.LanguageModelToolCallPart) {
                            toolCalls.push(part);
                        }
                    }

                    // Append assistant turn to message history
                    const assistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
                    if (roundText) {
                        assistantParts.push(new vscode.LanguageModelTextPart(roundText));
                    }
                    for (const tc of toolCalls) {
                        assistantParts.push(tc);
                    }
                    if (assistantParts.length > 0) {
                        vsMessages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
                    }

                    // If no tool calls, the LLM is done (or paused for user input)
                    if (toolCalls.length === 0) break;

                    // Invoke each tool and collect results
                    const toolResultParts: vscode.LanguageModelToolResultPart[] = [];
                    for (const tc of toolCalls) {
                        let result: vscode.LanguageModelToolResult;
                        try {
                            result = await vscode.lm.invokeTool(tc.name, { input: tc.input, toolInvocationToken: undefined }, token);
                        } catch (err: any) {
                            result = new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(`Tool "${tc.name}" failed: ${err?.message ?? err}`)
                            ]);
                        }
                        toolResultParts.push(new vscode.LanguageModelToolResultPart(tc.callId, result.content));
                    }

                    // Feed tool results back
                    vsMessages.push(vscode.LanguageModelChatMessage.User(toolResultParts));
                }
            } catch (error) {
                stream.markdown(`Error: ${error}`);
                return { metadata: { command: 'error' } };
            }
        } else {
            // Direct API providers — text-only streaming (no tool support yet)
            try {
                const messages: ChatMessage[] = [
                    { role: 'system', content: systemPrompt + outputFormatHint + workflowResumeHint },
                    { role: 'user', content: `BMAD methodology context:\n${bmadContext}` },
                    { role: 'user', content: `Current project state:\n${artifactContext}` },
                    { role: 'user', content: `Conversation history:\n${history}` },
                    { role: 'user', content: `User message: ${prompt}` }
                ];
                await streamChatResponse(model, messages, stream, token);
            } catch (error) {
                stream.markdown(`Error: ${error}`);
                return { metadata: { command: 'error' } };
            }
        }

        return { metadata: { command: 'conversation' } };
    }

    /**
     * Execute a workflow launched from the WorkflowLauncher UI.
     * This routes through executeWithTools so the LLM receives the actual
     * workflow file, instructions, schema, and tools — same as slash commands.
     */
    private async executeWorkflowLaunch(
        pendingWorkflow: { triggerPhrase: string; workflowFilePath: string },
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## BMAD Workflow\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown(this.getNoModelMessage());
            return { metadata: { command: 'error' } };
        }

        // Initialize executor with bundled resources fallback
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'workflow', status: 'no-bmad' } };
        }

        // Update shared tool context
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const workflowName = path.basename(path.dirname(pendingWorkflow.workflowFilePath));
        const task = prompt || pendingWorkflow.triggerPhrase;

        stream.markdown(`**Workflow:** ${workflowName}\n\n`);

        try {
            await executor.executeWithTools(
                model,
                task,
                null,  // No specific artifact — workflow will discover what it needs
                stream,
                token,
                this.store,
                pendingWorkflow.workflowFilePath
            );
        } catch (error) {
            stream.markdown(`\n\n**Error during workflow execution:** ${error}\n`);
            return { metadata: { command: 'workflow', status: 'error' } };
        }

        return { metadata: { command: 'workflow', status: 'completed' } };
    }

    /**
     * Build a concise BMAD methodology context string for general conversation.
     * This ensures the LLM stays in BMAD methodology mode even without slash commands.
     */
    private buildBmadMethodologyContext(): string {
        const executor = getWorkflowExecutor();
        const bmadPath = executor.getBmadPath();
        const projectRoot = executor.getProjectRoot() || this.store.getProjectRoot() || 'unknown';

        return [
            `You are operating within the BMAD (Business Method for AI Development) methodology.`,
            `Project root: ${projectRoot}`,
            bmadPath ? `BMAD installation: ${bmadPath}` : 'BMAD installation path: not yet resolved (user may need to load a project folder)',
            ``,
            `BMAD workflow phases:`,
            `  1. /vision    — Define product vision (product-brief schema)`,
            `  2. /requirements — Extract functional & non-functional requirements`,
            `  3. /epics     — Design epics from requirements`,
            `  4. /stories   — Create user stories for epics`,
            `  5. /refine <id> — Refine a specific artifact using BMAD workflows`,
            `  6. /enhance   — Enhance artifact quality (routes to workflow #1)`,
            `  7. /review    — Validate completeness`,
            `  8. /apply     — Apply pending AI refinements to JSON file`,
            `  9. /sprint    — Sprint planning from epics or check sprint status`,
            `  10. /ux       — Create UX design specifications collaboratively`,
            `  11. /readiness — Check implementation readiness before development`,
            `  12. /party    — Multi-agent collaboration mode (all agents discuss together)`,
            `  13. /document — Document a brownfield project for AI context`,
            `  14. /review-code — Adversarial code review finding specific issues`,
            `  15. /ci       — Scaffold CI/CD quality pipeline with test execution`,
            `  16. /quick    — Quick spec + dev flow for small features (spec or dev mode)`,
            `  17. /design-thinking — Human-centered design with empathy-driven methods`,
            `  18. /innovate — Disruption opportunities and business model innovation`,
            `  19. /solve    — Systematic problem-solving methodologies`,
            `  20. /story-craft — Craft compelling narratives using story frameworks`,
            ``,
            `Always guide the user through BMAD phases in order. When the user asks a question,`,
            `answer in the context of BMAD methodology and their current project state.`
        ].join('\n');
    }

    /**
     * Try to load the BMAD product-brief schema from disk.
     * Returns the schema as a JSON string, or null if not found.
     */
    private async loadBmadVisionSchema(): Promise<string | null> {
        try {
            const executor = getWorkflowExecutor();
            // Re-use already-initialized executor, or try to initialize now
            let bmadPath: string | null = executor.getBmadPath() || null;
            if (!bmadPath) {
                const projectRoot = this.store.getProjectRoot();
                const extensionPath = this.extensionContext?.extensionPath;
                const ok = await executor.initialize(projectRoot || undefined, extensionPath);
                bmadPath = ok ? executor.getBmadPath() : null;
            }
            if (!bmadPath) return null;

            const schemaUri = vscode.Uri.file(path.join(bmadPath, 'schemas', 'bmm', 'product-brief.schema.json'));
            const raw = await vscode.workspace.fs.readFile(schemaUri);
            return raw.toString();
        } catch {
            return null;
        }
    }

    /**
     * /vision command - Define product vision via native BMAD tool-calling workflow.
     */
    private async handleVisionCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        const state = this.store.getState();
        
        // If no prompt and no existing vision, ask for input
        if (!prompt && !state.vision?.problemStatement) {
            stream.markdown('## Product Vision\n\n');
            stream.markdown('To define your product vision, please describe:\n\n');
            stream.markdown('1. **What problem are you solving?**\n');
            stream.markdown('2. **Who are your target users?**\n');
            stream.markdown('3. **What makes your solution unique?**\n\n');
            stream.markdown('*Example: "We\'re building a task management app for remote teams that uses AI to auto-prioritize work based on deadlines and dependencies."*\n\n');
            stream.markdown('Type your description and I\'ll help structure it into a proper vision statement.\n');
            return { metadata: { command: 'vision', status: 'awaiting-input' } };
        }

        const model = await this.getModel();

        if (!model) {
            // No AI - use template
            stream.markdown('## Product Vision (Template Mode)\n\n');
            stream.markdown('*AI not available - using template*\n\n');
            const vision = {
                productName: state.projectName || 'My Product',
                problemStatement: prompt || 'Define the problem...',
                targetUsers: ['Primary User', 'Secondary User'],
                valueProposition: 'Unique value...',
                successCriteria: ['Criterion 1', 'Criterion 2'],
                status: 'draft' as const
            };
            await this.store.updateArtifact('vision', 'main', vision);
            stream.markdown(`**Problem:** ${vision.problemStatement}\n\n`);
            stream.markdown('Edit the vision in the Artifacts panel or describe your product for AI assistance.\n');
            return { metadata: { command: 'vision' } };
        }

        stream.markdown('## Product Vision\n\n');

        // Initialize executor with bundled resources fallback
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'vision', status: 'no-bmad' } };
        }

        // Update shared tool context so the already-registered tools use the correct paths
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const existingVision = state.vision ? JSON.stringify(state.vision, null, 2) : null;
        const task = existingVision
            ? `Refine and enhance the existing product vision. User input: "${prompt || 'improve it'}". Existing vision: ${existingVision}`
            : `Create a new product vision. User description: "${prompt}"`;

        const workflowPath = path.join(executor.getBmadPath(), 'bmm', 'workflows', '1-analysis', 'create-product-brief', 'workflow.md');

        await executor.executeWithTools(
            model,
            task,
            existingVision ? { type: 'vision', id: 'main', ...state.vision } : null,
            stream,
            token,
            this.store,
            workflowPath
        );

        this.store.setCurrentStep('requirements');
        return { metadata: { command: 'vision' } };
    }

    /**
     * /requirements command - Extract requirements via native BMAD tool-calling workflow
     */
    private async handleRequirementsCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## Requirements Extraction\n\n');

        // Check for PRD file
        const prdContent = await this.findAndReadPRD();
        const model = await this.getModel();
        
        const sourceText = prdContent || prompt;
        
        if (!sourceText) {
            stream.markdown('I can extract requirements from:\n\n');
            stream.markdown('1. **A PRD file** - Place `PRD.md` in your workspace\n');
            stream.markdown('2. **Direct input** - Paste your requirements or describe the features\n\n');
            stream.markdown('*Example: "Users should be able to create tasks, assign them to team members, set due dates, and receive notifications when tasks are overdue."*\n');
            return { metadata: { command: 'requirements', status: 'awaiting-input' } };
        }

        if (model) {
            // Initialize executor with bundled resources fallback
            const executor = getWorkflowExecutor();
            const projectRoot = this.store.getProjectRoot() || undefined;
            const extensionPath = this.extensionContext?.extensionPath;
            const initialized = await executor.initialize(projectRoot, extensionPath);

            if (!initialized) {
                stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
                return { metadata: { command: 'requirements', status: 'no-bmad' } };
            }

            // Update shared tool context so the already-registered tools use the correct paths
            if (this.extensionContext) {
                const outputUri = this.store.getSourceFolder();
                sharedToolContext.bmadPath = executor.getBmadPath();
                sharedToolContext.outputPath = outputUri?.fsPath ?? '';
                sharedToolContext.store = this.store;
            }

            const task = prdContent
                ? `Extract functional and non-functional requirements from this PRD document. PRD content:\n\n${prdContent.substring(0, 8000)}`
                : `Extract functional and non-functional requirements from this description. Description: "${sourceText}"`;

            const workflowPath = path.join(executor.getBmadPath(), 'bmm', 'workflows', '2-plan-workflows', 'create-prd', 'workflow-create-prd.md');

            await executor.executeWithTools(model, task, null, stream, token, this.store, workflowPath);

            this.store.setCurrentStep('epics');
        } else {
            stream.markdown('*AI not available - please add requirements manually or enable Copilot*\n');
        }

        return { metadata: { command: 'requirements' } };
    }

    /**
     * /epics command - Generate epic structure via native BMAD tool-calling workflow
     */
    private async handleEpicsCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## Epic Design\n\n');

        const requirements = this.store.getRequirements();
        const model = await this.getModel();

        if (requirements.functional.length === 0 && !prompt) {
            stream.markdown('No requirements found.\n\n');
            stream.markdown('Either:\n');
            stream.markdown('1. Run `/requirements` first to extract requirements\n');
            stream.markdown('2. Describe the epics you want to create\n\n');
            stream.markdown('*Example: "Create epics for a task management app with user authentication, task CRUD, and notifications"*\n');
            return { metadata: { command: 'epics', status: 'awaiting-input' } };
        }

        if (model) {
            // Initialize executor with bundled resources fallback
            const executor = getWorkflowExecutor();
            const projectRoot = this.store.getProjectRoot() || undefined;
            const extensionPath = this.extensionContext?.extensionPath;
            const initialized = await executor.initialize(projectRoot, extensionPath);

            if (!initialized) {
                stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
                return { metadata: { command: 'epics', status: 'no-bmad' } };
            }

            // Update shared tool context so the already-registered tools use the correct paths
            if (this.extensionContext) {
                const outputUri = this.store.getSourceFolder();
                sharedToolContext.bmadPath = executor.getBmadPath();
                sharedToolContext.outputPath = outputUri?.fsPath ?? '';
                sharedToolContext.store = this.store;
            }

            const reqSummary = requirements.functional
                .map((r: { id: string; title: string; description: string }) => `${r.id}: ${r.title} - ${r.description}`)
                .join('\n');

            const task = reqSummary
                ? `Design epics that organize these requirements by user value.\n\nRequirements:\n${reqSummary}${prompt ? `\n\nAdditional instructions: ${prompt}` : ''}`
                : `Design epics. User description: "${prompt}"`;

            const workflowPath = path.join(executor.getBmadPath(), 'bmm', 'workflows', '3-solutioning', 'create-epics-and-stories', 'workflow.md');

            await executor.executeWithTools(model, task, null, stream, token, this.store, workflowPath);

            this.store.setCurrentStep('stories');
        } else {
            stream.markdown('*AI not available - creating template epics*\n\n');
            
            // Create basic epic from requirements
            const epic: Epic = {
                id: 'EPIC-1',
                title: 'Core Functionality',
                goal: 'Enable basic user workflows',
                functionalRequirements: requirements.functional.map((r: { id: string }) => r.id),
                status: 'draft',
                stories: []
            };
            this.store.addEpic(epic);
            
            stream.markdown(`Created template epic: ${epic.title}\n`);
        }

        return { metadata: { command: 'epics' } };
    }

    /**
     * /stories command - Break epics into stories via native BMAD tool-calling workflow
     */
    private async handleStoriesCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## Story Breakdown\n\n');

        const epics = this.store.getEpics();
        const model = await this.getModel();

        if (epics.length === 0) {
            stream.markdown('No epics defined. Run `/epics` first.\n');
            return { metadata: { command: 'stories', status: 'blocked' } };
        }

        // Determine which epic to break down
        let targetEpic = epics[0];
        let explicitlySelected = false;

        if (prompt) {
            const found = epics.find(e =>
                e.title.toLowerCase().includes(prompt.toLowerCase()) ||
                e.id.toLowerCase() === prompt.toLowerCase()
            );
            if (found) { targetEpic = found; explicitlySelected = true; }
        }

        // Only fall back to "first epic without stories" when no explicit epic was specified
        if (!explicitlySelected) {
            const epicWithoutStories = epics.find(e => !e.stories || e.stories.length === 0);
            if (epicWithoutStories) targetEpic = epicWithoutStories;
        }

        stream.markdown(`Generating stories for: **${targetEpic.title}**\n\n`);

        if (model) {
            // Initialize executor with bundled resources fallback
            const executor = getWorkflowExecutor();
            const projectRoot = this.store.getProjectRoot() || undefined;
            const extensionPath = this.extensionContext?.extensionPath;
            const initialized = await executor.initialize(projectRoot, extensionPath);

            if (!initialized) {
                stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
                return { metadata: { command: 'stories', status: 'no-bmad' } };
            }

            // Update shared tool context so the already-registered tools use the correct paths
            if (this.extensionContext) {
                const outputUri = this.store.getSourceFolder();
                sharedToolContext.bmadPath = executor.getBmadPath();
                sharedToolContext.outputPath = outputUri?.fsPath ?? '';
                sharedToolContext.store = this.store;
            }

            const task = `Create user stories for the epic "${targetEpic.title}" (${targetEpic.id}).
Epic goal: ${targetEpic.goal || 'Not set'}
Requirements covered: ${targetEpic.functionalRequirements?.join(', ') || 'None'}${prompt ? `\nAdditional instructions: ${prompt}` : ''}`;

            const workflowPath = path.join(executor.getBmadPath(), 'bmm', 'workflows', '3-solutioning', 'create-epics-and-stories', 'steps', 'step-03-create-stories.md');

            await executor.executeWithTools(
                model,
                task,
                { type: 'epic', ...targetEpic },
                stream,
                token,
                this.store,
                workflowPath
            );

            // Check if more epics need stories
            const remaining = epics.filter(e => !e.stories || e.stories.length === 0).length - 1;
            if (remaining > 0) {
                stream.markdown(`\n${remaining} more epic(s) need stories. Run \`/stories\` again.\n`);
            } else {
                stream.markdown('\nAll epics have stories! Use `/enhance` for verbose details or `/review` to validate.\n');
                this.store.setCurrentStep('enhancement');
            }
        }

        return { metadata: { command: 'stories' } };
    }

    /**
     * /enhance command - Add verbose enterprise details via native BMAD tool-calling workflow
     */
    private async handleEnhanceCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## Epic Enhancement\n\n');

        const epics = this.store.getEpics();
        const model = await this.getModel();

        if (epics.length === 0) {
            stream.markdown('No epics to enhance. Run `/epics` first.\n');
            return { metadata: { command: 'enhance', status: 'blocked' } };
        }

        // Show enhancement menu if no specific request
        if (!prompt) {
            stream.markdown('Add enterprise-level detail to your epics:\n\n');
            stream.markdown('| Option | Command | Description |\n');
            stream.markdown('|--------|---------|-------------|\n');
            stream.markdown('| Use Cases | `/enhance use cases` | Real-world scenarios |\n');
            stream.markdown('| Fit Criteria | `/enhance fit criteria` | Testable checklists |\n');
            stream.markdown('| Metrics | `/enhance metrics` | Success measurements |\n');
            stream.markdown('| Risks | `/enhance risks` | Risk analysis |\n');
            stream.markdown('| Definition of Done | `/enhance dod` | Completion criteria |\n');
            stream.markdown('| **All** | `/enhance all` | Complete enhancement |\n\n');
            stream.markdown('*Specify which epic, e.g., `/enhance all EPIC-1`*\n');
            return { metadata: { command: 'enhance', status: 'awaiting-input' } };
        }

        // Parse enhancement type and target
        const targetEpicId = prompt.match(/EPIC-\d+/i)?.[0]?.toUpperCase();

        // Resolve target epic: explicit ID in prompt -> refine context -> selected artifact -> first epic
        let targetEpic = targetEpicId
            ? epics.find(e => e.id === targetEpicId)
            : undefined;

        if (!targetEpic && !targetEpicId) {
            // No explicit EPIC-N in prompt: check refine context then canvas selection
            const refineCtx = this.store.getRefineContext();
            if (refineCtx?.type === 'epic') {
                targetEpic = epics.find(e => e.id === refineCtx.id);
            }
            if (!targetEpic) {
                const sel = this.store.getSelectedArtifact();
                if (sel?.type === 'epic') {
                    targetEpic = epics.find(e => e.id === sel.id);
                }
            }
            if (!targetEpic) {
                targetEpic = epics[0];
            }
        }

        if (!targetEpic) {
            stream.markdown(`Epic ${targetEpicId} not found.
`);
            return { metadata: { command: 'enhance', status: 'error' } };
        }

        stream.markdown(`Enhancing: **${targetEpic.title}**\n\n`);

        if (model) {
            // Initialize executor with bundled resources fallback
            const executor = getWorkflowExecutor();
            const projectRoot = this.store.getProjectRoot() || undefined;
            const extensionPath = this.extensionContext?.extensionPath;
            const initialized = await executor.initialize(projectRoot, extensionPath);

            if (!initialized) {
                stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
                return { metadata: { command: 'enhance', status: 'no-bmad' } };
            }

            // Update shared tool context so the already-registered tools use the correct paths
            if (this.extensionContext) {
                const outputUri = this.store.getSourceFolder();
                sharedToolContext.bmadPath = executor.getBmadPath();
                sharedToolContext.outputPath = outputUri?.fsPath ?? '';
                sharedToolContext.store = this.store;
            }

            const lowerPrompt = prompt.toLowerCase();
            const enhanceType = lowerPrompt.includes('use case') ? 'use cases'
                : lowerPrompt.includes('fit') ? 'fit criteria'
                : lowerPrompt.includes('metric') ? 'success metrics'
                : lowerPrompt.includes('risk') ? 'risks and mitigations'
                : lowerPrompt.includes('dod') || lowerPrompt.includes('definition') ? 'definition of done'
                : 'all details (use cases, fit criteria, success metrics, risks, definition of done)';

            // Route to the most relevant supporting workflow; for "all" fall back to epic-enhancement step
            const supportingBase = path.join(executor.getBmadPath(), 'bmm', 'workflows', 'supporting');
            const enhancementStep = path.join(executor.getBmadPath(), 'bmm', 'workflows', '3-solutioning', 'create-epics-and-stories', 'steps', 'step-02a-epic-enhancement.md');
            const workflowPath = lowerPrompt.includes('use case')
                ? path.join(supportingBase, 'create-use-cases', 'workflow.yaml')
                : lowerPrompt.includes('risk')
                    ? path.join(supportingBase, 'create-risks', 'workflow.yaml')
                    : lowerPrompt.includes('dod') || lowerPrompt.includes('definition')
                        ? path.join(supportingBase, 'create-definition-of-done', 'workflow.yaml')
                        : enhancementStep;

            const task = `Enhance the epic "${targetEpic.title}" (${targetEpic.id}) with ${enhanceType}.
Epic goal: ${targetEpic.goal || 'Not set'}
Value delivered: ${(targetEpic as any).valueDelivered || 'Not set'}
Stories: ${targetEpic.stories?.map((s: any) => s.title).join(', ') || 'None'}`;

            await executor.executeWithTools(
                model,
                task,
                { type: 'epic', ...targetEpic },
                stream,
                token,
                this.store,
                workflowPath
            );
        }

        return { metadata: { command: 'enhance' } };
    }

    /**
     * /refine command - Refine a specific artifact with AI assistance using BMAD workflows
     * This is triggered from the canvas UI's "Refine with AI" button
     */
    private async handleRefineCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## BMAD Artifact Refinement\n\n');

        // Check if there's a refine context set from the canvas
        const refineContext = this.store.getRefineContext();
        
        // Try to find artifact by ID from prompt or context
        let targetArtifact: any = null;
        let targetType: string = '';
        let targetId: string = '';
        
        // Parse artifact ID from prompt (e.g., "/refine EPIC-1", "/refine TC-2 Test Design", "/refine architecture-1")
        // Matches uppercase prefixed IDs (EPIC-1, STORY-1-1, FR-1, TC-1, etc.) and
        // lowercase prefixed IDs (vision-1, prd-1, architecture-1, product-brief-1, etc.)
        const idMatch = prompt.match(/((?:EPIC|STORY|UC|FR|REQ|TC|TS|NFR|TASK|RISK|ADR|SC|TD|TF|CI|AS|ATD|TM|TR|RR|CR|CP|RET|SS|DOD|PO|PC|TECH)[-\d]+|(?:vision|prd|architecture|product-brief|ux-design|tech-spec|research|test-design|test-coverage|test-summary|test-review|test-framework|nfr-assessment|traceability-matrix|ci-pipeline|automation-summary|atdd-checklist|definition-of-done|readiness-report|sprint-status|retrospective|change-proposal|code-review|project-overview|project-context|storytelling|problem-solving|innovation-strategy|design-thinking)-[\w-]+)/i);
        if (idMatch) {
            targetId = idMatch[1];
            // Preserve lowercase for IDs that are naturally lowercase (vision-1, prd-1, architecture-1, product-brief-1, etc.)
            if (/^(vision|prd|architecture|product-brief|ux-design|tech-spec|research|test-design|test-coverage|test-summary|test-review|test-framework|nfr-assessment|traceability-matrix|ci-pipeline|automation-summary|atdd-checklist|definition-of-done|readiness-report|sprint-status|retrospective|change-proposal|code-review|project-overview|project-context|storytelling|problem-solving|innovation-strategy|design-thinking)-/i.test(targetId)) {
                targetId = targetId.toLowerCase();
            } else {
                targetId = targetId.toUpperCase();
            }
            
            const found = this.store.findArtifactById(targetId);
            if (found) {
                targetArtifact = found.artifact;
                targetType = found.type;
            }
        }
        
        // Fall back to refine context only when NO artifact ID was specified in the prompt.
        // If an explicit ID was given but not found in the store, report the error rather than
        // silently substituting a stale refine context from a previous canvas interaction.
        if (!targetArtifact) {
            if (idMatch) {
                // An ID was specified but not found -- do NOT silently fall back
                stream.markdown("Artifact " + targetId + " not found in the current project. Check the ID and try again.\n");
                return { metadata: { command: 'refine', status: 'not-found' } };
            }
            // No ID in prompt -- use refine context set by the canvas UI
            if (refineContext) {
                targetArtifact = refineContext;
                targetType = refineContext.type;
                targetId = refineContext.id;
            }
        }
        
        if (!targetArtifact) {
            stream.markdown('No artifact specified. Use `/refine <artifact-id>` or click "Refine with AI" on a card.\n\n');
            stream.markdown('**Examples:**\n');
            stream.markdown('- `/refine EPIC-1` - Refine a specific epic\n');
            stream.markdown('- `/refine STORY-1-1` - Refine a specific story\n');
            stream.markdown('- `/refine FR-1` - Refine a requirement\n');
            stream.markdown('- `/refine TC-1` - Refine a test case\n\n');
            stream.markdown('Or click the sparkle button on any card in the canvas!\n');
            return { metadata: { command: 'refine', status: 'awaiting-input' } };
        }

        stream.markdown(`Refining **${targetType}**: ${targetArtifact.title || targetArtifact.productName}\n\n`);
        stream.markdown(`**ID:** ${targetId}\n\n`);

        const model = await this.getModel();
        if (!model) {
            stream.markdown(this.getNoModelMessage());
            return { metadata: { command: 'refine', status: 'no-model' } };
        }

        // Initialize executor — pass extensionPath so it can fall back to bundled resources
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate bundled BMAD resources. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'refine', status: 'no-bmad' } };
        }

        // Update shared tool context so the already-registered tools use the correct paths
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // Extract the workflow selector from the prompt.
        // The prompt after the ID may contain a workflow name (e.g. "Test Design")
        // or a legacy numeric index (e.g. "3") for backward compatibility.
        // Strip the artifact ID first, then inspect what remains.
        const idPattern = /(EPIC-\d+|STORY-[\d-]+|UC-\d+-\d+|FR-\d+|REQ-\d+|TC-\d+|TS-\d+|NFR-\d+|product-brief-\d+|prd-\d+|architecture-\d+|vision-\d+)/i;
        const afterId = prompt.replace(idPattern, '').trim();

        // Try to match a workflow by name from the available workflows for this type
        const available = executor.getAvailableWorkflows(targetType);
        let chosenWorkflow: { path: string; name: string; description: string } | undefined;
        let userInstructions = afterId;

        if (afterId) {
            // First, try to find a workflow whose name appears at the start of the remaining text (case-insensitive)
            // Sort by name length descending so longer names match first (e.g. "Story Quality Review" before "Story")
            const sortedByLength = [...available].sort((a, b) => b.name.length - a.name.length);
            for (const wf of sortedByLength) {
                if (afterId.toLowerCase().startsWith(wf.name.toLowerCase())) {
                    chosenWorkflow = wf;
                    userInstructions = afterId.slice(wf.name.length).trim();
                    break;
                }
            }

            // Backward compat: if no name matched, check for a trailing numeric index
            if (!chosenWorkflow) {
                const legacyIndexMatch = afterId.match(/^(\d{1,2})(?:\s|$)/);
                if (legacyIndexMatch) {
                    const idx = parseInt(legacyIndexMatch[1], 10);
                    const byIndex = available[idx - 1];
                    if (byIndex) {
                        chosenWorkflow = byIndex;
                        userInstructions = afterId.slice(legacyIndexMatch[0].length).trim();
                    } else {
                        stream.markdown(`**Error:** Workflow index ${idx} is out of range for ${targetType} (max ${available.length}).\n`);
                        return { metadata: { command: 'refine', status: 'bad-index' } };
                    }
                }
            }
        }

        // Build the task description for the LLM
        const task = userInstructions
            ? `Refine the ${targetType} "${targetArtifact.title || targetId}". Additional instructions: ${userInstructions}`
            : `Refine the ${targetType} "${targetArtifact.title || targetId}".`;

        // Resolve workflow path
        let refineWorkflowPath: string;

        if (chosenWorkflow) {
            refineWorkflowPath = chosenWorkflow.path;
            stream.markdown(`**Workflow:** ${chosenWorkflow.name}\n\n`);
        } else {
            // No workflow specified — use the first available workflow for this type.
            // getAvailableWorkflows() always returns at least one entry (default case is Brainstorming).
            const defaultWorkflow = available[0];
            refineWorkflowPath = defaultWorkflow.path;
            stream.markdown(`**Workflow:** ${defaultWorkflow.name} (default)\n\n`);
        }

        try {
            await executor.executeWithTools(model, task, { type: targetType, id: targetId, ...targetArtifact }, stream, token, this.store, refineWorkflowPath);
        } catch (error) {
            this.store.clearRefineContext();
            stream.markdown(`\n\n**Error during workflow execution:** ${error}\n`);
            return { metadata: { command: 'refine', status: 'error', artifactType: targetType, artifactId: targetId } };
        }

        // Clear stale refine context now that the workflow has completed
        this.store.clearRefineContext();

        return { metadata: { command: 'refine', status: 'workflow-executed', artifactType: targetType, artifactId: targetId } };
    }

    /**
     * Handle /dev command - start development workflows for an artifact.
     * Similar to /refine but uses implementation-phase workflows (dev-story, checklist, code review).
     */
    private async handleDevCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Start Development\n\n');

        // Check if there's a refine context set from the canvas (Start Dev button sets this)
        const refineContext = this.store.getRefineContext();

        // Parse artifact ID from prompt
        let targetArtifact: any = null;
        let targetType: string = '';
        let targetId: string = '';

        const idMatch = prompt.match(/(EPIC-\d+|STORY-[\d-]+|UC-\d+-\d+|FR-\d+|REQ-\d+|TC-\d+|TS-\d+|NFR-\d+|product-brief-\d+|prd-\d+|architecture-\d+|vision-\d+)/i);
        if (idMatch) {
            targetId = idMatch[1];
            if (/^(vision|prd|architecture|product-brief)-/i.test(targetId)) {
                targetId = targetId.toLowerCase();
            } else {
                targetId = targetId.toUpperCase();
            }

            const found = this.store.findArtifactById(targetId);
            if (found) {
                targetArtifact = found.artifact;
                targetType = found.type;
            }
        }

        // Fall back to refine context if no ID specified
        if (!targetArtifact) {
            if (idMatch) {
                stream.markdown(`Artifact ${targetId} not found in the current project. Check the ID and try again.\n`);
                return { metadata: { command: 'dev', status: 'not-found' } };
            }
            if (refineContext) {
                targetArtifact = refineContext;
                targetType = refineContext.type;
                targetId = refineContext.id;
            }
        }

        if (!targetArtifact) {
            stream.markdown('No artifact specified. Use `/dev <artifact-id>` or click the **Start Dev** button on a card.\n\n');
            stream.markdown('**Examples:**\n');
            stream.markdown('- `/dev STORY-1-1` - Start developing a story\n');
            stream.markdown('- `/dev EPIC-1` - Check implementation readiness for an epic\n');
            stream.markdown('- `/dev TC-1` - Design tests for a test case\n');
            return { metadata: { command: 'dev', status: 'awaiting-input' } };
        }

        stream.markdown(`**Developing:** ${targetArtifact.title || targetArtifact.productName}\n\n`);
        stream.markdown(`**ID:** ${targetId}\n\n`);

        const model = await this.getModel();
        if (!model) {
            stream.markdown(this.getNoModelMessage());
            return { metadata: { command: 'dev', status: 'no-model' } };
        }

        // Initialize executor
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate bundled BMAD resources. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'dev', status: 'no-bmad' } };
        }

        // Update shared tool context
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // Get dev-specific workflows for this artifact type
        const available = executor.getDevWorkflows(targetType);

        if (available.length === 0) {
            stream.markdown(`No development workflows available for type **${targetType}**.\n\n`);
            stream.markdown('Development workflows are available for: **story**, **epic**, **test-case**.\n');
            return { metadata: { command: 'dev', status: 'no-workflows' } };
        }

        // Extract workflow selector from the prompt (after the artifact ID)
        const idPattern = /(EPIC-\d+|STORY-[\d-]+|UC-\d+-\d+|FR-\d+|REQ-\d+|TC-\d+|TS-\d+|NFR-\d+|product-brief-\d+|prd-\d+|architecture-\d+|vision-\d+)/i;
        const afterId = prompt.replace(idPattern, '').trim();

        let chosenWorkflow: { path: string; name: string; description: string } | undefined;
        let userInstructions = afterId;

        if (afterId) {
            // Match workflow by name
            const sortedByLength = [...available].sort((a, b) => b.name.length - a.name.length);
            for (const wf of sortedByLength) {
                if (afterId.toLowerCase().startsWith(wf.name.toLowerCase())) {
                    chosenWorkflow = wf;
                    userInstructions = afterId.slice(wf.name.length).trim();
                    break;
                }
            }

            // Backward compat: numeric index
            if (!chosenWorkflow) {
                const legacyIndexMatch = afterId.match(/^(\d{1,2})(?:\s|$)/);
                if (legacyIndexMatch) {
                    const idx = parseInt(legacyIndexMatch[1], 10);
                    const byIndex = available[idx - 1];
                    if (byIndex) {
                        chosenWorkflow = byIndex;
                        userInstructions = afterId.slice(legacyIndexMatch[0].length).trim();
                    } else {
                        stream.markdown(`**Error:** Workflow index ${idx} is out of range (max ${available.length}).\n`);
                        return { metadata: { command: 'dev', status: 'bad-index' } };
                    }
                }
            }
        }

        // Build the task description
        const task = userInstructions
            ? `Start development for ${targetType} "${targetArtifact.title || targetId}". Additional instructions: ${userInstructions}`
            : `Start development for ${targetType} "${targetArtifact.title || targetId}".`;

        // Resolve workflow path
        let devWorkflowPath: string;

        if (chosenWorkflow) {
            devWorkflowPath = chosenWorkflow.path;
            stream.markdown(`**Workflow:** ${chosenWorkflow.name}\n\n`);
        } else {
            // No workflow specified — auto-select the first one
            const defaultWorkflow = available[0];
            devWorkflowPath = defaultWorkflow.path;
            stream.markdown(`**Workflow:** ${defaultWorkflow.name}\n\n`);
        }

        try {
            await executor.executeWithTools(model, task, { type: targetType, id: targetId, ...targetArtifact }, stream, token, this.store, devWorkflowPath);
        } catch (error) {
            this.store.clearRefineContext();
            stream.markdown(`\n\n**Error during dev workflow execution:** ${error}\n`);
            return { metadata: { command: 'dev', status: 'error', artifactType: targetType, artifactId: targetId } };
        }

        this.store.clearRefineContext();

        return { metadata: { command: 'dev', status: 'workflow-executed', artifactType: targetType, artifactId: targetId } };
    }

    /**
     * Handle /continue command - progress to next workflow step
     */
    private async handleContinueCommand(
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        const executor = getWorkflowExecutor();
        const session = executor.getCurrentSession();

        if (!session) {
            stream.markdown('## No Active Workflow\n\n');
            stream.markdown('There is no active workflow session to continue.\n\n');
            stream.markdown('**To start a workflow:**\n');
            stream.markdown('1. Use `@agileagentcanvas /refine <artifact-id>` to select a workflow\n');
            stream.markdown('2. Select a workflow number from the menu\n\n');
            stream.markdown('**Example:** `@agileagentcanvas /refine EPIC-1 1`\n');
            return { metadata: { command: 'continue', status: 'no-session' } };
        }

        stream.markdown(`## Continuing Workflow\n\n`);
        stream.markdown(`**Session:** ${session.id}\n`);
        stream.markdown(`**Workflow:** ${session.workflowName}\n`);
        stream.markdown(`**Step:** ${session.currentStepNumber}\n\n`);

        // Determine user input - could be 'C' for continue, or actual input
        const userInput = prompt.trim() || 'C';
        
        stream.progress('Processing your input...');

        // Get the continue prompt
        const continuePrompt = await executor.buildContinuePrompt(userInput);
        
        if (!continuePrompt) {
            stream.markdown('Could not determine next step. The workflow may be complete or missing step navigation.\n\n');
            
            stream.markdown('**Options:**\n');
            stream.markdown('- Use `@agileagentcanvas /status` to check workflow status\n');
            stream.markdown('- Use `@agileagentcanvas /refine <artifact-id>` to start a new refinement\n');
            
            return { metadata: { command: 'continue', status: 'no-next-step', sessionId: session.id } };
        }

        // Execute with AI
        const model = await this.getModel();
        if (!model) {
            stream.markdown(this.getNoModelMessage());
            return { metadata: { command: 'continue', status: 'no-model' } };
        }

        // ── Ensure tool context is initialized ──────────────────────────────
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        await executor.initialize(projectRoot, extensionPath);

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        stream.progress('Executing next step...');

        // ── Build persona + collaboration context for /continue ─────────
        // The bare continuePrompt from buildContinuePrompt() only has step
        // instructions. The model needs identity, behavioral rules, and tool
        // awareness to function properly during workflow continuation.
        const bmadPath = executor.getBmadPath();
        const continuePersona = getPersonaForArtifactType(bmadPath, session.artifactType);
        const continuePersonaSection = continuePersona
            ? formatFullAgentForPrompt(continuePersona)
            : '';

        const continuePreamble = `${continuePersonaSection || 'You are a BMAD methodology AI analyst continuing a workflow inside VS Code.'}

## VS Code Workflow Continuation Context
You are continuing an active BMAD workflow session. The user is progressing through workflow steps.
Skip your activation menu — the user is mid-workflow and has already been interacting with you.

**CRITICAL — Interactive Collaboration Rules:**
- Follow the workflow step instructions exactly, including ALL checkpoint/pause instructions.
- When a step says to present options (e.g. [a] Advanced Elicitation, [c] Continue, [p] Party-Mode, [y] YOLO),
  you MUST present those options to the user and STOP. Do NOT auto-continue.
- When a step says "STOP and WAIT for user input", you MUST stop and wait.
- Each template-output section should be discussed with the user before proceeding.
- Only proceed autonomously if the user explicitly chose YOLO mode.
- This is a collaborative conversation, not an autonomous batch process.

## Your Tools
- **agileagentcanvas_read_file(path)** — read any file under \`${bmadPath}\` (use resolved absolute paths)
- **agileagentcanvas_list_directory(path)** — list any directory under \`${bmadPath}\`
- **agileagentcanvas_update_artifact(type, id, changes)** — persist changes to a BMAD artifact in the project
- **agileagentcanvas_sync_story_status(storyId, epicId, status)** — atomically sync a story's status across ALL tracker files
- **agileagentcanvas_sync_epic_status(epicId, status)** — atomically sync an epic's status across ALL tracker files

## BMAD Framework Location
The complete BMAD framework is at: \`${bmadPath}\`

---

`;

        try {
            let fullResponse = '';

            if (model.vscodeLm) {
                // VS Code LM path — agentic tool-calling loop so the agent can
                // read files, list directories, and save artifacts during /continue.
                const messages = [
                    vscode.LanguageModelChatMessage.User(continuePreamble),
                    vscode.LanguageModelChatMessage.User(continuePrompt)
                ];
                const tools = getToolDefinitions();
                const MAX_ROUNDS = 15;
                let rounds = 0;

                while (rounds < MAX_ROUNDS && !token.isCancellationRequested) {
                    rounds++;
                    const response = await model.vscodeLm.sendRequest(messages, { tools }, token);

                    let roundText = '';
                    const toolCalls: vscode.LanguageModelToolCallPart[] = [];

                    for await (const part of response.stream) {
                        if (token.isCancellationRequested) break;
                        if (part instanceof vscode.LanguageModelTextPart) {
                            roundText += part.value;
                            stream.markdown(part.value);
                        } else if (part instanceof vscode.LanguageModelToolCallPart) {
                            toolCalls.push(part);
                        }
                    }

                    fullResponse += roundText;

                    // Append assistant turn to message history
                    const assistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
                    if (roundText) {
                        assistantParts.push(new vscode.LanguageModelTextPart(roundText));
                    }
                    for (const tc of toolCalls) {
                        assistantParts.push(tc);
                    }
                    if (assistantParts.length > 0) {
                        messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
                    }

                    // If no tool calls, the LLM is done (or paused at a checkpoint)
                    if (toolCalls.length === 0) break;

                    // Invoke each tool and collect results
                    const toolResultParts: vscode.LanguageModelToolResultPart[] = [];
                    for (const tc of toolCalls) {
                        let result: vscode.LanguageModelToolResult;
                        try {
                            result = await vscode.lm.invokeTool(tc.name, { input: tc.input, toolInvocationToken: undefined }, token);
                        } catch (err: any) {
                            result = new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(`Tool "${tc.name}" failed: ${err?.message ?? err}`)
                            ]);
                        }
                        toolResultParts.push(new vscode.LanguageModelToolResultPart(tc.callId, result.content));
                    }

                    // Feed tool results back
                    messages.push(vscode.LanguageModelChatMessage.User(toolResultParts));
                }
            } else {
                // Direct API / Antigravity path — text-only streaming (no tool support yet)
                const chatMessages: ChatMessage[] = [
                    { role: 'system', content: continuePreamble },
                    { role: 'user', content: continuePrompt }
                ];
                fullResponse = await streamChatResponse(model, chatMessages, stream, token);
            }

            // Detect if waiting for more input
            const inputDetection = executor.detectUserPrompt(fullResponse);

            // Try to extract JSON refinements
            const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    const refinements = JSON.parse(jsonMatch[1]);
                    stream.markdown('\n\n---\n');
                    stream.markdown('**Refinements detected!** Use `@agileagentcanvas /apply` to save changes.\n');
                    
                    this.store.setRefineContext({ 
                        ...session.artifact, 
                        refinements, 
                        type: session.artifactType, 
                        id: session.artifactId 
                    });
                } catch {
                    // JSON parsing failed
                }
            }

            // Show navigation hints
            stream.markdown('\n\n---\n');
            
            const updatedSession = executor.getCurrentSession();
            if (updatedSession) {
                stream.markdown(`**Step ${updatedSession.currentStepNumber}** of workflow "${updatedSession.workflowName}"\n\n`);
                
                if (inputDetection.waitingForInput) {
                    if (inputDetection.continueOption) {
                        stream.markdown('Reply with your selection, or use `@agileagentcanvas /continue` to proceed.\n\n');
                        stream.button({
                            title: 'Continue to Next Step',
                            command: 'agileagentcanvas.continueWorkflow',
                            arguments: [updatedSession.id]
                        });
                    } else {
                        stream.markdown('Provide your response to continue.\n\n');
                    }
                }
            }

            return { 
                metadata: { 
                    command: 'continue', 
                    status: inputDetection.waitingForInput ? 'awaiting-input' : 'step-executed',
                    sessionId: session.id,
                    stepNumber: executor.getCurrentSession()?.currentStepNumber
                } 
            };

        } catch (error) {
            stream.markdown(`\n\nError continuing workflow: ${error}\n`);
            return { metadata: { command: 'continue', status: 'error', sessionId: session.id } };
        }
    }

    /**
     * Handle /status command - show current workflow session status
     */
    private async handleStatusCommand(
        stream: vscode.ChatResponseStream
    ): Promise<vscode.ChatResult> {
        
        const executor = getWorkflowExecutor();
        const session = executor.getCurrentSession();

        stream.markdown('## Workflow Status\n\n');

        if (!session) {
            stream.markdown('**No active workflow session.**\n\n');
            stream.markdown('Use `@agileagentcanvas /refine <artifact-id>` to start a new workflow.\n');
            return { metadata: { command: 'status', status: 'no-session' } };
        }

        stream.markdown(`### Active Session\n\n`);
        stream.markdown(`| Property | Value |\n`);
        stream.markdown(`|----------|-------|\n`);
        stream.markdown(`| Session ID | \`${session.id}\` |\n`);
        stream.markdown(`| Workflow | ${session.workflowName} |\n`);
        stream.markdown(`| Status | ${session.status} |\n`);
        stream.markdown(`| Current Step | ${session.currentStepNumber} |\n`);
        stream.markdown(`| Steps Completed | ${session.stepsCompleted.length} |\n`);
        stream.markdown(`| Artifact | ${session.artifactType} (${session.artifactId}) |\n`);
        stream.markdown(`| Started | ${session.startedAt.toLocaleString()} |\n`);
        stream.markdown(`| Last Activity | ${session.lastActivityAt.toLocaleString()} |\n\n`);

        if (session.stepsCompleted.length > 0) {
            stream.markdown('### Completed Steps\n\n');
            session.stepsCompleted.forEach((step, i) => {
                const stepName = step.split('/').pop() || step;
                stream.markdown(`${i + 1}. ${stepName}\n`);
            });
            stream.markdown('\n');
        }

        if (session.userInputs.length > 0) {
            stream.markdown('### User Inputs\n\n');
            session.userInputs.slice(-5).forEach((input, i) => {
                const stepName = input.step.split('/').pop() || input.step;
                stream.markdown(`- **${stepName}:** ${input.input.substring(0, 50)}${input.input.length > 50 ? '...' : ''}\n`);
            });
            stream.markdown('\n');
        }

        stream.markdown('### Actions\n\n');
        stream.button({
            title: 'Continue Workflow',
            command: 'agileagentcanvas.continueWorkflow',
            arguments: [session.id]
        });
        stream.button({
            title: 'Cancel Workflow',
            command: 'agileagentcanvas.cancelWorkflow',
            arguments: [session.id]
        });

        return { metadata: { command: 'status', sessionId: session.id } };
    }

    /**
     * /apply command - Apply stored refinements to the artifact
     * This is called after /refine when user says "apply" or uses /apply
     */
    private async handleApplyCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## Applying Refinements\n\n');

        // Get the stored refine context (which includes refinements)
        const refineContext = this.store.getRefineContext();
        
        if (!refineContext || !refineContext.refinements) {
            stream.markdown('No pending refinements to apply.\n\n');
            stream.markdown('Use `/refine <artifact-id>` first to generate refinements, then `/apply` to apply them.\n');
            return { metadata: { command: 'apply', status: 'no-refinements' } };
        }

        const { type, id, refinements } = refineContext;
        stream.markdown(`Applying refinements to **${type}**: ${id}\n\n`);

        try {
            // Build the changes object based on type
            let changes: any = {};
            
            switch (type) {
                case 'vision':
                    changes = {
                        productName: refinements.productName,
                        problemStatement: refinements.problemStatement,
                        targetUsers: refinements.targetUsers,
                        valueProposition: refinements.valueProposition,
                        successCriteria: refinements.successCriteria
                    };
                    // Remove undefined values
                    Object.keys(changes).forEach(key => {
                        if (changes[key] === undefined) delete changes[key];
                    });
                    await this.store.updateArtifact('vision', 'main', changes);
                    break;

                case 'epic':
                    changes = {
                        title: refinements.title,
                        description: refinements.goal, // goal maps to description
                        metadata: {
                            goal: refinements.goal,
                            valueDelivered: refinements.valueDelivered,
                            useCases: refinements.useCases,
                            risks: refinements.risks,
                            definitionOfDone: refinements.definitionOfDone
                        }
                    };
                    // Remove undefined values
                    if (!refinements.title) delete changes.title;
                    if (!refinements.goal) delete changes.description;
                    await this.store.updateArtifact('epic', id, changes);
                    break;

                case 'story':
                    changes = {
                        title: refinements.title,
                        metadata: {
                            userStory: refinements.userStory,
                            acceptanceCriteria: refinements.acceptanceCriteria,
                            technicalNotes: refinements.technicalNotes,
                            storyPoints: refinements.storyPoints
                        }
                    };
                    if (!refinements.title) delete changes.title;
                    await this.store.updateArtifact('story', id, changes);
                    break;

                case 'requirement':
                    changes = {
                        title: refinements.title,
                        description: refinements.description,
                        metadata: {
                            capabilityArea: refinements.capabilityArea
                        }
                    };
                    if (!refinements.title) delete changes.title;
                    if (!refinements.description) delete changes.description;
                    await this.store.updateArtifact('requirement', id, changes);
                    break;

                case 'test-case':
                    changes = {
                        title: refinements.title,
                        status: refinements.status,
                        metadata: {
                            description: refinements.description,
                            steps: refinements.steps,
                            expectedResult: refinements.expectedResult,
                            priority: refinements.priority,
                            tags: refinements.tags,
                        }
                    };
                    if (!refinements.title) delete changes.title;
                    if (!refinements.status) delete changes.status;
                    // Clean undefined metadata keys
                    if (changes.metadata) {
                        Object.keys(changes.metadata).forEach((key: string) => {
                            if (changes.metadata[key] === undefined) delete changes.metadata[key];
                        });
                    }
                    await this.store.updateArtifact('test-case', id, changes);
                    break;

                case 'test-strategy':
                    changes = {
                        title: refinements.title,
                        status: refinements.status,
                        metadata: {
                            approach: refinements.approach,
                            scope: refinements.scope,
                            tools: refinements.tools,
                            environments: refinements.environments,
                            riskAssessment: refinements.riskAssessment,
                        }
                    };
                    if (!refinements.title) delete changes.title;
                    if (!refinements.status) delete changes.status;
                    if (changes.metadata) {
                        Object.keys(changes.metadata).forEach((key: string) => {
                            if (changes.metadata[key] === undefined) delete changes.metadata[key];
                        });
                    }
                    await this.store.updateArtifact('test-strategy', id, changes);
                    break;

                case 'product-brief':
                    changes = { ...refinements };
                    // Remove suggestions from persisted data
                    delete changes.suggestions;
                    await this.store.updateArtifact('product-brief', id, changes);
                    break;

                case 'prd':
                    changes = { ...refinements };
                    delete changes.suggestions;
                    await this.store.updateArtifact('prd', id, changes);
                    break;

                case 'architecture':
                    changes = { ...refinements };
                    delete changes.suggestions;
                    await this.store.updateArtifact('architecture', id, changes);
                    break;

                case 'use-case':
                    changes = {
                        title: refinements.title,
                        metadata: {
                            summary: refinements.summary,
                            scenario: refinements.scenario,
                        }
                    };
                    if (!refinements.title) delete changes.title;
                    if (changes.metadata) {
                        Object.keys(changes.metadata).forEach((key: string) => {
                            if (changes.metadata[key] === undefined) delete changes.metadata[key];
                        });
                    }
                    await this.store.updateArtifact('use-case', id, changes);
                    break;

                default:
                    stream.markdown(`Unsupported artifact type: ${type}\n`);
                    return { metadata: { command: 'apply', status: 'unsupported-type' } };
            }

            stream.markdown('**Applied changes:**\n');
            Object.keys(changes).forEach(key => {
                if (key !== 'metadata' && changes[key]) {
                    stream.markdown(`- ${key}: ${typeof changes[key] === 'object' ? JSON.stringify(changes[key]) : changes[key]}\n`);
                }
            });
            if (changes.metadata) {
                Object.keys(changes.metadata).forEach(key => {
                    if (changes.metadata[key]) {
                        const value = changes.metadata[key];
                        if (Array.isArray(value)) {
                            stream.markdown(`- ${key}: ${value.length} items\n`);
                        } else {
                            stream.markdown(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`);
                        }
                    }
                });
            }
            
            stream.markdown('\n---\n');
            stream.markdown('Changes have been saved to the JSON file. The canvas will automatically refresh.\n');

            // Clear the refine context after successful application
            this.store.clearRefineContext();

        } catch (error) {
            stream.markdown(`Error applying refinements: ${error}\n`);
            return { metadata: { command: 'apply', status: 'error' } };
        }

        return { metadata: { command: 'apply', status: 'success', artifactType: type, artifactId: id } };
    }

    /**
     * Load the appropriate agent persona from disk for a given artifact type.
     * Returns undefined if the BMAD path isn't resolved or the file can't be parsed.
     */
    private loadPersonaForType(artifactType: string): AgentPersona | undefined {
        const executor = getWorkflowExecutor();
        const bmadPath = executor.getBmadPath();
        if (!bmadPath) {
            return undefined;
        }
        return getPersonaForArtifactType(bmadPath, artifactType);
    }

    private buildVisionRefinementPrompt(vision: any): string {
        const persona = this.loadPersonaForType('vision');
        const personaIntro = persona
            ? `You are ${persona.name}, a ${persona.title} from the BMAD methodology team. Your persona:
- Role: ${persona.role}
- Style: ${persona.communicationStyle}
- Principles: ${persona.principles}`
            : `You are John, a Product Manager from the BMAD methodology team. Your persona:
- Role: Product Manager specializing in collaborative PRD creation
- Style: Ask 'WHY?' relentlessly like a detective on a case. Direct and data-sharp, cuts through fluff.
- Principles: User value first. Ship the smallest thing that validates the assumption.`;

        return `${personaIntro}

## REFINEMENT MISSION

Review and refine this product vision to make it compelling, specific, and measurable.

### Current Vision:
- Product Name: ${vision.productName || 'Not set'}
- Problem Statement: ${vision.problemStatement || 'Not set'}
- Target Users: ${(vision.targetUsers || []).join(', ') || 'Not defined'}
- Value Proposition: ${vision.valueProposition || 'Not set'}
- Success Criteria: ${(vision.successCriteria || []).join('; ') || 'None'}

### BMAD Quality Standards for Vision:
1. **Problem Statement**: Must be specific, evidence-based pain point - not vague
2. **Target Users**: Should be actionable personas, not generic "users"
3. **Value Proposition**: Clear differentiation, why THIS solution vs alternatives
4. **Success Criteria**: SMART metrics - Specific, Measurable, Achievable, Relevant, Time-bound

### Provide refinements in this JSON format:
{
    "productName": "refined name if needed",
    "problemStatement": "clearer, evidence-based problem statement with quantifiable impact",
    "targetUsers": ["specific persona with job-to-be-done"],
    "valueProposition": "differentiated value with clear benefit over alternatives",
    "successCriteria": ["SMART measurable success criteria"],
    "suggestions": ["additional improvement suggestions"]
}

After refinement, use \`@agileagentcanvas /apply\` to save changes to the JSON file.`;
    }

    private buildRequirementRefinementPrompt(req: any): string {
        const persona = this.loadPersonaForType('requirement');
        const personaIntro = persona
            ? `You are ${persona.name}, a ${persona.title} from the BMAD methodology team. Your persona:
- Role: ${persona.role}
- Style: ${persona.communicationStyle}
- Principles: ${persona.principles}`
            : `You are Mary, a Business Analyst from the BMAD methodology team. Your persona:
- Role: Strategic Business Analyst + Requirements Expert
- Style: Speaks with excitement of a treasure hunter - thrilled by every clue, energized when patterns emerge.
- Principles: Articulate requirements with absolute precision. Ground findings in verifiable evidence.`;

        return `${personaIntro}

## REFINEMENT MISSION

Review and refine this requirement to make it specific, measurable, and testable.

### Current Requirement:
- ID: ${req.id}
- Title: ${req.title}
- Description: ${req.description}
- Capability Area: ${req.capabilityArea || 'Not specified'}

### BMAD Quality Standards for Requirements:
1. **Specificity**: No ambiguous language - every term should have one interpretation
2. **Measurability**: Must have quantifiable acceptance criteria
3. **Testability**: Clear test cases that verify the requirement is met
4. **Traceability**: Should link to user value and business goals

### DISASTER PREVENTION:
- Avoid vague terms like "fast", "user-friendly", "efficient" without metrics
- Ensure requirement doesn't overlap with existing requirements
- Verify technical feasibility with architecture constraints

### Provide refinements in this JSON format:
{
    "title": "clearer, action-oriented title",
    "description": "precise description with measurable outcomes",
    "capabilityArea": "appropriate capability area",
    "testCriteria": ["specific test cases to verify requirement"],
    "suggestions": ["additional improvement suggestions"]
}

After refinement, use \`@agileagentcanvas /apply\` to save changes to the JSON file.`;
    }

    private buildEpicRefinementPrompt(epic: any): string {
        const storySummary = epic.stories?.map((s: any) => `- ${s.id}: ${s.title}`).join('\n') || 'No stories yet';
        
        const persona = this.loadPersonaForType('epic');
        const personaIntro = persona
            ? `You are ${persona.name}, a ${persona.title} from the BMAD methodology team. Your persona:
- Role: ${persona.role}
- Style: ${persona.communicationStyle}
- Principles: ${persona.principles}`
            : `You are John, a Product Manager from the BMAD methodology team. Your persona:
- Role: Product Manager specializing in epics and value delivery
- Style: Ask 'WHY?' relentlessly. Direct and data-sharp.
- Principles: User value first. Technical feasibility is a constraint, not the driver.`;

        return `${personaIntro}

## REFINEMENT MISSION

Review and refine this epic to ensure it delivers clear user value with measurable outcomes.

### Current Epic:
- ID: ${epic.id}
- Title: ${epic.title}
- Goal: ${epic.goal || 'Not set'}
- Value Delivered: ${epic.valueDelivered || 'Not specified'}
- Requirements: ${(epic.functionalRequirements || []).join(', ') || 'None'}
- Stories:
${storySummary}

### BMAD Quality Standards for Epics:
1. **Goal**: Clear business outcome, not just "implement X"
2. **Value Delivered**: Quantifiable user/business benefit
3. **Use Cases**: Real scenarios showing before/after impact
4. **Definition of Done**: Comprehensive completion criteria
5. **Risks**: Identified risks with mitigation strategies

### DISASTER PREVENTION (from BMAD checklist):
- Avoid reinventing existing solutions - check for reuse opportunities
- Ensure epic scope is achievable - not too broad
- Verify stories cover all acceptance criteria
- Check cross-epic dependencies

### Provide refinements in this JSON format:
{
    "title": "clearer value-focused title if needed",
    "goal": "specific business outcome with measurable impact",
    "valueDelivered": "quantifiable user/business benefit",
    "useCases": [
        {
            "title": "descriptive use case name",
            "summary": "brief description",
            "scenario": {
                "context": "when/where this happens",
                "before": "current pain point with impact",
                "after": "improved state with benefit",
                "impact": "business/user impact metrics"
            }
        }
    ],
    "risks": [
        {"risk": "specific risk", "impact": "low|medium|high", "mitigation": "concrete strategy"}
    ],
    "definitionOfDone": ["specific, verifiable completion criteria"],
    "suggestions": ["additional improvement suggestions"]
}

After refinement, use \`@agileagentcanvas /apply\` to save changes to the JSON file.`;
    }

    private buildStoryRefinementPrompt(story: any): string {
        const acSummary = story.acceptanceCriteria?.map((ac: any) => 
            ac.criterion
                ? `- ${ac.criterion}`
                : `- Given ${ac.given}, when ${ac.when}, then ${ac.then}`
        ).join('\n') || 'No acceptance criteria';

        const persona = this.loadPersonaForType('story');
        const personaIntro = persona
            ? `You are ${persona.name}, a ${persona.title} from the BMAD methodology team. Your persona:
- Role: ${persona.role}
- Style: ${persona.communicationStyle}
- Principles: ${persona.principles}`
            : `You are Bob, a Scrum Master from the BMAD methodology team. Your persona:
- Role: Technical Scrum Master + Story Preparation Specialist
- Style: Crisp and checklist-driven. Every word has a purpose, every requirement crystal clear. Zero tolerance for ambiguity.
- Principles: I strive to be a servant leader and conduct myself accordingly. I love to talk about Agile process and theory.`;

        return `${personaIntro}

## REFINEMENT MISSION

Review and refine this user story to make it implementation-ready with comprehensive acceptance criteria.

### Current Story:
- ID: ${story.id}
- Title: ${story.title}
- User Story: As a ${story.userStory?.asA || 'user'}, I want ${story.userStory?.iWant || '...'}, so that ${story.userStory?.soThat || '...'}
- Story Points: ${story.storyPoints || 'Not estimated'}
- Acceptance Criteria:
${acSummary}
- Technical Notes: ${story.technicalNotes || 'None'}

### BMAD Quality Standards for Stories (from create-story checklist):

#### CRITICAL MISTAKES TO PREVENT:
- **Reinventing wheels**: Creating duplicate functionality instead of reusing existing
- **Wrong libraries**: Using incorrect frameworks, versions, or dependencies  
- **Vague implementations**: Creating unclear, ambiguous implementations
- **Lying about completion**: Implementing incorrectly or incompletely

#### STORY QUALITY CHECKLIST:
1. **User Story Format**: Specific role, clear action, measurable benefit
2. **Acceptance Criteria**: Gherkin format (Given/When/Then) - testable and complete
3. **Story Points**: Realistic estimate based on complexity
4. **Technical Notes**: Implementation guidance, patterns to follow, libraries to use
5. **Definition of Ready**: All blockers identified and resolved

### LLM OPTIMIZATION (for dev agent):
- Clarity over verbosity - be precise and direct
- Actionable instructions - every sentence guides implementation
- Token efficiency - pack maximum information into minimum text
- Unambiguous language - no room for interpretation

### Provide refinements in this JSON format:
{
    "title": "clearer, action-oriented title if needed",
    "userStory": {
        "asA": "specific user role with context",
        "iWant": "specific capability with clear scope",
        "soThat": "measurable benefit with business value"
    },
    "acceptanceCriteria": [
        {"given": "specific precondition", "when": "user action", "then": "expected result", "and": ["additional verifiable conditions"]}
    ],
    "storyPoints": 3,
    "technicalNotes": "implementation guidance: patterns, libraries, file locations, dependencies",
    "suggestions": ["additional improvement suggestions"]
}

After refinement, use \`@agileagentcanvas /apply\` to save changes to the JSON file.`;
    }

    private buildGenericRefinementPrompt(artifact: any): string {
        const artifactType = artifact?.type || artifact?.id?.replace(/-\d+$/, '') || '';
        const persona = this.loadPersonaForType(artifactType);
        const personaIntro = persona
            ? `You are ${persona.name}, a ${persona.title} from the BMAD methodology team.`
            : `You are Mary, a Business Analyst from the BMAD methodology team.`;

        return `${personaIntro}

Review and suggest improvements for this artifact following BMAD quality standards:
- Specificity: Remove ambiguity, every term should have one interpretation
- Measurability: Add quantifiable criteria where possible
- Testability: Ensure outcomes can be verified
- Value Focus: Connect to user/business value

Current artifact:
${JSON.stringify(artifact, null, 2)}

Provide refinements in JSON format with improved content and a "suggestions" array.

After refinement, use \`@agileagentcanvas /apply\` to save changes to the JSON file.`;
    }

    /**
     * /sprint command - Sprint planning or sprint status check.
     *
     * Sub-modes (parsed from prompt):
     *   - "plan" (default when epics exist) — runs sprint-planning workflow to
     *     generate/update sprint-status.yaml from epics
     *   - "status" — runs sprint-status workflow to read and summarize existing
     *     sprint-status.yaml, surface risks, and recommend next action
     *
     * Agent: Bob (Scrum Master) via artifact type 'sprint' mapping.
     */
    private async handleSprintCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        // ── Determine sub-mode ────────────────────────────────────────────
        const lower = prompt.toLowerCase().trim();
        const isStatusMode = lower.startsWith('status') || lower === 'check' || lower === 'check status';
        const subMode: 'plan' | 'status' = isStatusMode ? 'status' : 'plan';

        if (subMode === 'status') {
            stream.markdown('## Sprint Status\n\n');
        } else {
            stream.markdown('## Sprint Planning\n\n');
        }

        // ── Pre-flight checks ─────────────────────────────────────────────
        const epics = this.store.getEpics();

        if (subMode === 'plan' && epics.length === 0 && !prompt) {
            stream.markdown('No epics found in the store.\n\n');
            stream.markdown('Sprint planning needs epics to generate a sprint-status file.\n');
            stream.markdown('Either:\n');
            stream.markdown('1. Run `/epics` first to design your epic structure\n');
            stream.markdown('2. Provide a description of the sprints you want to plan\n\n');
            stream.markdown('**Sub-commands:**\n');
            stream.markdown('- `/sprint` or `/sprint plan` — generate sprint-status.yaml from epics\n');
            stream.markdown('- `/sprint status` — check existing sprint status and get next-action recommendations\n');
            return { metadata: { command: 'sprint', status: 'awaiting-input' } };
        }

        // ── Get AI model ──────────────────────────────────────────────────
        const model = await this.getModel();

        if (!model) {
            stream.markdown('*AI not available — the /sprint command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'sprint', status: 'no-model' } };
        }

        // ── Initialize workflow executor ──────────────────────────────────
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'sprint', status: 'no-bmad' } };
        }

        // Update shared tool context
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // ── Build task and select workflow ─────────────────────────────────
        const bmadPath = executor.getBmadPath();
        let workflowPath: string;
        let task: string;

        if (subMode === 'status') {
            // Sprint-status workflow — reads existing sprint-status.yaml
            workflowPath = path.join(bmadPath, 'bmm', 'workflows', '4-implementation', 'sprint-status', 'workflow.yaml');
            task = [
                'Read and analyze the existing sprint-status.yaml file.',
                'Summarize the current sprint status: count stories by status, detect risks,',
                'and recommend the next workflow action (e.g., create-story, dev-story, code-review).',
                prompt && !isStatusMode ? `Additional context: "${prompt}"` : '',
            ].filter(Boolean).join(' ');
        } else {
            // Sprint-planning workflow — generates sprint-status.yaml from epics
            workflowPath = path.join(bmadPath, 'bmm', 'workflows', '4-implementation', 'sprint-planning', 'workflow.yaml');

            // Provide epic context from the store
            const epicSummary = epics
                .map((e: Epic) => {
                    const storyCount = e.stories?.length ?? 0;
                    const storyList = e.stories?.map(s => `  - ${s.id}: ${s.title}`).join('\n') || '  (no stories yet)';
                    return `Epic ${e.id}: ${e.title} (${storyCount} stories)\n${storyList}`;
                })
                .join('\n\n');

            task = [
                'Generate a sprint-status.yaml file by parsing all epics and stories.',
                'Follow the sprint-planning workflow: discover epic files, extract all work items,',
                'build the sprint status structure, detect existing story file statuses,',
                'and produce a valid sprint-status.yaml.',
                '',
                `Epics from the store:\n\n${epicSummary}`,
                prompt ? `\nAdditional instructions: "${prompt}"` : '',
            ].filter(Boolean).join('\n');
        }

        // ── Execute workflow with Bob (SM) persona ────────────────────────
        // Pass a pseudo-artifact with type 'sprint' so executeWithTools picks Bob
        const sprintArtifact = { type: 'sprint', id: subMode };

        await executor.executeWithTools(
            model,
            task,
            sprintArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        // ── Post-execution guidance ──────────────────────────────────────
        if (subMode === 'plan') {
            stream.markdown('\n---\n');
            stream.markdown('**Next steps:**\n');
            stream.markdown('- Run `/sprint status` to review the generated sprint status\n');
            stream.markdown('- Run `/stories` to create detailed story files for individual stories\n');
        }

        return { metadata: { command: 'sprint', subMode } };
    }

    /**
     * /ux command - Create UX design specifications.
     *
     * This is a collaborative, multi-step workflow (14 steps) where Sally
     * (UX Designer) acts as a UX facilitator working with the user as a
     * product stakeholder.  The workflow produces a comprehensive
     * ux-design-specification document covering personas, journeys,
     * information architecture, wireframes, design system, interaction
     * patterns, accessibility, and responsive strategy.
     *
     * Agent: Sally (UX Designer) via artifact type 'ux-design' mapping.
     */
    private async handleUxCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## UX Design\n\n');

        // ── Get AI model ──────────────────────────────────────────────────
        const model = await this.getModel();

        if (!model) {
            stream.markdown('*AI not available — the /ux command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'ux', status: 'no-model' } };
        }

        // ── Initialize workflow executor ──────────────────────────────────
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'ux', status: 'no-bmad' } };
        }

        // Update shared tool context
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // ── Build task description ────────────────────────────────────────
        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', '2-plan-workflows', 'create-ux-design', 'workflow.md');

        // Gather available context from the store
        const state = this.store.getState();
        const contextParts: string[] = [
            'Start the UX design workflow. You are Sally, the UX Designer.',
            'Follow the create-ux-design workflow steps to collaboratively build a UX design specification.',
        ];

        // Include vision context if available
        if (state.vision?.productName || state.vision?.problemStatement) {
            contextParts.push(`\nProject context from existing artifacts:`);
            if (state.vision.productName) {
                contextParts.push(`- Product: ${state.vision.productName}`);
            }
            if (state.vision.problemStatement) {
                contextParts.push(`- Problem: ${state.vision.problemStatement}`);
            }
            if (state.vision.targetUsers && state.vision.targetUsers.length > 0) {
                contextParts.push(`- Target users: ${state.vision.targetUsers.join(', ')}`);
            }
            if (state.vision.valueProposition) {
                contextParts.push(`- Value proposition: ${state.vision.valueProposition}`);
            }
        }

        // Include requirements context if available
        const requirements = this.store.getRequirements();
        if (requirements.functional.length > 0) {
            const topReqs = requirements.functional.slice(0, 10)
                .map((r: { id: string; title: string }) => `  ${r.id}: ${r.title}`).join('\n');
            contextParts.push(`\nFunctional requirements (top ${Math.min(requirements.functional.length, 10)}):\n${topReqs}`);
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');

        // ── Execute workflow with Sally (UX Designer) persona ─────────────
        // Pass a pseudo-artifact with type 'ux-design' so executeWithTools picks Sally
        const uxArtifact = { type: 'ux-design', id: 'main' };

        await executor.executeWithTools(
            model,
            task,
            uxArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'ux' } };
    }

    /**
     * /readiness command - Implementation readiness check.
     *
     * A 6-step assessment workflow that validates PRD, Architecture, UX
     * Design, Epics and Stories are complete and aligned before Phase 4
     * implementation begins.  Produces a readiness report with findings
     * and recommendations.
     *
     * Steps:
     *   1. Document discovery & inventory
     *   2. PRD analysis
     *   3. Epic coverage validation
     *   4. UX alignment
     *   5. Epic quality review
     *   6. Final assessment & recommendations
     *
     * Agent: Winston (Architect) via artifact type 'readiness' mapping.
     */
    private async handleReadinessCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Implementation Readiness Check\n\n');

        // ── Get AI model ──────────────────────────────────────────────────
        const model = await this.getModel();

        if (!model) {
            stream.markdown('*AI not available — the /readiness command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'readiness', status: 'no-model' } };
        }

        // ── Initialize workflow executor ──────────────────────────────────
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'readiness', status: 'no-bmad' } };
        }

        // Update shared tool context
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // ── Build task description ────────────────────────────────────────
        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', '3-solutioning', 'check-implementation-readiness', 'workflow.md');

        // Summarise what artifacts exist in the store to give the LLM context
        const state = this.store.getState();
        const contextParts: string[] = [
            'Run the implementation readiness check workflow.',
            'Validate that PRD, Architecture, UX Design, Epics and Stories are complete',
            'and aligned before Phase 4 implementation starts.',
        ];

        // Tell the LLM what artifacts are already in the store
        const artifactInventory: string[] = [];
        if (state.vision?.productName) {
            artifactInventory.push(`- Vision / Product Brief: "${state.vision.productName}"`);
        }
        const reqCount = (state.requirements?.functional?.length || 0) + (state.requirements?.nonFunctional?.length || 0);
        if (reqCount > 0) {
            artifactInventory.push(`- Requirements: ${state.requirements?.functional?.length || 0} functional, ${state.requirements?.nonFunctional?.length || 0} non-functional`);
        }
        const epics = this.store.getEpics();
        if (epics.length > 0) {
            const storyCount = epics.reduce((sum, e) => sum + (e.stories?.length || 0), 0);
            artifactInventory.push(`- Epics: ${epics.length} epics, ${storyCount} stories total`);
        }
        if (artifactInventory.length > 0) {
            contextParts.push(`\nArtifacts currently in the store:\n${artifactInventory.join('\n')}`);
        } else {
            contextParts.push('\nNote: No artifacts found in the store yet — the workflow will discover documents from disk.');
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');

        // ── Execute workflow with Winston (Architect) persona ─────────────
        const readinessArtifact = { type: 'readiness', id: 'check' };

        await executor.executeWithTools(
            model,
            task,
            readinessArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'readiness' } };
    }

    /**
     * /party command - Multi-agent collaboration mode.
     *
     * Activates BMAD "Party Mode" where all installed agents join a group
     * discussion.  The LLM acts as a facilitator/orchestrator that role-plays
     * multiple agents, selecting 2-3 relevant agents per turn based on the
     * topic under discussion.
     *
     * The workflow is at `core/workflows/party-mode/workflow.md` and has 3
     * steps:
     *   1. Agent loading & party activation (roster introduction)
     *   2. Discussion orchestration (intelligent agent selection per turn)
     *   3. Graceful exit (agent farewells and session summary)
     *
     * Agent: BMad Master (orchestrator) via artifact type 'party' mapping.
     * The full agent roster is injected into the task description so the LLM
     * can role-play any agent in the roster.
     */
    private async handlePartyCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Party Mode\n\n');

        // ── Get AI model ──────────────────────────────────────────────────
        const model = await this.getModel();

        if (!model) {
            stream.markdown('*AI not available — the /party command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'party', status: 'no-model' } };
        }

        // ── Initialize workflow executor ──────────────────────────────────
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'party', status: 'no-bmad' } };
        }

        // Update shared tool context
        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // ── Build agent roster ────────────────────────────────────────────
        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'core', 'workflows', 'party-mode', 'workflow.md');

        const agentEntries = loadAllAgentPersonas(bmadPath);
        const rosterMarkdown = formatAgentRoster(agentEntries);
        const agentCount = agentEntries.length;

        // ── Build task description ────────────────────────────────────────
        const contextParts: string[] = [
            'Activate BMAD Party Mode. You are the Party Mode Facilitator.',
            '',
            'Your job is to orchestrate a multi-agent group discussion.',
            'For each user message, analyse the topic and select 2-3 of the most relevant agents from the roster below.',
            'Generate authentic, in-character responses for each selected agent using their exact communication style, role, and principles.',
            'Enable natural cross-talk: agents can reference, agree with, or respectfully disagree with each other.',
            'Rotate agent participation over time so all agents get a chance to contribute.',
            'If the user addresses a specific agent by name, prioritise that agent plus 1-2 complementary agents.',
            '',
            'When an agent asks the user a direct question, end the response round and wait for user input.',
            'Inter-agent questions can be answered within the same round.',
            '',
            'Each agent response should be formatted as:',
            '[Icon] **AgentName**: Their response...',
            '',
            `${rosterMarkdown}`,
            `**${agentCount} agents loaded and ready for discussion.**`,
        ];

        // Include project context if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
        }

        if (prompt) {
            contextParts.push(`\nThe user wants to discuss: "${prompt}"`);
        } else {
            contextParts.push(`\nThe user has just activated party mode. Introduce the agents and ask what they'd like to discuss.`);
        }

        const task = contextParts.join('\n');

        // ── Execute workflow with BMad Master (orchestrator) persona ──────
        const partyArtifact = { type: 'party', id: 'session' };

        await executor.executeWithTools(
            model,
            task,
            partyArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'party' } };
    }

    /**
     * /document command - Brownfield project documentation.
     *
     * Documents an existing (brownfield) project for AI context.  The workflow
     * at `bmm/workflows/document-project/workflow.yaml` supports two
     * sub-workflows:
     *   - **full-scan** — complete project scan (initial or rescan)
     *   - **deep-dive** — exhaustive documentation of a specific area
     *
     * Agent: Mary (Analyst) via artifact type 'document' mapping.
     */
    private async handleDocumentCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Document Project\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /document command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'document', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'document', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', 'document-project', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the document-project workflow. You are Mary, the Business Analyst.',
            'Document this brownfield project for AI context.',
            'The workflow supports two modes:',
            '  - full-scan: Complete project documentation (initial scan or full rescan)',
            '  - deep-dive: Exhaustive documentation of a specific project area',
            'Present the user with the choice of mode, then proceed with the selected workflow.',
        ];

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const docArtifact = { type: 'document', id: 'project' };

        await executor.executeWithTools(
            model,
            task,
            docArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'document' } };
    }

    /**
     * /review-code command - Adversarial code review.
     *
     * Performs adversarial code review finding specific issues.  The workflow
     * at `bmm/workflows/4-implementation/code-review/workflow.yaml` uses an
     * instructions.xml + checklist.md pattern (single-step).
     *
     * Agent: Quinn (QA) via artifact type 'code-review' mapping.
     */
    private async handleReviewCodeCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Code Review\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /review-code command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'review-code', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'review-code', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', '4-implementation', 'code-review', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the adversarial code review workflow. You are Quinn, the QA Engineer.',
            'Perform a thorough, adversarial code review that finds specific issues.',
            'Look for bugs, security vulnerabilities, performance problems, and code quality issues.',
            'Reference the architecture and sprint context when reviewing.',
        ];

        // Provide sprint/story context if available
        const state = this.store.getState();
        const epics = this.store.getEpics();
        if (epics.length > 0) {
            const storyCount = epics.reduce((sum, e) => sum + (e.stories?.length || 0), 0);
            contextParts.push(`\nProject has ${epics.length} epics with ${storyCount} stories.`);
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const reviewArtifact = { type: 'code-review', id: 'review' };

        await executor.executeWithTools(
            model,
            task,
            reviewArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'review-code' } };
    }

    /**
     * /ci command - Scaffold CI/CD quality pipeline.
     *
     * The workflow at `tea/workflows/testarch/ci/workflow.md` uses tri-modal
     * step-file architecture:
     *   - Create mode: scaffold new pipeline
     *   - Validate mode: validate existing outputs
     *   - Edit mode: revise existing outputs
     *
     * Auto-detects CI platform (GitHub Actions, GitLab CI, etc.) and test
     * framework from project configuration.
     *
     * Agent: Murat (TEA) via artifact type 'ci-pipeline' mapping.
     */
    private async handleCiCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## CI/CD Pipeline Setup\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /ci command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'ci', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'ci', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'tea', 'workflows', 'testarch', 'ci', 'workflow.md');

        const contextParts: string[] = [
            'Start the CI/CD pipeline setup workflow. You are Murat, the Master Test Architect.',
            'Scaffold a CI/CD quality pipeline with test execution, quality gates, and artifact collection.',
            'Auto-detect the CI platform, test directory, stack type, and test framework from the project.',
            'Present the user with mode selection: [C] Create, [R] Resume, [V] Validate, or [E] Edit.',
        ];

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const ciArtifact = { type: 'ci-pipeline', id: 'pipeline' };

        await executor.executeWithTools(
            model,
            task,
            ciArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'ci' } };
    }

    /**
     * /quick command - Quick spec + dev flow for small changes.
     *
     * Supports two sub-commands:
     *   - `/quick` or `/quick spec`  — Run quick-spec workflow (create tech spec)
     *   - `/quick dev`               — Run quick-dev workflow (implement a spec)
     *
     * Both workflows use step-file architecture with Barry (Quick Flow Solo Dev).
     *
     * Agent: Barry (Quick Flow Solo Dev) via 'quick-spec' / 'quick-dev' mappings.
     */
    private async handleQuickCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        // Determine sub-mode from prompt prefix
        const trimmed = prompt.trim().toLowerCase();
        const isDevMode = trimmed.startsWith('dev');
        const subCommand = isDevMode ? 'dev' : 'spec';
        const userPrompt = isDevMode ? prompt.replace(/^dev\s*/i, '').trim() : prompt.replace(/^spec\s*/i, '').trim();

        stream.markdown(`## Quick ${subCommand === 'dev' ? 'Dev' : 'Spec'}\n\n`);

        const model = await this.getModel();
        if (!model) {
            stream.markdown(`*AI not available — the /quick command requires an AI model.*\n\n`);
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'quick', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'quick', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = subCommand === 'dev'
            ? path.join(bmadPath, 'bmm', 'workflows', 'bmad-quick-flow', 'quick-dev', 'workflow.md')
            : path.join(bmadPath, 'bmm', 'workflows', 'bmad-quick-flow', 'quick-spec', 'workflow.md');

        const artifactType = subCommand === 'dev' ? 'quick-dev' : 'quick-spec';

        const contextParts: string[] = subCommand === 'dev'
            ? [
                'Start the quick-dev workflow. You are Barry, the Quick Flow Solo Dev.',
                'Execute implementation tasks efficiently from a tech-spec or direct user instructions.',
                'Follow patterns, ship code, run tests. Every response moves the project forward.',
            ]
            : [
                'Start the quick-spec workflow. You are Barry, the Quick Flow Solo Dev.',
                'Create an implementation-ready technical specification through conversational discovery,',
                'code investigation, and structured documentation.',
                'The spec must be Actionable, Logical, Testable, Complete, and Self-Contained.',
            ];

        if (userPrompt) {
            contextParts.push(`\nUser instructions: "${userPrompt}"`);
        }

        const task = contextParts.join('\n');
        const quickArtifact = { type: artifactType, id: subCommand };

        await executor.executeWithTools(
            model,
            task,
            quickArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'quick', subCommand } };
    }

    /**
     * /design-thinking command - Human-centered design process.
     *
     * Guides the user through empathy-driven design methodologies.
     * Workflow: `cis/workflows/design-thinking/workflow.yaml`
     *
     * Agent: Maya (Design Thinking Coach) via 'design-thinking' mapping.
     */
    private async handleDesignThinkingCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Design Thinking\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /design-thinking command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'design-thinking', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'design-thinking', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'cis', 'workflows', 'design-thinking', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the design thinking workflow. You are Maya, the Design Thinking Maestro.',
            'Guide the user through human-centered design using empathy-driven methodologies.',
            'Use the design methods and templates from the workflow to structure the session.',
        ];

        // Include project context if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const dtArtifact = { type: 'design-thinking', id: 'session' };

        await executor.executeWithTools(
            model,
            task,
            dtArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'design-thinking' } };
    }

    /**
     * /innovate command - Disruption opportunities and business model innovation.
     *
     * Identifies disruption opportunities and architects business model innovation.
     * Workflow: `cis/workflows/innovation-strategy/workflow.yaml`
     *
     * Agent: Victor (Innovation Strategist) via 'innovation-strategy' mapping.
     */
    private async handleInnovateCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Innovation Strategy\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /innovate command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'innovate', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'innovate', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'cis', 'workflows', 'innovation-strategy', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the innovation strategy workflow. You are Victor, the Disruptive Innovation Oracle.',
            'Identify disruption opportunities and architect business model innovation.',
            'Use the innovation frameworks from the workflow to structure the analysis.',
        ];

        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const innovateArtifact = { type: 'innovation-strategy', id: 'session' };

        await executor.executeWithTools(
            model,
            task,
            innovateArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'innovate' } };
    }

    /**
     * /solve command - Systematic problem-solving methodologies.
     *
     * Applies structured problem-solving techniques to complex challenges.
     * Workflow: `cis/workflows/problem-solving/workflow.yaml`
     *
     * Agent: Dr. Quinn (Creative Problem Solver) via 'problem-solving' mapping.
     */
    private async handleSolveCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Problem Solving\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /solve command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'solve', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'solve', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'cis', 'workflows', 'problem-solving', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the problem-solving workflow. You are Dr. Quinn, the Master Problem Solver.',
            'Apply systematic problem-solving methodologies to the user\'s challenge.',
            'Use the solving methods and frameworks from the workflow to structure the session.',
        ];

        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const solveArtifact = { type: 'problem-solving', id: 'session' };

        await executor.executeWithTools(
            model,
            task,
            solveArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'solve' } };
    }

    /**
     * /story-craft command - Craft compelling narratives.
     *
     * Guides the user through storytelling frameworks to create compelling
     * narratives for products, brands, or presentations.
     * Workflow: `cis/workflows/storytelling/workflow.yaml`
     *
     * Agent: Caravaggio (Presentation Master) via 'storytelling' mapping.
     */
    private async handleStoryCraftCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Story Craft\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /story-craft command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'story-craft', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'story-craft', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'cis', 'workflows', 'storytelling', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the storytelling workflow. You are Caravaggio, the Visual Communication + Presentation Expert.',
            'Help the user craft compelling narratives using storytelling frameworks.',
            'Use the story types and frameworks from the workflow to structure the narrative.',
        ];

        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const storyArtifact = { type: 'storytelling', id: 'session' };

        await executor.executeWithTools(
            model,
            task,
            storyArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'story-craft' } };
    }

    /**
     * /elicit command — apply an advanced elicitation method to an artifact,
     * then confirm with the user and write the results back to JSON.
     *
     * Prompt format (sent by elicitArtifactWithMethod):
     *   <artifact-id> <method-name>\n
     *   Category: ...\nDescription: ...\nOutput pattern: ...\n
     *   Artifact type: ...\nArtifact title: ...\n[Content: ...]
     *
     * Falls back to refine context / selected artifact when no ID is given.
     */
    private async handleElicitCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Advanced Elicitation\n\n');

        if (!prompt) {
            stream.markdown('No elicitation details provided.\n\n');
            stream.markdown('Use the **Elicit** button on an artifact card, or:\n');
            stream.markdown('`/elicit <artifact-id> <method-name>`\n');
            return { metadata: { command: 'elicit', status: 'awaiting-input' } };
        }

        // --- Resolve the target artifact ---
        const idPattern = /(EPIC-\d+|STORY-[\d-]+|UC-\d+-\d+|FR-\d+|REQ-\d+|TC-\d+|TS-\d+|NFR-\d+|product-brief-\d+|prd-\d+|architecture-\d+|vision-\d+)/i;
        const idMatch = prompt.match(idPattern);

        let targetArtifact: any = null;
        let targetType = '';
        let targetId = '';

        if (idMatch) {
            targetId = idMatch[1];
            if (/^(vision|prd|architecture|product-brief)-/i.test(targetId)) {
                targetId = targetId.toLowerCase();
            } else {
                targetId = targetId.toUpperCase();
            }
            const found = this.store.findArtifactById(targetId);
            if (found) {
                targetArtifact = found.artifact;
                targetType = found.type;
            }
        }

        if (!targetArtifact) {
            const refineCtx = this.store.getRefineContext();
            if (refineCtx) {
                targetArtifact = refineCtx;
                targetType = refineCtx.type;
                targetId = refineCtx.id;
            }
        }

        if (!targetArtifact) {
            const sel = this.store.getSelectedArtifact();
            if (sel) {
                const found = this.store.findArtifactById(sel.id);
                if (found) {
                    targetArtifact = found.artifact;
                    targetType = found.type;
                    targetId = sel.id;
                }
            }
        }

        if (!targetArtifact) {
            stream.markdown('No artifact specified or found in context. Use `/elicit <artifact-id> <method-name>` or click the Elicit button on an artifact card.\n');
            return { metadata: { command: 'elicit', status: 'no-artifact' } };
        }

        // --- Parse method details from the prompt text ---
        const afterId = idMatch ? prompt.slice(idMatch.index! + idMatch[0].length).trim() : prompt.trim();

        // Extract structured fields that were embedded by elicitArtifactWithMethod
        const methodNameLine = afterId.split('\n')[0].trim();
        const categoryMatch = afterId.match(/Category:\s*(.+)/i);
        const descMatch = afterId.match(/Description:\s*(.+)/i);
        const outputMatch = afterId.match(/Output pattern:\s*(.+)/i);

        const methodName = methodNameLine || 'Advanced Elicitation';
        const methodCategory = categoryMatch?.[1]?.trim() || 'general';
        const methodDescription = descMatch?.[1]?.trim() || 'Apply advanced elicitation techniques to improve this artifact.';
        const outputPattern = outputMatch?.[1]?.trim() || 'analysis \u2192 insights \u2192 improvements';

        stream.markdown(`**Artifact:** ${targetType} \u2014 ${targetArtifact.title || targetId}\n\n`);
        stream.markdown(`**Method:** ${methodName} (${methodCategory})\n\n`);

        // --- Get model ---
        const model = await this.getModel();
        if (!model) {
            stream.markdown(this.getNoModelMessage());
            return { metadata: { command: 'elicit', status: 'no-model' } };
        }

        // --- Initialize workflow executor ---
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'elicit', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        // --- Build the task prompt ---
        // The task gives the LLM full context about the elicitation method plus
        // explicit instructions to confirm with the user and call agileagentcanvas_update_artifact.
        const task = `Apply the **${methodName}** elicitation method (${methodCategory} category) to this ${targetType}.

Method description: ${methodDescription}

Expected output pattern: ${outputPattern}

## Instructions
1. Study the artifact content carefully.
2. Apply the "${methodName}" elicitation technique: ${methodDescription}
3. Follow the output pattern: ${outputPattern}
4. Present your findings and proposed improvements to the user.
5. **CRITICAL**: Ask the user to confirm whether they want to apply these changes before saving.
6. If the user confirms, call \`agileagentcanvas_update_artifact\` to persist the changes to the JSON file.
7. If the user declines, acknowledge and do NOT call agileagentcanvas_update_artifact.

Always end the interaction by either saving confirmed changes or acknowledging the user's decision not to save.`;

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'core', 'workflows', 'advanced-elicitation', 'workflow.xml');

        try {
            await executor.executeWithTools(
                model,
                task,
                { type: targetType, id: targetId, ...targetArtifact },
                stream,
                token,
                this.store,
                workflowPath
            );
        } catch (error) {
            this.store.clearRefineContext();
            stream.markdown(`\n\n**Error during elicitation:** ${error}\n`);
            return { metadata: { command: 'elicit', status: 'error', artifactType: targetType, artifactId: targetId } };
        }

        this.store.clearRefineContext();
        return { metadata: { command: 'elicit', status: 'executed', artifactType: targetType, artifactId: targetId } };
    }

    /**
     * /review command - Validate artifacts
     */
    private async handleReviewCommand(
        prompt: string,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        stream.markdown('## ✅ Artifact Review\n\n');
        
        const state = this.store.getState();
        
        // Completeness check
        stream.markdown('### Completeness\n\n');
        const checks = [
            { name: 'Vision', done: !!state.vision?.problemStatement, detail: state.vision?.productName || 'Not defined' },
            { name: 'Requirements', done: (state.requirements?.functional?.length || 0) > 0, detail: `${state.requirements?.functional?.length || 0} FRs, ${state.requirements?.nonFunctional?.length || 0} NFRs` },
            { name: 'Epics', done: (state.epics?.length || 0) > 0, detail: `${state.epics?.length || 0} epics` },
            { name: 'Stories', done: this.countStories(state) > 0, detail: `${this.countStories(state)} stories` },
        ];

        checks.forEach(c => {
            const icon = c.done ? '✅' : '⬜';
            stream.markdown(`${icon} **${c.name}**: ${c.detail}\n`);
        });

        // Validation issues
        stream.markdown('\n### Validation\n\n');
        const issues = this.validateArtifacts(state);
        
        if (issues.length === 0) {
            stream.markdown('✅ All validations passed!\n\n');
            stream.markdown('Your artifacts are ready for export. Use `AgileAgentCanvas: Export Artifacts` command.\n');
        } else {
            issues.forEach(issue => {
                stream.markdown(`⚠️ ${issue}\n`);
            });
        }

        // Enhancement status
        const enhancedEpics = state.epics?.filter(e => e.useCases || e.risks || e.definitionOfDone) || [];
        stream.markdown(`\n### Enhancement Status\n\n`);
        stream.markdown(`${enhancedEpics.length}/${state.epics?.length || 0} epics have verbose details.\n`);
        
        if (enhancedEpics.length < (state.epics?.length || 0)) {
            stream.markdown('\nRun `/enhance all` to add enterprise-level detail to remaining epics.\n');
        }

        this.store.setCurrentStep('review');
        return { metadata: { command: 'review' } };
    }

    // Helper methods

    private getAnalystPersona(): string {
        const executor = getWorkflowExecutor();
        const bmadPath = executor.getBmadPath() || '';
        const displayPath = bmadPath || '(not yet resolved — run /refine or load a project folder)';

        // Load the analyst persona from disk; fall back to a minimal inline version
        const persona = bmadPath ? loadAgentPersona(bmadPath, 'bmm/agents/analyst.md') : undefined;

        // ── Full-activation mode ─────────────────────────────────────────────
        // When we have the full agent file, inject it verbatim so the AI gets
        // the complete activation instructions, menus, menu-handlers, and rules
        // — exactly as the official BMAD-METHOD intends.  This enables the
        // interactive menu-driven conversational model.
        if (persona) {
            return `${formatFullAgentForPrompt(persona)}

## VS Code Extension Context
You are running inside the AgileAgentCanvas VS Code extension.
- BMAD installation path: \`${displayPath}\`
- All workflows are under: \`${displayPath}/bmm/workflows/\`, \`${displayPath}/core/workflows/\`, etc.
- All agents are under: \`${displayPath}/core/agents/\`, \`${displayPath}/bmm/agents/\`, etc.
- All JSON schemas are under: \`${displayPath}/schemas/\`
- **Never invent workflow steps, agent personas, or schema fields** — always reference the actual files.

## Tools Available
You have file-reading tools available:
- **agileagentcanvas_read_file(path)** — read any file under \`${displayPath}\` or in workspace folders
- **agileagentcanvas_list_directory(path)** — list any directory under \`${displayPath}\` or in workspace folders

Use these tools to load config.yaml, workflow files, data files, etc. as instructed in your activation steps.`;
        }

        // Fallback when BMAD path is not yet resolved
        return `You are Mary, a Business Analyst from the BMAD (Business Method for AI Development) methodology team.

## Your Persona:
- **Role**: Strategic Business Analyst + Requirements Expert
- **Style**: Speaks with the excitement of a treasure hunter - thrilled by every clue, energized when patterns emerge
- **Principles**: Channel expert business analysis frameworks. Articulate requirements with absolute precision. Ground findings in verifiable evidence.

## Your Capabilities:
- Create and refine product visions, requirements, epics, and user stories
- Use BMAD quality standards: Specificity, Measurability, Testability, Traceability
- Apply disaster prevention principles from BMAD create-story checklist
- Help users avoid: reinventing wheels, vague implementations, wrong libraries, scope creep

## CRITICAL — BMAD Grounding Rule:
You MUST always ground your responses in the actual BMAD methodology files on disk.
- BMAD installation path: \`${displayPath}\`
- **Never invent workflow steps, agent personas, or schema fields** — always reference the actual files.
- When suggesting a workflow, cite its path relative to the BMAD installation.
- When outputting JSON artifacts, always conform to the relevant schema in \`${displayPath}/schemas/\`.

Be professional, thorough, and focus on actionable outputs.
When generating artifacts, always use the exact JSON format from the BMAD schemas.
Engage the user in collaborative discussion — ask clarifying questions when useful, present options, and confirm understanding before producing final outputs.`;
    }

    private buildArtifactContext(): string {
        const state = this.store.getState();
        return JSON.stringify({
            projectName: state.projectName,
            hasVision: !!state.vision,
            requirementCount: state.requirements?.functional?.length || 0,
            epicCount: state.epics?.length || 0,
            storyCount: this.countStories(state)
        }, null, 2);
    }

    private buildHistory(context: vscode.ChatContext): string {
        return context.history.slice(-8).map(h => {
            if (h instanceof vscode.ChatRequestTurn) {
                return `User: ${h.prompt}`;
            }
            if (h instanceof vscode.ChatResponseTurn) {
                // Extract text content from the assistant's response parts
                const textParts = h.response
                    .filter((p): p is vscode.ChatResponseMarkdownPart => p instanceof vscode.ChatResponseMarkdownPart)
                    .map(p => p.value.value)
                    .join('');
                if (textParts) {
                    // Truncate long assistant responses to keep context manageable
                    const truncated = textParts.length > 2000
                        ? textParts.substring(0, 2000) + '\n[...truncated]'
                        : textParts;
                    return `Assistant: ${truncated}`;
                }
            }
            return '';
        }).filter(Boolean).join('\n');
    }

    private getNoModelMessage(): string {
        return providerNoModelMessage();
    }

    private async findAndReadPRD(): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return null;

        const patterns = ['**/PRD.md', '**/prd.md', '**/*-prd.md', '**/requirements.md'];
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
            if (files.length > 0) {
                const content = await vscode.workspace.fs.readFile(files[0]);
                return Buffer.from(content).toString('utf-8');
            }
        }
        return null;
    }

    private countStories(state: any): number {
        return state.epics?.reduce((sum: number, e: any) => sum + (e.stories?.length || 0), 0) || 0;
    }

    private validateArtifacts(state: any): string[] {
        const issues: string[] = [];

        if (!state.vision?.problemStatement) {
            issues.push('No product vision defined');
        }

        if (!state.requirements?.functional?.length) {
            issues.push('No functional requirements');
        }

        if (!state.epics?.length) {
            issues.push('No epics designed');
        }

        // Check for epics without stories
        const epicsWithoutStories = state.epics?.filter((e: any) => !e.stories?.length) || [];
        if (epicsWithoutStories.length > 0) {
            issues.push(`${epicsWithoutStories.length} epic(s) have no stories`);
        }

        // Check requirement coverage
        const coveredFRs = new Set<string>();
        state.epics?.forEach((epic: any) => {
            epic.functionalRequirements?.forEach((fr: string) => coveredFRs.add(fr));
        });
        const uncovered = (state.requirements?.functional?.length || 0) - coveredFRs.size;
        if (uncovered > 0) {
            issues.push(`${uncovered} requirement(s) not covered by epics`);
        }

        return issues;
    }

    /**
     * /convert-to-json command - Convert markdown BMAD artifacts to JSON format
     */
    private async handleConvertToJsonCommand(
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## 🔄 Convert Markdown to JSON\n\n');

        // Extract folder path from prompt (it comes as quoted path)
        const folderPath = prompt.replace(/"/g, '').trim();
        
        if (!folderPath) {
            stream.markdown('Please specify the folder path containing markdown files.\n\n');
            stream.markdown('**Usage:** `/convert-to-json "path/to/.agileagentcanvas-context"`\n');
            return { metadata: { command: 'convert-to-json', status: 'awaiting-input' } };
        }

        stream.markdown(`**Source folder:** ${folderPath}\n\n`);

        // Read markdown files from the folder
        try {
            const folderUri = vscode.Uri.file(folderPath);
            
            // Helper to recursively find all .md files in a directory
            async function findMdFilesRecursive(uri: vscode.Uri, basePath: string = ''): Promise<{path: string, uri: vscode.Uri}[]> {
                const result: {path: string, uri: vscode.Uri}[] = [];
                try {
                    const entries = await vscode.workspace.fs.readDirectory(uri);
                    for (const [name, type] of entries) {
                        const entryUri = vscode.Uri.joinPath(uri, name);
                        const relativePath = basePath ? `${basePath}/${name}` : name;
                        if (type === vscode.FileType.File && name.endsWith('.md')) {
                            result.push({ path: relativePath, uri: entryUri });
                        } else if (type === vscode.FileType.Directory) {
                            result.push(...await findMdFilesRecursive(entryUri, relativePath));
                        }
                    }
                } catch {
                    // Directory doesn't exist or can't be read
                }
                return result;
            }
            
            // Search multiple locations for markdown files
            let allMdFiles: {path: string, uri: vscode.Uri}[] = [];
            
            // Check planning (backward compat old projects)
            const planningUri = vscode.Uri.joinPath(folderUri, 'planning');
            allMdFiles.push(...await findMdFilesRecursive(planningUri, 'planning'));
            
            // Check solutioning (backward compat old projects)
            const implUri = vscode.Uri.joinPath(folderUri, 'solutioning');
            allMdFiles.push(...await findMdFilesRecursive(implUri, 'solutioning'));

            // Check epics/ (new epic-scoped structure)
            const epicsUri = vscode.Uri.joinPath(folderUri, 'epics');
            allMdFiles.push(...await findMdFilesRecursive(epicsUri, 'epics'));
            
            // Check root folder (non-recursive for root)
            try {
                const rootEntries = await vscode.workspace.fs.readDirectory(folderUri);
                for (const [name, type] of rootEntries) {
                    if (type === vscode.FileType.File && name.endsWith('.md')) {
                        allMdFiles.push({ path: name, uri: vscode.Uri.joinPath(folderUri, name) });
                    }
                }
            } catch {
                // Ignore errors
            }
            
            // Check docs folder
            const docsUri = vscode.Uri.joinPath(folderUri, 'docs');
            allMdFiles.push(...await findMdFilesRecursive(docsUri, 'docs'));

            if (allMdFiles.length === 0) {
                stream.markdown('❌ No markdown files found in the specified folder.\n');
                return { metadata: { command: 'convert-to-json', status: 'no-files' } };
            }

            stream.markdown(`Found **${allMdFiles.length}** markdown file(s):\n`);
            allMdFiles.forEach(({path}) => stream.markdown(`- ${path}\n`));
            stream.markdown('\n');

            // Read content of each markdown file
            let combinedContent = '';
            for (const { path, uri } of allMdFiles) {
                const content = await vscode.workspace.fs.readFile(uri);
                const text = Buffer.from(content).toString('utf-8');
                combinedContent += `\n\n--- FILE: ${path} ---\n\n${text}`;
            }

            stream.progress('Analyzing markdown content and generating JSON...');

            const model = await this.getModel();
            if (!model) {
                stream.markdown(this.getNoModelMessage());
                return { metadata: { command: 'convert-to-json', status: 'no-model' } };
            }

            const conversionPrompt = `You are a BMAD (Business Method for AI Development) expert. Convert the following markdown artifacts into a structured JSON format following the BMAD schema.

${combinedContent}

Generate a complete JSON file with this structure:
{
    "metadata": {
        "schemaVersion": "1.0.0",
        "projectName": "extracted from content",
        "generatedAt": "${new Date().toISOString()}",
        "generator": "Agile Agent Canvas Converter"
    },
    "content": {
        "overview": {
            "projectName": "name",
            "problemStatement": "extracted problem",
            "targetUsers": ["user types"],
            "valueProposition": "value"
        },
        "requirementsInventory": {
            "functional": [
                {"id": "FR-1", "title": "title", "description": "desc", "capabilityArea": "area"}
            ],
            "nonFunctional": [
                {"id": "NFR-1", "title": "title", "description": "desc", "category": "Performance|Security|etc"}
            ]
        },
        "epics": [
            {
                "id": "EPIC-1",
                "title": "Epic Title",
                "goal": "what this epic achieves",
                "valueDelivered": "business value",
                "functionalRequirements": ["FR-1"],
                "status": "draft",
                "stories": [
                    {
                        "id": "STORY-1-1",
                        "title": "Story Title",
                        "userStory": {
                            "asA": "user role",
                            "iWant": "capability",
                            "soThat": "benefit"
                        },
                        "acceptanceCriteria": [
                            {"given": "context", "when": "action", "then": "result"}
                        ],
                        "storyPoints": 3,
                        "status": "draft"
                    }
                ]
            }
        ]
    }
}

Extract ALL epics and stories from the markdown. Be thorough - don't miss any content.
Output ONLY the JSON, no explanation.`;

            let jsonOutput = '';

            if (model.vscodeLm) {
                const messages = [vscode.LanguageModelChatMessage.User(conversionPrompt)];
                const response = await model.vscodeLm.sendRequest(messages, {}, token);
                for await (const chunk of response.text) {
                    if (token.isCancellationRequested) break;
                    jsonOutput += chunk;
                }
            } else {
                const chatMessages: ChatMessage[] = [{ role: 'user', content: conversionPrompt }];
                jsonOutput = await streamChatResponse(model, chatMessages, stream, token);
            }

            // Clean up the response - extract JSON from potential markdown code block
            jsonOutput = jsonOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            // Validate JSON
            let parsedJson: any;
            try {
                parsedJson = JSON.parse(jsonOutput);
            } catch (e) {
                stream.markdown('⚠️ Generated JSON has syntax errors. Attempting to fix...\n\n');
                stream.markdown('```json\n' + jsonOutput.substring(0, 500) + '...\n```\n\n');
                return { metadata: { command: 'convert-to-json', status: 'parse-error' } };
            }

            // Show summary
            const epicCount = parsedJson.content?.epics?.length || 0;
            const storyCount = parsedJson.content?.epics?.reduce((sum: number, e: any) => 
                sum + (e.stories?.length || 0), 0) || 0;
            const frCount = parsedJson.content?.requirementsInventory?.functional?.length || 0;

            stream.markdown(`\n### ✅ Conversion Complete\n\n`);
            stream.markdown(`- **${epicCount}** epics\n`);
            stream.markdown(`- **${storyCount}** stories\n`);
            stream.markdown(`- **${frCount}** functional requirements\n\n`);

            // Save the JSON file to project root
            const outputFileName = 'epics.json';
            const outputUri = vscode.Uri.joinPath(folderUri, outputFileName);
            
            const jsonContent = JSON.stringify(parsedJson, null, 2);
            const convertFormat = vscode.workspace
                .getConfiguration('agileagentcanvas')
                .get<'json' | 'markdown' | 'dual'>('outputFormat', 'dual');
            const written: string[] = [];

            if (convertFormat === 'json' || convertFormat === 'dual') {
                await vscode.workspace.fs.writeFile(outputUri, Buffer.from(jsonContent, 'utf-8'));
                written.push(outputUri.fsPath);
            }
            if (convertFormat === 'markdown' || convertFormat === 'dual') {
                // Write a Markdown companion summarising the converted epics
                const mdLines: string[] = [`# Epics — Converted from Markdown\n`];
                const epics = parsedJson.content?.epics || [];
                mdLines.push(`**Total Epics:** ${epicCount}  `);
                mdLines.push(`**Total Stories:** ${storyCount}  `);
                mdLines.push(`**Functional Requirements:** ${frCount}\n`);
                for (const epic of epics) {
                    mdLines.push(`## Epic ${epic.id || ''}: ${epic.title || 'Untitled'}\n`);
                    if (epic.goal) mdLines.push(`${epic.goal}\n`);
                    const stories = epic.stories || [];
                    if (stories.length) {
                        mdLines.push(`### Stories (${stories.length})\n`);
                        for (const s of stories) {
                            if (typeof s === 'string') { mdLines.push(`- ${s}`); }
                            else { mdLines.push(`- **${s.id || ''}**: ${s.title || 'Untitled'} (${s.status || 'draft'})`); }
                        }
                        mdLines.push('');
                    }
                }
                const mdUri = vscode.Uri.joinPath(folderUri, 'epics.md');
                await vscode.workspace.fs.writeFile(mdUri, Buffer.from(mdLines.join('\n'), 'utf-8'));
                written.push(mdUri.fsPath);
            }
            
            stream.markdown(`**Saved to:** ${written.join(', ')}\n\n`);
            stream.markdown('You can now reload this folder in AgileAgentCanvas to view the artifacts on the canvas.\n\n');
            
            // Offer to reload
            stream.button({
                title: 'Reload Project',
                command: 'agileagentcanvas.loadProject'
            });

            return { metadata: { command: 'convert-to-json', status: 'success', outputPath: outputUri.fsPath } };

        } catch (error) {
            stream.markdown(`❌ Error reading files: ${error}\n`);
            return { metadata: { command: 'convert-to-json', status: 'error' } };
        }
    }

    /**
     * Handle /workflows command - show all available BMAD workflows
     */
    private async handleWorkflowsCommand(
        prompt: string,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        
        stream.markdown('## BMAD Workflow Catalog\n\n');

        // Initialize workflow executor with project root + bundled extension path
        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot();
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot || undefined, extensionPath);

        if (!initialized) {
            stream.markdown('**Warning:** Could not locate the BMAD framework. Please ensure the extension is installed correctly.\n\n');
            if (projectRoot) {
                stream.markdown(`*Searched in: ${projectRoot}*\n\n`);
            }
            stream.markdown('Showing workflow registry (workflows may not be executable without BMAD folder):\n\n');
        }

        // Check for filter in prompt (e.g., "/workflows bmm" or "/workflows story")
        const filterMatch = prompt.trim().toLowerCase();
        
        if (filterMatch) {
            // Check if filtering by module
            const modules = ['core', 'bmm', 'tea', 'cis'] as const;
            const moduleFilter = modules.find(m => filterMatch === m);
            
            if (moduleFilter) {
                const workflows = executor.getWorkflowsByModule(moduleFilter);
                stream.markdown(`### ${moduleFilter.toUpperCase()} Module (${workflows.length} workflows)\n\n`);
                
                if (workflows.length === 0) {
                    stream.markdown('No workflows found in this module.\n\n');
                } else {
                    // Group by phase/category
                    const byPhase = new Map<string, any[]>();
                    for (const w of workflows) {
                        const key = w.phase || w.category || 'general';
                        if (!byPhase.has(key)) byPhase.set(key, []);
                        byPhase.get(key)!.push(w);
                    }

                    for (const [phase, phaseWorkflows] of byPhase) {
                        if (phase !== 'general') {
                            stream.markdown(`**${this.formatPhaseName(phase)}:**\n`);
                        }
                        for (const w of phaseWorkflows) {
                            const tags = w.tags?.length ? ` (${w.tags.join(', ')})` : '';
                            stream.markdown(`- **${w.name}** - ${w.description}${tags}\n`);
                        }
                        stream.markdown('\n');
                    }
                }
                
                stream.markdown('---\n');
                stream.markdown('*Use `/workflows` to see all modules, or `/workflows <module>` to filter.*\n');
                return { metadata: { command: 'workflows', filter: moduleFilter } };
            }

            // Check if filtering by artifact type
            const artifactTypes = ['story', 'epic', 'prd', 'vision', 'requirement', 'architecture', 'use-case', 'test-case', 'test-strategy'];
            const typeFilter = artifactTypes.find(t => filterMatch.includes(t));
            
            if (typeFilter) {
                const workflows = executor.getAvailableWorkflows(typeFilter);
                stream.markdown(`### Workflows for ${typeFilter.toUpperCase()} artifacts\n\n`);
                
                if (workflows.length === 0) {
                    stream.markdown('No workflows specifically target this artifact type.\n\n');
                } else {
                    for (let i = 0; i < workflows.length; i++) {
                        const w = workflows[i];
                        stream.markdown(`**[${i + 1}]** ${w.name}\n`);
                        stream.markdown(`    ${w.description}\n\n`);
                    }
                }
                
                stream.markdown('---\n');
                stream.markdown(`*Use \`/refine <artifact-id> <number>\` to run a specific workflow.*\n`);
                return { metadata: { command: 'workflows', filter: typeFilter } };
            }

            // Check if filtering by tag
            const tagFilter = filterMatch;
            const tagWorkflows = executor.getWorkflowsByTag(tagFilter);
            if (tagWorkflows.length > 0) {
                stream.markdown(`### Workflows tagged: "${tagFilter}" (${tagWorkflows.length})\n\n`);
                for (const w of tagWorkflows) {
                    stream.markdown(`- **${w.name}** (${w.module}) - ${w.description}\n`);
                }
                stream.markdown('\n');
                return { metadata: { command: 'workflows', filter: tagFilter } };
            }
        }

        // Show full workflow catalog organized by module
        stream.markdown('BMAD methodology provides **44 workflows** across 4 modules:\n\n');
        
        const moduleDescriptions: Record<string, string> = {
            'core': 'Core utilities (brainstorming, conversion, party mode)',
            'bmm': 'Business Method Manager - analysis, planning, solutioning, implementation',
            'tea': 'Testing Architecture - test planning, quality assurance',
            'cis': 'Creative Innovation Strategy - innovation and ideation'
        };

        // Summary counts
        const modules = ['core', 'bmm', 'tea', 'cis'] as const;
        for (const module of modules) {
            const count = executor.getWorkflowsByModule(module).length;
            stream.markdown(`- **${module.toUpperCase()}**: ${count} workflows - ${moduleDescriptions[module]}\n`);
        }
        stream.markdown('\n---\n\n');

        // Detailed listing
        for (const module of modules) {
            const workflows = executor.getWorkflowsByModule(module);
            if (workflows.length === 0) continue;

            stream.markdown(`### ${module.toUpperCase()} Module\n\n`);

            // Group by phase/category
            const byPhase = new Map<string, any[]>();
            for (const w of workflows) {
                const key = w.phase || w.category || 'general';
                if (!byPhase.has(key)) byPhase.set(key, []);
                byPhase.get(key)!.push(w);
            }

            for (const [phase, phaseWorkflows] of byPhase) {
                if (phase !== 'general') {
                    stream.markdown(`**${this.formatPhaseName(phase)}:**\n`);
                }
                for (const w of phaseWorkflows) {
                    stream.markdown(`- ${w.name} - ${w.description}\n`);
                }
                stream.markdown('\n');
            }
        }

        stream.markdown('---\n\n');
        stream.markdown('**Filter by:**\n');
        stream.markdown('- `/workflows bmm` - Show BMM module workflows\n');
        stream.markdown('- `/workflows story` - Show workflows for story artifacts\n');
        stream.markdown('- `/workflows epic` - Show workflows for epic artifacts\n');
        stream.markdown('- `/workflows validation` - Show workflows by tag\n\n');
        stream.markdown('**To refine an artifact:**\n');
        stream.markdown('- `/refine EPIC-1` - Select from curated workflow list\n');
        stream.markdown('- `/refine STORY-1-1 2` - Run workflow #2 directly\n');

        return { metadata: { command: 'workflows' } };
    }

    /**
     * /context command - Generate project-context.md.
     *
     * Creates an LLM-optimized project-context.md file with implementation
     * rules, patterns, and guidelines that AI agents must follow.
     * Workflow: `bmm/workflows/generate-project-context/workflow.md`
     *
     * Agent: Paige (Tech Writer) via 'project-context' mapping.
     */
    private async handleContextCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Generate Project Context\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /context command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'context', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'context', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', 'generate-project-context', 'workflow.md');

        const contextParts: string[] = [
            'Start the generate-project-context workflow. You are Paige, the Technical Writer.',
            'Create a concise, optimized project-context.md file containing critical rules,',
            'patterns, and guidelines that AI agents must follow when implementing code.',
            'Focus on unobvious details that LLMs need to be reminded of.',
        ];

        // Include existing project context if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject: "${state.vision.productName}".`);
        }
        if (state.architecture) {
            contextParts.push('Architecture artifacts are available — reference them for tech stack and patterns.');
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const ctxArtifact = { type: 'project-context', id: 'generate' };

        await executor.executeWithTools(
            model,
            task,
            ctxArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'context' } };
    }

    /**
     * /write-doc command - Free-form document authoring with Tech Writer.
     *
     * Engages Paige (Tech Writer) for multi-turn document writing that
     * follows the documentation standards in _memory/tech-writer-sidecar/.
     * No specific workflow file — uses the agent's inline [WD] action prompt.
     */
    private async handleWriteDocCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Write Document\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /write-doc command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'write-doc', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'write-doc', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();

        // The write-doc command loads the Tech Writer agent definition and memory
        // then engages in multi-turn document writing following documentation standards.
        const agentPath = path.join(bmadPath, 'bmm', 'agents', 'tech-writer', 'tech-writer.md');
        const standardsPath = path.join(bmadPath, '_memory', 'tech-writer-sidecar', 'documentation-standards.md');

        const contextParts: string[] = [
            'You are Paige, the Technical Writer agent.',
            `Load and follow the documentation standards from: ${standardsPath}`,
            `Your agent definition is at: ${agentPath}`,
            '',
            'Engage in multi-turn conversation until you fully understand the ask.',
            'Author the final document following all documentation standards.',
            'After drafting, review and revise for quality of content and ensure standards are met.',
        ];

        // Include project context if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
        }

        if (prompt) {
            contextParts.push(`\nDocument request: "${prompt}"`);
        } else {
            contextParts.push('\nAsk the user what document they want to create. Suggest options based on the project context.');
        }

        const task = contextParts.join('\n');
        const docArtifact = { type: 'write-doc', id: 'session' };

        await executor.executeWithTools(
            model,
            task,
            docArtifact,
            stream,
            token,
            this.store,
            agentPath
        );

        return { metadata: { command: 'write-doc' } };
    }

    /**
     * /mermaid command - Generate Mermaid diagrams with Tech Writer.
     *
     * Uses Paige (Tech Writer) to create Mermaid-compliant diagrams based
     * on user description. Follows CommonMark fenced code block standards.
     */
    private async handleMermaidCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Mermaid Diagram\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /mermaid command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'mermaid', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'mermaid', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const agentPath = path.join(bmadPath, 'bmm', 'agents', 'tech-writer', 'tech-writer.md');
        const standardsPath = path.join(bmadPath, '_memory', 'tech-writer-sidecar', 'documentation-standards.md');

        const contextParts: string[] = [
            'You are Paige, the Technical Writer agent, specializing in Mermaid diagram generation.',
            `Follow documentation standards from: ${standardsPath}`,
            '',
            'Create a Mermaid diagram based on the user description.',
            'If the diagram type is not specified, suggest appropriate diagram types based on the ask.',
            'Strictly follow Mermaid syntax and CommonMark fenced code block standards.',
            'Supported diagram types include: flowchart, sequence, class, state, ER, gantt, pie,',
            'mindmap, timeline, quadrant, gitgraph, C4, sankey, and more.',
        ];

        // Include project context if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject context: Working on "${state.vision.productName}".`);
        }
        if (state.architecture) {
            contextParts.push('Architecture artifacts are available — reference them for component relationships.');
        }

        if (prompt) {
            contextParts.push(`\nDiagram request: "${prompt}"`);
        } else {
            contextParts.push('\nAsk the user what diagram they need. Suggest common diagram types for their project.');
        }

        const task = contextParts.join('\n');
        const mermaidArtifact = { type: 'mermaid', id: 'diagram' };

        await executor.executeWithTools(
            model,
            task,
            mermaidArtifact,
            stream,
            token,
            this.store,
            agentPath
        );

        return { metadata: { command: 'mermaid' } };
    }

    /**
     * /readme command - Generate or update a project README.md.
     *
     * Analyzes the project structure, existing documentation, and BMAD
     * artifacts to produce a comprehensive README.md.
     * Workflow: `bmm/workflows/generate-readme/workflow.yaml`
     *
     * Agent: Paige (Tech Writer) via 'readme' mapping.
     */
    private async handleReadmeCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Generate README\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /readme command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'readme', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'readme', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', 'generate-readme', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the generate-readme workflow. You are Paige, the Technical Writer.',
            'Analyze the project structure, source code, and existing documentation',
            'to generate a comprehensive, well-structured README.md.',
        ];

        // Inject rich project context from BMAD artifacts
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject: "${state.vision.productName}".`);
            if (state.vision.problemStatement) {
                contextParts.push(`Problem: ${state.vision.problemStatement}`);
            }
            if (state.vision.targetUsers?.length) {
                contextParts.push(`Target users: ${state.vision.targetUsers.join(', ')}`);
            }
        }
        if (state.prd) {
            contextParts.push('PRD artifact is available — reference it for feature descriptions.');
        }
        if (state.architecture) {
            contextParts.push('Architecture artifact is available — reference it for tech stack and setup instructions.');
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        }

        const task = contextParts.join('\n');
        const readmeArtifact = { type: 'readme', id: 'generate' };

        await executor.executeWithTools(
            model,
            task,
            readmeArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'readme' } };
    }

    /**
     * /changelog command - Generate changelog or release notes.
     *
     * Analyzes git history, commit messages, and project changes to produce
     * structured changelog entries or release notes.
     * Workflow: `bmm/workflows/generate-changelog/workflow.yaml`
     *
     * Agent: Paige (Tech Writer) via 'changelog' mapping.
     */
    private async handleChangelogCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Generate Changelog\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /changelog command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'changelog', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'changelog', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', 'generate-changelog', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the generate-changelog workflow. You are Paige, the Technical Writer.',
            'Analyze git history, commit messages, and project changes to produce',
            'structured changelog entries following the Keep a Changelog convention.',
            'Group changes by type: Added, Changed, Deprecated, Removed, Fixed, Security.',
        ];

        // Include version context from package.json if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject: "${state.vision.productName}".`);
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        } else {
            contextParts.push('\nAsk the user for the version range or commit range to generate the changelog for.');
        }

        const task = contextParts.join('\n');
        const changelogArtifact = { type: 'changelog', id: 'generate' };

        await executor.executeWithTools(
            model,
            task,
            changelogArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'changelog' } };
    }

    /**
     * /api-docs command - Generate API documentation from source code.
     *
     * Analyzes source code to produce API documentation in formats like
     * OpenAPI/Swagger, JSDoc, or structured markdown.
     * Workflow: `bmm/workflows/generate-api-docs/workflow.yaml`
     *
     * Agent: Paige (Tech Writer) via 'api-docs' mapping.
     */
    private async handleApiDocsCommand(
        prompt: string,
        _context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {

        stream.markdown('## Generate API Documentation\n\n');

        const model = await this.getModel();
        if (!model) {
            stream.markdown('*AI not available — the /api-docs command requires an AI model.*\n\n');
            stream.markdown('Please enable GitHub Copilot or configure an API provider in settings.\n');
            return { metadata: { command: 'api-docs', status: 'no-model' } };
        }

        const executor = getWorkflowExecutor();
        const projectRoot = this.store.getProjectRoot() || undefined;
        const extensionPath = this.extensionContext?.extensionPath;
        const initialized = await executor.initialize(projectRoot, extensionPath);

        if (!initialized) {
            stream.markdown('**Error:** Could not locate a BMAD framework folder. Please ensure the extension is installed correctly.\n');
            return { metadata: { command: 'api-docs', status: 'no-bmad' } };
        }

        if (this.extensionContext) {
            const outputUri = this.store.getSourceFolder();
            sharedToolContext.bmadPath = executor.getBmadPath();
            sharedToolContext.outputPath = outputUri?.fsPath ?? '';
            sharedToolContext.store = this.store;
        }

        const bmadPath = executor.getBmadPath();
        const workflowPath = path.join(bmadPath, 'bmm', 'workflows', 'generate-api-docs', 'workflow.yaml');

        const contextParts: string[] = [
            'Start the generate-api-docs workflow. You are Paige, the Technical Writer.',
            'Analyze the project source code to generate comprehensive API documentation.',
            'Support multiple output formats:',
            '  - OpenAPI/Swagger for REST APIs',
            '  - JSDoc/TSDoc for TypeScript/JavaScript',
            '  - Structured Markdown for any API surface',
            'Focus on endpoints, parameters, request/response schemas, and usage examples.',
        ];

        // Include architecture context if available
        const state = this.store.getState();
        if (state.vision?.productName) {
            contextParts.push(`\nProject: "${state.vision.productName}".`);
        }
        if (state.architecture) {
            contextParts.push('Architecture artifact is available — reference it for API patterns and tech stack.');
        }

        if (prompt) {
            contextParts.push(`\nUser instructions: "${prompt}"`);
        } else {
            contextParts.push('\nAsk the user which APIs or code paths to document. Suggest starting points based on project structure.');
        }

        const task = contextParts.join('\n');
        const apiDocsArtifact = { type: 'api-docs', id: 'generate' };

        await executor.executeWithTools(
            model,
            task,
            apiDocsArtifact,
            stream,
            token,
            this.store,
            workflowPath
        );

        return { metadata: { command: 'api-docs' } };
    }

    /**
     * Format phase name for display
     */
    private formatPhaseName(phase: string): string {
        // Convert kebab-case to Title Case
        return phase
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    // ─── /jira command ────────────────────────────────────────────────────────

    /**
     * Handle @agileagentcanvas /jira [subcommand] [arg]
     *
     * Subcommands:
     *   config               — show current Jira config status
     *   epics [projectKey]   — list epics
     *   stories [epicKey]    — list stories for an epic or all in project
     *   sync [projectKey]    — fetch and merge into canvas artifacts
     */
    private async handleJiraCommand(
        prompt: string,
        stream: vscode.ChatResponseStream
    ): Promise<vscode.ChatResult> {
        const parts = prompt.trim().split(/\s+/);
        const sub = (parts[0] ?? '').toLowerCase();
        const arg = parts[1] ?? '';

        // ── config ────────────────────────────────────────────────────────────
        if (!sub || sub === 'config') {
            return this.handleJiraConfig(stream);
        }

        // All other subcommands require a configured Jira
        const config = await getJiraConfig();
        if (!config) {
            stream.markdown(
                '## Jira — Not Configured\n\n' +
                'Please add your Jira credentials in **VS Code Settings** (`Ctrl/Cmd + ,`, search `"Jira"`):\n\n' +
                '| Setting | Example |\n' +
                '|---|---|\n' +
                '| `agileagentcanvas.jira.baseUrl` | `https://mycompany.atlassian.net` |\n' +
                '| `agileagentcanvas.jira.email` | `me@company.com` |\n' +
                '| `agileagentcanvas.jira.projectKey` | `PROJ` *(optional default)* |\n\n' +
                'Then store your API token securely via the command palette: **Agile Agent Canvas: Set Jira API Token**\n\n' +
                'Then run `/jira config` to verify the connection.\n'
            );
            return { metadata: { command: 'jira', status: 'not-configured' } };
        }

        const client = new JiraClient(config);
        const resolvedProject = arg || config.projectKey;

        // ── epics ─────────────────────────────────────────────────────────────
        if (sub === 'epics') {
            if (!resolvedProject) {
                stream.markdown('Please provide a project key: `/jira epics PROJ`\n');
                return { metadata: { command: 'jira', status: 'missing-arg' } };
            }
            stream.markdown(`## Fetching Jira Epics for \`${resolvedProject}\`…\n\n`);
            try {
                const epics = await client.fetchEpics(resolvedProject);
                stream.markdown(formatEpicsAsMarkdown(epics));
            } catch (err: any) {
                stream.markdown(`**Error:** ${err?.message ?? err}\n`);
                this.addJiraTokenHint(stream, err);
            }
            return { metadata: { command: 'jira', subcommand: 'epics' } };
        }

        // ── stories ───────────────────────────────────────────────────────────
        if (sub === 'stories') {
            if (!arg && !resolvedProject) {
                stream.markdown('Please provide an epic key or project key: `/jira stories PROJ-42` or `/jira stories PROJ`\n');
                return { metadata: { command: 'jira', status: 'missing-arg' } };
            }
            // Heuristic: if arg looks like PROJECT-NUMBER it's an epic key, else a project key
            const looksLikeEpicKey = /^[A-Z]+-\d+$/i.test(arg);

            if (looksLikeEpicKey) {
                const projectForEpic = resolvedProject || arg.replace(/-\d+$/, '');
                stream.markdown(`## Fetching Stories for Epic \`${arg}\`…\n\n`);
                try {
                    const stories = await client.fetchStoriesForEpic(arg, projectForEpic);
                    stream.markdown(formatStoriesAsMarkdown(stories, arg));
                } catch (err: any) {
                    stream.markdown(`**Error:** ${err?.message ?? err}\n`);
                    this.addJiraTokenHint(stream, err);
                }
            } else {
                const proj = arg || resolvedProject!;
                stream.markdown(`## Fetching All Stories in \`${proj}\`…\n\n`);
                try {
                    const stories = await client.fetchAllStoriesInProject(proj);
                    stream.markdown(formatStoriesAsMarkdown(stories));
                } catch (err: any) {
                    stream.markdown(`**Error:** ${err?.message ?? err}\n`);
                    this.addJiraTokenHint(stream, err);
                }
            }
            return { metadata: { command: 'jira', subcommand: 'stories' } };
        }

        // ── sync ──────────────────────────────────────────────────────────────
        if (sub === 'sync') {
            if (!resolvedProject) {
                stream.markdown('Please provide a project key: `/jira sync PROJ`\n');
                return { metadata: { command: 'jira', status: 'missing-arg' } };
            }
            stream.markdown(`## Syncing Jira Project \`${resolvedProject}\` into Canvas…\n\n`);
            try {
                const jiraEpics = await client.fetchEpicsWithStories(resolvedProject);
                const existing = this.store.getState();
                const { merged, added, updated } = mergeJiraIntoArtifacts(existing, jiraEpics);
                this.store.mergeFromState({ epics: merged.epics });

                const totalStories = jiraEpics.reduce((n, e) => n + e.stories.length, 0);
                stream.markdown(
                    `✅ **Sync complete** from \`${resolvedProject}\`\n\n` +
                    `| | Count |\n|---|---|\n` +
                    `| Epics fetched | ${jiraEpics.length} |\n` +
                    `| Stories fetched | ${totalStories} |\n` +
                    `| Epics added | ${added} |\n` +
                    `| Epics updated | ${updated} |\n\n` +
                    `Your canvas artifacts have been updated. Open the canvas to see the changes.\n`
                );
            } catch (err: any) {
                stream.markdown(`**Error:** ${err?.message ?? err}\n`);
                this.addJiraTokenHint(stream, err);
            }
            return { metadata: { command: 'jira', subcommand: 'sync' } };
        }

        // ── unknown subcommand ────────────────────────────────────────────────
        stream.markdown(
            `Unknown Jira subcommand: \`${sub}\`\n\n` +
            'Available subcommands:\n' +
            '- `/jira config` — show connection status\n' +
            '- `/jira epics [projectKey]` — list epics\n' +
            '- `/jira stories [epicKey|projectKey]` — list stories\n' +
            '- `/jira sync [projectKey]` — merge into canvas artifacts\n'
        );
        return { metadata: { command: 'jira', status: 'unknown-subcommand' } };
    }

    private async handleJiraConfig(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        const config = await getJiraConfig();

        if (!config) {
            stream.markdown(
                '## Jira Configuration\n\n' +
                '**Status:** ❌ Not configured\n\n' +
                'Set the following in **VS Code Settings** (`Ctrl/Cmd + ,`, search `"Jira"`):\n\n' +
                '| Setting | Example |\n' +
                '|---|---|\n' +
                '| `agileagentcanvas.jira.baseUrl` | `https://mycompany.atlassian.net` |\n' +
                '| `agileagentcanvas.jira.email` | `me@company.com` |\n' +
                '| `agileagentcanvas.jira.projectKey` | `PROJ` *(optional default project)* |\n\n' +
                'Then store your API token securely via the command palette:\n\n' +
                '> **Agile Agent Canvas: Set Jira API Token** — stores the token in the OS keychain (never in plain text).\n\n' +
                '> ⚠️ **Note:** API tokens expire after 1 year. Rotate before expiry to avoid disruption.\n'
            );
            return { metadata: { command: 'jira', subcommand: 'config', status: 'not-configured' } };
        }

        // Show masked config
        const client = new JiraClient(config);
        const masked = client.getMaskedConfig();

        stream.markdown(
            '## Jira Configuration\n\n' +
            '**Status:** ✅ Configured\n\n' +
            '| Setting | Value |\n' +
            '|---|---|\n' +
            `| Base URL | \`${masked.baseUrl}\` |\n` +
            `| Email | \`${masked.email}\` |\n` +
            `| API Token | \`${masked.apiToken}\` |\n` +
            `| Default Project | \`${masked.projectKey ?? '(not set)'}\` |\n\n` +
            'Testing connection…\n'
        );

        try {
            const me = await client.testConnection();
            stream.markdown(
                `✅ **Connection OK** — authenticated as **${me.displayName}** (${me.email})\n\n` +
                '> ⚠️ API tokens expire after 1 year. Rotate before expiry at ' +
                '[id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).\n'
            );
        } catch (err: any) {
            stream.markdown(`❌ **Connection failed:** ${err?.message ?? err}\n`);
        }

        return { metadata: { command: 'jira', subcommand: 'config' } };
    }

    /** Append a hint about token expiry when a 401 error occurs */
    private addJiraTokenHint(stream: vscode.ChatResponseStream, err: any): void {
        if (err?.statusCode === 401) {
            stream.markdown(
                '\n> 💡 **Tip:** 401 usually means your API token has expired (tokens expire after 1 year). ' +
                'Generate a new one at [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) ' +
                'and update `agileagentcanvas.jira.apiToken` in Settings.\n'
            );
        }
    }
}
