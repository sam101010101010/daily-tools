package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ApiEnvelope;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/java/dns")
public class DnsController {
  private final DnsService service;

  public DnsController(DnsService service) {
    this.service = service;
  }

  @PostMapping
  public ApiEnvelope<DnsReport> lookup(@Valid @RequestBody DnsRequest request) {
    DnsResolverChoice resolver = DnsResolverChoice.fromRequest(request.resolver());
    return ApiEnvelope.ok(service.resolve(request.domain(), resolver));
  }
}
