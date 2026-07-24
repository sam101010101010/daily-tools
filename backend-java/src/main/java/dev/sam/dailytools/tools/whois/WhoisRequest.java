package dev.sam.dailytools.tools.whois;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record WhoisRequest(
    @NotBlank @Pattern(regexp = "^[^\\s/:]+$", message = "domain must be a hostname") String domain) {}
