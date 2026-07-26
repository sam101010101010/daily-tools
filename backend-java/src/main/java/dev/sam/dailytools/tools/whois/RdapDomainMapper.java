package dev.sam.dailytools.tools.whois;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.sam.dailytools.common.ToolException;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

public class RdapDomainMapper {
  private static final String LOOKUP_FAILURE = "RDAP 服务返回了无法识别的数据";
  private final ObjectMapper mapper = new ObjectMapper();

  public RdapReport map(String input, String domain, URI source, String rawJson) {
    try {
      JsonNode root = mapper.readTree(rawJson);
      if (root == null || !root.isObject() || !"domain".equals(root.path("objectClassName").textValue())) {
        throw failure();
      }
      return new RdapReport(
          input, domain, true, source.toString(), text(root, "ldhName"), text(root, "unicodeName"), text(root, "handle"),
          strings(root.path("status")), events(root.path("events")), registrar(root.path("entities")),
          nameservers(root.path("nameservers")), notices(root.path("notices")), rawJson);
    } catch (ToolException error) {
      throw error;
    } catch (Exception error) {
      throw failure();
    }
  }

  private static List<RdapReport.Event> events(JsonNode nodes) {
    List<RdapReport.Event> result = new ArrayList<>();
    if (nodes.isArray()) for (JsonNode node : nodes) {
      result.add(new RdapReport.Event(text(node, "eventAction"), text(node, "eventDate"), text(node, "eventActor")));
    }
    return result;
  }

  private static RdapReport.Registrar registrar(JsonNode entities) {
    if (!entities.isArray()) return null;
    for (JsonNode entity : entities) {
      if (strings(entity.path("roles")).contains("registrar")) {
        return new RdapReport.Registrar(vcardName(entity.path("vcardArray")), text(entity, "handle"));
      }
    }
    return null;
  }

  private static String vcardName(JsonNode vcard) {
    if (!vcard.isArray() || vcard.size() < 2 || !vcard.get(1).isArray()) return null;
    for (JsonNode field : vcard.get(1)) {
      if (field.isArray() && field.size() > 3 && "fn".equals(field.path(0).asText()) && field.get(3).isTextual()) {
        return field.get(3).textValue();
      }
    }
    return null;
  }

  private static List<RdapReport.Nameserver> nameservers(JsonNode nodes) {
    List<RdapReport.Nameserver> result = new ArrayList<>();
    if (nodes.isArray()) for (JsonNode node : nodes) {
      result.add(new RdapReport.Nameserver(text(node, "ldhName"), text(node, "unicodeName"), strings(node.path("status"))));
    }
    return result;
  }

  private static List<RdapReport.Notice> notices(JsonNode nodes) {
    List<RdapReport.Notice> result = new ArrayList<>();
    if (nodes.isArray()) for (JsonNode node : nodes) {
      result.add(new RdapReport.Notice(text(node, "title"), strings(node.path("description"))));
    }
    return result;
  }

  private static List<String> strings(JsonNode nodes) {
    List<String> result = new ArrayList<>();
    if (nodes.isArray()) for (JsonNode node : nodes) if (node.isTextual()) result.add(node.textValue());
    return result;
  }

  private static String text(JsonNode node, String name) {
    JsonNode value = node.path(name);
    return value.isTextual() ? value.textValue() : null;
  }

  private static ToolException failure() {
    return new ToolException("RDAP_LOOKUP_FAILED", LOOKUP_FAILURE);
  }
}
