package dev.sam.dailytools.tools.ssl;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link TrustEvaluator}'s bystander trust check, offline: valid self-signed,
 * expired self-signed, and a leaf whose issuer is neither presented nor trusted. All exercise the
 * {@code trusted=false} branches — a genuinely-trusted chain is verified only in the T10 smoke to
 * keep unit tests off the network.
 */
class TrustEvaluatorTest {

  private static X509Certificate load(String name) throws Exception {
    try (InputStream in = TrustEvaluatorTest.class.getResourceAsStream("/ssl/" + name)) {
      return (X509Certificate)
          CertificateFactory.getInstance("X.509").generateCertificate(in);
    }
  }

  private static X509Certificate[] chain(String name) throws Exception {
    return new X509Certificate[] {load(name)};
  }

  @Test
  void self_signed_cert_is_untrusted_and_flagged_self_signed() throws Exception {
    TrustEvaluator.Trust t = TrustEvaluator.evaluate(chain("rsa-multi-san.pem"));
    assertThat(t.trusted()).isFalse();
    assertThat(t.selfSigned()).isTrue();
    assertThat(t.expired()).isFalse();
    assertThat(t.trustError()).isNotBlank();
  }

  @Test
  void expired_cert_is_untrusted_and_flagged_expired() throws Exception {
    TrustEvaluator.Trust t = TrustEvaluator.evaluate(chain("expired.pem"));
    assertThat(t.trusted()).isFalse();
    assertThat(t.expired()).isTrue();
    assertThat(t.daysUntilExpiry()).isLessThanOrEqualTo(0L);
    assertThat(t.trustError()).contains("过期");
  }

  @Test
  void leaf_with_missing_untrusted_issuer_reports_chain_error() throws Exception {
    TrustEvaluator.Trust t = TrustEvaluator.evaluate(chain("leaf-only.pem"));
    assertThat(t.trusted()).isFalse();
    assertThat(t.selfSigned()).isFalse();
    assertThat(t.expired()).isFalse();
    assertThat(t.trustError()).contains("链");
  }
}
