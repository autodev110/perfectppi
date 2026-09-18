"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShareLink, deleteMediaPackage } from "@/features/media/actions";
import type { MediaPackageWithShare } from "@/features/media/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

import { useTranslator } from "@/lib/i18n/client";

export function MediaPackagesManager({ packages }: { packages: MediaPackageWithShare[] }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  function getShareUrl(token: string) {
    const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const origin = typeof window !== "undefined" ? window.location.origin : fallback;
    return `${origin.replace(/\/$/, "")}/share/${token}`;
  }

  async function copyShareUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      window.setTimeout(() => {
        setCopiedLink((current) => (current === url ? null : current));
      }, 1500);
    } catch {
      setError(uiText("ui.could_not_copy_link_to_clipboard_0222c47588"));
    }
  }

  function handleGenerateShare(mediaPackageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await createShareLink({
        targetType: "media_package",
        targetId: mediaPackageId,
      });

      if ("error" in result) {
        setError(result.error ?? uiText("ui.failed_to_generate_share_link_57b351cb36"));
        return;
      }

      setGeneratedUrl(result.data.url);
      await copyShareUrl(result.data.url);
      router.refresh();
    });
  }

  function handleDelete(mediaPackageId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteMediaPackage(mediaPackageId);
      if ("error" in result) {
        setError(result.error ?? uiText("ui.failed_to_delete_media_package_9771d8a269"));
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {generatedUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.latest_share_link_f5c66c10de")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm break-all">{generatedUrl}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyShareUrl(generatedUrl)}
              disabled={isPending}
            >
              {copiedLink === generatedUrl ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />{uiText("ui.copied_8d525e5f15")}</>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />{uiText("ui.copy_link_724e78a325")}</>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{uiText("ui.no_media_packages_yet_2ba4902b0f")}</CardContent>
        </Card>
      ) : (
        packages.map((pkg) => (
          (() => {
            const currentShareLink = pkg.share_links?.[0] ?? null;
            const currentShareUrl = currentShareLink
              ? getShareUrl(currentShareLink.token)
              : null;

            return (
              <Card key={pkg.id}>
                <CardHeader>
                  <CardTitle>{pkg.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pkg.description ? (
                    <p className="text-sm text-muted-foreground">{pkg.description}</p>
                  ) : null}

                  <p className="text-sm">
                    {pkg.items.length}{uiText("ui.item_a5f3c2e9f9")}{pkg.items.length === 1 ? "" : uiText("ui.s_043a718774")}
                  </p>

                  {currentShareUrl ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">{uiText("ui.current_share_link_031d9426f1")}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono break-all text-muted-foreground flex-1">
                          {currentShareUrl}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => copyShareUrl(currentShareUrl)}
                          disabled={isPending}
                        >
                          {copiedLink === currentShareUrl ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleGenerateShare(pkg.id)}
                      disabled={isPending}
                    >
                      {currentShareUrl ? uiText("ui.regenerate_share_link_6e905d8319") : uiText("ui.generate_share_link_47e28d02ec")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(pkg.id)}
                      disabled={isPending}
                    >{uiText("ui.delete_e2d0a54968")}</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()
        ))
      )}
    </div>
  );
}
