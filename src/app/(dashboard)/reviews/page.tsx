import type { Metadata } from "next";
import { getServerApi } from "@/lib/trpc/server";
import { ReviewsList } from "./_components/reviews-list";

export const metadata: Metadata = {
  title: "Reviews",
};

export default async function ReviewsPage() {
  // Server-render the initial list; the client island seeds it as initialData
  // and polls while any review is still PENDING/PROCESSING.
  const api = await getServerApi();
  const reviews = await api.review.list({ limit: 50 });

  return <ReviewsList initialReviews={reviews} />;
}
