package dev.sam.dailytools.tools.ssl;
import jakarta.validation.constraints.NotBlank;
public record SslRequest(@NotBlank String host, Integer port) {
  public int portOrDefault() { return port == null ? 443 : port; }
}
