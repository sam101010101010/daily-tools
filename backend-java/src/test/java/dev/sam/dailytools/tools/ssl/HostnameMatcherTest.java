package dev.sam.dailytools.tools.ssl;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link HostnameMatcher} (RFC6125-style), driven by fixed offline certs:
 * {@code rsa-multi-san.pem} (SAN example.com/www/api), {@code wildcard.pem} (SAN *.example.com
 * only), {@code no-san.pem} (CN nosan.example.com, no SAN extension).
 */
class HostnameMatcherTest {

  private static X509Certificate load(String name) throws Exception {
    try (InputStream in = HostnameMatcherTest.class.getResourceAsStream("/ssl/" + name)) {
      return (X509Certificate)
          CertificateFactory.getInstance("X.509").generateCertificate(in);
    }
  }

  @Test
  void exact_match_is_case_insensitive() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("EXAMPLE.COM", load("rsa-multi-san.pem"));
    assertThat(m.match()).isTrue();
    assertThat(m.matchedName()).isEqualTo("example.com");
  }

  @Test
  void multi_san_returns_the_matched_entry() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("www.example.com", load("rsa-multi-san.pem"));
    assertThat(m.match()).isTrue();
    assertThat(m.matchedName()).isEqualTo("www.example.com");
  }

  @Test
  void wildcard_matches_exactly_one_left_label() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("a.example.com", load("wildcard.pem"));
    assertThat(m.match()).isTrue();
    assertThat(m.matchedName()).isEqualTo("*.example.com");
  }

  @Test
  void wildcard_does_not_match_bare_apex() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("example.com", load("wildcard.pem"));
    assertThat(m.match()).isFalse();
    assertThat(m.matchedName()).isNull();
  }

  @Test
  void wildcard_does_not_match_multiple_labels() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("a.b.example.com", load("wildcard.pem"));
    assertThat(m.match()).isFalse();
    assertThat(m.matchedName()).isNull();
  }

  @Test
  void falls_back_to_cn_when_no_san_present() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("nosan.example.com", load("no-san.pem"));
    assertThat(m.match()).isTrue();
    assertThat(m.matchedName()).isEqualTo("nosan.example.com");
  }

  @Test
  void no_match_returns_false_and_null_name() throws Exception {
    HostnameMatcher.Match m = HostnameMatcher.matches("other.org", load("rsa-multi-san.pem"));
    assertThat(m.match()).isFalse();
    assertThat(m.matchedName()).isNull();
  }
}
