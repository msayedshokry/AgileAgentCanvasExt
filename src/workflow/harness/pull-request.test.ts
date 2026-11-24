import { describe, it, expect } from 'vitest';
import { getCardPullRequest, parsePullRequest, prFixRequests } from './pull-request';

const VIEW = JSON.stringify({
  url: 'https://github.com/o/r/pull/7', number: 7, state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'build', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'test', conclusion: 'FAILURE' },
    { __typename: 'StatusContext', context: 'lint', state: 'PENDING' },
  ],
  reviews: [
    { author: { login: 'alice' }, state: 'CHANGES_REQUESTED', body: 'Handle the empty password case.' },
    { author: { login: 'bob' }, state: 'APPROVED', body: 'lgtm' },
  ],
  comments: [{ author: { login: 'carol' }, body: 'Add a test for lockout.' }],
});

describe('pull request status', () => {
  it('parses state, checks and review feedback (approvals are not feedback)', () => {
    const pr = parsePullRequest(VIEW)!;
    expect(pr).toMatchObject({ number: 7, state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED' });
    expect(pr.checks).toEqual([{ name: 'build', state: 'pass' }, { name: 'test', state: 'fail' }, { name: 'lint', state: 'pending' }]);
    expect(pr.feedback.map((f) => f.author)).toEqual(['alice', 'carol']);
  });

  it('turns feedback and failing checks into fix requests', () => {
    const fixes = prFixRequests(parsePullRequest(VIEW)!);
    expect(fixes.map((f) => f.failing_criterion)).toEqual([
      'Review comment from @alice', 'Review comment from @carol', 'CI check failing: test',
    ]);
  });

  it('asks gh for the card branch and treats "no PR" as undefined', async () => {
    const calls: string[][] = [];
    const none = await getCardPullRequest('S-1', '/r', async (args) => { calls.push([...args]); return { stdout: '', code: 1 }; });
    expect(none).toBeUndefined();
    expect(calls[0].slice(0, 3)).toEqual(['pr', 'view', 'aac/story-S-1']);
    expect(parsePullRequest('not json')).toBeUndefined();
  });
});
