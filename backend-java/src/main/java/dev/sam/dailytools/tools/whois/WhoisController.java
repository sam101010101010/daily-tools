package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ApiEnvelope;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/java/whois")
public class WhoisController {
  private final WhoisService service;

  public WhoisController(WhoisService service) {
    this.service = service;
  }

  @PostMapping
  public ApiEnvelope<RdapReport> lookup(@Valid @RequestBody WhoisRequest request) {
    return ApiEnvelope.ok(service.lookup(request.domain()));
  }
}
