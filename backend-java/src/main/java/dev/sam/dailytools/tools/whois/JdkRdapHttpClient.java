package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Service
public class JdkRdapHttpClient implements RdapHttpClient {
  static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
  static final int MAX_BODY_BYTES = 1024 * 1024;
  private final HttpClient client;
  private final Duration timeout;

  public JdkRdapHttpClient() {
    this(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(), REQUEST_TIMEOUT);
  }

  JdkRdapHttpClient(HttpClient client) {
    this(client, REQUEST_TIMEOUT);
  }

  JdkRdapHttpClient(HttpClient client, Duration timeout) {
    this.client = client;
    this.timeout = timeout;
  }

  @Override
  public RdapHttpResponse get(URI uri) {
    if (!"https".equalsIgnoreCase(uri.getScheme())) throw failure();
    CompletableFuture<HttpResponse<byte[]>> exchange = null;
    try {
      HttpRequest request = HttpRequest.newBuilder(uri).timeout(timeout).GET().build();
      exchange = client.sendAsync(request, boundedBodyHandler());
      HttpResponse<byte[]> response = exchange.get(timeout.toNanos(), TimeUnit.NANOSECONDS);
      byte[] bytes = response.body();
      if (bytes == null || bytes.length > MAX_BODY_BYTES) throw failure();
      return new RdapHttpResponse(response.statusCode(), new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
    } catch (InterruptedException error) {
      if (exchange != null) exchange.cancel(true);
      Thread.currentThread().interrupt();
      throw failure();
    } catch (TimeoutException error) {
      if (exchange != null) exchange.cancel(true);
      throw failure();
    } catch (ExecutionException | RuntimeException error) {
      if (error instanceof ToolException toolException) throw toolException;
      throw failure();
    }
  }

  static HttpResponse.BodyHandler<byte[]> boundedBodyHandler() {
    return responseInfo -> new BoundedBodySubscriber();
  }

  private static ToolException failure() {
    return new ToolException("RDAP_LOOKUP_FAILED", "RDAP 查询暂时不可用，请稍后重试");
  }

  private static final class BoundedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
    private final ByteArrayOutputStream output = new ByteArrayOutputStream();
    private final CompletableFuture<byte[]> body = new CompletableFuture<>();
    private Flow.Subscription subscription;
    private boolean done;

    @Override
    public CompletionStage<byte[]> getBody() {
      return body;
    }

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
      if (this.subscription != null) {
        subscription.cancel();
        return;
      }
      this.subscription = subscription;
      subscription.request(1);
    }

    @Override
    public void onNext(List<ByteBuffer> buffers) {
      if (done) return;
      for (ByteBuffer buffer : buffers) {
        int length = buffer.remaining();
        if (length > MAX_BODY_BYTES - output.size()) {
          done = true;
          subscription.cancel();
          body.completeExceptionally(failure());
          return;
        }
        byte[] bytes = new byte[length];
        buffer.get(bytes);
        output.writeBytes(bytes);
      }
      subscription.request(1);
    }

    @Override
    public void onError(Throwable error) {
      if (done) return;
      done = true;
      body.completeExceptionally(failure());
    }

    @Override
    public void onComplete() {
      if (done) return;
      done = true;
      body.complete(output.toByteArray());
    }
  }
}
