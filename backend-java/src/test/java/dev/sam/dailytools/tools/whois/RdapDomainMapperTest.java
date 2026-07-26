package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RdapDomainMapperTest {
  private final RdapDomainMapper mapper = new RdapDomainMapper();

  @Test
  void maps_public_domain_registration_fields_without_transforming_the_raw_json() {
    String raw = fixture("domain-example.json");

    RdapReport report = mapper.map("Example.COM", "example.com", URI.create("https://rdap.example/domain/example.com"), raw);

    assertThat(report.input()).isEqualTo("Example.COM");
    assertThat(report.domain()).isEqualTo("example.com");
    assertThat(report.found()).isTrue();
    assertThat(report.ldhName()).isEqualTo("example.com");
    assertThat(report.handle()).isEqualTo("2336799_DOMAIN_COM-VRSN");
    assertThat(report.statuses()).containsExactly("client delete prohibited", "client transfer prohibited");
    assertThat(report.events()).extracting(RdapReport.Event::action).containsExactly("registration", "expiration");
    assertThat(report.events().get(1).actor()).isEqualTo("Example Registrar");
    assertThat(report.registrar().name()).isEqualTo("Example Registrar");
    assertThat(report.registrar().handle()).isEqualTo("376");
    assertThat(report.nameservers()).singleElement().satisfies(nameserver -> {
      assertThat(nameserver.ldhName()).isEqualTo("a.iana-servers.net");
      assertThat(nameserver.statuses()).containsExactly("associated");
    });
    assertThat(report.notices()).singleElement().satisfies(notice -> {
      assertThat(notice.title()).isEqualTo("Terms of Service");
      assertThat(notice.description()).containsExactly("First line", "Second line");
    });
    assertThat(report.rawJson()).isSameAs(raw);
  }

  @Test
  void maps_absent_or_redacted_optional_fields_to_null_or_empty_values() {
    RdapReport report = mapper.map("example.com", "example.com", URI.create("https://rdap.example/domain/example.com"),
        "{\"objectClassName\":\"domain\",\"ldhName\":\"example.com\"}");

    assertThat(report.unicodeName()).isNull();
    assertThat(report.handle()).isNull();
    assertThat(report.statuses()).isEmpty();
    assertThat(report.events()).isEmpty();
    assertThat(report.registrar()).isNull();
    assertThat(report.nameservers()).isEmpty();
    assertThat(report.notices()).isEmpty();
  }

  @Test
  void turns_malformed_rdap_json_into_a_safe_lookup_failure() {
    assertThatThrownBy(() -> mapper.map("example.com", "example.com", URI.create("https://rdap.example/domain/example.com"), "not json"))
        .isInstanceOfSatisfying(ToolException.class, error -> assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED"));
  }

  @Test
  void rejects_an_object_that_is_not_an_rdap_domain_response() {
    assertThatThrownBy(() -> mapper.map("example.com", "example.com", URI.create("https://rdap.example/domain/example.com"), "{}"))
        .isInstanceOfSatisfying(ToolException.class, error -> assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED"));
  }

  private static String fixture(String name) {
    try (var input = RdapDomainMapperTest.class.getResourceAsStream("/whois/" + name)) {
      assertThat(input).isNotNull();
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    } catch (Exception error) {
      throw new AssertionError(error);
    }
  }
}
