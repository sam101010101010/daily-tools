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

  private static SslReport sampleReport() {
    return new SslReport("example.com", 443, "none",
        new SslReport.Negotiated("TLSv1.3", "TLS_AES_256_GCM_SHA384"),
        List.of(new ProtocolProber.ProtocolResult("TLSv1.2", true, false),
                new ProtocolProber.ProtocolResult("TLSv1.3", true, false)),
        new SslReport.Validation(true, null, true, "example.com", false, false, 1000),
        List.of(new CertDetail("example.com", "Example Org", "DigiCert", "DigiCert Inc",
            "CN=example.com,O=Example Org", "CN=DigiCert", "2020-01-01T00:00:00Z",
            "2030-01-01T00:00:00Z", false, 1000, "RSA", 2048, "SHA256withRSA", false,
            "AA:BB", "123", List.of("example.com"),
            "-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n")));
  }

  @Test
  void happy_path_returns_report_envelope_with_chain_and_validation() throws Exception {
    when(service.inspect("example.com", 443, "none")).thenReturn(sampleReport());
    mvc.perform(post("/api/java/ssl").contentType("application/json").content("{\"host\":\"example.com\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(true))
       .andExpect(jsonPath("$.data.host").value("example.com"))
       .andExpect(jsonPath("$.data.chain").isArray())
       .andExpect(jsonPath("$.data.chain[0].subjectCN").value("example.com"))
       .andExpect(jsonPath("$.data.chain[0].sha256Fingerprint").value("AA:BB"))
       .andExpect(jsonPath("$.data.chain[0].pem").value("-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n"))
       .andExpect(jsonPath("$.data.validation").exists())
       .andExpect(jsonPath("$.data.validation.trusted").value(true))
       .andExpect(jsonPath("$.data.supportedProtocols").isArray());
  }

  @Test
  void handshake_failure_becomes_fail_envelope() throws Exception {
    when(service.inspect("nope.invalid", 443, "none"))
        .thenThrow(new ToolException("SSL_HANDSHAKE_FAILED", "no"));
    mvc.perform(post("/api/java/ssl").contentType("application/json").content("{\"host\":\"nope.invalid\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(false))
       .andExpect(jsonPath("$.error.code").value("SSL_HANDSHAKE_FAILED"));
  }

  @Test
  void passes_port_and_starttls_through_and_maps_validation_error() throws Exception {
    // mock only matches if the controller forwards BOTH port=25 and startTls="ftp"
    when(service.inspect("example.com", 25, "ftp"))
        .thenThrow(new ToolException("VALIDATION_ERROR", "未知的 STARTTLS 协议：ftp"));
    mvc.perform(post("/api/java/ssl").contentType("application/json")
            .content("{\"host\":\"example.com\",\"port\":25,\"startTls\":\"ftp\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(false))
       .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
  }
}
