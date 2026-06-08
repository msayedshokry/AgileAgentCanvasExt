const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const props = pkg.contributes.configuration.properties;
const originalTitle = pkg.contributes.configuration.title || 'Agile Agent Canvas';

// Define logical groups with their property keys
const groups = [
  {
    title: originalTitle,
    order: 0,
    properties: [
      'outputFolder',
      'autoSync',
      'showAICursor',
      'logLevel',
    ],
  },
  {
    title: 'AI Provider',
    order: 1,
    properties: [
      'aiProvider',
      'apiKey',
      'modelId',
      'baseUrl',
      'defaultTemperature',
      'defaultAgent',
    ],
  },
  {
    title: 'Chat Provider',
    order: 2,
    properties: [
      'chatProvider',
      'chatProviderSelected',
    ],
  },
  {
    title: 'Jira',
    order: 3,
    properties: [
      'jira.baseUrl',
      'jira.email',
      'jira.apiToken',
      'jira.projectKey',
    ],
  },
  {
    title: 'graphify',
    order: 4,
    properties: [
      'graphify.pythonPath',
      'graphify.backend',
      'graphify.autoBootstrapOnNewProject',
      'graphify.autoUpdateOnSave',
      'graphify.showCodebaseLane',
    ],
  },
  {
    title: 'Codeburn',
    order: 5,
    properties: [
      'codeburn.enabled',
      'codeburn.path',
    ],
  },
  {
    title: 'Caveman',
    order: 6,
    properties: [
      'caveman.enabled',
      'caveman.intensity',
    ],
  },
  {
    title: 'Agentic Execution',
    order: 7,
    properties: [
      'agenticKanban.enabled',
      'agenticKanban.terminalProvider',
      'trace.enabled',
      'trace.retentionDays',
      'harness.enabled',
      'harness.sprintCapacity',
      'agentTeam.enabled',
      'yoloMode',
    ],
  },
  {
    title: 'Catalogue',
    order: 8,
    properties: [
      'userCataloguePath',
      'skillRepos',
    ],
  },
];

// Build the configuration array
const configuration = groups.map(group => {
  const groupProps = {};
  for (const key of group.properties) {
    const fullKey = `agileagentcanvas.${key}`;
    if (props[fullKey]) {
      groupProps[fullKey] = props[fullKey];
    } else {
      console.warn(`WARNING: Property not found: ${fullKey}`);
    }
  }
  // Add markdownDescription as section header
  return {
    title: group.title,
    order: group.order,
    properties: groupProps,
  };
});

// Validate all properties were assigned
const assigned = new Set();
for (const group of configuration) {
  for (const key of Object.keys(group.properties)) {
    assigned.add(key);
  }
}

const originalKeys = Object.keys(props);
const unassigned = originalKeys.filter(k => !assigned.has(k));
if (unassigned.length > 0) {
  console.warn('WARNING: Unassigned properties:', unassigned);
  // Add them as a fallback group
  const fallbackProps = {};
  for (const key of unassigned) {
    fallbackProps[key] = props[key];
  }
  configuration.push({
    title: 'Other',
    order: 99,
    properties: fallbackProps,
  });
}

// Update package.json
pkg.contributes.configuration = configuration;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('✅ Configuration reorganized into', configuration.length, 'groups');
