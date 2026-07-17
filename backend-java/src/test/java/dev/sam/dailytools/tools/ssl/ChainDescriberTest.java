package dev.sam.dailytools.tools.ssl;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigInteger;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ChainDescriber}, driven by fixed offline certificates under
 * {@code src/test/resources/ssl/} (generated once with openssl). Oracles for fingerprint/serial
 * come from openssl / an independent BigInteger conversion — never from the code under test.
 */
class ChainDescriberTest {

  private static X509Certificate load(String name) throws Exception {
    try (InputStream in = ChainDescriberTest.class.getResourceAsStream("/ssl/" + name)) {
      return (X509Certificate)
          CertificateFactory.getInstance("X.509").generateCertificate(in);
    }
  }

  @Test
  void rsa_cert_parses_names_key_signature_fingerprint_serial_sans() throws Exception {
    CertDetail d = ChainDescriber.describe(load("rsa-multi-san.pem"));

    // RDN extraction (CN / O) from the DN, plus raw DN preserved
    assertThat(d.subjectCN()).isEqualTo("example.com");
    assertThat(d.subjectO()).isEqualTo("Example Org");
    assertThat(d.issuerCN()).isEqualTo("example.com");
    assertThat(d.issuerO()).isEqualTo("Example Org");
    assertThat(d.subjectDN()).contains("CN=example.com").contains("O=Example Org");
    assertThat(d.issuerDN()).contains("CN=example.com");

    // key
    assertThat(d.keyAlgorithm()).isEqualTo("RSA");
    assertThat(d.keySize()).isEqualTo(2048);

    // signature (SHA-256 → not weak)
    assertThat(d.signatureAlgorithm()).isEqualToIgnoringCase("SHA256withRSA");
    assertThat(d.weakSignature()).isFalse();

    // fingerprint (colon-separated uppercase hex; oracle from openssl)
    assertThat(d.sha256Fingerprint()).isEqualTo(
        "28:EF:11:BA:DF:59:7C:6B:68:65:82:B3:BB:3D:A1:70:C7:CF:C3:1E:A0:95:2D:34:BD:4D:9A:CA:7C:4D:73:59");

    // serial (decimal string, matching existing behaviour; oracle = hex→BigInteger)
    assertThat(d.serialNumber()).isEqualTo(
        new BigInteger("2FB83E9FCB4545C996097F9E67C7E4E0011A4740", 16).toString());

    // multiple SANs
    assertThat(d.sans()).containsExactly("example.com", "www.example.com", "api.example.com");

    // validity: far-future cert, not expired, ISO timestamps
    assertThat(d.expired()).isFalse();
    assertThat(d.daysUntilExpiry()).isGreaterThan(30_000L);
    assertThat(Instant.parse(d.notBefore())).isBefore(Instant.parse(d.notAfter()));
  }

  @Test
  void self_signed_cert_has_subject_equal_to_issuer() throws Exception {
    CertDetail d = ChainDescriber.describe(load("rsa-multi-san.pem"));
    assertThat(d.subjectDN()).isEqualTo(d.issuerDN());
  }

  @Test
  void sha1_signed_cert_is_flagged_weak() throws Exception {
    CertDetail d = ChainDescriber.describe(load("rsa-sha1.pem"));
    assertThat(d.signatureAlgorithm()).isEqualToIgnoringCase("SHA1withRSA");
    assertThat(d.weakSignature()).isTrue();
  }

  @Test
  void ec_cert_reports_ec_algorithm_and_field_size() throws Exception {
    CertDetail d = ChainDescriber.describe(load("ec-p256.pem"));
    assertThat(d.keyAlgorithm()).isEqualTo("EC");
    assertThat(d.keySize()).isEqualTo(256);
    assertThat(d.signatureAlgorithm()).isEqualToIgnoringCase("SHA256withECDSA");
    assertThat(d.weakSignature()).isFalse();
  }

  @Test
  void emits_stable_standard_pem_for_every_presented_chain_certificate() throws Exception {
    List<X509Certificate> presentedChain = List.of(load("leaf-only.pem"), load("rsa-multi-san.pem"));
    List<CertDetail> details = presentedChain.stream().map(ChainDescriber::describe).toList();

    assertThat(details).hasSize(2);
    for (int i = 0; i < presentedChain.size(); i++) {
      String pem = details.get(i).pem();
      assertThat(pem).startsWith("-----BEGIN CERTIFICATE-----\n")
          .endsWith("-----END CERTIFICATE-----\n");
      assertThat(pem.lines().skip(1).limit(pem.lines().count() - 2))
          .allSatisfy(line -> assertThat(line).hasSizeLessThanOrEqualTo(64));
      assertThat(pem.lines().skip(1).limit(pem.lines().count() - 2))
          .anySatisfy(line -> assertThat(line).hasSize(64));
      assertThat(reparse(pem).getEncoded()).isEqualTo(presentedChain.get(i).getEncoded());
    }

    assertThat(ChainDescriber.describe(presentedChain.getFirst()).pem())
        .isEqualTo(details.getFirst().pem());
  }

  private static X509Certificate reparse(String pem) throws Exception {
    String body = pem
        .replace("-----BEGIN CERTIFICATE-----\n", "")
        .replace("-----END CERTIFICATE-----\n", "")
        .replace("\n", "");
    try (ByteArrayInputStream in = new ByteArrayInputStream(Base64.getDecoder().decode(body))) {
      return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(in);
    }
  }
}
