package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RdapBootstrapResolverTest {

  @Test
  void chooses_the_longest_matching_tld_from_the_iana_bootstrap() {
    FakeHttpClient client = new FakeHttpClient(fixture("iana-dns-bootstrap.json"));
    RdapBootstrapResolver resolver = new RdapBootstrapResolver(client, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));

    assertThat(resolver.baseUrlFor("example.com"))
        .isEqualTo(URI.create("https://rdap.com.example/rdap/"));
    assertThat(resolver.baseUrlFor("www.example.co.uk"))
        .isEqualTo(URI.create("https://rdap.couk.example/rdap/"));
    assertThat(client.requests).containsExactly(RdapBootstrapResolver.IANA_DNS_BOOTSTRAP);
  }

  @Test
  void caches_only_the_bootstrap_for_twenty_four_hours() {
    FakeHttpClient client = new FakeHttpClient(fixture("iana-dns-bootstrap.json"));
    MutableClock clock = new MutableClock(Instant.parse("2026-07-24T00:00:00Z"));
    RdapBootstrapResolver resolver = new RdapBootstrapResolver(client, clock);

    resolver.baseUrlFor("example.com");
    resolver.baseUrlFor("www.example.co.uk");
    assertThat(client.requests).hasSize(1);

    clock.advance(Duration.ofHours(24));
    resolver.baseUrlFor("example.com");
    assertThat(client.requests).hasSize(2);
  }

  @Test
  void turns_malformed_bootstrap_empty_services_and_unknown_tlds_into_safe_lookup_failures() {
    assertLookupFailure("not json", "example.com");
    assertLookupFailure("{\"services\":[[[],[]]]}", "example.com");
    assertLookupFailure(fixture("iana-dns-bootstrap.json"), "example.invalid");
  }

  @Test
  void rejects_unsafe_authority_urls_before_returning_them() {
    for (String unsafeUrl : List.of(
        "http://rdap.example/",
        "https://user@rdap.example/",
        "https://rdap.example:8443/",
        "https://192.0.2.10/",
        "https://rdap.example/rdap?override=true",
        "https://rdap.example/rdap#fragment")) {
      assertLookupFailure(bootstrapFor(unsafeUrl), "example.com");
    }
  }

  private static void assertLookupFailure(String bootstrap, String domain) {
    RdapBootstrapResolver resolver = new RdapBootstrapResolver(
        new FakeHttpClient(bootstrap), Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));

    assertThatThrownBy(() -> resolver.baseUrlFor(domain))
        .isInstanceOfSatisfying(ToolException.class,
            error -> assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED"));
  }

  private static String bootstrapFor(String url) {
    return "{\"services\":[[[\"com\"],[\"" + url + "\"]]]}";
  }

  private static String fixture(String name) {
    try (var input = RdapBootstrapResolverTest.class.getResourceAsStream("/whois/" + name)) {
      assertThat(input).isNotNull();
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    } catch (Exception error) {
      throw new AssertionError(error);
    }
  }

  private static final class FakeHttpClient implements RdapHttpClient {
    private final String body;
    private final List<URI> requests = new ArrayList<>();

    private FakeHttpClient(String body) {
      this.body = body;
    }

    @Override
    public RdapHttpResponse get(URI uri) {
      requests.add(uri);
      return new RdapHttpResponse(200, body);
    }
  }

  private static final class MutableClock extends Clock {
    private Instant instant;

    private MutableClock(Instant instant) {
      this.instant = instant;
    }

    void advance(Duration duration) {
      instant = instant.plus(duration);
    }

    @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(java.time.ZoneId zone) { return this; }
    @Override public Instant instant() { return instant; }
  }
}
