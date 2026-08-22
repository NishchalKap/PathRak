import assert from "node:assert/strict";
import { getBackendWeekday, isSafeWalkDue, recordShake } from "../src/utils/safetyLogic.js";

const eta = new Date("2026-08-23T00:00:10.000Z");
assert.equal(isSafeWalkDue({ active: true, etaTime: eta, nowMs: eta.getTime() - 1, alreadyHandled: false }), false);
assert.equal(isSafeWalkDue({ active: true, etaTime: eta, nowMs: eta.getTime(), alreadyHandled: false }), true);
assert.equal(isSafeWalkDue({ active: true, etaTime: eta, nowMs: eta.getTime() + 1, alreadyHandled: true }), false);

let shake = { count: 0, lastShakeMs: 0 };
shake = recordShake(shake, 26, 1000);
assert.equal(shake.shouldTrigger, false);
shake = recordShake(shake, 30, 1500);
assert.equal(shake.shouldTrigger, false);
shake = recordShake(shake, 28, 2000);
assert.equal(shake.shouldTrigger, true);

shake = recordShake({ count: 2, lastShakeMs: 1000 }, 30, 4001);
assert.deepEqual(shake, { count: 1, lastShakeMs: 4001, shouldTrigger: false });
assert.equal(getBackendWeekday(new Date("2026-08-23T12:00:00Z")), 6);

console.log("Safety logic checks passed: ETA boundary, duplicate guard, shake threshold, shake timeout, weekday mapping.");
