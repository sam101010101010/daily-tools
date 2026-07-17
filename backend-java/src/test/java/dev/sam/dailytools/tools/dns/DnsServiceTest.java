package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DnsServiceTest {
  @Test
  void groups_records_by_requested_type() {
    DnsWireClient fake = (domain, type, resolver) -> result(domain, type, switch (type) {
      case "A" -> List.of("93.184.216.34");
      case "MX" -> List.of("10 mail.example.com");
      default -> List.of();
    });
    DnsService svc = new DnsService(fake);

    DnsRecords r = svc.resolve("example.com", List.of("A", "MX", "TXT"));

    assertThat(r.domain()).isEqualTo("example.com");
    assertThat(r.records().get("A")).containsExactly("93.184.216.34");
    assertThat(r.records().get("MX")).containsExactly("10 mail.example.com");
    assertThat(r.records()).doesNotContainKey("TXT"); // empty types omitted
  }

  @Test
  void resolve_with_no_types_queries_default_types() {
    List<String> queriedTypes = new ArrayList<>();
    DnsWireClient fake = (domain, type, resolver) -> {
      queriedTypes.add(type);
      return result(domain, type, List.of("stub"));
    };
    DnsService svc = new DnsService(fake);

    svc.resolve("example.com", null);

    assertThat(queriedTypes).containsExactlyElementsOf(DnsService.DEFAULT_TYPES);
  }

  @Test
  void resolve_throws_dns_lookup_failed_when_all_requested_types_empty() {
    DnsWireClient fake = (domain, type, resolver) -> result(domain, type, List.of());
    DnsService svc = new DnsService(fake);

    assertThatThrownBy(() -> svc.resolve("example.com", List.of("A", "MX")))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("DNS_LOOKUP_FAILED"));
  }

  private static DnsQueryResult result(String domain, String type, List<String> values) {
    List<DnsRecord> answer = values.stream()
        .map(value -> new DnsRecord(domain, type, "IN", 60, value, Map.of()))
        .toList();
    return new DnsQueryResult(domain, type, 0, "NOERROR", new DnsFlags(false, false, true, true, false), null,
        answer, List.of(), List.of());
  }
}
