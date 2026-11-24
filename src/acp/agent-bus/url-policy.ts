// ─── Outbound URL policy for A2A calls ──────────────────────────────────────
// Agent Cards come from remote servers and name the RPC endpoint we call
// next, so every outbound URL is checked: http(s) only, an optional host
// allow-list, and no private / loopback / link-local / cloud-metadata
// addresses unless the host was explicitly allow-listed (SSRF).

import { promises as dns } from 'dns';
import * as net from 'net';

export interface UrlPolicy {
  /** Hosts that may be called. Empty = any public host. Allow-listed hosts may be private. */
  readonly allowedHosts: readonly string[];
}

export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) =>
  (await dns.lookup(host, { all: true })).map((a) => a.address);

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0
    || (a === 169 && b === 254)                 // link-local, cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);      // carrier-grade NAT
}

export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(bare)) return ipv4Private(bare);
  if (net.isIPv6(bare)) {
    if (bare === '::1' || bare === '::') return true;
    if (bare.startsWith('fe80:') || bare.startsWith('fc') || bare.startsWith('fd')) return true;
    const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? ipv4Private(mapped[1]) : false;
  }
  return false;
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((entry) => {
    const e = entry.trim().toLowerCase();
    return e.startsWith('*.') ? h.endsWith(e.slice(1)) : h === e;
  });
}

/**
 * Throws an Error (message suitable for users) when `rawUrl` may not be
 * fetched under `policy`. Resolves host names so a public-looking name that
 * points at a private address is refused too.
 */
export async function assertOutboundUrlAllowed(
  rawUrl: string,
  policy: UrlPolicy,
  resolve: HostResolver = defaultResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Refusing malformed URL: ${JSON.stringify(rawUrl)}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Refusing URL with protocol "${url.protocol}" (only http and https are allowed)`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (hostAllowed(host, policy.allowedHosts)) return url;

  const privateHint = 'add the host to agileagentcanvas.a2a.allowedHosts to allow it';
  if (host === 'localhost' || host.endsWith('.localhost') || (net.isIP(host) && isPrivateAddress(host))) {
    throw new Error(`Refusing to fetch private address ${host}; ${privateHint}`);
  }
  if (policy.allowedHosts.length > 0) {
    throw new Error(`Refusing ${host}: not in the A2A allowed hosts (agileagentcanvas.a2a.allowedHosts)`);
  }
  const addresses = net.isIP(host) ? [host] : await resolve(host).catch(() => [] as string[]);
  const blocked = addresses.find(isPrivateAddress);
  if (blocked) {
    throw new Error(`Refusing to fetch private address ${blocked} (${host}); ${privateHint}`);
  }
  return url;
}
