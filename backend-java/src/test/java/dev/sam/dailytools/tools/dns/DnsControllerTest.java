package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DnsController.class)
@Import(GlobalExceptionHandler.class)
class DnsControllerTest {
  @Autowired MockMvc mvc;
  @MockBean DnsService service;

  @Test
  void returns_records_envelope() throws Exception {
    when(service.resolve(any(), any())).thenReturn(new DnsRecords("example.com", Map.of("A", List.of("1.2.3.4"))));
    mvc.perform(post("/api/java/dns").contentType("application/json").content("{\"domain\":\"example.com\"}"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(true))
       .andExpect(jsonPath("$.data.records.A[0]").value("1.2.3.4"));
  }
}
