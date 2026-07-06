package dev.sam.dailytools.tools.dns;
import java.util.List;
import java.util.Map;
public record DnsRecords(String domain, Map<String, List<String>> records) {}
