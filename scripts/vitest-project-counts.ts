// Vitest reporter used by scripts/test.sh: writes the number of tests that ran
// (passed or failed) in each selected project as JSON to the file named by
// TEST_PROJECT_COUNTS_FILE, so the gate can fail when any one project collected
// nothing. Projects that ran no tests are written with a count of 0. Uses only
// the public reporter API (onInit, onTestRunEnd, TestModule).
import { writeFileSync } from 'node:fs';
import type { Reporter, TestModule, Vitest } from 'vitest/node';

export default class ProjectCountsReporter implements Reporter {
  private vitest: Vitest | undefined;

  onInit(vitest: Vitest): void {
    this.vitest = vitest;
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const file = process.env.TEST_PROJECT_COUNTS_FILE;
    if (!file || !this.vitest) return;
    const counts: Record<string, number> = {};
    for (const project of this.vitest.projects) counts[project.name] = 0;
    for (const module of testModules) {
      const name = module.project.name;
      let ran = 0;
      for (const test of module.children.allTests()) {
        const state = test.result().state;
        if (state === 'passed' || state === 'failed') ran++;
      }
      counts[name] = (counts[name] ?? 0) + ran;
    }
    writeFileSync(file, `${JSON.stringify(counts)}\n`);
  }
}
