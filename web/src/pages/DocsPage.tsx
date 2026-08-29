import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { ApiOperationItem } from "@/components/ApiOperationItem";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";
import { fetchJSON, HERMES_BASE_PATH } from "@/lib/api";
import {
  filterApiOperations,
  parseOpenApiDocument,
  type ApiDocumentation,
} from "@/lib/openapi-docs";
import { PluginSlot } from "@/plugins";

export default function DocsPage() {
  const { t } = useI18n();
  const { setEnd } = usePageHeader();
  const [documentation, setDocumentation] = useState<ApiDocumentation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await fetchJSON<unknown>("/openapi.json");
      setDocumentation(parseOpenApiDocument(payload));
    } catch (loadError) {
      const detail =
        loadError instanceof Error ? loadError.message : String(loadError);
      setError(`${t.docs.loadFailed}：${detail}`);
    }
  }, [t.docs.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    setEnd(
      <a
        href={`${HERMES_BASE_PATH}/openapi.json`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--mk-web-radius-control)] px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <ExternalLink className="size-4" />
        {t.docs.openSchema}
      </a>,
    );
    return () => setEnd(null);
  }, [setEnd, t.docs.openSchema]);

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          documentation?.operations.map((operation) => operation.tag) ?? [],
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [documentation],
  );
  const operations = useMemo(
    () =>
      filterApiOperations(documentation?.operations ?? [], query, activeTag),
    [activeTag, documentation, query],
  );

  return (
    <div className="mk-docs-page flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <PluginSlot name="docs:top" />
      <section className="mk-surface-section flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <BookOpen className="size-5" />
              <h2 className="text-xl font-semibold text-foreground text-balance">
                {t.docs.title}
              </h2>
            </div>
            <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground text-pretty">
              {t.docs.description}
            </p>
          </div>
          {documentation && (
            <div className="shrink-0 text-xs text-muted-foreground">
              <div>
                {t.docs.schemaVersion.replace(
                  "{version}",
                  documentation.schemaVersion || "—",
                )}
              </div>
              <div className="mt-1">v{documentation.version || "—"}</div>
            </div>
          )}
        </div>

        <label className="relative block">
          <span className="sr-only">{t.docs.searchPlaceholder}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t.docs.searchPlaceholder}
            className="min-h-11 w-full rounded-[var(--mk-web-radius-control)] border border-border bg-background/70 pl-11 pr-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2" aria-label={t.docs.allGroups}>
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={cn(
              "min-h-9 rounded-xl px-3 text-xs font-semibold transition-colors",
              activeTag === null
                ? "bg-primary text-primary-foreground"
                : "bg-background/60 text-muted-foreground hover:bg-primary/10 hover:text-foreground",
            )}
          >
            {t.docs.allGroups}
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={cn(
                "min-h-9 rounded-xl px-3 text-xs font-semibold transition-colors",
                activeTag === tag
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:bg-primary/10 hover:text-foreground",
              )}
            >
              {tag}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {t.docs.endpointCount.replace("{count}", String(operations.length))}
          </span>
        </div>
      </section>

      {!documentation && !error && (
        <div className="mk-surface-section flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
          <Spinner /> {t.common.loading}
        </div>
      )}

      {error && (
        <div className="mk-surface-section flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="max-w-[65ch] text-sm text-destructive text-pretty">
            {error}
          </p>
          <Button onClick={() => void load()}>{t.common.retry}</Button>
        </div>
      )}

      {documentation && operations.length === 0 && (
        <div className="mk-surface-section flex min-h-48 items-center justify-center p-6 text-sm text-muted-foreground">
          {t.docs.noEndpoints}
        </div>
      )}

      {documentation && operations.length > 0 && (
        <section className="mk-surface-section min-w-0 overflow-hidden">
          {operations.map((operation) => (
            <ApiOperationItem key={operation.id} operation={operation} />
          ))}
        </section>
      )}
      <PluginSlot name="docs:bottom" />
    </div>
  );
}
