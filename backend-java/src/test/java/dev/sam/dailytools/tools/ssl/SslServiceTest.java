package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import java.net.InetAddress;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SslServiceTest {
  // Cert-field parsing (formerly SslService.describe) now lives in ChainDescriberTest, exercised
  // against real fixed certificates. This class keeps the SSRF-guard contract.

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
