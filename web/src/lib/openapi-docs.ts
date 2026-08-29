const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const;

export type ApiMethod = (typeof HTTP_METHODS)[number];

export interface ApiParameter {
  readonly description: string;
  readonly location: string;
  readonly name: string;
  readonly required: boolean;
}

export interface ApiResponse {
  readonly code: string;
  readonly description: string;
}

export interface ApiOperation {
  readonly description: string;
  readonly id: string;
  readonly method: ApiMethod;
  readonly parameters: readonly ApiParameter[];
  readonly path: string;
  readonly requestBody: boolean;
  readonly responses: readonly ApiResponse[];
  readonly summary: string;
  readonly tag: string;
}

export interface ApiDocumentation {
  readonly operations: readonly ApiOperation[];
  readonly schemaVersion: string;
  readonly title: string;
  readonly version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readMethod(value: string): ApiMethod | null {
  return HTTP_METHODS.find((method) => method === value) ?? null;
}

function readParameters(value: unknown): readonly ApiParameter[] {
  if (!Array.isArray(value)) return [];
  const parameters: ApiParameter[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = readString(entry.name);
    if (!name) continue;
    parameters.push({
      description: readString(entry.description),
      location: readString(entry.in, "query"),
      name,
      required: entry.required === true,
    });
  }
  return parameters;
}

function readResponses(value: unknown): readonly ApiResponse[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([code, response]) => ({
    code,
    description: isRecord(response)
      ? readString(response.description, "—")
      : "—",
  }));
}

export function parseOpenApiDocument(value: unknown): ApiDocumentation {
  if (!isRecord(value)) {
    return { operations: [], schemaVersion: "", title: "My King", version: "" };
  }

  const info = isRecord(value.info) ? value.info : {};
  const paths = isRecord(value.paths) ? value.paths : {};
  const operations: ApiOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const [rawMethod, rawOperation] of Object.entries(pathItem)) {
      const method = readMethod(rawMethod.toLowerCase());
      if (!method || !isRecord(rawOperation)) continue;
      const tags = readStringList(rawOperation.tags);
      const summary = readString(rawOperation.summary);
      operations.push({
        description: readString(rawOperation.description),
        id: readString(rawOperation.operationId, `${method}:${path}`),
        method,
        parameters: readParameters(rawOperation.parameters),
        path,
        requestBody: isRecord(rawOperation.requestBody),
        responses: readResponses(rawOperation.responses),
        summary: summary || `${method.toUpperCase()} ${path}`,
        tag: tags[0] ?? "Other",
      });
    }
  }

  operations.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    if (pathOrder !== 0) return pathOrder;
    return HTTP_METHODS.indexOf(left.method) - HTTP_METHODS.indexOf(right.method);
  });

  return {
    operations,
    schemaVersion: readString(value.openapi),
    title: readString(info.title, "My King"),
    version: readString(info.version),
  };
}

export function filterApiOperations(
  operations: readonly ApiOperation[],
  query: string,
  tag: string | null,
): readonly ApiOperation[] {
  const needle = query.trim().toLocaleLowerCase();
  return operations.filter((operation) => {
    if (tag && operation.tag !== tag) return false;
    if (!needle) return true;
    return [
      operation.method,
      operation.path,
      operation.summary,
      operation.description,
      operation.tag,
    ].some((field) => field.toLocaleLowerCase().includes(needle));
  });
}
