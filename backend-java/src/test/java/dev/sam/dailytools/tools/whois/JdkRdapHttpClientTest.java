package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JdkRdapHttpClientTest {

  @Test
  void rejects_non_https_requests_before_transport() {
    HttpClient transport = mock(HttpClient.class);
    JdkRdapHttpClient client = new JdkRdapHttpClient(transport);

    assertThatThrownBy(() -> client.get(URI.create("http://rdap.example/domain/example.com")))
        .isInstanceOfSatisfying(ToolException.class,
            error -> assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED"));
    verifyNoInteractions(transport);
  }

  @Test
  void rejects_a_response_larger_than_one_mebibyte_without_leaking_body_content() throws Exception {
    HttpClient transport = mock(HttpClient.class);
    @SuppressWarnings("unchecked")
    HttpResponse<java.io.InputStream> response = mock(HttpResponse.class);
    byte[] oversized = new byte[JdkRdapHttpClient.MAX_BODY_BYTES + 1];
    byte[] secret = "upstream-secret".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    System.arraycopy(secret, 0, oversized, 0, secret.length);
    when(response.body()).thenReturn(new ByteArrayInputStream(oversized));
    when(transport.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    JdkRdapHttpClient client = new JdkRdapHttpClient(transport);

    assertThatThrownBy(() -> client.get(URI.create("https://rdap.example/domain/example.com")))
        .isInstanceOfSatisfying(ToolException.class, error -> {
          assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED");
          assertThat(error.getMessage()).doesNotContain("upstream-secret");
        });
  }
}
