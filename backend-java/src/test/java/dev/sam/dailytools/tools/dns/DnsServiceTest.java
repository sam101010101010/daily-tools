package dev.sam.dailytools.tools.dns;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class DnsServiceTest {
  @Test
  void groups_records_by_requested_type() {
    DnsQuery fake = (domain, type) -> switch (type) {
      case "A" -> List.of("93.184.216.34");
      case "MX" -> List.of("10 mail.example.com");
      default -> List.of();
    };
    DnsService svc = new DnsService(fake);

    DnsRecords r = svc.resolve("example.com", List.of("A", "MX", "TXT"));

    assertThat(r.domain()).isEqualTo("example.com");
    assertThat(r.records().get("A")).containsExactly("93.184.216.34");
    assertThat(r.records().get("MX")).containsExactly("10 mail.example.com");
    assertThat(r.records()).doesNotContainKey("TXT"); // empty types omitted
  }
}
