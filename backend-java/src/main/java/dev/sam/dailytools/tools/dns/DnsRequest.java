package dev.sam.dailytools.tools.dns;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;
public record DnsRequest(
    @NotBlank @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "domain must be a hostname") String domain,
    List<String> types) {}
