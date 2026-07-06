package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ApiEnvelope;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/java/dns")
public class DnsController {
  private final DnsService service;
  public DnsController(DnsService service) { this.service = service; }

  @PostMapping
  public ApiEnvelope<DnsRecords> lookup(@Valid @RequestBody DnsRequest req) {
    return ApiEnvelope.ok(service.resolve(req.domain(), req.types()));
  }
}
