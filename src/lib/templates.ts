import type { Language } from "./language.js";

export type GoTemplateRefs = {
  bytesRef: string;
  jsonRef: string;
  httpRef: string;
  timeRef: string;
};

export type TemplateArgs = {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly label: string;
  readonly hypothesis: string;
  readonly capture: readonly string[];
  readonly maxHits: number;
  readonly port: number;
  readonly goRefs?: GoTemplateRefs;
};

export type TemplateOutput = {
  readonly lines: readonly string[];
  readonly goRefs?: GoTemplateRefs;
};

export const goImportPaths = {
  bytes: "bytes",
  json: "encoding/json",
  http: "net/http",
  time: "time",
} as const;

const jsonQuote = (value: string): string => JSON.stringify(value);

const sanitizeIdentifier = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, "_");

const jsTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const vars = args.capture
    .map((entry) => `${jsonQuote(entry)}:__lpVal(()=>(${entry}))`)
    .join(",");

  return [
    `// LOGPOINT_START [${args.id}] - ${args.label}`,
    `;(()=>{try{globalThis.${counter}=(globalThis.${counter}??0)+1;if(globalThis.${counter}>${args.maxHits})return;const __lpSeen=new WeakSet();const __lpSer=(v)=>{try{return JSON.stringify(v,(_k,x)=>{if(typeof x==="object"&&x!==null){if(__lpSeen.has(x))return"[Circular]";__lpSeen.add(x)}return x})}catch{return JSON.stringify(String(v))}};const __lpVal=(fn)=>{try{const __raw=fn();const __txt=__lpSer(__raw);return typeof __txt==="string"&&__txt.length>10240?__txt.slice(0,10240)+"...[truncated]":__txt}catch{return"__unavailable__"}};const __lp=JSON.stringify({id:${jsonQuote(args.id)},file:${jsonQuote(args.file)},line:${args.line},label:${jsonQuote(args.label)},hypothesis:${jsonQuote(args.hypothesis)},timestamp:new Date().toISOString(),hit:globalThis.${counter},maxHits:${args.maxHits},vars:{${vars}}});fetch("http://localhost:${args.port}",{method:"POST",headers:{"Content-Type":"application/json"},body:__lp}).catch(()=>{})}catch{}})();`,
    `// LOGPOINT_END [${args.id}]`,
  ];
};

const pythonTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `# LOGPOINT_START [${args.id}] - ${args.label}`,
    "try:",
    `    globals()[${jsonQuote(counter)}] = int(globals().get(${jsonQuote(counter)}, 0)) + 1`,
    `    if globals()[${jsonQuote(counter)}] <= ${args.maxHits}:`,
    "        import json as __lpj",
    "        import urllib.request as __lpr",
    "        from datetime import datetime as __lpdt",
    "        __lp_vars = {}",
  ];

  for (const capture of args.capture) {
    lines.push("        try:");
    lines.push(`            __lp_raw = eval(${jsonQuote(capture)}, globals(), locals())`);
    lines.push("        except Exception:");
    lines.push("            __lp_raw = \"__unavailable__\"");
    lines.push("        try:");
    lines.push("            __lp_value = __lpj.dumps(__lp_raw, default=str)");
    lines.push("        except Exception:");
    lines.push("            __lp_value = str(__lp_raw)");
    lines.push(`        __lp_vars[${jsonQuote(capture)}] = __lp_value[:10240]`);
  }

  lines.push(
    `        __lp_payload = {"id": ${jsonQuote(args.id)}, "file": ${jsonQuote(args.file)}, "line": ${args.line}, "label": ${jsonQuote(args.label)}, "hypothesis": ${jsonQuote(args.hypothesis)}, "timestamp": __lpdt.now().isoformat(), "hit": globals()[${jsonQuote(counter)}], "maxHits": ${args.maxHits}, "vars": __lp_vars}`,
  );
  lines.push(
    `        __lp_req = __lpr.Request("http://localhost:${args.port}", data=__lpj.dumps(__lp_payload).encode(), headers={"Content-Type": "application/json"})`,
  );
  lines.push("        try:");
  lines.push("            __lpr.urlopen(__lp_req, timeout=0.5)");
  lines.push("        except Exception:");
  lines.push("            pass");
  lines.push("except Exception:");
  lines.push("    pass");
  lines.push(`# LOGPOINT_END [${args.id}]`);

  return lines;
};

const goTemplate = (args: TemplateArgs): TemplateOutput => {
  const refs: GoTemplateRefs =
    args.goRefs ??
    ({
      bytesRef: "bytes",
      jsonRef: "json",
      httpRef: "http",
      timeRef: "time",
    } as const);

  const vars = args.capture.length === 0 ? "" : `${args.capture.map((entry) => `"${entry}": ${entry}`).join(", ")}, `;

  const lines = [
    `// LOGPOINT_START [${args.id}] - ${args.label}`,
    "func() {",
    "    defer func() { _ = recover() }()",
    `    __lpVars := map[string]any{${vars}}`,
    `    __lpPayload := map[string]any{"id": ${jsonQuote(args.id)}, "file": ${jsonQuote(args.file)}, "line": ${args.line}, "label": ${jsonQuote(args.label)}, "hypothesis": ${jsonQuote(args.hypothesis)}, "timestamp": ${refs.timeRef}.Now().Format(${refs.timeRef}.RFC3339Nano), "maxHits": ${args.maxHits}, "vars": __lpVars}`,
    `    __lpBody, __lpErr := ${refs.jsonRef}.Marshal(__lpPayload)`,
    "    if __lpErr != nil {",
    "        return",
    "    }",
    "    go func(__lpBytes []byte) {",
    `        _, _ = ${refs.httpRef}.Post("http://localhost:${args.port}", "application/json", ${refs.bytesRef}.NewBuffer(__lpBytes))`,
    "    }(__lpBody)",
    "}()",
    `// LOGPOINT_END [${args.id}]`,
  ];

  return { lines, goRefs: refs };
};

const rubyTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `# LOGPOINT_START [${args.id}] - ${args.label}`,
    "begin",
    `  $${counter} = ($${counter} || 0) + 1`,
    `  if $${counter} <= ${args.maxHits}`,
    "    require \"json\"",
    "    require \"net/http\"",
    "    require \"uri\"",
    "    __lp_vars = {}",
  ];

  for (const capture of args.capture) {
    lines.push("    begin");
    lines.push(`      __lp_value = JSON.generate(${capture})`);
    lines.push(`      __lp_vars[${jsonQuote(capture)}] = __lp_value[0, 10240]`);
    lines.push("    rescue StandardError");
    lines.push(`      __lp_vars[${jsonQuote(capture)}] = \"__unavailable__\"`);
    lines.push("    end");
  }

  lines.push(
    "    __lp_payload = { " +
      `id: ${jsonQuote(args.id)}, file: ${jsonQuote(args.file)}, line: ${args.line}, label: ${jsonQuote(args.label)}, hypothesis: ${jsonQuote(args.hypothesis)}, timestamp: Time.now.utc.iso8601(6), hit: $${counter}, maxHits: ${args.maxHits}, vars: __lp_vars ` +
      "}",
  );
  lines.push(`    __lp_uri = URI("http://localhost:${args.port}")`);
  lines.push(
    '    begin; Net::HTTP.post(__lp_uri, JSON.generate(__lp_payload), { "Content-Type" => "application/json" }); rescue StandardError; end',
  );
  lines.push("  end");
  lines.push("rescue StandardError");
  lines.push("end");
  lines.push(`# LOGPOINT_END [${args.id}]`);

  return lines;
};

const shellTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__LP_COUNT_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `# LOGPOINT_START [${args.id}] - ${args.label}`,
    "{",
    `  : "\${${counter}:=0}"`,
    `  ${counter}=$(( ${counter} + 1 ))`,
    `  if [ "\${${counter}}" -le ${args.maxHits} ]; then`,
  ];

  const chunks: string[] = [];
  for (let index = 0; index < args.capture.length; index += 1) {
    const capture = args.capture[index];
    const variable = `__lp_var_${index}`;
    chunks.push(variable);
    lines.push(
      `    ${variable}=$(printf '%s' "\${${capture}-__unavailable__}" | tr '\\n' ' ' | cut -c1-10240 | sed 's/"/\\\\"/g')`,
    );
  }

  const renderedVars =
    chunks.length === 0
      ? "{}"
      : `{${chunks.map((chunk, index) => `${jsonQuote(args.capture[index] ?? "")}:"$${chunk}"`).join(",")}}`;

  lines.push(
    `    __lp_payload='{"id":${jsonQuote(args.id)},"file":${jsonQuote(args.file)},"line":${args.line},"label":${jsonQuote(args.label)},"hypothesis":${jsonQuote(args.hypothesis)},"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)'"'","hit":"'"\${${counter}}"'","maxHits":${args.maxHits},"vars":${renderedVars}}'`,
  );
  lines.push(
    `    curl -s -X POST "http://localhost:${args.port}" -H "Content-Type: application/json" --data "$__lp_payload" >/dev/null 2>&1 || true`,
  );
  lines.push("  fi");
  lines.push("} || true");
  lines.push(`# LOGPOINT_END [${args.id}]`);

  return lines;
};

const javaTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `// LOGPOINT_START [${args.id}] - ${args.label}`,
    "try {",
    `  int __lpCount = Integer.parseInt(System.getProperty(${jsonQuote(counter)}, "0")) + 1;`,
    `  System.setProperty(${jsonQuote(counter)}, Integer.toString(__lpCount));`,
    `  if (__lpCount <= ${args.maxHits}) {`,
    "    java.util.Map<String, Object> __lpVars = new java.util.HashMap<>();",
  ];

  for (const capture of args.capture) {
    lines.push(`    __lpVars.put(${jsonQuote(capture)}, String.valueOf(${capture}));`);
  }

  lines.push("    StringBuilder __lpVarsJson = new StringBuilder(\"{\");");
  lines.push("    boolean __lpFirst = true;");
  lines.push("    for (java.util.Map.Entry<String, Object> __lpEntry : __lpVars.entrySet()) {");
  lines.push("      if (!__lpFirst) __lpVarsJson.append(\",\");");
  lines.push("      __lpFirst = false;");
  lines.push('      String __lpEsc = String.valueOf(__lpEntry.getValue()).replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"");');
  lines.push('      __lpVarsJson.append("\\\"").append(__lpEntry.getKey()).append("\\\":\\\"").append(__lpEsc).append("\\\"");');
  lines.push("    }");
  lines.push("    __lpVarsJson.append(\"}\");");
  lines.push(
    `    String __lpPayload = "{\\\"id\\\":${jsonQuote(args.id)},\\\"file\\\":${jsonQuote(args.file)},\\\"line\\\":${args.line},\\\"label\\\":${jsonQuote(args.label)},\\\"hypothesis\\\":${jsonQuote(args.hypothesis)},\\\"timestamp\\\":\\\"" + java.time.Instant.now().toString() + "\\\",\\\"hit\\\":" + __lpCount + ",\\\"maxHits\\\":${args.maxHits},\\\"vars\\\":" + __lpVarsJson + "}";`,
  );
  lines.push("    java.net.http.HttpClient __lpClient = java.net.http.HttpClient.newHttpClient();");
  lines.push(
    `    java.net.http.HttpRequest __lpReq = java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:${args.port}"))`,
  );
  lines.push("      .header(\"Content-Type\", \"application/json\")");
  lines.push("      .POST(java.net.http.HttpRequest.BodyPublishers.ofString(__lpPayload))");
  lines.push("      .build();");
  lines.push("    __lpClient.sendAsync(__lpReq, java.net.http.HttpResponse.BodyHandlers.discarding());");
  lines.push("  }");
  lines.push("} catch (Throwable __lpErr) {}", `// LOGPOINT_END [${args.id}]`);

  return lines;
};

const csharpTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `// LOGPOINT_START [${args.id}] - ${args.label}`,
    "try {",
    `  var __lpCount = ((AppContext.GetData(${jsonQuote(counter)}) as int?) ?? 0) + 1;`,
    `  AppContext.SetData(${jsonQuote(counter)}, __lpCount);`,
    `  if (__lpCount <= ${args.maxHits}) {`,
    "    var __lpVars = new System.Collections.Generic.Dictionary<string, object?>();",
  ];

  for (const capture of args.capture) {
    lines.push(`    __lpVars[${jsonQuote(capture)}] = ${capture};`);
  }

  lines.push("    var __lpPayload = System.Text.Json.JsonSerializer.Serialize(new {");
  lines.push(`      id = ${jsonQuote(args.id)},`);
  lines.push(`      file = ${jsonQuote(args.file)},`);
  lines.push(`      line = ${args.line},`);
  lines.push(`      label = ${jsonQuote(args.label)},`);
  lines.push(`      hypothesis = ${jsonQuote(args.hypothesis)},`);
  lines.push("      timestamp = System.DateTimeOffset.UtcNow.ToString(\"O\"),");
  lines.push("      hit = __lpCount,");
  lines.push(`      maxHits = ${args.maxHits},`);
  lines.push("      vars = __lpVars");
  lines.push("    });");
  lines.push("    using var __lpClient = new System.Net.Http.HttpClient();");
  lines.push(
    `    _ = __lpClient.PostAsync("http://localhost:${args.port}", new System.Net.Http.StringContent(__lpPayload, System.Text.Encoding.UTF8, "application/json"));`,
  );
  lines.push("  }");
  lines.push("} catch {}", `// LOGPOINT_END [${args.id}]`);

  return lines;
};

const phpCaptureExpr = (capture: string): string => (capture.startsWith("$") ? capture : `$${capture}`);

const phpTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `# LOGPOINT_START [${args.id}] - ${args.label}`,
    "try {",
    `  $GLOBALS[${jsonQuote(counter)}] = ((int)($GLOBALS[${jsonQuote(counter)}] ?? 0)) + 1;`,
    `  if ($GLOBALS[${jsonQuote(counter)}] <= ${args.maxHits}) {`,
    "    $__lpVars = [];",
  ];

  for (const capture of args.capture) {
    const expr = phpCaptureExpr(capture);
    lines.push("    try {");
    lines.push(`      $__lpVars[${jsonQuote(capture)}] = ${expr};`);
    lines.push("    } catch (Throwable $__lpInner) {");
    lines.push(`      $__lpVars[${jsonQuote(capture)}] = "__unavailable__";`);
    lines.push("    }");
  }

  lines.push(
    `    $__lpPayload = json_encode(["id" => ${jsonQuote(args.id)}, "file" => ${jsonQuote(args.file)}, "line" => ${args.line}, "label" => ${jsonQuote(args.label)}, "hypothesis" => ${jsonQuote(args.hypothesis)}, "timestamp" => gmdate("c"), "hit" => $GLOBALS[${jsonQuote(counter)}], "maxHits" => ${args.maxHits}, "vars" => $__lpVars]);`,
  );
  lines.push(
    `    @file_get_contents("http://localhost:${args.port}", false, stream_context_create(["http" => ["method" => "POST", "header" => "Content-Type: application/json\\r\\n", "content" => $__lpPayload, "timeout" => 0.5]]));`,
  );
  lines.push("  }");
  lines.push("} catch (Throwable $__lpErr) {}", `# LOGPOINT_END [${args.id}]`);

  return lines;
};

const rustTemplate = (args: TemplateArgs): readonly string[] => {
  const lines: string[] = [`// LOGPOINT_START [${args.id}] - ${args.label}`, "{"];
  lines.push("  let mut __lp_vars: Vec<String> = Vec::new();");

  for (const capture of args.capture) {
    lines.push(
      `  __lp_vars.push(format!("\\\"${capture}\\\":\\\"{}\\\"", format!("{:?}", ${capture}).replace('\\\\', "\\\\\\\\").replace('\\\"', "\\\\\\\"")));`,
    );
  }

  lines.push("  let __lp_ts = format!(\"{:?}\", std::time::SystemTime::now());");
  lines.push(
    `  let __lp_body = format!("{{\\\"id\\\":${jsonQuote(args.id)},\\\"file\\\":${jsonQuote(args.file)},\\\"line\\\":${args.line},\\\"label\\\":${jsonQuote(args.label)},\\\"hypothesis\\\":${jsonQuote(args.hypothesis)},\\\"timestamp\\\":\\\"{}\\\",\\\"maxHits\\\":${args.maxHits},\\\"vars\\\":{{{}}}}}", __lp_ts, __lp_vars.join(","));`,
  );
  lines.push(`  if let Ok(mut __lp_stream) = std::net::TcpStream::connect("127.0.0.1:${args.port}") {`);
  lines.push(
    "    let __lp_request = format!(\"POST / HTTP/1.1\\r\\nHost: localhost\\r\\nContent-Type: application/json\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n\\r\\n{}\", __lp_body.len(), __lp_body);",
  );
  lines.push("    let _ = std::io::Write::write_all(&mut __lp_stream, __lp_request.as_bytes());");
  lines.push("  }");
  lines.push("}", `// LOGPOINT_END [${args.id}]`);

  return lines;
};

const kotlinTemplate = (args: TemplateArgs): readonly string[] => {
  const counter = `__lp_count_${sanitizeIdentifier(args.id)}`;
  const lines: string[] = [
    `// LOGPOINT_START [${args.id}] - ${args.label}`,
    "try {",
    `  val __lpCount = ((System.getProperty(${jsonQuote(counter)}) ?: \"0\").toIntOrNull() ?: 0) + 1`,
    `  System.setProperty(${jsonQuote(counter)}, __lpCount.toString())`,
    `  if (__lpCount <= ${args.maxHits}) {`,
    "    val __lpVars = mutableMapOf<String, Any?>()",
  ];

  for (const capture of args.capture) {
    lines.push(`    __lpVars[${jsonQuote(capture)}] = ${capture}`);
  }

  lines.push(
    '    val __lpVarsJson = __lpVars.entries.joinToString(",") { "\"${it.key}\":\"" + (it.value?.toString() ?: "__unavailable__").replace("\\", "\\\\").replace("\"", "\\\"") + "\"" }',
  );
  lines.push(
    `    val __lpPayload = "{\\\"id\\\":${jsonQuote(args.id)},\\\"file\\\":${jsonQuote(args.file)},\\\"line\\\":${args.line},\\\"label\\\":${jsonQuote(args.label)},\\\"hypothesis\\\":${jsonQuote(args.hypothesis)},\\\"timestamp\\\":\\\"${'$'}{java.time.Instant.now()}\\\",\\\"hit\\\":${'$'}__lpCount,\\\"maxHits\\\":${args.maxHits},\\\"vars\\\":{${'$'}__lpVarsJson}}"`,
  );
  lines.push(`    val __lpUrl = java.net.URL("http://localhost:${args.port}")`);
  lines.push("    val __lpConn = (__lpUrl.openConnection() as java.net.HttpURLConnection).apply {");
  lines.push("      requestMethod = \"POST\"");
  lines.push("      setRequestProperty(\"Content-Type\", \"application/json\")");
  lines.push("      doOutput = true");
  lines.push("    }");
  lines.push("    __lpConn.outputStream.use { it.write(__lpPayload.toByteArray()) }");
  lines.push("    runCatching { __lpConn.inputStream.close() }");
  lines.push("    __lpConn.disconnect()");
  lines.push("  }");
  lines.push("} catch (_: Throwable) {}", `// LOGPOINT_END [${args.id}]`);

  return lines;
};

export const generateTemplate = (args: TemplateArgs, language: Language): TemplateOutput => {
  switch (language) {
    case "javascript":
      return { lines: jsTemplate(args) };
    case "typescript":
      return { lines: jsTemplate(args) };
    case "python":
      return { lines: pythonTemplate(args) };
    case "go":
      return goTemplate(args);
    case "ruby":
      return { lines: rubyTemplate(args) };
    case "shell":
      return { lines: shellTemplate(args) };
    case "java":
      return { lines: javaTemplate(args) };
    case "csharp":
      return { lines: csharpTemplate(args) };
    case "php":
      return { lines: phpTemplate(args) };
    case "rust":
      return { lines: rustTemplate(args) };
    case "kotlin":
      return { lines: kotlinTemplate(args) };
    default:
      return { lines: jsTemplate(args) };
  }
};
