// preview.yml: Revisely Dev's native builds run in a lane of their own, so a Dev build waiting for a Mac can't hold
// up testers' preview update (#936 held #937's, Nov 23 2026). What promote.yml relies on stays in the publishing half.
const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(path.join(__dirname, '../../.github/workflows/preview.yml'), 'utf8');
const body = text.slice(text.indexOf('\njobs:\n'));
const jobs = Object.fromEntries(
  body
    .split(/\n(?=  [a-z][a-z-]*:\n)/)
    .slice(1)
    .map((block) => [block.slice(2, block.indexOf(':')), block]),
);
const needs = (name) => {
  const m = /\n    needs: (\[[^\]]*\]|\S+)/.exec(jobs[name]);
  return m ? m[1].replace(/[[\]]/g, '').split(',').map((s) => s.trim()) : [];
};

describe('preview.yml’s lanes', () => {
  it('has one concurrency group for Dev’s half, apart from preview’s', () => {
    const group = /\nconcurrency:\n  group: (.+)\n  cancel-in-progress: false/.exec(text)?.[1] ?? '';
    expect(group).toContain("inputs.dev && (inputs.dry_run && 'eas-dev-builds-dry-run' || 'eas-dev-builds')");
    expect(group).toContain("inputs.publish && (inputs.dry_run && 'eas-preview-dry-run' || 'eas-preview')");
    expect(group.indexOf('inputs.dev')).toBeLessThan(group.indexOf('inputs.publish'));
  });

  it('builds Revisely Dev only in its own half, after its own check', () => {
    expect(needs('dev-build')).toEqual(['dev-plan']);
    expect(needs('dev-android-build')).toEqual(['dev-plan']);
    expect(needs('dev-update')).toEqual(['dev-plan', 'dev-build', 'dev-android-build']);
    expect(jobs['dev-plan']).toContain("if: ${{ inputs.dev && vars.DEV_APP == 'true' }}");
    expect(jobs['dev-plan']).toContain('run: sh .github/scripts/publish-check.sh');
  });

  it('never makes anything of preview’s wait for a Dev job', () => {
    for (const name of ['publish', 'build', 'android-build', 'update']) {
      expect([name, needs(name).filter((n) => n.startsWith('dev-'))]).toEqual([name, []]);
    }
    expect(jobs.gate).toContain('!inputs.publish && !inputs.dev');
    expect(jobs.publish).toContain('if: ${{ inputs.publish }}');
  });

  it('hands Dev over as the publishing job’s last step, whose failure changes nothing', () => {
    const at = jobs.publish.indexOf("- name: Hand Revisely Dev's part to its own lane");
    expect(at).toBeGreaterThan(jobs.publish.indexOf('id: preview'));
    const step = jobs.publish.slice(at);
    expect(step).toContain('continue-on-error: true');
    expect(step).toContain('-f dev="$SHA"');
    expect(step.match(/\n      - /g)).toBeNull();
  });
});
