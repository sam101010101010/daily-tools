package dev.sam.dailytools.tools.crypto;

import dev.sam.dailytools.common.ApiEnvelope;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/java/crypto")
public class CryptoController {
  private final CryptoService service;

  public CryptoController(CryptoService service) {
    this.service = service;
  }

  @PostMapping
  public ApiEnvelope<CryptoResult> run(@RequestBody CryptoRequest req) {
    return ApiEnvelope.ok(service.transform(req));
  }
}
