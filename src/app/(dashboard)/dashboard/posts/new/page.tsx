import { getCommunityPostOptions } from "@/features/community/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPostForm } from "./new-post-form";

export default async function NewDashboardPostPage() {
  const { vehicles, listings } = await getCommunityPostOptions();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Create Community Post</h1>
        <p className="text-muted-foreground">
          Share public vehicle context, an active listing, or a factual inspection discussion.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Post Details</CardTitle>
        </CardHeader>
        <CardContent>
          <NewPostForm vehicles={vehicles} listings={listings} />
        </CardContent>
      </Card>
    </div>
  );
}
