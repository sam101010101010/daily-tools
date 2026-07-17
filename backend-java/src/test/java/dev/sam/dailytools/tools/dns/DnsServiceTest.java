package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DnsServiceTest {
  @Test
  void hostname_queries_the_fixed_concrete_type_plan_without_any() {
    List<String> queriedTypes = Collections.synchronizedList(new ArrayList<>());
    DnsService service = new DnsService((name, type, resolver) -> {
      queriedTypes.add(type);
      return response(name, type, "NOERROR");
    });

    DnsReport report = service.resolve("example.com", DnsResolverChoice.CLOUDFLARE);

    assertThat(queriedTypes).containsExactlyInAnyOrder(
        "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA", "SRV", "DS", "DNSKEY", "RRSIG");
    assertThat(queriedTypes).doesNotContain("ANY");
    assertThat(report.queries()).extracting(DnsQueryResult::type).containsExactly(
        "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA", "SRV", "DS", "DNSKEY", "RRSIG");
    assertThat(report.resolver()).isEqualTo(DnsResolverChoice.CLOUDFLARE);
  }

  @Test
  void ipv4_literal_becomes_ptr_only_reverse_query() {
    List<String> names = Collections.synchronizedList(new ArrayList<>());
    List<String> types = Collections.synchronizedList(new ArrayList<>());
    DnsService service = new DnsService((name, type, resolver) -> {
      names.add(name);
      types.add(type);
      return response(name, type, "NOERROR");
    });

    DnsReport report = service.resolve("203.0.113.7", null);

    assertThat(names).containsExactly("7.113.0.203.in-addr.arpa.");
    assertThat(types).containsExactly("PTR");
    assertThat(report.queries()).singleElement().satisfies(query -> {
      assertThat(query.queryName()).isEqualTo("7.113.0.203.in-addr.arpa.");
      assertThat(query.type()).isEqualTo("PTR");
    });
  }

  @Test
  void ipv6_literal_becomes_nibble_reversed_ptr_query() {
    List<String> names = Collections.synchronizedList(new ArrayList<>());
    DnsService service = new DnsService((name, type, resolver) -> {
      names.add(name);
      return response(name, type, "NOERROR");
    });

    service.resolve("2001:db8::1", DnsResolverChoice.SYSTEM);

    assertThat(names).containsExactly("1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.");
  }

  @Test
  void omitted_resolver_defaults_to_system() {
    List<DnsResolverChoice> resolvers = Collections.synchronizedList(new ArrayList<>());
    DnsService service = new DnsService((name, type, resolver) -> {
      resolvers.add(resolver);
      return response(name, type, "NOERROR");
    });

    DnsReport report = service.resolve("example.com", null);

    assertThat(report.resolver()).isEqualTo(DnsResolverChoice.SYSTEM);
    assertThat(resolvers).containsOnly(DnsResolverChoice.SYSTEM);
  }

  @Test
  void nxdomain_and_empty_noerror_are_successful_diagnostic_results() {
    DnsService service = new DnsService((name, type, resolver) ->
        response(name, type, type.equals("A") ? "NXDOMAIN" : "NOERROR"));

    DnsReport report = service.resolve("example.com", DnsResolverChoice.SYSTEM);

    assertThat(report.respondedQueryCount()).isEqualTo(12);
    assertThat(report.queries()).allSatisfy(query -> {
      assertThat(query.error()).isNull();
      assertThat(query.answer()).isEmpty();
      assertThat(query.authority()).isEmpty();
      assertThat(query.additional()).isEmpty();
    });
    assertThat(report.queries()).first().extracting(DnsQueryResult::rcode).isEqualTo("NXDOMAIN");
  }

  @Test
  void all_transport_errors_fail_the_lookup() {
    DnsService service = new DnsService((name, type, resolver) ->
        DnsQueryResult.transportError(name, type, 1, "DNS_TIMEOUT", "timed out"));

    assertThatThrownBy(() -> service.resolve("example.com", DnsResolverChoice.SYSTEM))
        .isInstanceOf(ToolException.class)
        .satisfies(error -> assertThat(((ToolException) error).getCode()).isEqualTo("DNS_LOOKUP_FAILED"));
  }

  @Test
  void mixed_protocol_responses_and_transport_errors_keep_error_rows() {
    DnsService service = new DnsService((name, type, resolver) -> type.equals("A")
        ? response(name, type, "NOERROR")
        : DnsQueryResult.transportError(name, type, 1, "DNS_TIMEOUT", "timed out"));

    DnsReport report = service.resolve("example.com", DnsResolverChoice.SYSTEM);

    assertThat(report.respondedQueryCount()).isEqualTo(1);
    assertThat(report.queries()).filteredOn(query -> query.error() != null)
        .allSatisfy(query -> assertThat(query.error().code()).isEqualTo("DNS_TIMEOUT"));
  }

  @Test
  void malformed_input_is_a_validation_error() {
    DnsService service = new DnsService((name, type, resolver) -> response(name, type, "NOERROR"));

    assertThatThrownBy(() -> service.resolve("ldap://attacker", DnsResolverChoice.SYSTEM))
        .isInstanceOf(ToolException.class)
        .satisfies(error -> assertThat(((ToolException) error).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  private static DnsQueryResult response(String name, String type, String rcode) {
    return new DnsQueryResult(name, type, 1, rcode,
        new DnsFlags(false, false, true, true, false), null, List.of(), List.of(), List.of());
  }
}
