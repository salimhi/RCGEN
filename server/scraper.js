import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import { URL } from 'url';

/**
 * Checks if an IPv4 or IPv6 address is in a private, loopback, link-local, or cloud metadata range.
 */
function isPrivateOrReservedIP(ip) {
  // IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv4 checks
  if (ip.includes('.')) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b, c, d] = parts;

    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 100.64.0.0/10 (Carrier grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 169.254.0.0/16 (Link-local & AWS metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmark testing)
    if (a === 198 && b >= 18 && b <= 19) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (a >= 240) return true;
    // 255.255.255.255 (Broadcast)
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;

    return false;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
  // Unspecified ::
  if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
  // Unique local fc00::/7 (fc00... or fd00...)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
  // Link-local fe80::/10 (fe80... to febf...)
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;

  return false;
}

/**
 * Validates a target URL against SSRF rules.
 * Resolves hostname and verifies that all resolved IPs are public.
 */
async function validateUrlForSsrf(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are allowed');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new Error('Missing hostname');
  }

  // Literal IP address check or DNS resolution
  let addresses = [];
  try {
    const lookup = await dns.lookup(hostname, { all: true });
    addresses = lookup.map((item) => item.address);
  } catch (err) {
    throw new Error(`DNS resolution failed for hostname "${hostname}": ${err.message}`);
  }

  if (addresses.length === 0) {
    throw new Error(`No IP addresses found for hostname "${hostname}"`);
  }

  for (const addr of addresses) {
    if (isPrivateOrReservedIP(addr)) {
      throw new Error(`Access to private, loopback, or metadata address (${addr}) is blocked`);
    }
  }

  return { parsed, addresses };
}

/**
 * Safely fetches an article HTML with SSRF protection, size limit, timeout, and redirect controls.
 */
export async function safeFetchArticleHtml(targetUrl, maxRedirects = 3) {
  let currentUrl = targetUrl.trim();
  if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
    currentUrl = `https://${currentUrl}`;
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const { parsed } = await validateUrlForSsrf(currentUrl);

    const client = parsed.protocol === 'https:' ? https : http;

    const res = await new Promise((resolve, reject) => {
      const req = client.get(
        parsed,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; RCBot/3.0; +https://example.com)',
            'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
          },
          timeout: 8000
        },
        (response) => resolve(response)
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out after 8 seconds'));
      });

      req.on('error', (err) => reject(err));
    });

    // Check for redirect (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      const redirectLocation = res.headers.location;
      if (!redirectLocation) {
        throw new Error(`Redirect with status ${res.statusCode} missing Location header`);
      }
      currentUrl = new URL(redirectLocation, currentUrl).toString();
      continue;
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Server returned HTTP ${res.statusCode}`);
    }

    const contentType = (res.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type "${contentType}". Only text/html is accepted.`);
    }

    // Read response with 2 MB limit
    const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
    let totalBytes = 0;
    const chunks = [];

    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BYTES) {
          res.destroy();
          reject(new Error('Article response exceeded maximum size limit of 2 MB'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => resolve());
      res.on('error', (err) => reject(err));
    });

    const body = Buffer.concat(chunks).toString('utf-8');
    return { html: body, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects (exceeded limit of 3)');
}

