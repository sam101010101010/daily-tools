package dev.sam.dailytools.tools.dns;

import com.fasterxml.jackson.annotation.JsonValue;
import dev.sam.dailytools.common.ToolException;

import java.util.Locale;

public enum DnsResolverChoice {
  SYSTEM,
  CLOUDFLARE;

  public static DnsResolverChoice defaultFor(DnsResolverChoice resolver) {
    return resolver == null ? SYSTEM : resolver;
  }

  public static DnsResolverChoice fromRequest(String value) {
    if (value == null) {
      return SYSTEM;
    }
    return switch (value.toLowerCase(Locale.ROOT)) {
      case "system" -> SYSTEM;
      case "cloudflare" -> CLOUDFLARE;
      default -> throw new ToolException("VALIDATION_ERROR", "resolver must be system or cloudflare");
    };
  }

  @JsonValue
  public String value() {
    return name().toLowerCase(Locale.ROOT);
  }
}
