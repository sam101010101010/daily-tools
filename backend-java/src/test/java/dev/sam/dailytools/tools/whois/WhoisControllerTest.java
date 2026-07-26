package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.GlobalExceptionHandler;
import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WhoisController.class)
@Import(GlobalExceptionHandler.class)
class WhoisControllerTest {
  @Autowired MockMvc mvc;
  @MockBean WhoisService service;

  @Test
  void found_report_uses_the_success_envelope_and_delegates_once() throws Exception {
    when(service.lookup("Example.COM")).thenReturn(foundReport());

    mvc.perform(post("/api/java/whois").contentType("application/json")
            .content("{\"domain\":\"Example.COM\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true))
        .andExpect(jsonPath("$.data.domain").value("example.com"))
        .andExpect(jsonPath("$.data.events").isArray())
        .andExpect(jsonPath("$.data.nameservers").isArray())
        .andExpect(jsonPath("$.data.notices").isArray())
        .andExpect(jsonPath("$.data.rawJson").value("{\"ldhName\":\"example.com\"}"));

    verify(service).lookup("Example.COM");
  }

  @Test
  void not_found_report_is_successful_diagnostic_data() throws Exception {
    when(service.lookup("missing.example")).thenReturn(notFoundReport());

    mvc.perform(post("/api/java/whois").contentType("application/json")
            .content("{\"domain\":\"missing.example\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(true))
        .andExpect(jsonPath("$.data.found").value(false));
  }

  @Test
  void blank_missing_and_url_shaped_input_are_validation_errors() throws Exception {
    mvc.perform(post("/api/java/whois").contentType("application/json").content("{\"domain\":\" \"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

    mvc.perform(post("/api/java/whois").contentType("application/json").content("{}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

    mvc.perform(post("/api/java/whois").contentType("application/json")
            .content("{\"domain\":\"https://example.com\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

    verifyNoInteractions(service);
  }

  @Test
  void rdap_lookup_failure_preserves_its_failure_code_in_the_envelope() throws Exception {
    when(service.lookup("example.com"))
        .thenThrow(new ToolException("RDAP_LOOKUP_FAILED", "RDAP lookup temporarily unavailable"));

    mvc.perform(post("/api/java/whois").contentType("application/json")
            .content("{\"domain\":\"example.com\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.error.code").value("RDAP_LOOKUP_FAILED"));
  }

  private static RdapReport foundReport() {
    return new RdapReport("Example.COM", "example.com", true, "https://rdap.example/domain/example.com",
        "example.com", null, "EXAMPLE", List.of("active"),
        List.of(new RdapReport.Event("registration", "2020-01-01T00:00:00Z", null)),
        new RdapReport.Registrar("Example Registrar", "REG-1"),
        List.of(new RdapReport.Nameserver("ns1.example.com", null, List.of("associated"))),
        List.of(new RdapReport.Notice("Terms", List.of("Example terms"))), "{\"ldhName\":\"example.com\"}");
  }

  private static RdapReport notFoundReport() {
    return new RdapReport("missing.example", "missing.example", false,
        "https://rdap.example/domain/missing.example", null, null, null, List.of(), List.of(), null,
        List.of(), List.of(), null);
  }
}
