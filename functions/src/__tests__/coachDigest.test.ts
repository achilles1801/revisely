import { checkDigestCaller, DIGEST_WORKFLOW_REF, ledgerDayCounts, parseWeek } from '../coachDigest';
import { REPOSITORY, REPOSITORY_ID } from '../playAvailable';

const claims = (over: Record<string, unknown> = {}) =>
  ({
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'revisely-coach-digest',
    exp: 0,
    repository: REPOSITORY,
    repository_id: REPOSITORY_ID,
    job_workflow_ref: DIGEST_WORKFLOW_REF,
    event_name: 'schedule',
    ...over,
  }) as never;

describe('the coach digest endpoint (C6)', () => {
  it('lets only stats-digest.yml on main, scheduled or run by hand, in this repository', () => {
    expect(() => checkDigestCaller(claims())).not.toThrow();
    expect(() => checkDigestCaller(claims({ event_name: 'workflow_dispatch' }))).not.toThrow();
    expect(() => checkDigestCaller(claims({ repository: 'someone/else' }))).toThrow('another repository');
    expect(() => checkDigestCaller(claims({ job_workflow_ref: DIGEST_WORKFLOW_REF.replace('stats-digest', 'android-build') }))).toThrow('not stats-digest.yml on main');
    expect(() => checkDigestCaller(claims({ job_workflow_ref: DIGEST_WORKFLOW_REF.replace('refs/heads/main', 'refs/heads/develop') }))).toThrow();
    expect(() => checkDigestCaller(claims({ event_name: 'pull_request' }))).toThrow('event');
  });

  it('reads one week at most, as two dates', () => {
    expect(parseWeek({ start: '2026-11-02', end: '2026-11-08' })).toEqual({ start: '2026-11-02', end: '2026-11-08' });
    expect(() => parseWeek({ start: '2026-11-02', end: '2026-11-20' })).toThrow('at most seven days');
    expect(() => parseWeek({ start: '2026-11-08', end: '2026-11-02' })).toThrow();
    expect(() => parseWeek({ start: 'today', end: '2026-11-08' })).toThrow('YYYY-MM-DD');
  });

  it('returns the counts of a day and nothing else a document holds', () => {
    const doc = { day: '2026-11-03', calls: 2, inputTokens: 900, outputTokens: 60, cacheReadTokens: 4000, cacheWriteTokens: 0, spendUsd: 0.01, uid: 'secret', answer: 'a private sentence' };
    const counts = ledgerDayCounts(doc);
    expect(counts).toEqual({ day: '2026-11-03', calls: 2, inputTokens: 900, outputTokens: 60, cacheReadTokens: 4000, cacheWriteTokens: 0, spendUsd: 0.01 });
    expect(JSON.stringify(counts)).not.toMatch(/secret|private/);
  });
});
