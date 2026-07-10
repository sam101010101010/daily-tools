package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.GlobalExceptionHandler;
import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SslController.class)
@Import(GlobalExceptionHandler.class)
class SslControllerTest {
  @Autowired MockMvc mvc;
  @MockBean SslService service;

  @Test
  void returns_report_envelope() throws Exception {
    when(service.inspect("example.com", 443, "none")).thenReturn(
        new SslReport("example.com", 443, "none",
            new SslReport.Negotiated("TLSv1.3", "TLS_AES_256_GCM_SHA384"),
            List.of(),
            new SslReport.Validation(true, null, true, "example.com", false, false, 1000),
            List.of()));
    mvc.perform(post("/api/java/ssl").contentType("application/json").content("{\"host\":\"example.com\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(true))
       .andExpect(jsonPath("$.data.host").value("example.com"))
       .andExpect(jsonPath("$.data.validation.trusted").value(true));
  }

  @Test
  void handshake_failure_becomes_fail_envelope() throws Exception {
    when(service.inspect("nope.invalid", 443, "none")).thenThrow(new ToolException("SSL_HANDSHAKE_FAILED", "no"));
    mvc.perform(post("/api/java/ssl").contentType("application/json").content("{\"host\":\"nope.invalid\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(false))
       .andExpect(jsonPath("$.error.code").value("SSL_HANDSHAKE_FAILED"));
  }
}
