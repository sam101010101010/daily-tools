package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ApiEnvelope;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/java/ssl")
public class SslController {
  private final SslService service;
  public SslController(SslService service) { this.service = service; }

  @PostMapping
  public ApiEnvelope<SslReport> check(@Valid @RequestBody SslRequest req) {
    return ApiEnvelope.ok(service.inspect(req.host(), req.portOrDefault(), req.startTlsOrDefault()));
  }
}
