package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WhoisServiceTest {
  @Test
  void normalizes_case_and_idn_then_queries_only_the_discovered_authority_path() {
    RecordingClient client = clientWith("https://authority.example/rdap/", new RdapHttpResponse(200, fixture("domain-example.json")));
    WhoisService service = service(client);

    assertThat(service.lookup("Example.COM").domain()).isEqualTo("example.com");
    assertThat(client.requests()).containsExactly(
        RdapBootstrapResolver.IANA_DNS_BOOTSTRAP,
        URI.create("https://authority.example/rdap/domain/example.com"));

    client.clearRequests();
    service.lookup("bücher.com");
    assertThat(client.requests()).containsExactly(URI.create("https://authority.example/rdap/domain/xn--bcher-kva.com"));
  }

  @Test
  void rejects_non_domain_input_without_any_external_request() {
    for (String input : new String[] {" https://example.com", "https://example.com", "192.0.2.1", "localhost", "example..com"}) {
      RecordingClient client = clientWith("https://authority.example/rdap/", new RdapHttpResponse(200, fixture("domain-example.json")));

      assertThatThrownBy(() -> service(client).lookup(input))
          .isInstanceOfSatisfying(ToolException.class, error -> assertThat(error.getCode()).isEqualTo("VALIDATION_ERROR"));
      assertThat(client.requests()).isEmpty();
    }
  }

  @Test
  void maps_an_authoritative_404_to_a_successful_not_found_report() {
    RecordingClient client = clientWith("https://authority.example/rdap/", new RdapHttpResponse(404, "not found"));

    RdapReport report = service(client).lookup("missing.com");

    assertThat(report.found()).isFalse();
    assertThat(report.domain()).isEqualTo("missing.com");
    assertThat(report.rawJson()).isNull();
    assertThat(report.statuses()).isEmpty();
  }

  @Test
  void collapses_non_404_upstream_failures_without_leaking_the_remote_body() {
    RecordingClient client = clientWith("https://authority.example/rdap/", new RdapHttpResponse(500, "database password=secret"));

    assertThatThrownBy(() -> service(client).lookup("example.com"))
        .isInstanceOfSatisfying(ToolException.class, error -> {
          assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED");
          assertThat(error.getMessage()).doesNotContain("password").doesNotContain("secret");
        });
  }

  private static WhoisService service(RecordingClient client) {
    return new WhoisService(new RdapBootstrapResolver(client, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC)), client);
  }

  private static RecordingClient clientWith(String baseUrl, RdapHttpResponse domainResponse) {
    String bootstrap = "{\"services\":[[[\"com\"],[\"" + baseUrl + "\"]]]}";
    RecordingClient client = new RecordingClient();
    client.responses.put(RdapBootstrapResolver.IANA_DNS_BOOTSTRAP, new RdapHttpResponse(200, bootstrap));
    client.defaultResponse = domainResponse;
    return client;
  }

  private static String fixture(String name) {
    try (var input = WhoisServiceTest.class.getResourceAsStream("/whois/" + name)) {
      assertThat(input).isNotNull();
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    } catch (Exception error) {
      throw new AssertionError(error);
    }
  }

  private static final class RecordingClient implements RdapHttpClient {
    private final Map<URI, RdapHttpResponse> responses = new LinkedHashMap<>();
    private final java.util.List<URI> requests = new java.util.ArrayList<>();
    private RdapHttpResponse defaultResponse;

    @Override public RdapHttpResponse get(URI uri) {
      requests.add(uri);
      return responses.getOrDefault(uri, defaultResponse);
    }
    java.util.List<URI> requests() { return requests; }
    void clearRequests() { requests.clear(); }
  }
}
