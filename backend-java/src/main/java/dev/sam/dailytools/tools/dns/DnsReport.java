package dev.sam.dailytools.tools.dns;

import java.util.List;

public record DnsReport(
    String input,
    DnsResolverChoice resolver,
    long elapsedMs,
    int queryCount,
    int respondedQueryCount,
    List<DnsQueryResult> queries) {
  public DnsReport {
    queries = List.copyOf(queries);
  }
}
