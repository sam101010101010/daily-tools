package dev.sam.dailytools.tools.dns;

import java.util.Map;

public record DnsRecord(
    String name,
    String type,
    String recordClass,
    long ttl,
    String value,
    Map<String, String> fields) {
  public DnsRecord {
    fields = Map.copyOf(fields);
  }
}
