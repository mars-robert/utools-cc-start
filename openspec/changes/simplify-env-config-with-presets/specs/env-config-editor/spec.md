## MODIFIED Requirements

### Requirement: User can edit configuration in form mode

The system SHALL provide a form-based editor that displays configuration fields organized into collapsible sections, with simplified default view showing only essential fields.

#### Scenario: Display basic fields by default
- **WHEN** user opens configuration editor in form mode
- **THEN** system displays only priority "basic" fields: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL, and CLAUDE_CODE_EFFORT_LEVEL

#### Scenario: Advanced fields are hidden initially
- **WHEN** user opens configuration editor in form mode
- **THEN** system hides fields marked as priority "advanced" including ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_OPUS_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL, and others

#### Scenario: User can access advanced fields
- **WHEN** user clicks "显示高级选项" button or section toggle
- **THEN** system expands to show all advanced configuration fields

#### Scenario: JSON mode shows complete configuration
- **WHEN** user switches to JSON mode
- **THEN** system displays complete settings.json structure including all fields regardless of priority

### Requirement: Configuration fields have priority metadata

The system SHALL classify each configuration field with a priority level to control visibility in simplified view.

#### Scenario: Core fields marked as basic priority
- **WHEN** system loads field definitions from ConfigFields.js
- **THEN** ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL, and CLAUDE_CODE_EFFORT_LEVEL have priority "basic"

#### Scenario: Model-specific fields marked as advanced priority
- **WHEN** system loads field definitions from ConfigFields.js
- **THEN** ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_OPUS_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL, and CLAUDE_CODE_SUBAGENT_MODEL have priority "advanced"

#### Scenario: Environment and debug fields marked as advanced priority
- **WHEN** system loads field definitions from ConfigFields.js
- **THEN** MAX_THINKING_TOKENS, BASH_DEFAULT_TIMEOUT_MS, HTTP_PROXY, HTTPS_PROXY, DISABLE_TELEMETRY, and similar fields have priority "advanced"

### Requirement: Form sections reorganized for clarity

The system SHALL organize configuration fields into logical sections with basic configuration prominently displayed.

#### Scenario: Basic configuration section default open
- **WHEN** user opens configuration editor
- **THEN** "基础配置" section is expanded by default showing 4 basic fields

#### Scenario: Other sections default collapsed
- **WHEN** user opens configuration editor
- **THEN** "通用设置", "MCP 配置", and "环境变量（高级）" sections are collapsed by default

#### Scenario: Section shows count of filled fields
- **WHEN** user views collapsed section header
- **THEN** section displays count of fields with non-empty values

### Requirement: Editor supports preset application

The system SHALL allow applying vendor presets to current configuration being edited.

#### Scenario: Preset button shown for BASE_URL field
- **WHEN** user views ANTHROPIC_BASE_URL field in form mode AND presets are available
- **THEN** system displays "+ 预设" button next to the field

#### Scenario: Clicking preset button shows menu
- **WHEN** user clicks "+ 预设" button
- **THEN** system displays dropdown menu with all available vendor presets

#### Scenario: Selecting preset fills multiple fields
- **WHEN** user selects a preset from the menu
- **THEN** system populates all fields defined in preset config while preserving existing AUTH_TOKEN value

#### Scenario: Preset menu hidden when no presets available
- **WHEN** system has no presets loaded
- **THEN** "+ 预设" button is not displayed

## ADDED Requirements

### Requirement: Configuration editor supports simplified workflow

The system SHALL optimize the editing experience for common use cases while maintaining access to advanced options.

#### Scenario: New user focuses on essential fields
- **WHEN** user creates first configuration
- **THEN** system presents only 4 basic fields reducing cognitive load

#### Scenario: Power user can expand full options
- **WHEN** advanced user needs to configure proxy or custom timeouts
- **THEN** user can expand advanced sections or switch to JSON mode

#### Scenario: Mode switching preserves data
- **WHEN** user fills basic fields and switches between form and JSON modes
- **THEN** system preserves all entered values across mode transitions
