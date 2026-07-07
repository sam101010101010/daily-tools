package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import javax.security.auth.x500.X500Principal;
import java.math.BigInteger;
import java.net.InetAddress;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

  @Test
  void isBlocked_true_for_internal_and_metadata_ranges() throws Exception {
    // loopback, IPv6 loopback, link-local incl. cloud metadata, private IPv4, any-local, IPv6 ULA
    for (String ip : List.of(
        "127.0.0.1", "::1", "169.254.169.254", "10.0.0.1",
        "172.16.0.1", "192.168.1.1", "0.0.0.0", "fc00::1")) {
      assertThat(SslService.isBlocked(InetAddress.getByName(ip)))
          .as("expected %s to be blocked", ip).isTrue();
    }
  }

  @Test
  void isBlocked_false_for_public_addresses() throws Exception {
    for (String ip : List.of("8.8.8.8", "93.184.216.34", "1.1.1.1")) {
      assertThat(SslService.isBlocked(InetAddress.getByName(ip)))
          .as("expected %s to be allowed", ip).isFalse();
    }
  }

  @Test
  void inspect_rejects_blocked_target_before_connecting() {
    assertThatThrownBy(() -> new SslService().inspect("169.254.169.254", 443))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }
}
