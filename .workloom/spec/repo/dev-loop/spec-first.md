# spec first

Write the behavior spec before implementation code.

- rule: every implementation point gets a written behavior spec first — inputs, outputs, data layout, edge cases
- rule: when the spec touches host API boundaries (tool schemas, command definitions, service registration), verify each field against official samples or real types before writing — never write shapes from memory
- counter-example: writing a tool schema from memory and discovering field mismatches only during on-device verification
