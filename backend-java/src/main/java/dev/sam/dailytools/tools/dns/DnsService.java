package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class DnsService {
  public static final List<String> DEFAULT_TYPES = List.of("A", "AAAA", "MX", "TXT", "CNAME");
  private final DnsWireClient query;

  public DnsService(DnsWireClient query) { this.query = query; }

  public DnsRecords resolve(String domain, List<String> types) {
    List<String> want = (types == null || types.isEmpty()) ? DEFAULT_TYPES : types;
    Map<String, List<String>> out = new LinkedHashMap<>();
    for (String type : want) {
      List<String> vals = query.query(domain, type, DnsResolverChoice.SYSTEM).answer().stream()
          .map(DnsRecord::value)
          .toList();
      if (vals != null && !vals.isEmpty()) out.put(type, vals);
    }
    if (out.isEmpty()) throw new ToolException("DNS_LOOKUP_FAILED", "无解析记录：" + domain);
    return new DnsRecords(domain, out);
  }
}
