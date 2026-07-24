package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
public class JdkRdapHttpClient implements RdapHttpClient {
  static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
  static final int MAX_BODY_BYTES = 1024 * 1024;
  private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

  @Override
  public RdapHttpResponse get(URI uri) {
    try {
      HttpRequest request = HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT).GET().build();
      HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
      try (InputStream body = response.body()) {
        byte[] bytes = body.readNBytes(MAX_BODY_BYTES + 1);
        if (bytes.length > MAX_BODY_BYTES) throw failure();
        return new RdapHttpResponse(response.statusCode(), new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw failure();
    } catch (IOException | RuntimeException error) {
      if (error instanceof ToolException toolException) throw toolException;
      throw failure();
    }
  }

  private static ToolException failure() {
    return new ToolException("RDAP_LOOKUP_FAILED", "RDAP 查询暂时不可用，请稍后重试");
  }
}
