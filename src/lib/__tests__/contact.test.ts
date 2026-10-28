import { SUPPORT_EMAIL, supportMailto } from '../contact';

describe('support contact', () => {
  it('writes to support@, not privacy@', () => {
    expect(SUPPORT_EMAIL).toBe('support@revisely.app');
    expect(supportMailto()).toBe('mailto:support@revisely.app?subject=Revisely%20support');
  });
});
