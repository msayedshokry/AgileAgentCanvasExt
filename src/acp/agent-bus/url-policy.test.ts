import { describe, it, expect } from 'vitest';
import { assertOutboundUrlAllowed, isPrivateAddress } from './url-policy';

const resolveTo = (...ips: string[]) => async () => ips;

describe('isPrivateAddress', () => {
  it.each(['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1'])(
    '%s is private', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '172.32.0.1', '2606:4700::1111'])('%s is public', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('assertOutboundUrlAllowed', () => {
  it('allows a public host when no allow-list is configured', async () => {
    await expect(assertOutboundUrlAllowed('https://agents.example.com/card.json', { allowedHosts: [] }, resolveTo('93.184.216.34')))
      .resolves.toBeInstanceOf(URL);
  });

  it('refuses a public-looking name that resolves to a private address (DNS rebinding)', async () => {
    await expect(assertOutboundUrlAllowed('https://rebind.example.com/', { allowedHosts: [] }, resolveTo('169.254.169.254')))
      .rejects.toThrow(/private address 169\.254\.169\.254/);
  });

  it('allow-listed hosts (including wildcards and private ones) are permitted', async () => {
    await expect(assertOutboundUrlAllowed('http://localhost:8080/rpc', { allowedHosts: ['localhost'] })).resolves.toBeInstanceOf(URL);
    await expect(assertOutboundUrlAllowed('https://a.agents.dev/x', { allowedHosts: ['*.agents.dev'] })).resolves.toBeInstanceOf(URL);
  });

  it('refuses hosts outside a configured allow-list', async () => {
    await expect(assertOutboundUrlAllowed('https://evil.example.org/', { allowedHosts: ['*.agents.dev'] }))
      .rejects.toThrow(/not in the A2A allowed hosts/);
  });

  it('refuses non-http protocols, IPv6 loopback and malformed URLs', async () => {
    await expect(assertOutboundUrlAllowed('ftp://example.com/', { allowedHosts: [] })).rejects.toThrow(/protocol/);
    await expect(assertOutboundUrlAllowed('https://[::1]/', { allowedHosts: [] })).rejects.toThrow(/private/);
    await expect(assertOutboundUrlAllowed('nope', { allowedHosts: [] })).rejects.toThrow(/malformed/);
  });
});
