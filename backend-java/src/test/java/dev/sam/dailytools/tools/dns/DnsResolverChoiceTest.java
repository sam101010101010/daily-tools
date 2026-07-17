package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DnsResolverChoiceTest {
  @Test
  void accepts_only_lowercase_public_request_values() {
    assertThat(DnsResolverChoice.fromRequest("system")).isEqualTo(DnsResolverChoice.SYSTEM);
    assertThat(DnsResolverChoice.fromRequest("cloudflare")).isEqualTo(DnsResolverChoice.CLOUDFLARE);
    assertThat(DnsResolverChoice.fromRequest(null)).isEqualTo(DnsResolverChoice.SYSTEM);
    assertThatThrownBy(() -> DnsResolverChoice.fromRequest("SYSTEM"))
        .isInstanceOf(ToolException.class)
        .satisfies(error -> assertThat(((ToolException) error).getCode()).isEqualTo("VALIDATION_ERROR"));
  }
}
