package dev.sam.dailytools.tools.crypto;

import dev.sam.dailytools.common.GlobalExceptionHandler;
import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CryptoController.class)
@Import(GlobalExceptionHandler.class)
class CryptoControllerTest {
  @Autowired MockMvc mvc;
  @MockBean CryptoService service;

  private static final String BODY = "{\"op\":\"encrypt\",\"mode\":\"ECB\",\"padding\":\"PKCS5Padding\","
      + "\"keySource\":\"raw\",\"key\":\"0123456789abcdef\",\"keyEnc\":\"utf8\","
      + "\"input\":\"hi\",\"inputEnc\":\"utf8\",\"outputEnc\":\"base64\"}";

  @Test
  void returns_result_envelope() throws Exception {
    when(service.transform(any())).thenReturn(new CryptoResult("aGVsbG8=", ""));
    mvc.perform(post("/api/java/crypto").contentType("application/json").content(BODY))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(true))
       .andExpect(jsonPath("$.data.output").value("aGVsbG8="));
  }

  @Test
  void tool_exception_becomes_fail_envelope() throws Exception {
    when(service.transform(any()))
        .thenThrow(new ToolException("DECRYPT_FAILED", "解密失败：密钥、IV 或密文不匹配"));
    mvc.perform(post("/api/java/crypto").contentType("application/json").content(BODY))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.ok").value(false))
       .andExpect(jsonPath("$.error.code").value("DECRYPT_FAILED"));
  }
}
