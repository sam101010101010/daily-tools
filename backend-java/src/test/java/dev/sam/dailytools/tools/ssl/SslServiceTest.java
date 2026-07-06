package dev.sam.dailytools.tools.ssl;

import org.junit.jupiter.api.Test;
import javax.security.auth.x500.X500Principal;
import java.math.BigInteger;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SslServiceTest {
  @Test
  void describe_maps_cert_fields_and_flags_expiry() throws Exception {
    X509Certificate cert = mock(X509Certificate.class);
    when(cert.getSubjectX500Principal()).thenReturn(new X500Principal("CN=example.com"));
    when(cert.getIssuerX500Principal()).thenReturn(new X500Principal("CN=Test CA"));
    Date notAfter = new Date(System.currentTimeMillis() + 10L * 86400_000L);
    when(cert.getNotBefore()).thenReturn(new Date(0));
    when(cert.getNotAfter()).thenReturn(notAfter);
    when(cert.getSerialNumber()).thenReturn(new BigInteger("123"));
    when(cert.getSubjectAlternativeNames()).thenReturn(List.of(List.of(2, "example.com"), List.of(2, "www.example.com")));

    SslCertInfo info = new SslService().describe(cert);

    assertThat(info.subject()).contains("example.com");
    assertThat(info.issuer()).contains("Test CA");
    assertThat(info.expired()).isFalse();
    assertThat(info.daysUntilExpiry()).isBetween(9L, 10L);
    assertThat(info.sans()).containsExactly("example.com", "www.example.com");
    assertThat(info.serialNumber()).isEqualTo("123");
  }
}
