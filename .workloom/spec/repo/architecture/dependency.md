# dependency

Dependency direction between packages.

- rule: `core` must not import `assets`; when core needs content, the adapter reads it from assets and passes it in as text
- rule: adapters may depend on both core and assets
- counter-example: adding `ensureSpecTemplates` to core and reading templates from assets inside core instead of receiving them as parameters
