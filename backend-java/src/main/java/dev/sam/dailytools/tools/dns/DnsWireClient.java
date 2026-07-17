package dev.sam.dailytools.tools.dns;

public interface DnsWireClient {
  DnsQueryResult query(String qname, String type, DnsResolverChoice resolver);
}
