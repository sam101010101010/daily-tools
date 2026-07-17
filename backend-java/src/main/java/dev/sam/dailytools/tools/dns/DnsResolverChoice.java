package dev.sam.dailytools.tools.dns;

public enum DnsResolverChoice {
  SYSTEM,
  CLOUDFLARE;

  public static DnsResolverChoice defaultFor(DnsResolverChoice resolver) {
    return resolver == null ? SYSTEM : resolver;
  }
}
