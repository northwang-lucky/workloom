# concurrency

Atomicity and occupancy semantics for stateful gates and registries.

- rule: between a capacity/lock check and the action it guards (spawn, register, start), there must be no await gap — reserve the slot synchronously right after the check passes (provisional / in-flight entry), then await; release the reservation on every failure path (spawn error, probe failure, abort) so no phantom slot survives
- rule: slot occupancy is defined by the mechanism's own resource semantics, not by entity lifecycle — a resident entity that finished its work (idle) must release capacity slots while keeping the entry for reuse; the entry itself is removed only when the entity exits
- rule: any gate behavior that unit tests cannot prove (async timing, process liveness, registry lifecycle) needs a real-machine verification item before the task check passes
- counter-example: Pi capacity gate checked the registry, then awaited the spawn-confirmation event before registering the child — three same-turn dispatches all observed an empty registry and were all admitted (fixed 2026-09 with pre-await provisional registration)
- counter-example: settled-but-still-alive RPC children kept counting as running, so the concurrency ceiling drained monotonically until no new dispatch could pass (fixed 2026-09 with an explicit idle state that frees the slot but keeps the process)
