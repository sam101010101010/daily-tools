package dev.sam.dailytools.tools.dns;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
public record DnsRequest(@NotBlank String domain, List<String> types) {}
