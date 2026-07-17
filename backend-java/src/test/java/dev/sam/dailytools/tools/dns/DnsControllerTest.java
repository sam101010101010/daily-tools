package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.GlobalExceptionHandler;
import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DnsController.class)
@Import(GlobalExceptionHandler.class)
class DnsControllerTest {
  @Autowired MockMvc mvc;
  @MockBean DnsService service;

  @Test
  void omitted_resolver_defaults_to_system_in_report_and_service_call() throws Exception {
    when(service.resolve(eq("example.com"), eq(DnsResolverChoice.SYSTEM))).thenReturn(report("NOERROR"));

    mvc.perform(post("/api/java/dns").contentType("application/json").content("{\"domain\":\"example.com\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true))
        .andExpect(jsonPath("$.data.resolver").value("system"))
        .andExpect(jsonPath("$.data.queries[0].answer").isArray())
        .andExpect(jsonPath("$.data.queries[0].authority").isArray())
        .andExpect(jsonPath("$.data.queries[0].additional").isArray());

    verify(service).resolve("example.com", DnsResolverChoice.SYSTEM);
  }

  @Test
  void cloudflare_request_selects_the_closed_cloudflare_resolver() throws Exception {
    when(service.resolve(eq("example.com"), eq(DnsResolverChoice.CLOUDFLARE)))
        .thenReturn(report("NOERROR", DnsResolverChoice.CLOUDFLARE));

    mvc.perform(post("/api/java/dns").contentType("application/json")
            .content("{\"domain\":\"example.com\",\"resolver\":\"cloudflare\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true))
        .andExpect(jsonPath("$.data.resolver").value("cloudflare"));

    verify(service).resolve("example.com", DnsResolverChoice.CLOUDFLARE);
  }

  @Test
  void nxdomain_is_successful_diagnostic_data() throws Exception {
    when(service.resolve(eq("does-not-exist.example"), eq(DnsResolverChoice.SYSTEM))).thenReturn(report("NXDOMAIN"));

    mvc.perform(post("/api/java/dns").contentType("application/json")
            .content("{\"domain\":\"does-not-exist.example\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true))
        .andExpect(jsonPath("$.data.queries[0].rcode").value("NXDOMAIN"));
  }

  @Test
  void malformed_resolver_and_input_are_validation_errors() throws Exception {
    mvc.perform(post("/api/java/dns").contentType("application/json")
            .content("{\"domain\":\"example.com\",\"resolver\":\"8.8.8.8\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

    mvc.perform(post("/api/java/dns").contentType("application/json")
            .content("{\"domain\":\"ldap://attacker:1389/x\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
  }

  @Test
  void total_dns_failure_keeps_the_existing_error_envelope() throws Exception {
    when(service.resolve(eq("example.com"), eq(DnsResolverChoice.SYSTEM)))
        .thenThrow(new ToolException("DNS_LOOKUP_FAILED", "DNS query did not receive a response"));

    mvc.perform(post("/api/java/dns").contentType("application/json").content("{\"domain\":\"example.com\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("DNS_LOOKUP_FAILED"));
  }

  private static DnsReport report(String rcode) {
    return report(rcode, DnsResolverChoice.SYSTEM);
  }

  private static DnsReport report(String rcode, DnsResolverChoice resolver) {
    DnsQueryResult query = new DnsQueryResult("example.com.", "A", 1, rcode,
        new DnsFlags(false, false, true, true, false), null, List.of(), List.of(), List.of());
    return new DnsReport("example.com", resolver, 1, 1, 1, List.of(query));
  }
}
