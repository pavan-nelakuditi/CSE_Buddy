import { describe, expect, it } from 'vitest';

import { pickPreferredStage, toUserFriendlyAwsError } from '../electron/services/surface1/aws-api-gateway-adapter.js';

describe('pickPreferredStage', () => {
  it('prefers production-like stages in deterministic order', () => {
    expect(pickPreferredStage(['dev', 'staging', 'prod'])).toBe('prod');
    expect(pickPreferredStage(['qa', '$default', 'sandbox'])).toBe('$default');
    expect(pickPreferredStage(['sandbox', 'qa'])).toBeUndefined();
  });
});

describe('toUserFriendlyAwsError', () => {
  it('returns setup guidance when credentials are missing', () => {
    const error = toUserFriendlyAwsError(
      new Error('CredentialsProviderError: Could not load credentials from any providers'),
      undefined
    );

    expect(error.message).toContain('No AWS credentials were detected');
    expect(error.message).toContain('aws configure');
    expect(error.message).toContain('aws sso login');
  });

  it('includes the selected profile in setup guidance', () => {
    const error = toUserFriendlyAwsError(
      new Error('Could not resolve credentials using profile: sandbox'),
      'sandbox'
    );

    expect(error.message).toContain('sandbox');
    expect(error.message).toContain('aws configure --profile sandbox');
  });
});
