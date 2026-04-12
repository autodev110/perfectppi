import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyTechnicianReviews } from "@/features/reviews/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils/formatting";
import { MessageSquare, Star, TrendingUp } from "lucide-react";

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

export default async function TechReviewsPage() {
  const { technicianProfile, reviews } = await getMyTechnicianReviews();

  if (!technicianProfile) redirect("/tech");

  const avgRating = Number(technicianProfile.avg_rating ?? 0);
  const totalReviews = technicianProfile.total_reviews ?? 0;
  const reputationScore = Number(technicianProfile.reputation_score ?? 0);

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <h1 className="text-3xl font-black font-heading tracking-tight">Reviews</h1>
        <p className="text-sm text-on-surface-variant mt-2">
          Feedback left by inspection requesters after completed technician PPIs.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-on-surface-variant">Average Rating</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            <p className="text-2xl font-black font-heading">{avgRating.toFixed(1)}</p>
            <p className="text-xs text-on-surface-variant">/ 5</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-on-surface-variant">Total Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black font-heading">{totalReviews}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-on-surface-variant">Reputation Score</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal" />
            <p className="text-2xl font-black font-heading">{reputationScore.toFixed(2)}</p>
          </CardContent>
        </Card>
      </section>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="font-bold text-on-surface">No reviews yet</p>
            <p className="text-sm text-on-surface-variant mt-1">
              Reviews will appear here once requesters complete inspections and leave feedback.
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
                <CardContent className="p-5 space-y-4">
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

                  {review.title && (
                    <p className="font-semibold text-on-surface">{review.title}</p>
                  )}

                  {review.content && (
                    <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{review.content}</p>
                  )}

                  {vehicle && (
                    <div className="pt-2 border-t border-outline-variant/20 text-xs text-on-surface-variant">
                      Inspection vehicle: {vehicleLabel(vehicle) || "Vehicle"}
                      {review.ppi_request?.id && (
                        <span>
                          {" "}
                          · <Link href={`/tech/ppi`} className="underline-offset-2 hover:underline">View queue</Link>
                        </span>
                      )}
                    </div>
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
