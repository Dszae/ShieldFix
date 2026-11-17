import { describe, expect, it } from 'vitest';
import {
  approximateSite,
  describeUrl,
  hostMatchesDomain,
  isSameSite,
  isValidHostname,
  normalizeHostname,
  originPatternsFor,
} from '../../src/shared/domain';
import { hostFromPattern } from '../../src/background/router';

describe('hostnames', () => {
  it('normalises', () => {
    expect(normalizeHostname('WWW.Example.COM.')).toBe('example.com');
    expect(normalizeHostname('news.example.com')).toBe('news.example.com');
  });

  it('validates', () => {
    expect(isValidHostname('example.com')).toBe(true);
    expect(isValidHostname('127.0.0.1')).toBe(true);
    expect(isValidHostname('999.0.0.1')).toBe(false);
    expect(isValidHostname('localhost')).toBe(false);
    expect(isValidHostname('com')).toBe(false);
    expect(isValidHostname('exa mple.com')).toBe(false);
    expect(isValidHostname('-bad.com')).toBe(false);
  });

  it('matches subdomains but not lookalikes', () => {
    expect(hostMatchesDomain('example.com', 'example.com')).toBe(true);
    expect(hostMatchesDomain('www.news.example.com', 'example.com')).toBe(true);
    expect(hostMatchesDomain('badexample.com', 'example.com')).toBe(false);
    expect(hostMatchesDomain('example.com.evil.net', 'example.com')).toBe(false);
  });

  it('builds permission patterns', () => {
    expect(originPatternsFor('www.example.com')).toEqual([
      '*://example.com/*',
      '*://*.example.com/*',
    ]);
    expect(originPatternsFor('127.0.0.1')).toEqual(['*://127.0.0.1/*']);
  });

  it('parses hosts back from patterns', () => {
    expect(hostFromPattern('*://example.com/*')).toBe('example.com');
    expect(hostFromPattern('https://example.com/*')).toBe('example.com');
    expect(hostFromPattern('*://*.example.com/*')).toBeNull();
    expect(hostFromPattern('https://*/*')).toBeNull();
  });

  it('approximates sites', () => {
    expect(approximateSite('cdn.example.com')).toBe('example.com');
    expect(approximateSite('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(isSameSite('static.example.com', 'example.com')).toBe(true);
    expect(isSameSite('doubleclick.net', 'example.com')).toBe(false);
  });
});

describe('describeUrl', () => {
  it('supports http and https pages', () => {
    expect(describeUrl('https://www.example.com/a?b=c')).toEqual({
      supported: true,
      hostname: 'example.com',
      reason: null,
    });
  });
  it.each([
    'chrome://settings',
    'brave://settings',
    'file:///C:/x.html',
    'about:blank',
    'chrome-extension://abc/popup.html',
  ])('rejects %s', (url) => expect(describeUrl(url).supported).toBe(false));
  it('rejects the extension store and missing URLs', () => {
    expect(describeUrl('https://chromewebstore.google.com/detail/x').supported).toBe(false);
    expect(describeUrl(undefined).supported).toBe(false);
    expect(describeUrl('not a url').supported).toBe(false);
  });
});
