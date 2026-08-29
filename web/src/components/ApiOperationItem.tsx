import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ApiMethod, ApiOperation } from "@/lib/openapi-docs";

const METHOD_STYLES: Readonly<Record<ApiMethod, string>> = {
  get: "bg-success/10 text-success",
  post: "bg-primary/10 text-primary",
  put: "bg-warning/10 text-warning",
  patch: "bg-warning/10 text-warning",
  delete: "bg-destructive/10 text-destructive",
  options: "bg-muted text-muted-foreground",
  head: "bg-muted text-muted-foreground",
};

interface ApiOperationItemProps {
  readonly operation: ApiOperation;
}

export function ApiOperationItem({ operation }: ApiOperationItemProps) {
  const { t } = useI18n();

  return (
    <details className="group border-b border-border/70 last:border-b-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 sm:px-5">
        <span
          className={cn(
            "w-16 shrink-0 rounded-lg px-2 py-1 text-center font-mono text-[11px] font-bold uppercase",
            METHOD_STYLES[operation.method],
          )}
        >
          {operation.method.toUpperCase()}
        </span>
        <code className="min-w-0 flex-1 [overflow-wrap:anywhere] text-sm font-semibold text-foreground">
          {operation.path}
        </code>
        <span className="hidden max-w-[38%] truncate text-xs text-muted-foreground md:block">
          {operation.summary}
        </span>
      </summary>
      <div className="grid gap-5 border-t border-border/60 bg-background/35 px-4 py-5 sm:px-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-foreground text-balance">
              {operation.summary}
            </h3>
            {operation.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
                {operation.description}
              </p>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {t.docs.parameters}
            </h4>
            {operation.parameters.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t.docs.noParameters}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {operation.parameters.map((parameter) => (
                  <div
                    key={`${parameter.location}:${parameter.name}`}
                    className="rounded-xl bg-background/60 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-semibold text-primary">
                        {parameter.name}
                      </code>
                      <span className="text-xs text-muted-foreground">
                        {parameter.location}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {parameter.required
                          ? t.docs.required
                          : t.docs.optional}
                      </span>
                    </div>
                    {parameter.description && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground text-pretty">
                        {parameter.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {operation.requestBody && (
            <div className="rounded-xl bg-primary/[0.055] p-3 text-sm font-medium text-primary">
              {t.docs.requestBody}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            {t.docs.responses}
          </h4>
          <div className="mt-2 space-y-2">
            {operation.responses.map((response) => (
              <div
                key={response.code}
                className="flex items-start gap-3 rounded-xl bg-background/60 p-3 text-sm"
              >
                <code className="shrink-0 font-semibold text-primary">
                  {response.code}
                </code>
                <span className="min-w-0 [overflow-wrap:anywhere] text-muted-foreground">
                  {response.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
