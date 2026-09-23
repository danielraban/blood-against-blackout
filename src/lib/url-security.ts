import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;

const resolveHost: ResolveHost = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export async function assertPublicHttpsUrl(
  raw: string,
  resolve: ResolveHost = resolveHost,
): Promise<URL> {
  if (raw.length > 2048) throw new Error("Feed URL is too long");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Feed URL is invalid");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Feed URL must be public HTTPS");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("Private feed hosts are not allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Private feed addresses are not allowed");
    }
    return url;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new Error("Feed host could not be resolved");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Feed host must resolve only to public addresses");
  }

  return url;
}

function ipv4MappedAddress(address: string) {
  const dotted = address.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (dotted) return dotted;

  const hex = address.match(/:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateAddress(address: string) {
  if (address.includes(":")) {
    const value = address.toLowerCase();
    const mappedV4 = ipv4MappedAddress(value);
    if (mappedV4) return isPrivateAddress(mappedV4);
    return (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      /^fe[89ab]/.test(value)
    );
  }

  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
