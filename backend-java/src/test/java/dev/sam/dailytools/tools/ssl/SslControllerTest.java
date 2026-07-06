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
  void returns_cert_info_envelope() throws Exception {
    when(service.inspect("example.com", 443)).thenReturn(
        new SslCertInfo("CN=example.com", "CN=CA", "2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z",
            false, 1000, List.of("example.com"), "123"));
    mvc.perform(post("/api/java/ssl").contentType("application/json").content("{\"host\":\"example.com\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(true))
       .andExpect(jsonPath("$.data.subject").value("CN=example.com"))
       .andExpect(jsonPath("$.data.expired").value(false));
  }

  @Test
  void handshake_failure_becomes_fail_envelope() throws Exception {
    when(service.inspect("nope.invalid", 443)).thenThrow(new ToolException("SSL_HANDSHAKE_FAILED", "no"));
    mvc.perform(post("/api/java/ssl").contentType("application/json").content("{\"host\":\"nope.invalid\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(false))
       .andExpect(jsonPath("$.error.code").value("SSL_HANDSHAKE_FAILED"));
  }
}
