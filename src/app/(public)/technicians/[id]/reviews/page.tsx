import Link from "next/link";
import { notFound } from "next/navigation";
import { getTechProfile } from "@/features/technicians/queries";
import {
  getPublicTechnicianReviews,
  getTechnicianReviewSummary,
} from "@/features/reviews/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getInitials } from "@/lib/utils/formatting";
import { ChevronLeft, MessageSquare, Star, TrendingUp } from "lucide-react";

function vehicleLabel(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
} | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim]
    .filter(Boolean)
    .join(" ");
}

export default async function TechnicianReviewsPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tech, summary, reviews] = await Promise.all([
    getTechProfile(id),
    getTechnicianReviewSummary(id),
    getPublicTechnicianReviews(id, 50),
  ]);

  if (!tech) notFound();

  const displayName = tech.profile?.display_name ?? tech.profile?.username ?? "Technician";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <Link
        href={`/technicians/${id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Technician Profile
      </Link>

      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-on-surface">
          {displayName} Reviews
        </h1>
        <p className="text-sm text-on-surface-variant">
          Verified feedback from completed technician-performed inspections.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Average Rating</p>
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <p className="text-2xl font-black">{(summary?.avgRating ?? 0).toFixed(1)}</p>
              <span className="text-xs text-on-surface-variant">/5</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Total Reviews</p>
            <p className="text-2xl font-black">{summary?.totalReviews ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Reputation Score</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal" />
              <p className="text-2xl font-black">{(summary?.reputationScore ?? 0).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <MessageSquare className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="font-bold text-on-surface">No reviews yet</p>
            <p className="text-sm text-on-surface-variant mt-1">
              Reviews will appear once completed inspections are rated by requesters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const reviewer = review.reviewer;
            const vehicle = review.ppi_request?.vehicle ?? null;

            return (
              <Card key={review.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={reviewer?.avatar_url ?? ""} />
                        <AvatarFallback className="text-xs">
                          {getInitials(reviewer?.display_name ?? reviewer?.username ?? "U")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold text-on-surface">
                          {reviewer?.display_name ?? reviewer?.username ?? "PerfectPPI user"}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {new Date(review.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-bold">
                      <Star className="mr-1 h-3 w-3 text-amber-500" />
                      {review.rating}/5
                    </Badge>
                  </div>

                  {review.title && <p className="font-semibold text-on-surface">{review.title}</p>}
                  {review.content && (
                    <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{review.content}</p>
                  )}

                  {vehicle && (
                    <p className="text-xs text-on-surface-variant">
                      Vehicle inspected: {vehicleLabel(vehicle) || "Vehicle"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
