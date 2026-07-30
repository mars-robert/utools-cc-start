## ADDED Requirements

### Requirement: System provides built-in API vendor presets

The system SHALL provide a collection of built-in API vendor presets that contain pre-configured settings for popular API providers.

#### Scenario: List available presets
- **WHEN** user requests the list of vendor presets
- **THEN** system returns at least 5 presets including DeepSeek, official Anthropic, OpenRouter, China relay template, and custom blank template

#### Scenario: Preset contains vendor-specific configuration
- **WHEN** user inspects a preset (e.g., DeepSeek)
- **THEN** preset includes pre-filled ANTHROPIC_BASE_URL, recommended MODEL values, and appropriate EFFORT_LEVEL settings

#### Scenario: Preset indicates token requirement
- **WHEN** user views a preset that requires authentication
- **THEN** preset metadata includes requiresToken flag and optional tokenPlaceholder and documentation link

### Requirement: User can select preset when creating new configuration

The system SHALL present preset selection interface when user initiates configuration creation.

#### Scenario: Display preset selection dialog
- **WHEN** user clicks "新增配置" button
- **THEN** system displays a modal with all available vendor presets showing name, icon, and description

#### Scenario: Select preset to pre-fill configuration
- **WHEN** user clicks on a preset option
- **THEN** system creates new configuration draft with preset values pre-filled and opens editor

#### Scenario: Preset with template flag shows modification hint
- **WHEN** user selects a preset marked as template (e.g., China relay)
- **THEN** system displays visual indicator that URL needs customization

### Requirement: User can apply preset to existing configuration

The system SHALL allow users to apply a preset to an already-created configuration through the editor.

#### Scenario: Access preset menu from editor
- **WHEN** user is editing a configuration and clicks "+ 预设" button next to BASE_URL field
- **THEN** system displays dropdown menu with available presets

#### Scenario: Apply preset overwrites relevant fields
- **WHEN** user selects a preset from the dropdown
- **THEN** system overwrites BASE_URL, MODEL, and related fields with preset values while preserving AUTH_TOKEN

#### Scenario: Apply preset to blank custom configuration
- **WHEN** user created configuration from "custom" preset and applies another preset
- **THEN** system populates all preset fields into the previously blank configuration

### Requirement: Configuration retains preset source metadata

The system SHALL record which preset was used to create a configuration for display purposes.

#### Scenario: Store preset ID with configuration
- **WHEN** user creates configuration from a preset
- **THEN** system stores _presetId metadata field with the configuration

#### Scenario: Display preset label on configuration card
- **WHEN** user views configuration list and a configuration has _presetId
- **THEN** card displays preset icon and name as a tag (e.g., "🔷 DeepSeek")

#### Scenario: Handle configurations without preset metadata
- **WHEN** user views configuration created before preset feature or from scratch
- **THEN** card displays no preset tag and functions normally

### Requirement: Preset definitions are code-managed

The system SHALL define presets in application code, not in user-editable files.

#### Scenario: Presets loaded from code
- **WHEN** application initializes
- **THEN** preset list is loaded from hardcoded definitions in preload layer

#### Scenario: User cannot modify preset definitions
- **WHEN** user views or uses presets
- **THEN** system does not provide UI to add, edit, or delete preset definitions

### Requirement: DeepSeek preset includes full recommended configuration

The DeepSeek preset SHALL include all recommended settings for optimal performance with DeepSeek API.

#### Scenario: DeepSeek preset configuration values
- **WHEN** user applies DeepSeek preset
- **THEN** system sets ANTHROPIC_BASE_URL to "https://api.deepseek.com/anthropic"
- **AND** sets ANTHROPIC_MODEL to "deepseek-v4-pro[1m]"
- **AND** sets ANTHROPIC_DEFAULT_OPUS_MODEL to "deepseek-v4-pro[1m]"
- **AND** sets ANTHROPIC_DEFAULT_SONNET_MODEL to "deepseek-v4-pro[1m]"
- **AND** sets ANTHROPIC_DEFAULT_HAIKU_MODEL to "deepseek-v4-flash"
- **AND** sets CLAUDE_CODE_SUBAGENT_MODEL to "deepseek-v4-flash"
- **AND** sets CLAUDE_CODE_EFFORT_LEVEL to "max"

#### Scenario: DeepSeek preset includes documentation link
- **WHEN** user views DeepSeek preset details
- **THEN** system displays link to "https://platform.deepseek.com/api_keys" for API key registration
