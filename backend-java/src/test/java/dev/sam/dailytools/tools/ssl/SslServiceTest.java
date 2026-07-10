package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import java.net.InetAddress;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SSRF-guard contract and input validation for {@link SslService#inspect}. These all reject before
 * any network I/O, so they stay offline. The real full-chain / verdict positive path is exercised
 * only in the T10 docker-compose smoke to keep unit tests off the network.
 */
class SslServiceTest {

  private static void expectValidationError(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
    assertThatThrownBy(call)
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
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
    expectValidationError(() -> new SslService().inspect("169.254.169.254", 443, "none"));
  }

  @Test
  void inspect_rejects_port_out_of_range() {
    expectValidationError(() -> new SslService().inspect("example.com", 0, "none"));
    expectValidationError(() -> new SslService().inspect("example.com", 70000, "none"));
  }

  @Test
  void inspect_rejects_unknown_starttls() {
    expectValidationError(() -> new SslService().inspect("example.com", 443, "ftp"));
  }
}
