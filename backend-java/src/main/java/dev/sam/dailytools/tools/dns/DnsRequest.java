package dev.sam.dailytools.tools.dns;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record DnsRequest(
    @NotBlank @Pattern(regexp = "^[A-Za-z0-9._:-]+$", message = "domain must be a hostname or IP address") String domain,
    @Pattern(regexp = "^(system|cloudflare)$", message = "resolver must be system or cloudflare") String resolver) {}
