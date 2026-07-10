package dev.sam.dailytools.tools.ssl;

import jakarta.validation.constraints.NotBlank;

public record SslRequest(@NotBlank String host, Integer port, String startTls) {
  public int portOrDefault() {
    return port == null ? 443 : port;
  }

  public String startTlsOrDefault() {
    return startTls == null || startTls.isBlank() ? "none" : startTls;
  }
}
