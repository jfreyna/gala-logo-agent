/**
 * A minimal check runner for the verifiers (build gates 3b and 3c).
 *
 * Every check is registered before any runs, so the expected count comes
 * from the checks themselves. The last line is either "N/N passed" or, when
 * a check could not run or the run died, "N/M, run incomplete", never a
 * shorter total that looks complete. A check that cannot run (a missing
 * tool) is reported as not run, which makes the run incomplete, not passed.
 */

export class NotRun extends Error {}

type Check = { name: string; fn: () => void | Promise<void> };

export function createHarness(title: string) {
  const checks: Check[] = [];
  return {
    check(name: string, fn: Check["fn"]) {
      checks.push({ name, fn });
    },
    async run(): Promise<void> {
      const expected = checks.length;
      let passed = 0;
      let failed = 0;
      let notRun = 0;
      console.log(`${title}: ${expected} checks`);
      for (const c of checks) {
        try {
          await c.fn();
          passed++;
          console.log(`  ok    ${c.name}`);
        } catch (err) {
          if (err instanceof NotRun) {
            notRun++;
            console.log(`  skip  ${c.name}: not run (${err.message})`);
          } else {
            failed++;
            console.log(`  FAIL  ${c.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      const ran = passed + failed;
      if (notRun > 0 || ran !== expected) {
        console.log(`${passed}/${expected}, run incomplete (${failed} failed, ${notRun} not run)`);
        process.exitCode = 1;
      } else if (failed > 0) {
        console.log(`${passed}/${expected} passed (${failed} failed)`);
        process.exitCode = 1;
      } else {
        console.log(`${passed}/${expected} passed`);
      }
    },
  };
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertClose(actual: number, expected: number, tolerance: number, what: string): void {
  if (!(Math.abs(actual - expected) <= tolerance)) throw new Error(`${what}: got ${actual}, expected ${expected} ±${tolerance}`);
}

export function assertEqual<T>(actual: T, expected: T, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: got ${a}, expected ${e}`);
}
