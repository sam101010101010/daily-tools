package dev.sam.dailytools.common;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest
@Import({EnvelopeContractTest.PingController.class, GlobalExceptionHandler.class})
class EnvelopeContractTest {
  @Autowired MockMvc mvc;

  @RestController
  static class PingController {
    @GetMapping("/__ping")
    ApiEnvelope<String> ping(@RequestParam boolean boom) {
      if (boom) throw new ToolException("PING_BOOM", "kaboom");
      return ApiEnvelope.ok("pong");
    }
  }

  @Test
  void success_is_ok_envelope() throws Exception {
    mvc.perform(get("/__ping?boom=false"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(true))
       .andExpect(jsonPath("$.data").value("pong"));
  }

  @Test
  void tool_exception_maps_to_fail_envelope_with_code_and_http_200() throws Exception {
    mvc.perform(get("/__ping?boom=true"))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(false))
       .andExpect(jsonPath("$.error.code").value("PING_BOOM"))
       .andExpect(jsonPath("$.error.message").value("kaboom"));
  }
}
