package dev.sam.dailytools.tools.dns;

import java.util.List;

public record DnsQueryResult(
    String queryName,
    String type,
    long elapsedMs,
    String rcode,
    DnsFlags flags,
    Error error,
    List<DnsRecord> answer,
    List<DnsRecord> authority,
    List<DnsRecord> additional) {
  public DnsQueryResult {
    answer = List.copyOf(answer);
    authority = List.copyOf(authority);
    additional = List.copyOf(additional);
  }

  public static DnsQueryResult transportError(String queryName, String type, long elapsedMs, String code, String message) {
    return new DnsQueryResult(queryName, type, elapsedMs, null, null, new Error(code, message), List.of(), List.of(), List.of());
  }

  public record Error(String code, String message) {}
}
