package dev.cobolens.analyze;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import io.proleap.cobol.asg.runner.impl.CobolParserRunnerImpl;
import io.proleap.cobol.preprocessor.CobolPreprocessor.CobolSourceFormatEnum;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public final class AnalyzeMain {
  private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().setPrettyPrinting().create();

  public static void main(String[] args) {
    try {
      Options options = Options.parse(args);
      GraphDocument graph = analyze(options);
      writeGraph(graph, options.out);
    } catch (Throwable error) {
      System.err.println(errorSummary(error));
      System.exit(1);
    }
  }

  private static GraphDocument analyze(Options options) throws IOException {
    if (!Files.isDirectory(options.root)) {
      throw new IllegalArgumentException("root is not a directory: " + options.root);
    }
    if (!options.encoding.equalsIgnoreCase("utf8")) {
      throw new IllegalArgumentException("only utf8 encoding is supported by the JVM spike");
    }

    List<SourceFile> files = discoverFiles(options.root, options.extensions);
    GraphBuilder builder = new GraphBuilder();
    List<ParseError> parseErrors = new ArrayList<>();
    int parsed = 0;

    for (int index = 0; index < files.size(); index += 1) {
      System.out.println(GSON.toJson(new Progress("parse", index, files.size())));
      SourceFile source = files.get(index);
      try {
        parseFile(source, options, builder);
        parsed += 1;
      } catch (Throwable error) {
        parseErrors.add(new ParseError(source.rel, errorSummary(error)));
      }
    }
    System.out.println(GSON.toJson(new Progress("parse", files.size(), files.size())));

    return new GraphDocument(
        1,
        new GraphMeta("unix:" + Instant.now().getEpochSecond(), "unknown", files.size(), parsed, parseErrors),
        new ArrayList<>(builder.nodes.values()),
        new ArrayList<>(builder.edges.values()));
  }

  private static void parseFile(SourceFile source, Options options, GraphBuilder builder) throws Exception {
    List<String> lines = Files.readAllLines(source.path, StandardCharsets.UTF_8);
    if (source.kind == FileKind.JCL) {
      parseJcl(source, lines, builder);
      return;
    }

    if (source.kind == FileKind.COBOL) {
      new CobolParserRunnerImpl().analyzeFile(source.path.toFile(), cobolFormat(options.format));
    }
    parseCobol(source, lines, builder);
  }

  private static CobolSourceFormatEnum cobolFormat(String format) {
    if (format.equalsIgnoreCase("free")) {
      return CobolSourceFormatEnum.TANDEM;
    }
    return CobolSourceFormatEnum.FIXED;
  }

  private static void parseCobol(SourceFile source, List<String> lines, GraphBuilder builder) {
    String ownerName = source.kind == FileKind.COPYBOOK ? fileStem(source.path) : findProgramName(lines, fileStem(source.path));
    String ownerId = (source.kind == FileKind.COPYBOOK ? "copy:" : "prog:") + normalize(ownerName);
    String ownerType = source.kind == FileKind.COPYBOOK ? "copybook" : "program";
    builder.node(new GraphNode(ownerId, ownerType, ownerName, source.rel, new int[] {1, Math.max(1, lines.size())}, null, null));

    for (int index = 0; index < lines.size(); index += 1) {
      int lineNumber = index + 1;
      List<String> tokens = tokenize(lines.get(index));
      if (tokens.isEmpty()) {
        continue;
      }

      dataItemDefinition(tokens).ifPresent(dataItem -> {
        String id = ensureDataItem(builder, dataItem, source, lineNumber);
        builder.edge(new GraphEdge(ownerId, id, "DEFINES", site(source, lineNumber)));
      });

      if (tokens.get(0).equalsIgnoreCase("COPY") && tokens.size() > 1) {
        String copy = tokens.get(1);
        String id = "copy:" + normalize(copy);
        builder.node(new GraphNode(id, "copybook", copy, null, null, true, null));
        builder.edge(new GraphEdge(ownerId, id, "COPIES", site(source, lineNumber)));
      }

      int performIndex = indexOf(tokens, "PERFORM");
      if (performIndex >= 0 && performIndex + 1 < tokens.size() && !isInlinePerform(tokens.get(performIndex + 1))) {
        String paragraph = tokens.get(performIndex + 1);
        String id = "para:" + normalize(ownerName) + "/" + normalize(paragraph);
        builder.node(new GraphNode(id, "paragraph", paragraph, source.rel, new int[] {lineNumber, lineNumber}, null, null));
        builder.edge(new GraphEdge(ownerId, id, "PERFORMS", site(source, lineNumber)));
      }

      int callIndex = indexOf(tokens, "CALL");
      if (callIndex >= 0 && callIndex + 1 < tokens.size()) {
        String program = tokens.get(callIndex + 1);
        String id = "prog:" + normalize(program);
        builder.node(new GraphNode(id, "program", program, null, null, true, null));
        builder.edge(new GraphEdge(ownerId, id, "CALLS", site(source, lineNumber)));
      }

      moveTargets(tokens).ifPresent(move -> {
        String from = ensureDataItem(builder, move.from, source, lineNumber);
        String to = ensureDataItem(builder, move.to, source, lineNumber);
        builder.edge(new GraphEdge(from, to, "moves-to", site(source, lineNumber)));
      });

      targetAfter(tokens, "READ").ifPresent(target -> {
        String id = ensureDataset(builder, target, source, lineNumber);
        builder.edge(new GraphEdge(ownerId, id, "reads", site(source, lineNumber)));
      });

      targetAfter(tokens, "WRITE").ifPresent(target -> {
        String id = ensureDataItem(builder, target, source, lineNumber);
        builder.edge(new GraphEdge(ownerId, id, "writes", site(source, lineNumber)));
      });

      sqlTable(tokens).ifPresent(table -> {
        String id = "db2:" + normalize(table);
        builder.node(new GraphNode(id, "db2-table", table, null, null, true, null));
        builder.edge(new GraphEdge(ownerId, id, sqlEdgeType(tokens), site(source, lineNumber)));
      });

      cicsProgram(tokens).ifPresent(program -> {
        String commandId = "cics:" + normalize(ownerName) + "/" + lineNumber + ":" + normalize(program);
        String programId = "prog:" + normalize(program);
        builder.node(new GraphNode(commandId, "cics-command", "LINK " + program, source.rel, new int[] {lineNumber, lineNumber}, null, null));
        builder.node(new GraphNode(programId, "program", program, null, null, true, null));
        builder.edge(new GraphEdge(ownerId, commandId, "executes", site(source, lineNumber)));
        builder.edge(new GraphEdge(commandId, programId, "links", site(source, lineNumber)));
      });
    }
  }

  private static void parseJcl(SourceFile source, List<String> lines, GraphBuilder builder) {
    String jobName = fileStem(source.path);
    String jobId = "job:" + normalize(jobName);
    String currentStepId = null;
    String previousStepId = null;
    List<String> stepIds = new ArrayList<>();

    for (int index = 0; index < lines.size(); index += 1) {
      int lineNumber = index + 1;
      String line = lines.get(index).trim();
      if (!line.startsWith("//")) {
        continue;
      }
      List<String> tokens = tokenize(line.substring(2));
      if (tokens.size() >= 2 && tokens.get(1).equalsIgnoreCase("JOB")) {
        jobName = tokens.get(0);
        jobId = "job:" + normalize(jobName);
        builder.node(new GraphNode(jobId, "jcl-job", jobName, source.rel, new int[] {lineNumber, lineNumber}, null, new ArrayList<>()));
        continue;
      }
      int execIndex = indexOf(tokens, "EXEC");
      if (execIndex > 0) {
        String stepName = tokens.get(0);
        currentStepId = "step:" + normalize(jobName) + "/" + normalize(stepName);
        stepIds.add(currentStepId);
        builder.node(new GraphNode(currentStepId, "jcl-step", stepName, source.rel, new int[] {lineNumber, lineNumber}, null, null));
        builder.edge(new GraphEdge(jobId, currentStepId, "CONTAINS", site(source, lineNumber)));
        if (previousStepId != null) {
          builder.edge(new GraphEdge(previousStepId, currentStepId, "RUNS-AFTER", site(source, lineNumber)));
        }
        previousStepId = currentStepId;
        String stepId = currentStepId;
        execProgram(tokens.subList(execIndex + 1, tokens.size())).ifPresent(program -> {
          String id = "prog:" + normalize(program);
          builder.node(new GraphNode(id, "program", program, null, null, true, null));
          builder.edge(new GraphEdge(stepId, id, "RUNS", site(source, lineNumber)));
        });
        continue;
      }
      if (currentStepId != null && tokens.size() >= 2 && tokens.get(1).equalsIgnoreCase("DD")) {
        String stepId = currentStepId;
        String ddJobName = jobName;
        dsn(lines.get(index)).ifPresent(dataset -> {
          String ddId = "dd:" + normalize(ddJobName) + "/" + normalize(tokens.get(0));
          String datasetId = ensureDataset(builder, dataset, source, lineNumber);
          builder.node(new GraphNode(ddId, "jcl-dd", tokens.get(0), source.rel, new int[] {lineNumber, lineNumber}, null, null));
          builder.edge(new GraphEdge(stepId, ddId, "DECLARES-DD", site(source, lineNumber)));
          builder.edge(new GraphEdge(ddId, datasetId, "uses-dd", site(source, lineNumber)));
        });
      }
    }
    builder.node(new GraphNode(jobId, "jcl-job", jobName, source.rel, new int[] {1, Math.max(1, lines.size())}, null, stepIds));
  }

  private static List<SourceFile> discoverFiles(Path root, Set<String> extensions) throws IOException {
    try (var stream = Files.walk(root)) {
      return stream
          .filter(Files::isRegularFile)
          .filter(path -> extensions.contains(extension(path)))
          .map(path -> new SourceFile(path, root.relativize(path).toString().replace('\\', '/'), kind(path)))
          .sorted(Comparator.comparing(source -> source.rel))
          .toList();
    }
  }

  private static void writeGraph(GraphDocument graph, Path out) throws IOException {
    if (out.getParent() != null) {
      Files.createDirectories(out.getParent());
    }
    Files.writeString(out, GSON.toJson(graph), StandardCharsets.UTF_8);
  }

  private static java.util.Optional<String> dataItemDefinition(List<String> tokens) {
    if (tokens.size() < 2 || !tokens.get(0).chars().allMatch(Character::isDigit)) {
      return java.util.Optional.empty();
    }
    if (tokens.get(1).equalsIgnoreCase("FILLER")) {
      return java.util.Optional.empty();
    }
    return java.util.Optional.of(tokens.get(1));
  }

  private static java.util.Optional<Move> moveTargets(List<String> tokens) {
    if (tokens.isEmpty() || !tokens.get(0).equalsIgnoreCase("MOVE")) {
      return java.util.Optional.empty();
    }
    int toIndex = indexOf(tokens, "TO");
    if (toIndex < 2 || toIndex + 1 >= tokens.size()) {
      return java.util.Optional.empty();
    }
    return java.util.Optional.of(new Move(tokens.get(1), tokens.get(toIndex + 1)));
  }

  private static java.util.Optional<String> targetAfter(List<String> tokens, String marker) {
    int index = indexOf(tokens, marker);
    return index >= 0 && index + 1 < tokens.size() ? java.util.Optional.of(tokens.get(index + 1)) : java.util.Optional.empty();
  }

  private static java.util.Optional<String> sqlTable(List<String> tokens) {
    int fromIndex = indexOf(tokens, "FROM");
    if (fromIndex >= 0 && fromIndex + 1 < tokens.size()) {
      return java.util.Optional.of(tokens.get(fromIndex + 1));
    }
    return java.util.Optional.empty();
  }

  private static String sqlEdgeType(List<String> tokens) {
    return tokens.stream().anyMatch(token -> token.equalsIgnoreCase("UPDATE") || token.equalsIgnoreCase("INSERT")) ? "updates" : "queries";
  }

  private static java.util.Optional<String> cicsProgram(List<String> tokens) {
    if (indexOf(tokens, "CICS") < 0 || (indexOf(tokens, "LINK") < 0 && indexOf(tokens, "XCTL") < 0)) {
      return java.util.Optional.empty();
    }
    return targetAfter(tokens, "PROGRAM");
  }

  private static java.util.Optional<String> execProgram(List<String> tokens) {
    for (String token : tokens) {
      if (token.toUpperCase(Locale.ROOT).startsWith("PGM=")) {
        return java.util.Optional.of(token.substring(4));
      }
    }
    return targetAfter(tokens, "PGM");
  }

  private static java.util.Optional<String> dsn(String line) {
    int index = line.toUpperCase(Locale.ROOT).indexOf("DSN=");
    if (index < 0) {
      return java.util.Optional.empty();
    }
    String value = line.substring(index + 4).split("[,\\s]")[0].replaceAll("^[.'\"]+|[.'\"]+$", "");
    return value.isBlank() ? java.util.Optional.empty() : java.util.Optional.of(value);
  }

  private static String ensureDataItem(GraphBuilder builder, String name, SourceFile source, int line) {
    String id = "data:" + normalize(name);
    builder.node(new GraphNode(id, "data-item", name, source.rel, new int[] {line, line}, null, null));
    return id;
  }

  private static String ensureDataset(GraphBuilder builder, String name, SourceFile source, int line) {
    String id = "dataset:" + normalize(name);
    builder.node(new GraphNode(id, "dataset", name, source.rel, new int[] {line, line}, null, null));
    return id;
  }

  private static List<String> tokenize(String line) {
    List<String> tokens = new ArrayList<>();
    StringBuilder current = new StringBuilder();
    for (char ch : line.toCharArray()) {
      if (Character.isLetterOrDigit(ch) || ch == '-' || ch == '_' || ch == '=' || ch == '$' || ch == '#' || ch == '@') {
        current.append(ch);
      } else if (current.length() > 0) {
        tokens.add(clean(current.toString()));
        current.setLength(0);
      }
    }
    if (current.length() > 0) {
      tokens.add(clean(current.toString()));
    }
    return tokens.stream().filter(token -> !token.isBlank()).toList();
  }

  private static String findProgramName(List<String> lines, String fallback) {
    for (String line : lines) {
      List<String> tokens = tokenize(line);
      for (int index = 0; index + 2 < tokens.size(); index += 1) {
        if (tokens.get(index).equalsIgnoreCase("PROGRAM") && tokens.get(index + 1).equalsIgnoreCase("ID")) {
          return tokens.get(index + 2);
        }
      }
    }
    return fallback;
  }

  private static int indexOf(List<String> tokens, String needle) {
    for (int index = 0; index < tokens.size(); index += 1) {
      if (tokens.get(index).equalsIgnoreCase(needle)) {
        return index;
      }
    }
    return -1;
  }

  private static boolean isInlinePerform(String token) {
    return Set.of("VARYING", "UNTIL", "TIMES", "WITH", "TEST").contains(token.toUpperCase(Locale.ROOT));
  }

  private static String extension(Path path) {
    String name = path.getFileName().toString();
    int index = name.lastIndexOf('.');
    return index >= 0 ? name.substring(index).toLowerCase(Locale.ROOT) : "";
  }

  private static FileKind kind(Path path) {
    return switch (extension(path)) {
      case ".jcl" -> FileKind.JCL;
      case ".cpy" -> FileKind.COPYBOOK;
      default -> FileKind.COBOL;
    };
  }

  private static String fileStem(Path path) {
    String name = path.getFileName().toString();
    int index = name.lastIndexOf('.');
    return index >= 0 ? name.substring(0, index) : name;
  }

  private static String clean(String value) {
    return value.replaceAll("^[.'\"(),;=]+|[.'\"(),;=]+$", "");
  }

  private static String normalize(String value) {
    return clean(value).toUpperCase(Locale.ROOT);
  }

  private static String errorSummary(Throwable error) {
    String message = error.getMessage();
    String type = error.getClass().getSimpleName();
    if (message == null || message.isBlank()) {
      return type;
    }
    return type + ": " + message;
  }

  private static SourceSite site(SourceFile source, int line) {
    return new SourceSite(source.rel, line);
  }

  enum FileKind { COBOL, COPYBOOK, JCL }

  record Options(Path root, Path out, String format, Set<String> extensions, String encoding) {
    static Options parse(String[] args) {
      Path root = null;
      Path out = null;
      String format = "auto";
      Set<String> extensions = new LinkedHashSet<>(List.of(".cbl", ".cob", ".cpy", ".jcl"));
      String encoding = "utf8";
      for (int index = 0; index < args.length; index += 2) {
        if (index + 1 >= args.length) {
          throw new IllegalArgumentException("missing value for " + args[index]);
        }
        String key = args[index];
        String value = args[index + 1];
        switch (key) {
          case "--root" -> root = Path.of(value);
          case "--out" -> out = Path.of(value);
          case "--format" -> format = value;
          case "--ext" -> {
            extensions = new LinkedHashSet<>();
            for (String ext : value.split(",")) {
              if (!ext.isBlank()) {
                extensions.add(ext.trim().toLowerCase(Locale.ROOT));
              }
            }
          }
          case "--encoding" -> encoding = value;
          default -> throw new IllegalArgumentException("unknown argument: " + key);
        }
      }
      if (root == null || out == null) {
        throw new IllegalArgumentException("--root and --out are required");
      }
      return new Options(root, out, format, extensions, encoding);
    }
  }

  record SourceFile(Path path, String rel, FileKind kind) {}
  record Progress(String phase, int done, int total) {}
  record ParseError(String file, String reason) {}
  record GraphMeta(String scannedAt, String dialectGuess, int fileCount, int parsedFileCount, List<ParseError> parseErrors) {}
  record SourceSite(String file, int line) {}
  record GraphEdge(String from, String to, String type, SourceSite site) {}
  record GraphNode(String id, String type, String name, String file, int[] lines, Boolean external, List<String> steps) {}
  record GraphDocument(int schemaVersion, GraphMeta meta, List<GraphNode> nodes, List<GraphEdge> edges) {}
  record Move(String from, String to) {}

  static final class GraphBuilder {
    final Map<String, GraphNode> nodes = new TreeMap<>();
    final Map<String, GraphEdge> edges = new TreeMap<>();

    void node(GraphNode node) {
      GraphNode existing = nodes.get(node.id);
      if (existing == null || existing.file == null && node.file != null || Boolean.TRUE.equals(existing.external) && !Boolean.TRUE.equals(node.external)) {
        nodes.put(node.id, node);
      }
    }

    void edge(GraphEdge edge) {
      String site = edge.site == null ? "-" : edge.site.file + ":" + edge.site.line;
      edges.putIfAbsent(edge.from + "|" + edge.to + "|" + edge.type + "|" + site, edge);
    }
  }
}
